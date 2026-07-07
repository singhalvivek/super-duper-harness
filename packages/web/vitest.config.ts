import { defineConfig } from "vitest/config";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

/**
 * Vitest config for the web package's backend integration tests.
 *
 * The API tests run against the REAL SQLite engine (a temp file per run) and
 * the REAL Google Gemini API. The Gemini key lives in the repo-root `.env`, so
 * we load it here (repo root is two levels up from packages/web) before the
 * suite runs. dotenv does not overwrite already-set process.env values, so a
 * per-test override (e.g. the title-failure case pointing at a bad key) still
 * wins within its own scope.
 *
 * Playwright owns `tests/e2e/**`; it is excluded here so `vitest run` does not
 * try to execute the E2E specs.
 */
loadEnv({ path: resolve(__dirname, "../../.env") });

export default defineConfig({
  // Resolve the `@/*` → `src/*` path alias the Route Handlers import with
  // (Next resolves it from tsconfig; Vitest needs it declared here too).
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    // Real Gemini calls over a full transcript can take a few seconds.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
