# Data Model — Meeting Capture Assistant

> Storage technology and idiom are the project's chosen stack; see [architecture.md](architecture.md) → `## Stack`.

---

## Storage Technology

**SQLite** (local file `packages/web/data/meetings.db`, overridable via `DATABASE_URL`) via **Drizzle ORM** with the **libSQL** driver (`@libsql/client`, `drizzle-orm/libsql`; chosen over `better-sqlite3` because that native addon needs a C++ toolchain and has no Node 24 Windows prebuilt, whereas libSQL ships prebuilt cross-platform binaries, is Drizzle-supported, and uses the same SQLite file format via a `file:` URL). Migrations are generated from the Drizzle schema and applied with `drizzle-kit` (`db:generate` → `db:migrate`; commands in [architecture.md](architecture.md) → `## Commands`). SQLite is production for this single-user local tool, so tests use the same engine (a temp libSQL file DB per run). Schema lives in `packages/web/src/db/schema.ts`; the typed client in `packages/web/src/db/client.ts`.

The design target is a **growing library of long (1–2h) transcripts** that stays organized and queryable: meetings list newest-first (indexed on `started_at`), and a meeting's lines load in capture order (indexed on `(meeting_id, seq)`).

## Entities

### Entity: `meetings` (one saved session per captured meeting)

Represents one captured Google Meet session. Identified by an auto-generated, Gemini-produced title (no user-entered title in scope).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | text (uuid) | yes | Primary key. |
| `title` | text | yes | Gemini-generated title, or a timestamp placeholder if titling failed. |
| `title_status` | text | yes | `"ok"` \| `"failed"` (failed = placeholder title; dashboard may offer re-title). Default `"ok"`. |
| `source` | text | yes | Capture source. Always `"google-meet"` in scope. Default `"google-meet"`. |
| `started_at` | integer (epoch ms) | yes | When capture started. **Indexed** (library ordering). |
| `ended_at` | integer (epoch ms) | yes | When capture stopped. |
| `duration_ms` | integer | yes | `ended_at - started_at` (denormalized for cheap list display). |
| `line_count` | integer | yes | Number of transcript lines (denormalized for list display). |
| `created_at` | integer (epoch ms) | yes | Row insert time. Default now. |

Indexes: `idx_meetings_started_at` on `started_at` (desc listing).

### Entity: `transcript_lines` (speaker-labelled, timestamped lines of a meeting)

One row per captured caption line, preserving who said what and when.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | text (uuid) | yes | Primary key (stable — used as citation target for jump-to-moment in P3). |
| `meeting_id` | text (fk → meetings.id) | yes | Owning meeting. **Indexed** with `seq`. |
| `seq` | integer | yes | 0-based order of the line within the meeting (capture order). |
| `speaker` | text | yes | Speaker label as scraped from Meet (may be `"Unknown"` if Meet did not attribute it). |
| `text` | text | yes | The caption line text. |
| `timestamp_ms` | integer | yes | Offset from `meetings.started_at` (ms) when the line appeared — used for display + jump-to-moment. |

Indexes: `idx_lines_meeting_seq` on `(meeting_id, seq)` (ordered load); FK `meeting_id` → `meetings.id` ON DELETE CASCADE.

### Entity: `summaries` (P2 — one per meeting)

Gemini-generated summary. Created lazily on first generate; regenerable.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | text (uuid) | yes | Primary key. |
| `meeting_id` | text (fk → meetings.id) | yes | Owning meeting (unique — one summary per meeting; regenerate overwrites). |
| `tldr` | text | yes | TL;DR paragraph. |
| `key_points_json` | text (JSON array) | yes | Bulleted key points / decisions. |
| `action_items_json` | text (JSON array of `{text, owner?}`) | yes | Action items with owners where detectable. |
| `created_at` | integer (epoch ms) | yes | Generation time. |

### Entity: `qa_messages` (P3 — persisted Q&A chat history per meeting)

One row per turn (a user question or an assistant answer), preserving conversation memory per meeting.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | text (uuid) | yes | Primary key. |
| `meeting_id` | text (fk → meetings.id) | yes | Owning meeting. **Indexed** with `created_at`. |
| `role` | text | yes | `"user"` \| `"assistant"`. |
| `content` | text | yes | Question text (user) or answer text (assistant). |
| `citations_json` | text (JSON array of `{lineId, timestampMs}`) \| null | no | Assistant turns only: cited transcript lines for jump-to-moment. |
| `in_transcript` | integer (0/1) \| null | no | Assistant turns only: whether the answer was found in the transcript (0 → "not in transcript" flag). |
| `created_at` | integer (epoch ms) | yes | Turn time (ordering). |

Indexes: `idx_qa_meeting_created` on `(meeting_id, created_at)`.

### Entity: `recordings` (P4 — optional saved audio/video artifact per meeting)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | text (uuid) | yes | Primary key. |
| `meeting_id` | text (fk → meetings.id) | yes | Owning meeting. |
| `file_path` | text | yes | Local path to the stored artifact. |
| `mime_type` | text | yes | e.g. `audio/webm`, `video/webm`. |
| `bytes` | integer | yes | File size. |
| `created_at` | integer (epoch ms) | yes | Upload time. |

> P5 cross-meeting search reads existing `transcript_lines` across all meetings; if a retrieval index is needed it is added as a P5 migration (e.g. a lightweight keyword/FTS index over `transcript_lines.text`), not a new first-class entity.

### Relationships

- `meetings` **1 — N** `transcript_lines` (cascade delete).
- `meetings` **1 — 0..1** `summaries` (P2).
- `meetings` **1 — N** `qa_messages` (P3).
- `meetings` **1 — N** `recordings` (P4).

## Data Lifecycle

- **Create:** a `meetings` row + its `transcript_lines` are inserted **in one transaction** on `POST /api/sessions` (extension stop). The Gemini title is written in the same request (or a placeholder on failure). Summaries/Q&A/recordings are created later, on demand, in their phases.
- **Read:** library lists `meetings` newest-first; opening a meeting loads its `transcript_lines` ordered by `seq`, plus its summary/Q&A when present.
- **Update:** `title` may be updated by a re-title action; `summaries` are overwritten on regenerate.
- **Delete:** deleting a `meetings` row cascades to its lines, summary, Q&A, and recordings. (Delete UI is not in Phase 1 scope; the cascade is defined so later deletion is clean.)
- No time-boxing/archival — this is a personal library kept indefinitely.

## Sensitive Data

Transcripts contain meeting content (potentially personal/confidential) but the tool is single-user and local — no auth, no sharing, no cloud storage. The only secret is `GEMINI_API_KEY` (and later `SLACK_WEBHOOK_URL`), which live in `.env` (gitignored) and are never written to the database, logged, or returned by any endpoint. The `data/` directory holding the SQLite file is gitignored.
