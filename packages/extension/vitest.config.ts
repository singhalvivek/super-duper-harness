import { defineConfig } from "vitest/config";

/**
 * Vitest config for the extension's PURE modules (parser + capture buffer +
 * countdown state machine). Runs in a jsdom environment so the parser can be
 * unit-tested against saved Google Meet caption DOM fixtures without a browser
 * or a live Meet. No network, no chrome.* — those live only in content.ts.
 */
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    globals: false,
  },
});
