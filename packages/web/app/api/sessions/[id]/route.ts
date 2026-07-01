import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { MeetingDetail } from "@meeting-capture/shared";
import { getDb } from "@/db/client";
import { apiError } from "@/api/errors";
import { toMeetingDetail } from "@/api/mappers";
import { getMeetingWithLines } from "@/api/queries";
import { logApiRequest } from "@/log";

// The libSQL (SQLite) driver requires the Node runtime, not Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sessions/:id — one meeting header plus its full ordered transcript
 * (lines by seq ascending). 404 if no meeting has that id (spec/api.md).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<MeetingDetail> | NextResponse<{ error: unknown }>> {
  const started = Date.now();
  const { id } = await params;
  const path = `/api/sessions/${id}`;

  try {
    const db = getDb();
    const found = await getMeetingWithLines(db, id);
    if (!found) {
      logApiRequest({ method: "GET", path, status: 404, latencyMs: Date.now() - started, error: "not found" });
      return apiError(404, "not_found", `No meeting with id "${id}".`);
    }
    const detail = toMeetingDetail(found.meeting, found.lines);
    logApiRequest({ method: "GET", path, status: 200, latencyMs: Date.now() - started });
    return NextResponse.json(detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logApiRequest({ method: "GET", path, status: 500, latencyMs: Date.now() - started, error: message });
    return apiError(500, "db_read_failed", "Failed to load the meeting.");
  }
}
