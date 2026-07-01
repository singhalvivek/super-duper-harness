# Capability: AI Summary (TL;DR + Key Points + Action Items)

**Phase:** 2 (STUB in Phase 1 — labelled "coming soon")

## What It Does
Generates a structured summary of one meeting via Gemini over the full transcript: a TL;DR paragraph, bulleted key points/decisions, and action items with owners (names where detectable), each linking back to the transcript.

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| meeting id | path param | `POST /api/sessions/:id/summary` | yes |
| Full transcript text | string | Stored `transcript_lines` | yes |

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| `{ tldr, keyPoints[], actionItems[{text, owner?}] }` | JSON | `summaries` table + Summary panel |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| Google Gemini (`@google/genai`) | Single structured-JSON summary call (large context) | Surface an error to the UI (retry); never persist a hallucinated placeholder. Auth failure → actionable message. |
| SQLite (Drizzle) | Upsert `summaries` row (one per meeting) | 500 + retry. |

## Business Rules
- One summary per meeting; regenerate overwrites.
- Action-item owners are extracted from the transcript where detectable; otherwise omitted (never invented).
- Output validated against the shared Zod schema before persisting.
- Prompt lives in `packages/web/src/prompts/summary.md`.

## Success Criteria
- [ ] Generating a summary over a real stored transcript returns non-empty `{tldr, keyPoints[], actionItems[]}` (integration test against **real Gemini**), persisted and re-readable.
- [ ] Action items carry owner names where the transcript names them.
- [ ] The Summary panel (a P1 stub) renders the real summary with working transcript back-links (Playwright E2E).
