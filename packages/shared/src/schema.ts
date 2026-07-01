import { z } from "zod";

/**
 * Wire contract for the Meeting Capture Assistant — Phase 1.
 *
 * Single source of truth for the HTTP wire format shared by the Chrome
 * extension (which POSTs sessions) and the Next.js dashboard (which reads
 * them). Defined once here as Zod schemas so the two sides cannot drift.
 *
 * Every shape below is authored to match spec/api.md EXACTLY (api.md is the
 * binding contract). spec/data.md defines the DB columns (snake_case); the
 * mapping between the DB and this camelCase wire format is the backend's job,
 * NOT this package's.
 *
 * WIRE CONVENTIONS (see spec/api.md, spec/data.md):
 *  - All field names on the wire are **camelCase** (timestampMs, startedAt,
 *    titleStatus, durationMs, lineCount, createdAt).
 *  - All absolute timestamps are **epoch milliseconds as integers** (startedAt,
 *    endedAt, createdAt). A line's `timestampMs` is an **offset in ms from the
 *    session's startedAt**, not an absolute epoch.
 *  - Every successful response is a JSON body; errors use the ApiError envelope.
 */

/** An integer epoch-ms timestamp or offset (>= 0). */
const nonNegativeInt = z.number().int().nonnegative();

// ---------------------------------------------------------------------------
// Ingest (POST /api/sessions request body) — the extension → backend write.
// ---------------------------------------------------------------------------

/**
 * One captured caption line as sent by the extension inside an ingest payload.
 *
 * Per spec/api.md the ingest line carries `seq` (0-based ascending capture
 * order), a non-empty `speaker` label (`"Unknown"` allowed), non-empty `text`,
 * and `timestampMs` — the offset in ms from the session's startedAt
 * (non-negative and, across the array, non-decreasing).
 */
export const CaptureLineSchema = z.object({
  seq: nonNegativeInt,
  speaker: z.string().min(1),
  text: z.string().min(1),
  timestampMs: nonNegativeInt,
});
export type CaptureLine = z.infer<typeof CaptureLineSchema>;

/**
 * POST /api/sessions request body — a captured session plus its ordered lines.
 *
 * Validation rules from spec/api.md:
 *  - `source` defaults to "google-meet" (the only in-scope value)
 *  - `endedAt >= startedAt`
 *  - at least one line
 *  - `lines[].seq` is 0-based ascending (0, 1, 2, …)
 *  - `lines[].timestampMs` is non-decreasing across the ordered lines
 */
export const IngestSessionSchema = z
  .object({
    source: z.literal("google-meet").default("google-meet"),
    startedAt: nonNegativeInt,
    endedAt: nonNegativeInt,
    lines: z.array(CaptureLineSchema).min(1),
  })
  .refine((s) => s.endedAt >= s.startedAt, {
    message: "endedAt must be greater than or equal to startedAt",
    path: ["endedAt"],
  })
  .refine((s) => s.lines.every((line, i) => line.seq === i), {
    message: "lines[].seq must be 0-based ascending (0, 1, 2, …)",
    path: ["lines"],
  })
  .refine(
    (s) =>
      s.lines.every(
        (line, i) => i === 0 || line.timestampMs >= s.lines[i - 1]!.timestampMs,
      ),
    {
      message: "lines[].timestampMs must be non-decreasing",
      path: ["lines"],
    },
  );
export type IngestSession = z.infer<typeof IngestSessionSchema>;

// ---------------------------------------------------------------------------
// Stored / returned shapes (read side: list + detail + ingest response).
// ---------------------------------------------------------------------------

/** `"ok"` = Gemini titled it; `"failed"` = placeholder title (offer re-title). */
export const TitleStatusSchema = z.enum(["ok", "failed"]);
export type TitleStatus = z.infer<typeof TitleStatusSchema>;

/**
 * A stored transcript line as returned by the API (GET /api/sessions/:id).
 * `id` is a stable citation target for Phase-3 jump-to-moment.
 */
export const TranscriptLineSchema = z.object({
  id: z.string(),
  seq: nonNegativeInt,
  speaker: z.string(),
  text: z.string(),
  timestampMs: nonNegativeInt,
});
export type TranscriptLine = z.infer<typeof TranscriptLineSchema>;

/**
 * A row in the GET /api/sessions library list.
 *
 * Per spec/api.md the list row carries exactly what the library needs to render
 * (title, date, duration, line count) plus `id` + `titleStatus`. `source`,
 * `endedAt` and `createdAt` are intentionally NOT in the list row — they appear
 * on the detail shape (MeetingDetailSchema) / ingest response instead.
 */
export const MeetingListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  titleStatus: TitleStatusSchema,
  startedAt: nonNegativeInt,
  durationMs: nonNegativeInt,
  lineCount: nonNegativeInt,
});
export type MeetingListItem = z.infer<typeof MeetingListItemSchema>;

/** GET /api/sessions response envelope: newest-first meetings + total count. */
export const MeetingListResponseSchema = z.object({
  meetings: z.array(MeetingListItemSchema),
  total: nonNegativeInt,
});
export type MeetingListResponse = z.infer<typeof MeetingListResponseSchema>;

/**
 * GET /api/sessions/:id — one meeting header plus its full ordered transcript.
 *
 * Carries the full header (including `source` and `endedAt`, which the list row
 * omits) and the `lines[]` ordered by seq ascending. Note spec/api.md's detail
 * shape does NOT include `createdAt`.
 */
export const MeetingDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  titleStatus: TitleStatusSchema,
  source: z.string(),
  startedAt: nonNegativeInt,
  endedAt: nonNegativeInt,
  durationMs: nonNegativeInt,
  lineCount: nonNegativeInt,
  lines: z.array(TranscriptLineSchema),
});
export type MeetingDetail = z.infer<typeof MeetingDetailSchema>;

/**
 * POST /api/sessions response (201) — the stored session header.
 *
 * Per spec/api.md the ingest response returns the FULL header (not just
 * id/title/titleStatus): source, startedAt, endedAt, durationMs, lineCount and
 * createdAt as well. On a Gemini titling failure the response is still 201 with
 * `titleStatus: "failed"` and a placeholder `title`.
 */
export const IngestResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  titleStatus: TitleStatusSchema,
  source: z.string(),
  startedAt: nonNegativeInt,
  endedAt: nonNegativeInt,
  durationMs: nonNegativeInt,
  lineCount: nonNegativeInt,
  createdAt: nonNegativeInt,
});
export type IngestResponse = z.infer<typeof IngestResponseSchema>;

// ---------------------------------------------------------------------------
// Health + error envelopes.
// ---------------------------------------------------------------------------

/** GET /api/health — liveness + readiness (Gemini key presence only). */
export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  geminiKeyPresent: z.boolean(),
  dbReady: z.boolean(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** The uniform error envelope every failing endpoint returns. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

// P2+ schemas (summary / Q&A / recording / cross-meeting search) live here later.
