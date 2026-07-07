# Architecture

> Meeting Capture Assistant — a single-user personal tool that captures Google Meet transcripts from live captions (Chrome MV3 extension), stores them locally, and lets the user browse, read, summarize, and query them from a web dashboard. All TypeScript.

---

## System Overview

Meeting Capture Assistant is an **all-TypeScript pnpm monorepo** with three deployable units and one shared package:

1. **Chrome MV3 extension** (`packages/extension`) — injected into `meet.google.com` tabs. A content script observes Google Meet's live-caption DOM region, parses each caption line into `{ speaker, text, timestamp }`, and buffers the session. A small overlay/popup shows recording status. On **stop**, the buffered transcript is POSTed to the backend ingest endpoint.
2. **Web app** (`packages/web`) — a **Next.js 15** application that serves BOTH the dashboard UI (library, transcript view, and labelled stub panels) AND the backend HTTP API (Next.js Route Handlers under `/api/*`). One app, one server, one port. The API persists sessions to a local database and calls **Google Gemini** to auto-title (Phase 1) and later summarize/answer (Phase 2+).
3. **Shared package** (`packages/shared`) — TypeScript types + Zod schemas for the ingest/list/get API contract, imported by BOTH the extension and the web app so the wire format cannot drift.

> **Why one Next.js app for UI + API (not a separate Node server):** single language, single server, single port, single deploy for a personal tool — the simplest thing that works. Next.js Route Handlers are a first-class Node HTTP surface; a second Express/Fastify server would add a second process, a second port, and CORS between our own halves for no benefit. The extension talks to the same origin's `/api/*` routes. If this app ever needed to run headless without the UI, the Route Handlers could be lifted to a standalone Node server with no contract change (the contract lives in `packages/shared`), so the simplification is not a lock-in.

The **existing** Python/FastAPI/LangGraph skeleton in the repo root (`src/`, `pyproject.toml`, `alembic/`, `agent.py`, `alembic.ini`, `uv.lock`) is **NOT** this project's stack. It is the harness's default skeleton and is being replaced by this TypeScript monorepo. Generators do not extend it. The pre-existing `frontend/` Next.js scaffold is superseded by `packages/web` (repurposed/rebuilt as the dashboard).

## Component Map

```
┌─────────────────────────────┐
│  Chrome MV3 extension        │   packages/extension
│  (content script + popup)    │
│  scrape captions → buffer    │
└───────────────┬─────────────┘
                │  POST /api/sessions  (ingest, JSON)
                ▼
┌─────────────────────────────────────────────────────┐
│  Next.js 15 web app          packages/web            │
│                                                       │
│  Route Handlers /api/*  ──►  Gemini (auto-title)     │
│      │                        via @google/genai      │
│      ▼                                                │
│  Local DB (SQLite + Drizzle) ◄── stores sessions +   │
│      ▲                           transcript lines    │
│      │  GET /api/sessions, GET /api/sessions/:id      │
│  Dashboard UI (React 19) ────► reads library +        │
│  library · transcript view      transcript, renders   │
│  · stub panels (summary/Q&A)    labelled stubs        │
└───────────────────────────────────────────────────────┘
                ▲
                │  shared types + Zod schemas
        packages/shared  (imported by extension AND web)
```

## Layers

| Layer | Responsibility |
|-------|----------------|
| **Capture (extension content script)** | Observe Meet caption DOM, enforce captions-on-to-start, run the 15s caption-off countdown, buffer parsed lines. |
| **Caption parser (pure fn, in extension)** | `parseCaptionNode(el) → CaptionLine \| null` and `mergeCaptionUpdates(...)` — pure, importable, unit-tested against saved DOM fixtures. No DOM-observer glue inside the pure function. |
| **Extension UI (popup/overlay)** | Recording indicator, elapsed timer, caption on/off status, 15s warning. Manual start/stop. NOT a live transcript. |
| **API (Next.js Route Handlers)** | Validate with Zod (shared schemas), persist sessions + lines, orchestrate the Gemini titling call, serve library/transcript reads, health. |
| **LLM pipeline** | Plain `@google/genai` calls — no agent framework. Titling now; summary + chunked Q&A later. Auth errors surfaced clearly. |
| **Storage** | SQLite via Drizzle ORM. Migrations via `drizzle-kit`. Indexed for a growing library of long transcripts. |
| **Dashboard UI (React 19 / Next.js pages)** | Library list, transcript view, labelled non-functional stub panels for deferred features. |

