# Capability: Meeting Library

**Phase:** 1

## What It Does
Lists the user's captured meetings newest-first in the dashboard so they can browse a growing library and open one at a time.

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| limit / offset | query params | Dashboard request | no (defaults 50/0) |

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| Meeting list `{id, title, titleStatus, startedAt, durationMs, lineCount}[]` | JSON → rendered rows | Dashboard Library page |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| SQLite (Drizzle) | Select meetings ordered by `started_at` desc | 500 with error envelope; UI shows a retry banner. |

## Business Rules
- Newest-first ordering via the `idx_meetings_started_at` index (must stay performant as the library grows).
- Each row shows title (or placeholder + re-title affordance if `titleStatus="failed"`), date/time, duration, line count.
- Empty state when no meetings exist.

## Success Criteria
- [ ] `GET /api/sessions` returns stored meetings newest-first with the documented fields (integration test against real SQLite).
- [ ] The Library page renders real captured meetings (Playwright E2E after seeding a real session via the API) — not a broken shell.
- [ ] Empty state renders when there are no meetings.
