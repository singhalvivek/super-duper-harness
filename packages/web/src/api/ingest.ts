import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { IngestSession } from "@meeting-capture/shared";
import type { DbClient } from "../db/client";
import { meetings, transcriptLines } from "../db/schema";
import type { MeetingRow } from "../db/schema";
import { titleTranscript } from "../llm/gemini";
import { logger } from "../log";
import { buildTranscriptText, placeholderTitle } from "./mappers";

/**
 * Persist a validated captured session and its transcript lines in ONE
 * transaction, then auto-title it via Gemini.
 *
 * Ordering matters for the data-safety guarantee (spec/agent.md,
 * spec/api.md): the transcript is committed FIRST (transaction), so a Gemini
 * titling failure can never lose captured data. On a titling failure we simply
 * UPDATE the already-committed row's title to a placeholder and set
 * `title_status = "failed"`, logging the actionable error. The request still
 * succeeds (201).
 *
 * The libSQL Drizzle driver is async, so the transaction + queries are awaited.
 */
export async function ingestSession(
  db: DbClient,
  payload: IngestSession,
): Promise<MeetingRow> {
  const meetingId = randomUUID();
  const now = Date.now();
  const durationMs = payload.endedAt - payload.startedAt;
  const lineCount = payload.lines.length;

  // Provisional title before Gemini responds; overwritten on success, kept as
  // the placeholder (with title_status "failed") on failure.
  const provisionalTitle = placeholderTitle(payload.startedAt);

  // --- Step 1: commit the transcript atomically (data is never lost). ---
  await db.transaction(async (tx) => {
    await tx.insert(meetings).values({
      id: meetingId,
      title: provisionalTitle,
      titleStatus: "failed", // upgraded to "ok" only if titling succeeds
      source: payload.source,
      startedAt: payload.startedAt,
      endedAt: payload.endedAt,
      durationMs,
      lineCount,
      createdAt: now,
    });

    await tx.insert(transcriptLines).values(
      payload.lines.map((line) => ({
        id: randomUUID(),
        meetingId,
        seq: line.seq,
        speaker: line.speaker,
        text: line.text,
        timestampMs: line.timestampMs,
      })),
    );
  });

  // --- Step 2: title via Gemini (non-fatal). ---
  let title = provisionalTitle;
  let titleStatus: "ok" | "failed" = "failed";
  try {
    const transcriptText = buildTranscriptText(payload.lines);
    title = await titleTranscript(transcriptText);
    titleStatus = "ok";
    await db
      .update(meetings)
      .set({ title, titleStatus })
      .where(eq(meetings.id, meetingId));
  } catch (err) {
    // Titling failed — transcript already saved. Keep the placeholder + failed
    // status (already the row's default from step 1) and log the actionable
    // error. Never rethrow: data was preserved.
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { kind: "gemini", surface: "titleTranscript", meetingId, error: message },
      "titling failed; transcript saved with placeholder title",
    );
  }

  return {
    id: meetingId,
    title,
    titleStatus,
    source: payload.source,
    startedAt: payload.startedAt,
    endedAt: payload.endedAt,
    durationMs,
    lineCount,
    createdAt: now,
  };
}
