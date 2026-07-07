# Capability: Capture Transcript (Google Meet live captions)

**Phase:** 1

## What It Does
A Chrome MV3 extension scrapes Google Meet's live captions from the DOM — with speaker labels and timestamps — while enforcing captions-on-to-start and a 15-second caption-off stop countdown, then POSTs the buffered session to the backend on stop.

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| Meet caption DOM nodes | DOM elements | Google Meet caption region (content script `MutationObserver`) | yes |
| Start / Stop clicks | user action | Extension popup | yes |
| Captions on/off state | boolean (derived) | Presence of the caption region in the DOM | yes |

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| Session payload `{source, startedAt, endedAt, lines[]}` | JSON | `POST /api/sessions` (backend) |
| Live status (indicator, timer, caption status, 15s warning) | UI | Extension popup |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| Backend `/api/sessions` | POST buffered session on stop | Keep the buffer; show "couldn't save — is the dashboard running at :8788?" and allow retry (never drop the transcript). |
| Chrome DOM / MutationObserver | Observe caption region | Unrecognized node → parser returns `null`, line skipped, no crash; 0 lines surfaces a visible "no lines captured" message. |

## Business Rules
- **Captions must be ON to start.** If OFF at Start, block start and prompt the user to enable captions first.
- **Mid-meeting caption-off:** on captions going OFF, start a 15s countdown warning; if not re-enabled, stop capture. Text while captions are off is unrecoverable (captions-only strategy — no STT).
- The caption parser is a **pure, importable function** decoupled from the observer glue: `parseCaptionNode(el) → { speaker, text, timestampMs } | null`, plus merge logic for caption updates. It is unit-tested against saved Meet caption DOM fixtures.
- Lines are buffered in capture order with 0-based `seq`, `speaker` (`"Unknown"` if unattributed), `text`, and `timestampMs` = offset from `startedAt`.
- The popup shows status only — NOT a live scrolling transcript.

## Success Criteria
- [ ] `parseCaptionNode` correctly extracts `{speaker, text, timestampMs}` from every saved Meet caption DOM fixture (≥90% line attribution) — deterministic unit test, no live Meet needed.
- [ ] Start is blocked when captions are OFF (unit-tested gate logic) with the enable-captions prompt.
- [ ] Turning captions OFF mid-capture starts a 15s countdown that stops capture if not cancelled, and cancels if captions return (unit-tested timer logic).
- [ ] On Stop, a valid session payload (schema-valid per `packages/shared`) is POSTed; on network failure the buffer is retained.
- [ ] `pnpm --filter @meeting-capture/extension build` produces a loadable unpacked extension at `packages/extension/dist/`.
