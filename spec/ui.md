# UI — Meeting Capture Assistant

> Two UI surfaces: the **dashboard** (Next.js web app, `packages/web`) and the **extension capture UI** (Chrome MV3 popup/overlay, `packages/extension`). Tech is the project's chosen stack; see [architecture.md](architecture.md) → `## Stack`.

---

## UI Type

- **Dashboard:** local web app (Next.js 15 + React 19 + Tailwind v4) at `http://localhost:8788/`. The user browses and works with **one meeting at a time**.
- **Extension capture UI:** a minimal MV3 popup (status only — NOT a live scrolling transcript). Keep it out of the way; manual start/stop.

---

## Dashboard — Views / Screens

### Screen: Library (home, `/`)  — Phase 1, REAL

**Purpose:** Browse the growing library of past meetings and open one.

**Key elements:**
- Header with app name and a **top Search box** (labelled STUB in P1 — "Search across all meetings — coming soon", disabled/greyed, non-functional; becomes real in P5).
- Meeting list, **newest-first**: each row shows the Gemini title (or placeholder + a small "re-title" affordance if `titleStatus="failed"`), date/time, duration, and line count.
- Empty state: "No meetings captured yet — load the extension and start a Meet with captions on."

**Actions available:**
- Click a meeting row → open its detail page.
- (Search box is present but disabled in P1.)

**Data source:** `GET /api/sessions`.

### Screen: Meeting detail (`/meetings/:id`) — Phase 1, transcript REAL + labelled STUB panels

**Purpose:** Read one meeting's transcript; (later) summary and Q&A.

**Layout:** transcript as the primary column; a side/lower area with the Summary, Q&A, and (from library) Search entry points.

**Key elements:**
- **Transcript view (REAL, P1):** speaker-labelled, timestamped lines in capture order — each line shows `speaker`, the `text`, and a formatted timestamp (offset from start). Readable, scannable; long (1–2h) transcripts scroll smoothly. Each line has a stable anchor (its `line.id`) so Phase-3 citations can jump to it.
- **AI Summary panel (STUB, P1 → REAL P2):** a clearly-labelled "AI Summary — coming soon" placeholder card showing the intended shape (TL;DR / Key points / Action items) greyed out. In P2 it renders the real TL;DR paragraph, bulleted key points/decisions, and action items with owners, each linking back into the transcript.
- **Q&A panel (STUB, P1 → REAL P3):** a clearly-labelled "Ask about this meeting — coming soon" placeholder (disabled input). In P3 it becomes a chat with grounded answers, clickable **jump-to-moment** citations (scroll transcript to the cited line), a clear **"Not found in this transcript"** state, and persisted history.

**Actions available:**
- Scroll/read the transcript (P1).
- (P2) Generate/regenerate summary. (P3) Ask questions, click citations. (P4) Attach/play a recording, toggle Slack auto-post.

**Data source:** `GET /api/sessions/:id`.

### Stub labelling rule (Phase 1)

Every non-functional area (Search box, Summary panel, Q&A panel) is visibly labelled "Coming soon", rendered greyed/disabled, and shows the intended shape so the user sees the vision. A stub must **never** look like a broken or empty real feature — it is clearly a placeholder, not a bug. Playwright E2E asserts these stubs are present-and-labelled (not interactive) in P1.

## Dashboard — Error & Loading States

- **Loading:** library and transcript show a skeleton/spinner while fetching.
- **Empty library:** the empty-state message above.
- **Meeting not found (404):** "That meeting doesn't exist" with a link back to the library.
- **Title failed:** a small inline "titling failed — re-title" note on the row/detail (transcript still shown fully).
- **API/network error:** an inline error banner with a retry, never a blank white screen.

## Dashboard — Tech Stack

Next.js 15 (App Router) + React 19 + Tailwind CSS v4. Same app/process/port as the API (`:8788`). Playwright E2E in `packages/web/tests/e2e/`.

---

## Extension capture UI (Chrome MV3 popup) — Phase 1, REAL

**Purpose:** Start/stop capture and show status only. Deliberately minimal and out of the way.

**Key elements:**
- **Start / Stop button** (manual control).
- **Captions-on gate:** if Meet captions are OFF when the user clicks Start, Start is blocked and the popup prompts: "Turn on Google Meet captions first, then Start." (Detected from the caption DOM presence.)
- **Recording indicator:** a clear on-air dot/badge while capturing.
- **Elapsed timer:** counts up while recording.
- **Caption status:** "Captions: ON / OFF".
- **15-second caption-off warning:** if captions go OFF mid-capture, a prominent countdown — "Recording will stop in 15s unless you turn captions back on" — that cancels if captions return, or auto-stops at 0.
- **Post-stop confirmation:** a brief "Saved N lines — open dashboard" with a link to `http://localhost:8788/`.

**What it does NOT show:** a live scrolling transcript. Status only.

**Actions available:**
- Start (blocked unless captions on), Stop, open dashboard.

**Error states:**
- Captions off on Start → the prompt above (not an error, a gate).
- Backend unreachable on Stop → "Couldn't save — is the dashboard running at :8788?" with the buffered session retained so the user can retry.
- 0 lines captured → "No caption lines captured — were captions on and did anyone speak?" (so a DOM-structure change surfaces as a visible signal, not a silent success).
