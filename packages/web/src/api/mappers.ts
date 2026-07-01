import type {
  IngestResponse,
  MeetingDetail,
  MeetingListItem,
  TitleStatus,
  TranscriptLine,
} from "@meeting-capture/shared";
import type { MeetingRow, TranscriptLineRow } from "../db/schema";

/**
 * DB (snake_case columns, via Drizzle's camelCase JS field names) ↔ wire
 * (camelCase) mapping. The DB stores `title_status` as free text; on the wire
 * it is the `"ok" | "failed"` union — we narrow it here (defaulting an
 * unexpected value to "failed" so a bad row never crashes serialization).
 */

function toTitleStatus(raw: string): TitleStatus {
  return raw === "ok" ? "ok" : "failed";
}

/** Build the ingest 201 response body from the stored meeting row. */
export function toIngestResponse(row: MeetingRow): IngestResponse {
  return {
    id: row.id,
    title: row.title,
    titleStatus: toTitleStatus(row.titleStatus),
    source: row.source,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationMs: row.durationMs,
    lineCount: row.lineCount,
    createdAt: row.createdAt,
  };
}

/** Build a library list row (omits source/endedAt/createdAt per api.md). */
export function toListItem(row: MeetingRow): MeetingListItem {
  return {
    id: row.id,
    title: row.title,
    titleStatus: toTitleStatus(row.titleStatus),
    startedAt: row.startedAt,
    durationMs: row.durationMs,
    lineCount: row.lineCount,
  };
}

/** Build one transcript line for the detail response. */
export function toTranscriptLine(row: TranscriptLineRow): TranscriptLine {
  return {
    id: row.id,
    seq: row.seq,
    speaker: row.speaker,
    text: row.text,
    timestampMs: row.timestampMs,
  };
}

/** Build the full meeting detail (header + ordered lines). */
export function toMeetingDetail(
  row: MeetingRow,
  lines: TranscriptLineRow[],
): MeetingDetail {
  return {
    id: row.id,
    title: row.title,
    titleStatus: toTitleStatus(row.titleStatus),
    source: row.source,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationMs: row.durationMs,
    lineCount: row.lineCount,
    lines: lines.map(toTranscriptLine),
  };
}

/** Compose the transcript text (speaker: text lines) sent to Gemini. */
export function buildTranscriptText(
  lines: { speaker: string; text: string }[],
): string {
  return lines.map((l) => `${l.speaker}: ${l.text}`).join("\n");
}

/**
 * A timestamp-based placeholder title used when Gemini titling fails, e.g.
 * `Meeting on 2026-07-01 14:30`. Uses local time from the session start.
 */
export function placeholderTitle(startedAt: number): string {
  const d = new Date(startedAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `Meeting on ${date} ${time}`;
}
