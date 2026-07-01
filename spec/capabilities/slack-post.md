# Capability: Slack Auto-Post of Summary

**Phase:** 4 (STUB/deferred; low priority)

## What It Does
Posts a meeting's summary to a Slack channel via an incoming webhook when the meeting ends (or on a manual action), controlled by a user toggle.

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| meeting id | path param | `POST /api/sessions/:id/slack` | yes |
| stored summary | JSON | `summaries` table | yes (requires Phase 2) |
| `SLACK_WEBHOOK_URL` | env | `.env` (blank now) | yes to post |

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| `{ posted: boolean }` | JSON | caller; message → Slack channel |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| Slack incoming webhook | POST formatted summary | If `SLACK_WEBHOOK_URL` is blank/unset → skip silently (`posted:false`), never block. On HTTP error → surface but never lose the summary. |

## Business Rules
- Depends on the Phase-2 summary (posts the TL;DR + key points + action items).
- Blank webhook → no-op, no error. Auto-post is opt-in via a settings toggle.

## Success Criteria
- [ ] With a real/test `SLACK_WEBHOOK_URL`, the summary payload is posted (integration test).
- [ ] With a blank webhook, the path is skipped cleanly (`posted:false`, no throw).
