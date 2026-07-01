/**
 * Content script — the ONLY module allowed to touch chrome.* and the live DOM.
 *
 * It wires the PURE modules (parser.ts, capture.ts) to the real world:
 *   - detects whether Meet captions are currently ON (structural DOM probe),
 *   - runs a MutationObserver over the caption region, feeding each parsed row
 *     into the CaptureSession buffer,
 *   - drives the captions-on/off + 15s countdown state machine on a 1s tick,
 *   - on STOP (manual or countdown-expiry) builds the schema-valid payload and
 *     POSTs it to the backend, retaining the buffer on failure,
 *   - mirrors status to the popup via chrome.runtime messaging + chrome.storage.
 *
 * This file is browser glue: it MUST typecheck and build, but is not unit-tested
 * (its logic lives in the pure modules that ARE tested).
 */

import {
  CaptureSession,
  type CaptureEvent,
  type CaptureState,
  initialState,
  reduce,
  secondsLeft,
} from "./capture";
import {
  STATUS_STORAGE_KEY,
  idleStatus,
  type BackgroundCommand,
  type ContentPush,
  type IngestResult,
  type PopupCommand,
  type PopupStatus,
  type SaveOutcome,
} from "./messages";
import { captionsArePresent, parseCaptionRegion } from "./parser";

const TICK_MS = 1000;

let session: CaptureSession | null = null;
let machine: CaptureState = initialState(detectCaptions());
let lastSave: SaveOutcome | null = null;
let startBlockedCaptionsOff = false;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let captionObserver: MutationObserver | null = null;

/**
 * Structurally detect whether Meet captions are ON right now: the caption
 * region is only mounted in the DOM while captions are enabled.
 */
function detectCaptions(): boolean {
  return captionsArePresent(document);
}

/**
 * Locate the live caption TEXT region element, if present.
 *
 * Requiring `role="region"` is essential: several Meet buttons carry "caption"
 * in their aria-label ("Open caption settings", "Turn off captions") and a bare
 * `[aria-label*="aption"]` match returns one of those buttons — whose children
 * contain no caption rows — so nothing gets captured. The real caption text
 * container is `<div role="region" aria-label="Captions">`.
 */
function findCaptionRegion(): Element | null {
  return (
    document.querySelector('div[role="region"][aria-label*="aption" i]') ??
    document.querySelector('[role="region"][aria-label*="aption" i]') ??
    document.querySelector('[jsname="dsyhDe"]') ??
    document.querySelector(".iOzk7") ??
    document.querySelector(".caption-region")
  );
}

/** Build the current serializable status snapshot for the popup. */
function currentStatus(): PopupStatus {
  const now = Date.now();
  return {
    status: machine.status,
    captionsOn: machine.captionsOn,
    startedAt: session ? session.startedAt : null,
    lineCount: session ? session.lineCount() : 0,
    countdownSecondsLeft: secondsLeft(machine, now),
    lastSave,
    startBlockedCaptionsOff,
  };
}

/** Push status to the popup (best-effort) and mirror it into session storage. */
function publishStatus(): void {
  const status = currentStatus();
  const push: ContentPush = { type: "STATUS", status };
  try {
    chrome.runtime.sendMessage(push).catch(() => {
      /* no popup open — fine */
    });
  } catch {
    /* messaging unavailable — fine */
  }
  chrome.storage?.session
    ?.set({ [STATUS_STORAGE_KEY]: status })
    .catch(() => {
      /* storage optional */
    });
}

/** Apply a state-machine event, then republish + react to transitions. */
function dispatch(event: CaptureEvent): void {
  const prev = machine.status;
  machine = reduce(machine, event, Date.now());
  // Auto-stop side effect: entering "stopped" from an active state → save.
  if (machine.status === "stopped" && prev !== "stopped") {
    void finishAndPost();
  }
  publishStatus();
}

/**
 * Re-scan the whole caption region (mutation-observer callback target).
 *
 * Uses the pure `parseCaptionRegion`, which selects the REAL caption rows
 * (`.nMcdL`) and skips non-caption siblings like the "Jump to recent captions"
 * button and hidden nodes — feeding each parsed line into the deduping buffer.
 */
function scanCaptionRegion(): void {
  if (!session) return;
  if (machine.status !== "recording" && machine.status !== "warning") return;
  const region = findCaptionRegion();
  if (!region) return;
  const now = Date.now();
  for (const parsed of parseCaptionRegion(region)) {
    session.append(parsed, now);
  }
}

