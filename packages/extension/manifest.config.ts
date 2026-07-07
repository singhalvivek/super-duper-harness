import { defineManifest } from "@crxjs/vite-plugin";

/**
 * Chrome MV3 manifest for the Meeting Capture Assistant extension.
 *
 * - content script runs on Google Meet tabs (`document_idle`) and observes the
 *   live-caption DOM region.
 * - the action popup is the status UI (indicator / timer / caption on-off /
 *   15s warning). NOT a live transcript.
 * - permissions are minimal: `storage` (share capture state with the popup),
 *   `activeTab`. host permissions cover Meet (where we read captions) and the
 *   local backend (where we POST the buffered session on stop).
 */
export default defineManifest({
  manifest_version: 3,
  name: "Meeting Capture Assistant",
  version: "0.1.0",
  description:
    "Capture Google Meet live captions (speaker-labelled, timestamped) and save them to your local Meeting Capture dashboard.",
  icons: {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    48: "icons/icon-48.png",
    128: "icons/icon-128.png",
  },
  action: {
    default_popup: "src/popup.html",
    default_title: "Meeting Capture Assistant",
    default_icon: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
      128: "icons/icon-128.png",
    },
  },
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["https://meet.google.com/*"],
      js: ["src/content.ts"],
      run_at: "document_idle",
    },
  ],
  permissions: ["storage", "activeTab"],
  host_permissions: ["https://meet.google.com/*", "http://localhost:8788/*"],
});