## Data Flow

**Capture → ingest → store → title → read** (Phase 1 primary journey):

1. **Trigger:** User opens a Google Meet, turns on captions, clicks **Start** in the extension popup. If captions are OFF, the extension blocks start and prompts the user to enable them first.
2. **Capture:** The content script's `MutationObserver` watches Meet's caption region; each new/updated caption row is passed to the pure `parseCaptionNode` → `{ speaker, text, timestampMs }` and merged into an ordered in-memory buffer. Elapsed timer + caption-on status update the popup. If captions go OFF mid-meeting, a 15s countdown starts; if not re-enabled, capture stops automatically.
3. **Stop:** User clicks **Stop** (or the countdown expires). The extension assembles the session payload (`startedAt`, `endedAt`, `source: "google-meet"`, ordered `lines[]`) and `POST`s it to `/api/sessions`.
4. **Ingest + store:** The Route Handler validates the payload (Zod), inserts a `meetings` row and its `transcript_lines` rows in one transaction.
5. **Title (Gemini):** The same request calls Gemini (`@google/genai`) with a titling prompt over the transcript text (Gemini's large context window handles 1–2h transcripts in one shot) and writes the returned title back onto the `meetings` row. On Gemini auth failure the ingest still succeeds (transcript is never lost) but the title falls back to a timestamp-based placeholder and the error is logged with an actionable message; the meeting is flagged `title_status: "failed"` so the dashboard can offer a re-title.
6. **Output / read:** The dashboard's **Library** lists meetings (title, date, duration, line count) newest-first; opening one loads the speaker-labelled, timestamped **Transcript view**. Summary / Q&A / Search panels render as labelled stubs.

## External Dependencies

| Dependency | Purpose | Failure Mode |
|------------|---------|--------------|
| **Google Gemini** (`@google/genai`, `GEMINI_API_KEY`) | Auto-title (P1); summary + Q&A (P2+). | On auth failure (401/403/invalid key) surface a CLEAR, actionable error pointing at `.env` / https://aistudio.google.com/apikey — never mask or silently fall back to a stub answer. On titling failure specifically, the transcript is still saved and the title falls back to a placeholder (`title_status="failed"`). |
| **Chrome Extension APIs (MV3)** | `chrome.runtime`, `chrome.tabs`, `chrome.storage`, content-script injection on `meet.google.com`. | If the caption DOM structure changes, the parser returns `null` for unrecognized nodes (never crashes); no lines are captured and the popup shows "0 lines captured" so the user notices. |
| **Google Meet caption DOM** | Source of transcript text (captions-only — no audio/STT anywhere). | Caption text only exists in the DOM while captions are ON; the 15s-off rule + captions-on-to-start enforce this. There is no hidden feed to recover. |
| **Slack Incoming Webhook** (`SLACK_WEBHOOK_URL`) | Auto-post summary when a meeting ends (deferred phase; blank now). | If the webhook URL is blank/unset, the Slack step is skipped silently in that later phase; never blocks ingest. |

## Stack

> This project's concrete technology choices — captured at intake. The generic every-project principles live in `harness/patterns/tech-stack.md`; this section is what **this** project actually uses.

- **Mode:** Greenfield (all-TypeScript monorepo built from scratch; the repo's Python skeleton is replaced, not extended).
- **Language:** TypeScript 5.6+ throughout. Node 24, npm 11 available; **pnpm 11** is the package manager. No Python anywhere.
- **Agent framework:** **None.** This is a plain Gemini-call pipeline (titling now; summary + chunked Q&A later) — NOT LangGraph/CrewAI/AutoGen. See `spec/agent.md`.
- **LLM provider + model:** **Google Gemini** via `@google/genai` (Google Gen AI TypeScript SDK). Model id `gemini-2.5-flash` (configurable via `GEMINI_MODEL` env var; a fast, large-context model well-suited to 1–2h transcripts). API key in `.env` as `GEMINI_API_KEY`.
  > **Assumed:** `gemini-2.5-flash` is the default model; overridable via `GEMINI_MODEL`. The provided `GEMINI_API_KEY` may NOT be the usual AI Studio `AIza…` format — the code must NOT validate the key's shape, must attempt the real call, and must surface the provider's auth error verbatim plus a pointer to `.env` / https://aistudio.google.com/apikey rather than pre-rejecting or masking it.
- **Backend:** **Next.js 15 Route Handlers** (App Router, `app/api/*/route.ts`) — same app/process/port as the dashboard. Runs on the Node.js runtime (not Edge) so it can use the SQLite driver and Node crypto.
- **Database + ORM:** **SQLite** (local file `packages/web/data/meetings.db`) via **Drizzle ORM** + **libSQL** driver (`@libsql/client`, `drizzle-orm/libsql`). Migrations via **drizzle-kit** (dialect `sqlite`, driver `libsql`). SQLite is production for this single-user local tool, so tests run against the same engine (a separate temp libSQL file DB per test run) — never a lighter substitute.
  > **Driver note (binding):** `better-sqlite3` is a native addon that needs a C++ toolchain (node-gyp + Visual Studio) to compile and has **no prebuilt binary for Node 24 (ABI 137) on Windows**, so it cannot install/run here. We use **libSQL** (`@libsql/client` + `drizzle-orm/libsql`) instead: it ships prebuilt cross-platform binaries (no compile step), is fully supported by Drizzle, and uses the **same local-SQLite file format**. It connects via a `file:`-prefixed URL. This remains "local SQLite" — the product requirement is unchanged; only the driver package changes.
  > **Assumed:** DB file path is `packages/web/data/meetings.db`, overridable via `DATABASE_URL`. The connection URL is `file:<path>`; `DATABASE_URL` may be a bare path (code prepends `file:`) or a full `file:`/`libsql:` URL. The `data/` dir is gitignored.
- **Frontend:** **Next.js 15 + React 19** (App Router) with **Tailwind CSS v4**. This is the same app as the backend.
- **Extension:** **Chrome MV3**, TypeScript, bundled with **Vite** (`@crxjs/vite-plugin`) producing an unpacked extension folder at `packages/extension/dist/`. Loaded via `chrome://extensions` → Load unpacked.
  > **Assumed:** Vite + `@crxjs/vite-plugin` is the extension bundler (handles MV3 manifest, content-script + popup entry points, HMR in dev, and a clean `dist/` for Load-unpacked). tsup/esbuild alone would require hand-rolling the MV3 manifest wiring; crxjs is the least-effort correct choice.
- **Dependency management:** **pnpm workspaces** (`pnpm-workspace.yaml`) across three packages, each with a scoped name: `@meeting-capture/shared` (`packages/shared`), `@meeting-capture/web` (`packages/web`), `@meeting-capture/extension` (`packages/extension`). The web and extension packages declare `"@meeting-capture/shared": "workspace:*"` as a dependency.
- **Testing:** **Vitest** for unit/integration (caption parser against DOM fixtures; API ingest/list/get against real SQLite). **Playwright** for dashboard E2E against the running Next.js app.
- **Observability:** Structured JSON request/response logging (input size, output, latency, error) to stdout on every `/api/*` handler and every Gemini call, wired from Phase 1. No LangSmith (no LangGraph).

## Commands

> The single binding source of truth for which tool every generator and gate actually runs. All commands use the pnpm prefix. **Working directory is the repo root `e:\cat-prep\super-duper-harness` unless a `--filter` or explicit `cwd` is noted.** pnpm workspace filters (`--filter <pkg>`) run a package's script from the root without cd-ing.

| Command | Value |
|---------|-------|
| Package-manager run prefix | `pnpm` (workspaces; `pnpm --filter <pkg> <script>` targets a package from the root) |
| Install (all workspaces) | `pnpm install` (from repo root) |
| Test command | `pnpm -r test` (runs Vitest in every package; parser fixtures + API integration against real SQLite). Per-package: `pnpm --filter @meeting-capture/extension test`, `pnpm --filter @meeting-capture/web test` |
| Migration command | `pnpm --filter @meeting-capture/web db:migrate` → runs `drizzle-kit migrate` (applies SQL migrations to the SQLite file at `DATABASE_URL`). Generate migrations from schema with `pnpm --filter @meeting-capture/web db:generate` (`drizzle-kit generate`). |
| E2E / UI test command | `pnpm --filter @meeting-capture/web test:e2e` → `playwright test tests/e2e/ --reporter=line` (drives the running Next.js app; seeds a real session via the API, asserts the library + transcript render real data) |
| Extension build command | `pnpm --filter @meeting-capture/extension build` → `vite build` → produces the unpacked extension at `packages/extension/dist/` |
| Dev run command | `pnpm --filter @meeting-capture/web dev` → `next dev -p 8788` (the dashboard + API). For the extension in dev: `pnpm --filter @meeting-capture/extension dev` (Vite watch → `dist/`). |
| Production run command | `pnpm --filter @meeting-capture/web build` then `pnpm --filter @meeting-capture/web start` (`next start -p 8788`) |
| Dev port | **8788** (dashboard + API; `next dev -p 8788` / `next start -p 8788`). Chosen to avoid common ports (3000/8000/8001). |
| Health endpoint | `GET http://localhost:8788/api/health` → `{ "ok": true, "geminiKeyPresent": <bool>, "dbReady": <bool> }` |
| Dashboard URL | `http://localhost:8788/` (library home) |

| Key library | Version | Purpose |
|-------------|---------|---------|
| next | 15.x | Web app: dashboard UI + `/api/*` Route Handlers (one app) |
| react / react-dom | 19.x | Dashboard UI |
| tailwindcss | 4.x | Dashboard styling (`@tailwindcss/postcss` + `@source` in globals.css) |
| drizzle-orm | ^0.36 | SQLite ORM (schema, queries) |
| drizzle-kit | ^0.28 | Migration generate/apply (`db:generate` / `db:migrate`) |
| @libsql/client | ^0.14 | SQLite driver (libSQL, prebuilt cross-platform binaries — no native compile; Node runtime) — **main dependency**, needed at migrate/deploy time |
| @google/genai | latest | Google Gemini TypeScript SDK (titling now; summary/Q&A later) |
| zod | ^3 | Request/response validation; source of the shared wire types |
| vite | ^5 | Extension bundler |
| @crxjs/vite-plugin | ^2 | MV3 manifest + content-script/popup wiring → unpacked `dist/` |
| vitest | ^2 | Unit + integration tests |
| @playwright/test | ^1 | Dashboard E2E |
| pino | ^9 | Structured JSON logging to stdout |

**Avoid:**
- **No Python / uv / FastAPI / LangGraph / Alembic** — the repo's `src/`, `pyproject.toml`, `alembic/`, `agent.py`, `uv.lock` are dead skeleton for this project; do not extend or run them.
- **No agent-orchestration framework** (LangGraph/CrewAI/AutoGen) — plain Gemini calls only.
- **No second backend server / second port** — do not add Express/Fastify; the Next.js app is the only server.
- **No audio capture / STT / Whisper / speech-to-text anywhere** — capture is captions-only, by design.
- **No Edge runtime for `/api/*`** — SQLite + `@libsql/client` require the Node runtime; set `export const runtime = "nodejs"` on DB-touching handlers.
- **No token/cost UI** — hidden by product decision.
- **No key-format pre-validation** — never reject `GEMINI_API_KEY` for not matching `AIza…`; attempt the call and surface the real auth error.

## Deployment Model

Runs locally on the user's machine: `pnpm --filter @meeting-capture/web dev` (or `build` + `start`) serves the dashboard + API on `http://localhost:8788`; the SQLite DB is a local file; the Chrome extension is loaded unpacked from `packages/extension/dist/` and posts to `http://localhost:8788/api/*`. Single user, no auth, no cloud.
