# Capability: Action Items with Owners

**Phase:** 2 (part of the AI Summary story; STUB in Phase 1)

## What It Does
Extracts actionable follow-ups from a meeting transcript with the responsible owner attached where a name is detectable, as a first-class part of the summary output.

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| Full transcript text | string | Stored `transcript_lines` | yes |

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| `actionItems[{text, owner?}]` | JSON (part of the summary) | `summaries.action_items_json` + Summary panel |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| Google Gemini (`@google/genai`) | Included in the single summary call (not a separate model call) | Same as AI Summary. |

## Business Rules
- Folded into the summary generation (one Gemini call), not a separate endpoint.
- `owner` is populated only when the transcript makes attribution clear; never guessed.
- Each action item links back to the transcript context it came from where possible.

## Success Criteria
- [ ] Summary output includes `actionItems[]` where each item has `text` and an optional `owner` (integration test against **real Gemini** on a transcript that assigns tasks to named people).
- [ ] Owners are present when named in the transcript and absent (not fabricated) when not.
