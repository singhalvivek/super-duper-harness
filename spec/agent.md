# Agent / LLM Pipeline

> **This project has NO agent-orchestration framework.** There is no LangGraph, CrewAI, AutoGen, or any graph/supervisor/multi-agent runtime, and no `StateGraph`, nodes, or conditional edges. This file documents the **plain Google Gemini call pipeline** the backend uses — a set of stateless, single-purpose Gemini invocations behind normal HTTP Route Handlers. There is no long-running agent state, no tool-calling loop, and no autonomous multi-step reasoning graph. This file is kept (not deleted) because Gemini calls are load-bearing and the auth-error / large-context behaviour must be specified precisely; it is deliberately not the framework template.

---

## Why no framework

The product needs discrete, deterministic LLM transformations of a transcript — "give me a title", "give me a summary", "answer this question grounded in this transcript" — each a single request/response. There are no branches to route between, no tools for the model to choose, no cross-step planning, and no persistent agent memory beyond what we already store in the database (meetings, transcript lines, Q&A history). A graph framework would add moving parts and a second mental model for zero benefit. Each capability is one function that builds a prompt, calls Gemini once (or, for Q&A/search, retrieves-then-calls-once), validates the output, and returns. **Gemini's large context window is the deliberate architecture:** a 1–2h transcript fits in one call for titling (P1) and summarizing (P2); only cross-meeting/very-long Q&A (P3/P5) adds a retrieval step before the single Gemini call.

---

## LLM Provider & Model

- **Provider:** Google Gemini via `@google/genai` (Google Gen AI TypeScript SDK).
- **Model id:** `gemini-2.5-flash` — configurable via the `GEMINI_MODEL` env var (falls back to `gemini-2.5-flash`). Fast and large-context, suited to 1–2h transcripts.
- **API key:** `GEMINI_API_KEY` from `.env` (gitignored, already present).

| Call surface | Phase | Purpose | Input | Output |
|--------------|-------|---------|-------|--------|
| `titleTranscript()` | **P1** | Auto-generate a concise meeting title | full transcript text (speaker: line) | short title string |
| `summarizeMeeting()` | P2 | TL;DR + key points + action items with owners | full transcript text | structured `{ tldr, keyPoints[], actionItems[{text, owner?}] }` |
| `answerQuestion()` | P3 | Grounded Q&A over one meeting | question + retrieved timestamped chunks | `{ answer, citations[{lineId, timestampMs}], inTranscript: boolean }` |
| `searchAcrossMeetings()` | P5 | Grounded answer across all meetings | question + retrieved chunks from many meetings | `{ answer, matches[{meetingId, meetingTitle, citations[]}] }` |

**Fallback / resilience behaviour (production, NOT a test stub):**
- **Auth failure (invalid/expired/wrong-format key → 401/403):** surface a CLEAR, actionable error. Never mask it, never pre-validate the key's shape (the provided key may not be the usual `AIza…` AI Studio format), never silently fall back to a canned answer. The error message must name the cause and point at `.env` and https://aistudio.google.com/apikey. Example surfaced message: `Gemini authentication failed. Check GEMINI_API_KEY in .env — get a key at https://aistudio.google.com/apikey.`
- **Titling (P1) is non-fatal to ingest:** if `titleTranscript()` throws for any reason (auth, rate limit, timeout), the transcript is STILL saved; the meeting gets a placeholder title (e.g. `Meeting on 2026-07-01 14:30`) and `title_status = "failed"` so the dashboard can offer a re-title. Data is never lost to an LLM failure.
- **Summary/Q&A/Search failures** return a surfaced error to the caller (the UI shows an error state and a retry) — they never write a hallucinated placeholder into storage as if real.
- **Rate limit / transient (429/5xx):** one retry with short backoff, then surface the error. Tests still run against the real API (keys from `.env`); no offline stub is the gate.

**Prompt strategy:**
- System/instruction + user content split. The transcript is passed as user content (speaker-labelled lines). Prompts request **structured JSON output** for summary/Q&A/search (parsed and validated with the shared Zod schemas) and a **plain short string** for titling.
- Q&A and search prompts explicitly instruct the model to **only** use the provided transcript context and to return `inTranscript: false` (Q&A) / empty `matches` (search) when the answer is not present — the "do not hallucinate; flag not-in-transcript" rule is enforced in the prompt AND validated in code.
- Prompts live as `.md` files under `packages/web/src/prompts/` (`title.md` in P1; `summary.md` P2; `qa.md` P3; `search.md` P5), loaded at runtime — never inlined as string literals in handlers.

---

## Where the pipeline lives

| Concern | Location |
|---------|----------|
| Gemini client wrapper (model config, auth-error surfacing, one-retry) | `packages/web/src/llm/gemini.ts` |
| Prompt templates | `packages/web/src/prompts/*.md` |
| Titling call (P1) | `titleTranscript()` in `packages/web/src/llm/gemini.ts`, invoked by `app/api/sessions/route.ts` (ingest) |
| Summary / Q&A / Search calls (P2/P3/P5) | same client module, invoked by their respective Route Handlers |
| Structured-output validation | shared Zod schemas in `packages/shared/src/schema.ts` |
| Retrieval (P3/P5 only, before the single Gemini call) | `packages/web/src/qa/*` and `packages/web/src/search/*` |
| Observability | structured JSON log per Gemini call (surface, input char count, latency, ok/error) via `packages/web/src/log.ts` (pino) — wired in Phase 1 |

---

## State & Memory (no agent state)

There is no in-memory agent/graph state. Everything persistent lives in SQLite (see [data.md](data.md)): meetings, transcript lines, and — from Phase 3 — Q&A chat history (`qa_messages`) which provides conversational memory per meeting. Each Gemini call is stateless: it receives exactly the transcript context (and, for Q&A, prior turns from `qa_messages` if a follow-up) it needs, built fresh per request. Context-window management: titling/summary rely on Gemini's large context (whole transcript in one call); Q&A/search chunk-and-retrieve the relevant timestamped lines before the single call so even a 1–2h meeting is fully covered without truncation.

---

## Concurrency

- Each `/api/*` request is independent; Gemini calls are per-request with no shared mutable state. `better-sqlite3` is synchronous; writes are wrapped in transactions. A single local user makes concurrency contention effectively nil, but ingest is transactional so a partially-written session can never appear in the library.
