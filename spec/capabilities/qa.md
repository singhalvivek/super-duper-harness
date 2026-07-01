# Capability: Grounded Q&A on a Meeting

**Phase:** 3 (STUB in Phase 1 — labelled "coming soon")

## What It Does
Answers questions about a single meeting grounded in its transcript, handling 1–2h meetings by chunking/retrieving so nothing is missed, returning jump-to-moment citation links, explicitly flagging when the answer is not in the transcript, and persisting Q&A history.

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| meeting id | path param | `POST /api/sessions/:id/qa` | yes |
| question | string | Q&A panel | yes |
| prior turns | history | `qa_messages` (for follow-ups) | no |

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| `{ answer, citations[{lineId, timestampMs}], inTranscript }` | JSON | `qa_messages` + Q&A panel |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| Google Gemini (`@google/genai`) | Grounded answer over retrieved timestamped chunks (single call after retrieval) | Surface an error (retry); auth failure → actionable message. Never hallucinate a citation. |
| SQLite (Drizzle) | Read transcript, retrieve chunks, persist turns | 500 + retry. |

## Business Rules
- Chunk + retrieve the relevant timestamped lines before the single Gemini call so a fact in any part of a long meeting can be found — a sampled subset is not acceptable.
- Citations reference real `transcript_lines.id` + `timestampMs`; clicking one scrolls the transcript to that line.
- If the answer is not in the transcript, return `inTranscript:false` and the UI shows a clear "not found in this transcript" flag — no hallucinated answer.
- Q&A history is persisted per meeting (conversational memory) and reloaded on reopen.
- Prompt lives in `packages/web/src/prompts/qa.md`.

## Success Criteria
- [ ] Against a **long** stored transcript (large enough that sampled ≠ full), a fact stated late in the meeting is answered with a citation to the correct line (integration test against **real Gemini**).
- [ ] An out-of-scope question returns `inTranscript:false` and the not-in-transcript flag (integration test).
- [ ] Clicking a citation scrolls the transcript to the cited timestamped line (Playwright E2E).
- [ ] Q&A history persists and reloads per meeting.
