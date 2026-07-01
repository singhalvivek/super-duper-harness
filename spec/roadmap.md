# Roadmap — Meeting Capture Assistant

> Slug: `meeting-capture`. Personal single-user tool. All-TypeScript pnpm monorepo. Stack + exact commands live in [architecture.md](architecture.md) → `## Stack` and `## Commands`.

---

## What This Agent Does

Meeting Capture Assistant captures Google Meet meetings by scraping Meet's **live captions** from the page (a Chrome MV3 extension), preserving **who said what and when** (speaker labels + timestamps). Each meeting becomes a saved session with an auto-generated title (titled by Google Gemini from the transcript content). A local Next.js web dashboard is the home base: the user browses a growing **library** of past meetings, reads clean speaker-labelled transcripts, and — in later phases — gets AI summaries, asks grounded questions about a meeting, auto-posts summaries to Slack, and searches across every meeting. Everything runs locally for a single user; capture is captions-only (no audio, no speech-to-text, ever).

## Who Uses It

A single person (the tool's owner) who attends many Google Meet calls and wants a searchable, readable, AI-assisted record of them without paying for or trusting a third-party meeting-bot. They start and stop capture manually, then work through their meetings one at a time in the dashboard. No teammates, no auth, no compliance regime.

## Core Problem Being Solved

Google Meet's transcripts/recordings require admin features or leave you with a raw, unstructured dump; third-party note-takers are cloud services you must trust with your calls. This tool captures the meeting locally straight from the captions already on screen, keeps the speaker-attributed transcript in a private local library, and layers AI (title now; summary, grounded Q&A, cross-meeting search later) on top — replacing manual note-taking and scattered, un-queryable meeting notes.

## Success Criteria

- [ ] Loading the unpacked extension and running a real Google Meet with captions ON captures a transcript where **≥90% of caption lines are correctly attributed** to a speaker with a monotonic timestamp, verified deterministically by the caption-parser unit tests against saved Meet caption DOM fixtures.
- [ ] Captions-on enforcement works: **Start is blocked** when captions are OFF (with a prompt to enable them), and turning captions OFF mid-capture triggers a **15-second countdown** that stops recording if captions are not re-enabled.
- [ ] A captured session round-trips end-to-end: extension `POST /api/sessions` → stored in SQLite → **appears in the dashboard library** with a Gemini-generated title, date, duration, and line count, and its **transcript view renders the real captured lines** (speaker-labelled, timestamped) — no fake data on the tested path.
- [ ] Gemini auth failure produces a **clear, actionable error** pointing at `.env` / https://aistudio.google.com/apikey, and the transcript is **still saved** (title falls back to a placeholder, meeting flagged for re-title) — the key being non-`AIza…` format never silently loses data.
- [ ] The library stays organized and queryable as it grows: meetings list newest-first, indexed by `started_at`, and a 1–2h transcript (thousands of lines) loads and titles without truncation.

## What This Agent Does NOT Do (Out of Scope)

- **No audio/video capture, no speech-to-text, no Whisper/STT of any kind** — capture is **captions-only**. When Meet captions are off, no text exists to recover; that is accepted, not worked around.
- **No caption-text recovery while captions are off** — Google only renders caption text to the DOM while captions are enabled; there is no hidden feed.
- **Not multi-user, no auth, no sharing, no compliance/retention controls** — one local user.
- **No live scrolling transcript in the extension UI** — the capture overlay shows status only (indicator, timer, caption on/off, 15s warning).
- **No token/cost display anywhere** — deliberately hidden.
- **No support for platforms other than Google Meet** in scope for this project.
- **No cloud sync / no server deployment** — runs locally.

## Key Constraints

- **Captions must be ON to start**, and mid-meeting caption-off triggers a 15s stop countdown (see success criteria).
- **All TypeScript, single language, single server + port** — Next.js app serves both dashboard and API; the extension is a separate MV3 build. No Python.
- **LLM = Google Gemini** via `@google/genai`; key `GEMINI_API_KEY` in `.env` may not be `AIza…` format → surface real auth errors, never mask, never pre-validate the key shape.
- **Gemini's large context window is the strategy for 1–2h transcripts** — title (P1) and summarize (P2) in a single call; Q&A (P3) chunks/retrieves so nothing is missed.
- **Local SQLite + Drizzle**, migrations via `drizzle-kit`; indexed for a growing library. Tests run against real SQLite (same engine as prod).
- **The live-Meet capture path is inherently manual to test** — the automated gate must cover parser (DOM fixtures), backend (real DB), and dashboard (E2E) deterministically; the human tests the live-Meet leg by hand.

## Phases of Development

> **Phase 1 is the smallest first-time-right user-testable win.** Real on the one core path (extension → backend → dashboard on live Meet captions); everything else (summary, Q&A, action items, Slack, recording, cross-meeting search) appears in the dashboard as clearly-labelled NON-FUNCTIONAL stubs so the user sees the vision (a stub is never a bug). Deferred features are then built IN THE STATED ORDER. Every gate command runs with the real Gemini key from `.env` and the real SQLite engine.

### Phase 1 — Capture → Store → Read (the end-to-end core)

- **Goal:** Load the unpacked extension, capture a real Google Meet's live captions (with captions-on-to-start enforcement + the 15s caption-off countdown), and see the captured transcript — speaker-labelled, timestamped, auto-titled by Gemini — saved via the backend and readable in the dashboard library. Extension → backend → dashboard, end to end, on real Meet captions. All other dashboard features are labelled stubs.
- **Independent slices (parallel build units):** three disjoint file surfaces + one shared contract; the shared contract is the only declared dependency.
  - `shared-contract` (shared) — Zod schemas + TS types for `POST /api/sessions` payload and the list/get responses. **deps: none.** Built first (tiny); the other two slices import it.
  - `extension` (extension) — MV3 manifest, content script (caption `MutationObserver` + captions-on/off detection + 15s countdown), the **pure caption parser** + DOM fixtures + parser unit tests, popup UI (indicator/timer/caption-status/15s warning), and the POST-on-stop client. **deps: `shared-contract` (types only).**
  - `backend-api` (web / `app/api`) — Drizzle schema + migration, `/api/sessions` ingest (validate → store → Gemini title), `/api/sessions` list, `/api/sessions/:id` get, `/api/health`; Gemini titling client with actionable auth-error surfacing; structured logging. **deps: `shared-contract` (types only).**
  - `dashboard` (web / `app` pages + components) — library list page, transcript view page, and the labelled non-functional stub panels (Summary, Q&A, Cross-meeting search); Playwright E2E. **deps: `shared-contract` (types only); consumes `backend-api` at test time (E2E seeds via the real API).**
  > Extension, backend-api, and dashboard touch **disjoint files** (`packages/extension/**` vs `packages/web/app/api/**` vs `packages/web/app/(pages) + components/**`) so their generators run concurrently after `shared-contract` lands.
- **Key surfaces / files:**
  - `pnpm-workspace.yaml`, root `package.json`, `packages/shared/{package.json,src/schema.ts,src/index.ts}`
  - `packages/extension/{manifest.config.ts,vite.config.ts,package.json}`, `packages/extension/src/{content.ts,parser.ts,popup.tsx,capture.ts}`, `packages/extension/tests/{parser.test.ts,fixtures/*.html}`
  - `packages/web/{package.json,next.config.ts,drizzle.config.ts,postcss.config.mjs}`, `packages/web/src/db/{schema.ts,client.ts}`, `packages/web/src/llm/gemini.ts`, `packages/web/src/prompts/title.md`, `packages/web/src/log.ts`, `packages/web/app/api/health/route.ts`, `packages/web/app/api/sessions/route.ts`, `packages/web/app/api/sessions/[id]/route.ts`, `packages/web/tests/api.test.ts`
  - `packages/web/app/page.tsx` (library), `packages/web/app/meetings/[id]/page.tsx` (transcript + stub panels), `packages/web/app/globals.css`, `packages/web/src/components/*`, `packages/web/tests/e2e/*.spec.ts`
- **Gate command (all must pass, from repo root, real Gemini via `.env` + real SQLite):**
  1. `pnpm install`
  2. `pnpm --filter @meeting-capture/web db:migrate` (applies Drizzle migration to real SQLite — confirmed, not assumed)
  3. `pnpm --filter @meeting-capture/extension test` (caption parser unit tests pass against saved Meet DOM fixtures — speaker + text + timestamp parsed deterministically; captions-on/off + 15s-countdown logic unit-tested)
  4. `pnpm --filter @meeting-capture/web test` (API ingest → store → real Gemini title → list → get, against real SQLite + real `GEMINI_API_KEY`; asserts a titled row and its lines are retrievable)
  5. `pnpm --filter @meeting-capture/extension build` (produces the unpacked extension at `packages/extension/dist/`)
  6. `pnpm --filter @meeting-capture/web build` (Next.js builds; Tailwind CSS bundle contains real utility selectors, no unexpanded `@tailwind`/`@source`)
  7. `pnpm --filter @meeting-capture/web test:e2e` (Playwright drives the running app at `:8788`, seeds a real session via the API, asserts the library lists it and the transcript view renders the real speaker-labelled, timestamped lines — not a 200-only check)
- **How the user tests it (handoff seed):**
  1. **Start the dashboard:** from the repo root run `pnpm --filter @meeting-capture/web db:migrate` then `pnpm --filter @meeting-capture/web dev`. Open **http://localhost:8788/** — the Library page. Health check: **http://localhost:8788/api/health** should return `{"ok":true,"geminiKeyPresent":true,"dbReady":true}` (if `geminiKeyPresent` is false, put `GEMINI_API_KEY` in `.env`).
  2. **Build + load the extension:** run `pnpm --filter @meeting-capture/extension build`. In Chrome go to **chrome://extensions**, toggle **Developer mode** ON (top-right), click **Load unpacked**, and select the folder **`e:\cat-prep\super-duper-harness\packages\extension\dist`**. The "Meeting Capture Assistant" extension appears; pin it.
  3. **Capture a real Meet:** join any Google Meet. **Turn on captions** (Meet: More options → Captions, or the CC button). Click the extension icon → **Start**. (If captions are OFF, Start is blocked with a "turn on captions first" prompt — that is expected.) The popup shows the recording indicator, an elapsed timer, and "Captions: ON". Talk / let people talk so captions appear. To see the safeguard, turn captions OFF — a **15-second countdown warning** appears; turn them back on to cancel it, or let it expire to auto-stop. Click **Stop** to finish.
  4. **See it in the dashboard:** return to **http://localhost:8788/** and refresh. The meeting appears in the **Library** with a Gemini-generated title, the date, duration, and line count. Click it → the **Transcript view** shows the real captured lines with speaker names and timestamps.
  5. **What is REAL vs a labelled STUB:** REAL = the extension capture, `/api/*` ingest/list/get, Gemini titling, the Library list, and the Transcript view. LABELLED STUBS (visible but non-functional, marked "Coming soon") = the **AI Summary** panel, the **Q&A** panel, and the **Cross-meeting search** box. These render greyed-out placeholder text so you see the vision; they are stubs, not bugs.

### Phase 2 — AI Summary (TL;DR + Key Points + Action Items with owners)

- **Goal:** Wire the Summary stub into a real Gemini-generated summary per meeting: a TL;DR paragraph, bulleted key points/decisions, and action items with owners (names where detectable in the transcript), each with a link back to the full transcript. This is one coherent Gemini-summary story (3 capabilities: `ai-summary`, `action-items`, and the summary UI panel that renders them).
- **Independent slices:**
  - `summary-backend` (web / `app/api`) — `POST /api/sessions/:id/summary` (and/or generate-on-first-view): Gemini call over the full transcript (large-context, single call) returning structured `{ tldr, keyPoints[], actionItems[] }`; persist to a `summaries` table; the summary prompt in `packages/web/src/prompts/summary.md`. **deps: none (extends Phase 1 API + DB).**
  - `summary-ui` (web / pages+components) — the Summary panel becomes real: renders TL;DR + key points + action-items-with-owners, a "Generate/Regenerate summary" control, and transcript back-links. **deps: `summary-backend` (endpoint shape from `packages/shared`).**
  - `summary-schema` (shared) — extend `packages/shared` with the summary request/response Zod schema. **deps: none.**
- **Key surfaces / files:** `packages/web/src/db/schema.ts` (+ migration), `packages/web/app/api/sessions/[id]/summary/route.ts`, `packages/web/src/prompts/summary.md`, `packages/web/app/meetings/[id]/*` (summary panel components), `packages/shared/src/schema.ts`, `packages/web/tests/summary.test.ts`.
- **Gate command:** `pnpm --filter @meeting-capture/web db:migrate` then `pnpm --filter @meeting-capture/web test` (summary generated against **real Gemini** over a real stored transcript, asserting structured `{tldr, keyPoints[], actionItems[]}` shape + non-empty content, persisted and re-readable) then `pnpm --filter @meeting-capture/web test:e2e` (Summary panel renders the real generated summary with owner-labelled action items and working transcript back-links).
- **How the user tests it (handoff seed):** open a captured meeting at `http://localhost:8788/meetings/<id>`, click **Generate summary**; within seconds the panel (previously a stub) shows a TL;DR paragraph, bulleted key points/decisions, and action items with owner names where detectable, each linking back into the transcript. Regenerate re-runs Gemini. Q&A and Search remain labelled stubs.

### Phase 3 — Grounded Q&A on a meeting (long-transcript retrieval + jump-to-moment + not-in-transcript flag)

- **Goal:** Wire the Q&A stub into real grounded question-answering over a single meeting's transcript that works for 1–2h meetings (chunk/retrieve so nothing is missed), returns **jump-to-moment citation links** (click a citation → the transcript scrolls to that timestamped line), **explicitly flags when the answer is not in the transcript** instead of hallucinating, and persists the **Q&A chat history** per meeting. Three capabilities: `qa`, jump-to-moment citations, and persisted Q&A history.
- **Independent slices:**
  - `qa-backend` (web / `app/api`) — chunk the transcript, retrieve the relevant timestamped lines, call Gemini with a grounded/citation prompt, return `{ answer, citations[{lineId,timestampMs}], inTranscript: boolean }`; persist to `qa_messages`. Prompt in `packages/web/src/prompts/qa.md`. **deps: none (extends Phase 1 DB/API).**
  - `qa-ui` (web / pages+components) — the Q&A panel becomes a real chat: question box, answer with clickable citations that scroll the transcript to the cited line, a clear "Not found in this transcript" state, and rendered history. **deps: `qa-backend`.**
  - `qa-schema` (shared) — Q&A request/response + citation Zod schema. **deps: none.**
- **Key surfaces / files:** `packages/web/src/db/schema.ts` (`qa_messages`, + migration), `packages/web/src/qa/{chunk.ts,retrieve.ts}`, `packages/web/app/api/sessions/[id]/qa/route.ts`, `packages/web/src/prompts/qa.md`, `packages/web/app/meetings/[id]/*` (Q&A panel + citation-scroll), `packages/shared/src/schema.ts`, `packages/web/tests/qa.test.ts`.
- **Gate command:** `pnpm --filter @meeting-capture/web db:migrate` then `pnpm --filter @meeting-capture/web test` — the Q&A test runs against a **long stored transcript large enough that a sampled answer and a full-transcript answer differ** (a fact placed only in a late chunk must be retrieved and cited), against **real Gemini**; asserts (a) a fact from a late section is answered with a citation to the correct line, (b) an out-of-scope question returns `inTranscript:false` and the "not in transcript" flag, (c) history is persisted — then `pnpm --filter @meeting-capture/web test:e2e` (asking a question renders an answer whose citation, when clicked, scrolls the transcript to the cited timestamped line).
- **How the user tests it (handoff seed):** open a long captured meeting, ask a question about something said late in the call — the answer cites specific lines; click a citation and the transcript scrolls to that timestamped moment. Ask something not discussed — it clearly says it is not in the transcript rather than inventing an answer. Re-open the meeting later and the Q&A history is still there. Search remains a labelled stub.

### Phase 4 — Slack auto-post + Saved recording (secondary integrations)

> Lower priority than the AI features; grouped so the phase carries ≥3 capabilities together.

- **Goal:** When a meeting ends, optionally auto-post its summary to Slack (using `SLACK_WEBHOOK_URL` from `.env`); and add the "saved recording" nice-to-have (persist an uploaded audio/video artifact alongside the meeting and surface it in the transcript view). Capabilities: `slack-post`, `saved-recording`, and the settings/toggle UI that controls them.
- **Independent slices:**
  - `slack-backend` (web / `app/api`) — post the meeting summary to `SLACK_WEBHOOK_URL` after summary generation (skipped silently if the webhook is blank); a manual "Post to Slack" action too. **deps: Phase 2 summary.**
  - `recording-backend` (web / `app/api` + storage) — accept and store a recording artifact for a meeting (upload endpoint + local file storage + `recordings` metadata), serve it back. **deps: none.**
  - `settings-ui` (web / pages+components) — a Settings/meeting-level UI to toggle auto-post and to attach/play a saved recording. **deps: `slack-backend`, `recording-backend`.**
- **Key surfaces / files:** `packages/web/app/api/sessions/[id]/slack/route.ts`, `packages/web/src/slack.ts`, `packages/web/app/api/sessions/[id]/recording/route.ts`, `packages/web/src/db/schema.ts` (`recordings`, + migration), `packages/web/app/(settings + meeting)/*`, `packages/shared/src/schema.ts`, `packages/web/tests/{slack.test.ts,recording.test.ts}`.
- **Gate command:** `pnpm --filter @meeting-capture/web db:migrate` then `pnpm --filter @meeting-capture/web test` (with a real/test `SLACK_WEBHOOK_URL` set, asserts a summary payload is posted and the blank-webhook path is skipped cleanly; recording upload persists + serves back) then `pnpm --filter @meeting-capture/web test:e2e` (toggle + attach flows render).
- **How the user tests it (handoff seed):** set `SLACK_WEBHOOK_URL` in `.env`, enable auto-post, generate a summary → it appears in the Slack channel; attach a recording to a meeting and play it back from the transcript view. Search remains a labelled stub.

### Phase 5 — Cross-meeting search (the LAST feature)

- **Goal:** Wire the final stub: ask a question **across ALL transcripts** and get back the exact meeting(s) plus the relevant transcript excerpt and a grounded answer — turning the library into a searchable knowledge base. Capabilities: `cross-meeting-search`, cross-meeting retrieval/indexing, and the search results UI.
- **Independent slices:**
  - `search-backend` (web / `app/api`) — index/retrieve across all meetings' transcript lines, then answer with Gemini, returning `{ answer, matches[{meetingId, meetingTitle, citations[]}] }`. **deps: none (reads Phase 1 data; may add a search index table + migration).**
  - `search-ui` (web / pages+components) — the top-level Search box (a stub since Phase 1) becomes real: results list linking to each matching meeting + jumping to the cited line, with the grounded answer. **deps: `search-backend`.**
  - `search-schema` (shared) — cross-meeting search request/response Zod schema. **deps: none.**
- **Key surfaces / files:** `packages/web/src/search/*`, `packages/web/app/api/search/route.ts`, `packages/web/app/search/*`, `packages/web/src/db/schema.ts` (optional index + migration), `packages/shared/src/schema.ts`, `packages/web/tests/search.test.ts`.
- **Gate command:** `pnpm --filter @meeting-capture/web db:migrate` then `pnpm --filter @meeting-capture/web test` — seeds **multiple** stored meetings where the answer lives in exactly one, and asserts (against **real Gemini**) that search returns that meeting + a citation and does not conflate meetings — then `pnpm --filter @meeting-capture/web test:e2e` (a cross-meeting query returns results linking to the right meeting and jumping to the cited line).
- **How the user tests it (handoff seed):** with several meetings captured, use the top **Search** box to ask something discussed in one of them → results name the exact meeting(s), show the excerpt, and let you jump straight to the cited moment. Every dashboard feature is now real — no stubs remain.