/** Start observing the caption region for new/updated caption rows. */
function startObserving(): void {
  stopObserving();
  const region = findCaptionRegion();
  if (!region) return;
  captionObserver = new MutationObserver(() => scanCaptionRegion());
  captionObserver.observe(region, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  scanCaptionRegion(); // capture whatever is already on screen
}

function stopObserving(): void {
  captionObserver?.disconnect();
  captionObserver = null;
}

/** 1s tick: refresh caption on/off detection + drive the countdown. */
function tick(): void {
  const on = detectCaptions();
  if (on !== machine.captionsOn) {
    dispatch({ type: on ? "CAPTIONS_ON" : "CAPTIONS_OFF" });
    if (on) startObserving();
  } else if (machine.status === "warning") {
    dispatch({ type: "TICK" });
  } else {
    publishStatus();
  }
}

function startTicking(): void {
  if (tickTimer) return;
  tickTimer = setInterval(tick, TICK_MS);
}

function stopTicking(): void {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
}

/** Handle a START command from the popup — enforces the captions-on gate. */
function handleStart(): void {
  if (!detectCaptions()) {
    // Captions-on-to-start gate: block and flag the popup to prompt.
    startBlockedCaptionsOff = true;
    machine = { ...machine, captionsOn: false };
    publishStatus();
    return;
  }
  startBlockedCaptionsOff = false;
  lastSave = null;
  session = new CaptureSession(Date.now());
  machine = reduce(initialState(true), { type: "START" }, Date.now());
  startObserving();
  startTicking();
  publishStatus();
}

/** Handle a manual STOP command from the popup. */
function handleStop(): void {
  if (machine.status === "idle" || machine.status === "stopped") return;
  dispatch({ type: "STOP" });
}

/**
 * Build the payload from the buffer and POST it to the backend. On failure,
 * RETAIN the buffer (do not clear `session`) and surface a retryable message.
 */
async function finishAndPost(): Promise<void> {
  stopObserving();
  stopTicking();
  if (!session || session.lineCount() === 0) {
    lastSave = {
      ok: false,
      lineCount: 0,
      message:
        "No caption lines captured — were captions on and did anyone speak?",
    };
    publishStatus();
    return;
  }

  const lineCount = session.lineCount();
  let payload;
  try {
    payload = session.buildIngestPayload(Date.now());
  } catch {
    lastSave = {
      ok: false,
      lineCount,
      message: "No caption lines captured — nothing to save.",
    };
    publishStatus();
    return;
  }

  // Hand the POST to the background service worker (extension context, holds the
  // localhost host-permission) so Chrome does not show a "Local Network Access"
  // prompt on the Meet page for every Stop.
  let result: IngestResult;
  try {
    const request: BackgroundCommand = { type: "INGEST", payload };
    result = (await chrome.runtime.sendMessage(request)) as IngestResult;
  } catch {
    result = { ok: false, status: null };
  }

  if (result?.ok) {
    lastSave = {
      ok: true,
      lineCount,
      message: `Saved ${lineCount} line${lineCount === 1 ? "" : "s"} — open the dashboard.`,
    };
    // Success: clear the buffer so a new capture starts fresh.
    session = null;
  } else if (result?.status) {
    lastSave = {
      ok: false,
      lineCount,
      message: `Couldn't save (HTTP ${result.status}) — is the dashboard running at :8788?`,
    };
  } else {
    // Network error / worker unreachable → keep the buffer for retry.
    lastSave = {
      ok: false,
      lineCount,
      message: "Couldn't save — is the dashboard running at :8788?",
    };
  }
  publishStatus();
}

// --- popup <-> content messaging bridge -------------------------------------

chrome.runtime?.onMessage?.addListener(
  (msg: PopupCommand, _sender, sendResponse) => {
    switch (msg?.type) {
      case "GET_STATUS":
        sendResponse(currentStatus());
        return true;
      case "START":
        handleStart();
        sendResponse(currentStatus());
        return true;
      case "STOP":
        handleStop();
        sendResponse(currentStatus());
        return true;
      default:
        sendResponse(idleStatus());
        return true;
    }
  },
);

// Keep caption on/off detection live even before recording (so the popup's
// "Captions: ON/OFF" and the Start gate are accurate the moment it opens).
startTicking();
publishStatus();
