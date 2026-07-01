# Capability: Saved Recording (nice-to-have)

**Phase:** 4 (deferred; nice-to-have)

## What It Does
Stores an uploaded audio/video artifact alongside a meeting and surfaces it in the transcript view for playback. (Capture remains captions-only; this is an optional attached artifact, NOT an STT source.)

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| meeting id | path param | `POST /api/sessions/:id/recording` | yes |
| recording file | binary | user upload | yes |

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| `{ id, mimeType, bytes }` | JSON | `recordings` table + local file storage |
| stored artifact | binary | `GET /api/sessions/:id/recording` |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| Local file storage | Write/read the artifact | 500 + retry; metadata row only written after the file lands. |
| SQLite (Drizzle) | `recordings` metadata row | 500 + retry. |

## Business Rules
- The recording is a stored artifact only — it is NEVER transcribed (captions-only strategy holds).
- One meeting may have recordings attached; served back for playback in the transcript view.

## Success Criteria
- [ ] Uploading a recording persists the file + a `recordings` row and serves it back (integration test against real SQLite + local storage).
- [ ] The transcript view can play back an attached recording (Playwright E2E).
