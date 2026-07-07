/**
 * Message + shared-state contract between the popup UI and the content script.
 *
 * The content script is the single owner of live capture state (it has the DOM
 * and the buffer). The popup is a thin view: it asks for a snapshot, sends
 * START/STOP commands, and receives pushed status updates. State also lands in
 * chrome.storage.session so a freshly-opened popup can render immediately.
 */

import type { IngestSession } from "@meeting-capture/shared";

import type { CaptureStatus } from "./capture";

/** The status snapshot the popup renders. Serializable (crosses the bridge). */
export interface PopupStatus {
  status: CaptureStatus;
  captionsOn: boolean;
  /** Absolute epoch ms when recording started; null when not recording. */
  startedAt: number | null;
  /** Lines buffered so far (for the "Saved N lines" confirmation). */
  lineCount: number;
  /** Whole seconds left in the caption-off countdown; 0 when not warning. */
  countdownSecondsLeft: number;
  /** Set after a Stop POST resolves: outcome + human-readable detail. */
  lastSave: SaveOutcome | null;
  /** True when the user pressed Start while captions were OFF (gate prompt). */
  startBlockedCaptionsOff: boolean;
}

export interface SaveOutcome {
  ok: boolean;
  lineCount: number;
  /** e.g. "Saved 42 lines" or "Couldn't save — is the dashboard running at :8788?" */
  message: string;
}

/** Popup → content commands. */
export type PopupCommand =
  | { type: "GET_STATUS" }
  | { type: "START" }
  | { type: "STOP" };

/** Content → popup pushes. */
export type ContentPush = { type: "STATUS"; status: PopupStatus };

/**
 * Content → background command: POST the buffered session to the local
 * dashboard. The background service worker performs the network request because
 * it runs in the EXTENSION context (with the `http://localhost:8788/*`
 * host-permission). A `fetch` to localhost from the content script instead runs
 * in the Meet PAGE's context, which triggers Chrome's "Local Network Access"
 * permission prompt on every Stop — routing through the background avoids it.
 */
export type BackgroundCommand = { type: "INGEST"; payload: IngestSession };

/** Background → content reply describing the POST outcome. */
export interface IngestResult {
  ok: boolean;
  /** HTTP status code, or null if the request never completed (network error). */
  status: number | null;
}

/** The chrome.storage.session key the content script writes status under. */
export const STATUS_STORAGE_KEY = "meetingCaptureStatus";

/** The idle/default status a popup shows before the content script answers. */
export function idleStatus(): PopupStatus {
  return {
    status: "idle",
    captionsOn: false,
    startedAt: null,
    lineCount: 0,
    countdownSecondsLeft: 0,
    lastSave: null,
    startBlockedCaptionsOff: false,
  };
}
