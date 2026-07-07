# API — Meeting Capture Assistant

> The HTTP contract served by the Next.js Route Handlers (`packages/web/app/api/*/route.ts`) and consumed by BOTH the extension and the dashboard. Request/response shapes are defined once as Zod schemas in `packages/shared/src/schema.ts` and imported by both sides so the wire format cannot drift. All DB-touching handlers run on the Node runtime (`export const runtime = "nodejs"`).

---

## API Style

REST-ish JSON over HTTP, same origin as the dashboard (`http://localhost:8788`). No authentication (single local user). Every successful response is `200`/`201` with a JSON body; errors return a JSON `{ "error": { "code": string, "message": string } }` envelope with an appropriate status. Timestamps are epoch milliseconds (integers).

## Endpoints / Commands

### `GET /api/health`

**Purpose:** Liveness + readiness. Confirms the DB is reachable and whether the Gemini key is present (presence only — never the value).

**Response (200):**
```json
{ "ok": true, "geminiKeyPresent": true, "dbReady": true }
```

---

### `POST /api/sessions`  *(Phase 1 — the ingest endpoint the extension calls on stop)*

**Purpose:** Persist a captured session and its transcript lines, then auto-title it via Gemini. This is the extension → backend write.

**Request:**
```json
{
  "source": "google-meet",
  "startedAt": 1719840600000,
  "endedAt": 1719844200000,
  "lines": [
    { "seq": 0, "speaker": "Alice Chen", "text": "Let's start with the roadmap.", "timestampMs": 1200 },
    { "seq": 1, "speaker": "Bob Ray",    "text": "Sounds good.",                  "timestampMs": 4800 }
  ]
}
```
- `source` — always `"google-meet"` in scope.
- `startedAt` / `endedAt` — epoch ms; `endedAt >= startedAt`.
- `lines[]` — ordered; `seq` 0-based ascending; `speaker` non-empty (`"Unknown"` allowed); `text` non-empty; `timestampMs` = offset from `startedAt`, non-negative, non-decreasing. At least 1 line required.

**Response (201):**
```json
{
  "id": "b3f1...uuid",
  "title": "Q3 Roadmap Planning",
  "titleStatus": "ok",
  "source": "google-meet",
  "startedAt": 1719840600000,
  "endedAt": 1719844200000,
  "durationMs": 3600000,
  "lineCount": 2,
  "createdAt": 1719844205000
}
```
- On a Gemini titling failure the session is still saved: `title` is a placeholder (e.g. `"Meeting on 2026-07-01 14:30"`) and `titleStatus` is `"failed"`. The response is still `201` (data was not lost).

**Error cases:**
| Status | Condition |
|--------|-----------|
| 400 | Payload fails Zod validation (missing/empty lines, `endedAt < startedAt`, bad types, `seq` not ascending). |
| 500 | DB write failed (transaction rolled back — no partial session persisted). |

> Note: a Gemini **auth** failure does NOT fail this endpoint — the transcript is saved with a placeholder title and the actionable auth error is logged (see [agent.md](agent.md)). Auth errors surface as a hard error only on the summary/Q&A/search endpoints where there is no data to preserve.

---

### `GET /api/sessions`  *(Phase 1 — library list)*

**Purpose:** List meetings newest-first for the dashboard library.

**Query params:** `limit` (default 50, max 200), `offset` (default 0).

**Response (200):**
```json
{
  "meetings": [
    {
      "id": "b3f1...uuid",
      "title": "Q3 Roadmap Planning",
      "titleStatus": "ok",
      "startedAt": 1719840600000,
      "durationMs": 3600000,
      "lineCount": 128
    }
  ],
  "total": 1
}
```
Ordered by `startedAt` descending (uses `idx_meetings_started_at`).

---

### `GET /api/sessions/:id`  *(Phase 1 — one meeting + its transcript)*

**Purpose:** Full transcript for the transcript view.

**Response (200):**
```json
{
  "id": "b3f1...uuid",
  "title": "Q3 Roadmap Planning",
  "titleStatus": "ok",
  "source": "google-meet",
  "startedAt": 1719840600000,
  "endedAt": 1719844200000,
  "durationMs": 3600000,
  "lineCount": 2,
  "lines": [
    { "id": "l1...uuid", "seq": 0, "speaker": "Alice Chen", "text": "Let's start with the roadmap.", "timestampMs": 1200 },
    { "id": "l2...uuid", "seq": 1, "speaker": "Bob Ray",    "text": "Sounds good.",                  "timestampMs": 4800 }
  ]
}
```
Lines ordered by `seq` ascending. Each `line.id` is a stable citation target for Phase-3 jump-to-moment.

**Error cases:**
| Status | Condition |
|--------|-----------|
| 404 | No meeting with that `id`. |

---

## Later-phase endpoints (documented now; built in their phases — see [roadmap.md](roadmap.md))

| Endpoint | Phase | Purpose | Response shape (summary) |
|----------|-------|---------|--------------------------|
| `POST /api/sessions/:id/summary` | P2 | Generate/regenerate the summary via Gemini | `{ tldr, keyPoints[], actionItems[{text, owner?}] }` |
| `GET /api/sessions/:id/summary` | P2 | Read the stored summary | same as above, or 404 if not generated |
| `POST /api/sessions/:id/qa` | P3 | Ask a grounded question; persists the turn | `{ answer, citations[{lineId, timestampMs}], inTranscript }` |
| `GET /api/sessions/:id/qa` | P3 | Read persisted Q&A history | `{ messages[{role, content, citations?, inTranscript?, createdAt}] }` |
| `POST /api/sessions/:id/slack` | P4 | Post the summary to `SLACK_WEBHOOK_URL` | `{ posted: boolean }` |
| `POST /api/sessions/:id/recording` | P4 | Upload/store a recording artifact | `{ id, mimeType, bytes }` |
| `GET /api/sessions/:id/recording` | P4 | Stream the stored recording | binary |
| `POST /api/search` | P5 | Cross-meeting grounded search | `{ answer, matches[{meetingId, meetingTitle, citations[]}] }` |

## Authentication

None. Single local user; the API binds to localhost only. The only secrets (`GEMINI_API_KEY`, later `SLACK_WEBHOOK_URL`) are server-side env vars, never accepted from or returned to clients.
