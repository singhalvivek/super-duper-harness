# Meeting Capture Assistant

Capture Google Meet meetings straight from the **live captions** on screen — with speaker labels and timestamps — store them in a private local library, and browse, read, and (in later phases) summarize and query them from a web dashboard. Single-user, local, all-TypeScript. Capture is captions-only (no audio, no speech-to-text).

> **All commands run from the repository root** (`e:\cat-prep\super-duper-harness`) unless a different working directory is stated. Commands use **pnpm**; `pnpm --filter <pkg> <script>` runs a package's script from the root.

## What it is

An all-TypeScript **pnpm monorepo** with three units:

- **`packages/extension`** — Chrome MV3 extension (TypeScript, built with Vite + @crxjs). A content script scrapes Google Meet's live-caption DOM into `{ speaker, text, timestamp }` lines; a popup shows recording status. On **Stop**, the transcript is POSTed to the backend.
- **`packages/web`** — Next.js 15 app that serves **both** the dashboard UI **and** the backend HTTP API (`/api/*` Route Handlers). Persists to local **SQLite** (Drizzle ORM) and calls **Google Gemini** to auto-title meetings. One app, one server, one port.
- **`packages/shared`** — TypeScript types + Zod schemas for the API contract, imported by both the extension and the web app so the wire format cannot drift.

The full design lives in [`spec/`](spec/) — start with [`spec/roadmap.md`](spec/roadmap.md) and [`spec/architecture.md`](spec/architecture.md).

## Prerequisites

- **Node.js ≥ 20** (tested on Node 24)
- **pnpm 11** (`npm install -g pnpm` if you don't have it)
- A **Google Gemini API key** — get one at https://aistudio.google.com/apikey
- **Google Chrome** (to load the unpacked extension)

## Setup

1. **Install dependencies** (from the repo root):

   ```bash
   pnpm install
   ```

2. **Configure secrets.** Copy `.env.example` to `.env` and set your Gemini key:

   ```bash
   cp .env.example .env
   # then edit .env and set GEMINI_API_KEY=...
   ```

   `.env` is gitignored. See `.env.example` for every variable.

3. **Create the database** (applies the Drizzle migration to the local SQLite file):

   ```bash
   pnpm --filter @meeting-capture/web db:migrate
   ```

## Run the dashboard

From the repo root:

```bash
pnpm --filter @meeting-capture/web dev
```

- Dashboard (Library): **http://localhost:8788/**
- Health check: **http://localhost:8788/api/health** → `{ "ok": true, "geminiKeyPresent": true, "dbReady": true }`

If `geminiKeyPresent` is `false`, set `GEMINI_API_KEY` in `.env` and restart.

## Build + load the Chrome extension

1. **Build the unpacked extension** (from the repo root):

   ```bash
   pnpm --filter @meeting-capture/extension build
   ```

   This produces the unpacked extension at **`packages/extension/dist/`**.

2. In Chrome, open **chrome://extensions**, toggle **Developer mode** ON (top-right), click **Load unpacked**, and select the folder:

   ```
   e:\cat-prep\super-duper-harness\packages\extension\dist
   ```

3. Pin the **Meeting Capture Assistant** extension.

## Capture a meeting

1. Join any **Google Meet**.
2. **Turn on captions** (the CC button, or More options → Captions). Captions must be ON to start recording.
3. Click the extension icon → **Start**. The popup shows a recording indicator, an elapsed timer, and the caption on/off status. (If captions are OFF, Start is blocked with a prompt to turn them on.)
4. If captions are turned OFF mid-meeting, a **15-second countdown** warns you; turn them back on to keep recording, or let it expire to auto-stop.
5. Click **Stop** to finish. The transcript is sent to the dashboard, auto-titled by Gemini, and appears in the **Library**.

## Commands

| Task | Command (from repo root) |
|------|--------------------------|
| Install | `pnpm install` |
| Migrate DB | `pnpm --filter @meeting-capture/web db:migrate` |
| Generate migration from schema | `pnpm --filter @meeting-capture/web db:generate` |
| Run dashboard + API (dev) | `pnpm --filter @meeting-capture/web dev` (port **8788**) |
| Production build + start | `pnpm --filter @meeting-capture/web build` then `pnpm --filter @meeting-capture/web start` |
| Build extension | `pnpm --filter @meeting-capture/extension build` → `packages/extension/dist/` |
| Run all unit/integration tests | `pnpm -r test` |
| Run web tests only | `pnpm --filter @meeting-capture/web test` |
| Run extension tests only | `pnpm --filter @meeting-capture/extension test` |
| Run dashboard E2E (Playwright) | `pnpm --filter @meeting-capture/web test:e2e` |

Tests run against the **real Gemini API** (key from `.env`) and the **real SQLite engine** (a temp DB file per run).

## Status (phased build)

- **Phase 1 — Capture → Store → Read (current):** REAL end-to-end — extension capture, `/api/*` ingest/list/get, Gemini titling, the Library list, and the speaker-labelled, timestamped Transcript view. The **AI Summary**, **Q&A**, and **Cross-meeting search** panels are visible but **labelled non-functional stubs** ("Coming soon").
- **Phase 2 —** AI Summary (TL;DR + key points + action items with owners).
- **Phase 3 —** Grounded Q&A on a meeting (long-transcript retrieval, jump-to-moment citations, "not in transcript" flag, persisted history).
- **Phase 4 —** Slack auto-post + saved recording.
- **Phase 5 —** Cross-meeting search (the last feature).

See [`spec/roadmap.md`](spec/roadmap.md) for the full plan.
