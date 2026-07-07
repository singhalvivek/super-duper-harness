import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  IngestSessionSchema,
  type IngestResponse,
  type MeetingListResponse,
} from "@meeting-capture/shared";
import { getDb } from "@/db/client";
import { apiError } from "@/api/errors";
import { ingestSession } from "@/api/ingest";
import { toIngestResponse, toListItem } from "@/api/mappers";
import { listMeetings } from "@/api/queries";
import { logApiRequest } from "@/log";

// The libSQL (SQLite) driver requires the Node runtime, not Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_LIMIT_DEFAULT = 50;
const LIST_LIMIT_MAX = 200;

/**
 * POST /api/sessions — ingest a captured session (spec/api.md).
 *
 * Validate the body with the shared Zod schema (400 on failure), persist the
 * meeting + lines in one transaction, then auto-title via Gemini. A titling
 * failure is non-fatal: the transcript is saved with a placeholder title and
 * `titleStatus: "failed"`, and the response is still 201.
 */
export async function POST(
  req: NextRequest,
): Promise<NextResponse<IngestResponse> | NextResponse<{ error: unknown }>> {
  const started = Date.now();
  const path = "/api/sessions";

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    logApiRequest({ method: "POST", path, status: 400, latencyMs: Date.now() - started, error: "invalid JSON" });
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = IngestSessionSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    logApiRequest({ method: "POST", path, status: 400, latencyMs: Date.now() - started, error: message });
    return apiError(400, "validation_error", message);
  }

  try {
    const db = getDb();
    const row = await ingestSession(db, parsed.data);
    logApiRequest({ method: "POST", path, status: 201, latencyMs: Date.now() - started });
    return NextResponse.json(toIngestResponse(row), { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logApiRequest({ method: "POST", path, status: 500, latencyMs: Date.now() - started, error: message });
    return apiError(500, "db_write_failed", "Failed to persist the session.");
  }
}

/**
 * GET /api/sessions — library list, newest-first (spec/api.md).
 *
 * Query params: `limit` (default 50, max 200), `offset` (default 0).
 */
export async function GET(
  req: NextRequest,
): Promise<NextResponse<MeetingListResponse> | NextResponse<{ error: unknown }>> {
  const started = Date.now();
  const path = "/api/sessions";

  const { searchParams } = new URL(req.url);
  const limit = clampInt(searchParams.get("limit"), LIST_LIMIT_DEFAULT, 1, LIST_LIMIT_MAX);
  const offset = clampInt(searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);

  try {
    const db = getDb();
    const { rows, total } = await listMeetings(db, { limit, offset });
    const response: MeetingListResponse = {
      meetings: rows.map(toListItem),
      total,
    };
    logApiRequest({ method: "GET", path, status: 200, latencyMs: Date.now() - started });
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logApiRequest({ method: "GET", path, status: 500, latencyMs: Date.now() - started, error: message });
    return apiError(500, "db_read_failed", "Failed to list meetings.");
  }
}

/** Parse and clamp an integer query param, falling back to a default. */
function clampInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === null) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
