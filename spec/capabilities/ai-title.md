# Capability: AI Title (Gemini auto-titling)

**Phase:** 1

## What It Does
On ingest, calls Google Gemini once over the full transcript to generate a concise meeting title, storing it on the meeting — with data-safe fallback and actionable auth errors.

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| Full transcript text (speaker: line) | string | Stored `transcript_lines` (built in the ingest request) | yes |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | env | `.env` | key required; model defaults `gemini-2.5-flash` |

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| Title | string | `meetings.title` (+ `title_status`) |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| Google Gemini (`@google/genai`) | Single titling call over the whole transcript (large context) | **Non-fatal to ingest:** transcript is still saved; title falls back to a timestamp placeholder, `title_status="failed"`, and the actionable auth error is logged (points at `.env` / https://aistudio.google.com/apikey). Never mask, never pre-validate key shape, never silently return a canned title as if real. |

## Business Rules
- Titling runs inside the `POST /api/sessions` request; Gemini's large context handles a full 1–2h transcript in one call (no truncation).
- The provided `GEMINI_API_KEY` may not be the `AIza…` AI Studio format — do NOT validate the shape; attempt the real call and surface the provider's auth error verbatim plus the pointer.
- A titling failure must never lose the transcript.

## Success Criteria
- [ ] Ingest of a real transcript returns a non-empty Gemini-generated title with `titleStatus="ok"` (integration test against **real Gemini** + real SQLite).
- [ ] A forced Gemini failure still persists the transcript with a placeholder title and `titleStatus="failed"` (integration test).
- [ ] An auth failure produces a logged, actionable message pointing at `.env` / aistudio — verified by the error path.
