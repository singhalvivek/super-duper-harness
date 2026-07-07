# Capability: Cross-Meeting Search (the LAST feature)

**Phase:** 5 (STUB in Phase 1 — the top Search box; built last)

## What It Does
Answers a question across ALL captured meetings, returning the exact meeting(s) plus the relevant transcript excerpt and a grounded answer — turning the library into a searchable knowledge base.

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| question | string | top Search box | yes |

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| `{ answer, matches[{meetingId, meetingTitle, citations[{lineId, timestampMs}]}] }` | JSON | Search results page |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| SQLite (Drizzle) | Retrieve relevant lines across all meetings (index/FTS if added) | 500 + retry. |
| Google Gemini (`@google/genai`) | Grounded answer over the cross-meeting retrieval (single call after retrieval) | Surface an error (retry); auth failure → actionable message. Never conflate meetings or invent a source. |

## Business Rules
- Retrieval spans every meeting's `transcript_lines`; results name the exact meeting(s) and cite specific lines (jump-to-moment across meetings).
- If the answer is not in any transcript, return empty `matches` and say so — no hallucination.
- Built LAST, after all per-meeting features are real.

## Success Criteria
- [ ] With multiple stored meetings where the answer lives in exactly one, search returns that meeting + a citation and does not conflate meetings (integration test against **real Gemini**).
- [ ] Results link to the right meeting and jump to the cited line (Playwright E2E).
- [ ] A no-match query returns empty `matches` with a clear "not found" message.
