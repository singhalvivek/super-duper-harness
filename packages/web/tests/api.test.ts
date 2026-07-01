import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  IngestResponseSchema,
  MeetingDetailSchema,
  MeetingListResponseSchema,
  ApiErrorSchema,
} from "@meeting-capture/shared";

/**
 * Backend integration test — Phase 1 gate (spec/roadmap.md).
 *
 * Runs against the REAL SQLite engine (a temp file per run — the SAME engine as
 * prod, never a substitute) and the REAL Google Gemini API (key loaded from the
 * repo-root `.env` by vitest.config.ts via dotenv).
 *
 * We point DATABASE_URL at a temp SQLite file, run the real Drizzle migrations
 * against it, then import the route handlers (whose DB client resolves
 * DATABASE_URL lazily on first use). The handlers are invoked DIRECTLY (their
 * exported GET/POST) with real Request objects — no Next dev server needed.
 */

const tempDir = mkdtempSync(join(tmpdir(), "mca-api-test-"));
const dbFile = join(tempDir, "test-meetings.db");

// Must be set BEFORE any module that reads it (the db client + drizzle-kit).
process.env.DATABASE_URL = dbFile;

// Deferred handler references (imported after DATABASE_URL is set).
let POST_sessions: typeof import("../app/api/sessions/route").POST;
let GET_sessions: typeof import("../app/api/sessions/route").GET;
let GET_session: typeof import("../app/api/sessions/[id]/route").GET;
let GET_health: typeof import("../app/api/health/route").GET;

const GEMINI_KEY_PRESENT = Boolean(process.env.GEMINI_API_KEY);

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** A valid multi-line, 2-speaker captured session payload. */
function validPayload(startedAt: number) {
  return {
    source: "google-meet" as const,
    startedAt,
    endedAt: startedAt + 3_600_000,
    lines: [
      { seq: 0, speaker: "Alice Chen", text: "Let's kick off the Q3 roadmap planning session.", timestampMs: 0 },
      { seq: 1, speaker: "Bob Ray", text: "Sounds good. First item is the mobile app redesign timeline.", timestampMs: 4_800 },
      { seq: 2, speaker: "Alice Chen", text: "We should aim to ship the redesign by end of August.", timestampMs: 9_200 },
      { seq: 3, speaker: "Bob Ray", text: "Agreed. I'll own the design review and report back next week.", timestampMs: 15_000 },
    ],
  };
}

beforeAll(async () => {
  // Apply the real Drizzle migrations to the temp libSQL/SQLite file (the SAME
  // engine as prod). We migrate programmatically so the test is self-contained.
  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");
  const { migrate } = await import("drizzle-orm/libsql/migrator");
  const { resolve } = await import("node:path");
  const { pathToFileURL } = await import("node:url");

  const client = createClient({ url: pathToFileURL(dbFile).href });
  await client.execute("PRAGMA foreign_keys = ON;");
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: resolve(__dirname, "..", "drizzle") });
  client.close();

  // Import handlers AFTER DATABASE_URL is set and the schema exists.
  const sessions = await import("../app/api/sessions/route");
  const session = await import("../app/api/sessions/[id]/route");
  const health = await import("../app/api/health/route");
  POST_sessions = sessions.POST;
  GET_sessions = sessions.GET;
  GET_session = session.GET;
  GET_health = health.GET;
});

afterAll(async () => {
  // Release the singleton libSQL connection the route handlers opened on the
  // temp DB file. libSQL holds the `.db` (and its WAL) open for the client's
  // life, and Windows refuses to delete an open file — so we MUST close before
  // unlinking, or `rmSync` throws EPERM.
  try {
    const { closeDb } = await import("../src/db/client");
    await closeDb();
  } catch {
    /* nothing to close; proceed to cleanup */
  }
  // Best-effort removal with retries (Windows may briefly hold the handle even
  // after close). A residual temp file is not a test failure — the OS reclaims
  // %TEMP% — so any lingering EPERM/EBUSY is swallowed rather than failing the run.
  try {
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* temp dir left for the OS to reap; not a test failure */
  }
});

describe("GET /api/health", () => {
  it("reports geminiKeyPresent from env and dbReady", async () => {
    const res = await GET_health();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.geminiKeyPresent).toBe(GEMINI_KEY_PRESENT);
    expect(body.dbReady).toBe(true);
  });
});

