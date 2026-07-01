# Capability: Transcript View

**Phase:** 1

## What It Does
Renders one meeting's full transcript — speaker-labelled and timestamped, in capture order — for readable review, with stable per-line anchors that later citations can jump to.

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| meeting id | path param | Dashboard route `/meetings/:id` | yes |

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| Meeting + ordered lines `{..., lines[{id, seq, speaker, text, timestampMs}]}` | JSON → rendered transcript | Dashboard meeting-detail page |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| SQLite (Drizzle) | Select meeting + its lines ordered by `seq` | 404 if meeting missing (UI: "that meeting doesn't exist"); 500 → retry banner. |

## Business Rules
- Lines render in capture order (`seq` ascending), each showing speaker, text, and a formatted timestamp (offset from start).
- Each line carries a stable DOM anchor keyed by `line.id` so Phase-3 jump-to-moment citations can scroll to it.
- Long (1–2h) transcripts (thousands of lines) render and scroll without truncation.

## Success Criteria
- [ ] `GET /api/sessions/:id` returns the meeting and its `seq`-ordered lines (integration test against real SQLite); 404 for an unknown id.
- [ ] The transcript view renders the real captured lines with speaker + timestamp (Playwright E2E on real seeded data).
- [ ] Each line exposes an anchor keyed by `line.id`.
