import { NextResponse } from "next/server";
import type { HealthResponse } from "@meeting-capture/shared";
import { getDb } from "@/db/client";
import { meetings } from "@/db/schema";
import { logApiRequest } from "@/log";

// The libSQL (SQLite) driver requires the Node runtime, not Edge.
export const runtime = "nodejs";
// Always evaluate live (never cache the health snapshot).
export const dynamic = "force-dynamic";

/**
 * GET /api/health — liveness + readiness.
 *
 * Reports whether the Gemini key is PRESENT (a boolean — never the value) and
 * whether the DB is reachable (a trivial query succeeds). `ok` is true when the
 * server is serving; `dbReady` reflects the actual DB probe.
 */
export async function GET(): Promise<NextResponse<HealthResponse>> {
  const started = Date.now();
  const geminiKeyPresent = Boolean(process.env.GEMINI_API_KEY);

  let dbReady = false;
  try {
    const db = getDb();
    // A cheap probe that touches the schema; a limit-1 select is fine on empty.
    await db.select({ id: meetings.id }).from(meetings).limit(1);
    dbReady = true;
  } catch {
    dbReady = false;
  }

  logApiRequest({
    method: "GET",
    path: "/api/health",
    status: 200,
    latencyMs: Date.now() - started,
  });

  return NextResponse.json({ ok: true, geminiKeyPresent, dbReady });
}