describe("POST /api/sessions (ingest) + read-back", () => {
  let createdId: string;
  const startedAt = 1_719_840_600_000;

  it("ingests a valid session, titles it via REAL Gemini, returns 201", async () => {
    const req = jsonRequest("http://localhost:8788/api/sessions", "POST", validPayload(startedAt));
    const res = await POST_sessions(req as never);
    expect(res.status).toBe(201);

    const body = await res.json();
    const parsed = IngestResponseSchema.parse(body); // validates the full shape

    expect(parsed.source).toBe("google-meet");
    expect(parsed.durationMs).toBe(3_600_000);
    expect(parsed.lineCount).toBe(4);
    expect(parsed.startedAt).toBe(startedAt);

    if (GEMINI_KEY_PRESENT) {
      // Real Gemini titled it: status "ok" and a non-empty, non-placeholder title.
      expect(parsed.titleStatus).toBe("ok");
      expect(parsed.title.trim().length).toBeGreaterThan(0);
      expect(parsed.title.startsWith("Meeting on ")).toBe(false);
      // eslint-disable-next-line no-console
      console.log(`[real Gemini title] "${parsed.title}"`);
    } else {
      // No key: transcript still saved with a placeholder + failed status.
      expect(parsed.titleStatus).toBe("failed");
      expect(parsed.title.startsWith("Meeting on ")).toBe(true);
    }

    createdId = parsed.id;
  });

  it("lists the meeting in GET /api/sessions (newest-first)", async () => {
    const req = jsonRequest("http://localhost:8788/api/sessions", "GET");
    const res = await GET_sessions(req as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    const parsed = MeetingListResponseSchema.parse(body);

    expect(parsed.total).toBeGreaterThanOrEqual(1);
    expect(parsed.meetings[0]?.id).toBe(createdId); // newest-first
    expect(parsed.meetings[0]?.lineCount).toBe(4);
    expect(parsed.meetings[0]?.durationMs).toBe(3_600_000);
  });

  it("returns the stored lines in seq order via GET /api/sessions/:id", async () => {
    const req = jsonRequest(`http://localhost:8788/api/sessions/${createdId}`, "GET");
    const res = await GET_session(req as never, { params: Promise.resolve({ id: createdId }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    const parsed = MeetingDetailSchema.parse(body);

    expect(parsed.id).toBe(createdId);
    expect(parsed.source).toBe("google-meet");
    expect(parsed.lines).toHaveLength(4);
    // seq order preserved with correct speaker/text/timestampMs.
    expect(parsed.lines.map((l) => l.seq)).toEqual([0, 1, 2, 3]);
    expect(parsed.lines[0]?.speaker).toBe("Alice Chen");
    expect(parsed.lines[0]?.text).toContain("Q3 roadmap");
    expect(parsed.lines[0]?.timestampMs).toBe(0);
    expect(parsed.lines[3]?.speaker).toBe("Bob Ray");
    expect(parsed.lines[3]?.timestampMs).toBe(15_000);
    // each line has a stable id (citation target)
    expect(parsed.lines[0]?.id.length).toBeGreaterThan(0);
  });
});

describe("validation + not-found", () => {
  it("rejects an invalid body (endedAt < startedAt) with 400 ApiError", async () => {
    const bad = { ...validPayload(2_000_000_000_000), endedAt: 1_000_000_000_000 };
    const req = jsonRequest("http://localhost:8788/api/sessions", "POST", bad);
    const res = await POST_sessions(req as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    const parsed = ApiErrorSchema.parse(body);
    expect(parsed.error.code).toBe("validation_error");
    expect(parsed.error.message.length).toBeGreaterThan(0);
  });

  it("rejects an empty lines array with 400 ApiError", async () => {
    const bad = { ...validPayload(1_719_840_600_000), lines: [] };
    const req = jsonRequest("http://localhost:8788/api/sessions", "POST", bad);
    const res = await POST_sessions(req as never);
    expect(res.status).toBe(400);
    const parsed = ApiErrorSchema.parse(await res.json());
    expect(parsed.error.code).toBe("validation_error");
  });

  it("returns 404 ApiError for a non-existent id", async () => {
    const missingId = "00000000-0000-0000-0000-000000000000";
    const req = jsonRequest(`http://localhost:8788/api/sessions/${missingId}`, "GET");
    const res = await GET_session(req as never, { params: Promise.resolve({ id: missingId }) });
    expect(res.status).toBe(404);
    const parsed = ApiErrorSchema.parse(await res.json());
    expect(parsed.error.code).toBe("not_found");
  });
});

describe("titling failure is non-fatal to ingest", () => {
  it("saves the transcript with a placeholder title + titleStatus 'failed' when Gemini auth fails", async () => {
    // Force a Gemini auth failure for THIS case only by pointing at a bad key +
    // model, then restore. The transcript must STILL be saved (data never lost).
    const savedKey = process.env.GEMINI_API_KEY;
    const savedModel = process.env.GEMINI_MODEL;
    process.env.GEMINI_API_KEY = "definitely-not-a-valid-key-abc123";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";

    const startedAt = 1_719_900_000_000;
    let body: unknown;
    try {
      const req = jsonRequest("http://localhost:8788/api/sessions", "POST", validPayload(startedAt));
      const res = await POST_sessions(req as never);
      expect(res.status).toBe(201); // still 201 — data was not lost
      body = await res.json();
    } finally {
      // Restore so other tests keep using the real key.
      if (savedKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = savedKey;
      if (savedModel === undefined) delete process.env.GEMINI_MODEL;
      else process.env.GEMINI_MODEL = savedModel;
    }

    const parsed = IngestResponseSchema.parse(body);
    expect(parsed.titleStatus).toBe("failed");
    expect(parsed.title.startsWith("Meeting on ")).toBe(true);
    expect(parsed.lineCount).toBe(4);

    // And the transcript is genuinely retrievable with its lines intact.
    const detailReq = jsonRequest(`http://localhost:8788/api/sessions/${parsed.id}`, "GET");
    const detailRes = await GET_session(detailReq as never, {
      params: Promise.resolve({ id: parsed.id }),
    });
    expect(detailRes.status).toBe(200);
    const detail = MeetingDetailSchema.parse(await detailRes.json());
    expect(detail.lines).toHaveLength(4);
    expect(detail.titleStatus).toBe("failed");
  });
});
