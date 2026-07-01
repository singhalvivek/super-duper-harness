import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import manifest from "./manifest.config";

/**
 * Vite + @crxjs/vite-plugin build for the MV3 extension.
 *
 * `crx({ manifest })` wires the MV3 manifest, the content script, the popup
 * HTML entry, and the background service worker into a single unpacked build
 * under `dist/`. That `dist/` folder is what the user Load-unpacks in
 * chrome://extensions.
 */
export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    // Keep the popup + service-worker output stable and Chrome-friendly.
    rollupOptions: {
      input: {
        popup: "src/popup.html",
      },
    },
    // Chrome does not accept top-level await / esm-in-worker quirks that a
    // modern target can emit; MV3 in current Chrome is fine with ES2022.
    target: "es2022",
  },
});
