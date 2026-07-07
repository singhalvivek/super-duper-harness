/**
 * MV3 background service worker.
 *
 * The capture logic lives entirely in the content script (it owns the DOM and
 * the buffer). The service worker's one active job is to perform the ingest
 * POST to the LOCAL dashboard: it runs in the extension context and holds the
 * `http://localhost:8788/*` host-permission, so its request does NOT trigger
 * Chrome's "Local Network Access" prompt that a page-origin (content-script)
 * fetch to localhost would. It also logs install/update for observability.
 */

import { DEFAULT_BACKEND_BASE_URL } from "./capture";
import type { BackgroundCommand, IngestResult } from "./messages";

const INGEST_URL = `${DEFAULT_BACKEND_BASE_URL}/api/sessions`;

chrome.runtime.onInstalled.addListener((details) => {
  // Structured-ish stdout log for observability during dev.
  console.info(
    JSON.stringify({
      ts: new Date().toISOString(),
      event: "extension_installed",
      reason: details.reason,
      version: chrome.runtime.getManifest().version,
    }),
  );
});

/**
 * Handle the content script's INGEST command: POST the session payload to the
 * dashboard and reply with the outcome. Returns `true` to keep the message
 * channel open for the async `sendResponse`.
 */
chrome.runtime.onMessage.addListener(
  (msg: BackgroundCommand, _sender, sendResponse) => {
    if (msg?.type !== "INGEST") return false;

    void (async () => {
      try {
        const res = await fetch(INGEST_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(msg.payload),
        });
        const result: IngestResult = { ok: res.ok, status: res.status };
        sendResponse(result);
      } catch {
        const result: IngestResult = { ok: false, status: null };
        sendResponse(result);
      }
    })();

    return true;
  },
);

export {};
