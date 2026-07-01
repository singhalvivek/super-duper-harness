import { asc, desc, eq, sql } from "drizzle-orm";
import type { DbClient } from "../db/client";
import { meetings, transcriptLines } from "../db/schema";
import type { MeetingRow, TranscriptLineRow } from "../db/schema";

/**
 * Read-side queries for the library list and the transcript detail view.
 * All filters/ordering use Drizzle column expressions with parameter binding —
 * no string-concatenated SQL from user input. The libSQL driver is async, so
 * these return promises.
 */

/** Library list newest-first (started_at desc), with a total count. */
export async function listMeetings(
  db: DbClient,
  opts: { limit: number; offset: number },
): Promise<{ rows: MeetingRow[]; total: number }> {
  const rows = await db
    .select()
    .from(meetings)
    .orderBy(desc(meetings.startedAt))
    .limit(opts.limit)
    .offset(opts.offset);

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(meetings);
  const total = countResult[0]?.count ?? 0;

  return { rows, total };
}

/** One meeting header (or null) plus its lines ordered by seq ascending. */
export async function getMeetingWithLines(
  db: DbClient,
  id: string,
): Promise<{ meeting: MeetingRow; lines: TranscriptLineRow[] } | null> {
  const meetingRows = await db
    .select()
    .from(meetings)
    .where(eq(meetings.id, id))
    .limit(1);

  const meeting = meetingRows[0];
  if (!meeting) return null;

  const lines = await db
    .select()
    .from(transcriptLines)
    .where(eq(transcriptLines.meetingId, id))
    .orderBy(asc(transcriptLines.seq));

  return { meeting, lines };
}
