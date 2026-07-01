/**
 * MV3 background service worker.
 *
 * The capture logic lives entirely in the content script (it owns the DOM and
 * the buffer) and the popup talks to it directly, so the service worker is
 * intentionally minimal — it exists to satisfy MV3's module-SW slot and to log
 * install/update for observability. No capture state is held here.
 */

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

export {};
