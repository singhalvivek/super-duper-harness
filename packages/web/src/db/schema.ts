import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

/**
 * Drizzle SQLite schema — Phase 1 tables (see spec/data.md).
 *
 * Columns are snake_case (the DB idiom); the API handlers map these to the
 * camelCase wire contract in `@meeting-capture/shared`. Only the two Phase-1
 * entities are defined here — `summaries` (P2), `qa_messages` (P3) and
 * `recordings` (P4) are added in their own phases so this migration stays
 * minimal.
 */

/** One captured Google Meet session. */
export const meetings = sqliteTable(
  "meetings",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    titleStatus: text("title_status").notNull().default("ok"),
    source: text("source").notNull().default("google-meet"),
    startedAt: integer("started_at").notNull(),
    endedAt: integer("ended_at").notNull(),
    durationMs: integer("duration_ms").notNull(),
    lineCount: integer("line_count").notNull(),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => ({
    // Library lists newest-first: index started_at for the ORDER BY.
    startedAtIdx: index("idx_meetings_started_at").on(table.startedAt),
  }),
);

/** One speaker-labelled, timestamped caption line of a meeting. */
export const transcriptLines = sqliteTable(
  "transcript_lines",
  {
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    speaker: text("speaker").notNull(),
    text: text("text").notNull(),
    timestampMs: integer("timestamp_ms").notNull(),
  },
  (table) => ({
    // Transcript loads in capture order: index (meeting_id, seq).
    meetingSeqIdx: index("idx_lines_meeting_seq").on(
      table.meetingId,
      table.seq,
    ),
  }),
);

export type MeetingRow = typeof meetings.$inferSelect;
export type NewMeetingRow = typeof meetings.$inferInsert;
export type TranscriptLineRow = typeof transcriptLines.$inferSelect;
export type NewTranscriptLineRow = typeof transcriptLines.$inferInsert;
