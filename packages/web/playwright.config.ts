import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the Meeting Capture Assistant dashboard E2E.
 *
 * The gate drives the REAL running Next.js app on port 8788 (the dashboard +
 * `/api/*` in one app). We build a production bundle and `next start` it so the
 * E2E exercises the same Tailwind-expanded CSS and Server-Component data fetch
 * the user gets — not a dev-only path.
 *
 * DB READINESS: the E2E seeds a session via the real ingest API, which requires
 * the SQLite schema to already be migrated. Per spec/roadmap.md the gate runs
 * `pnpm --filter @meeting-capture/web db:migrate` BEFORE this suite. To keep the
 * one-command `test:e2e` self-sufficient we also run the migration in the
 * webServer command right before `next start`, so a fresh checkout's E2E does
 * not fail on an unmigrated DB.
 *
 * `reuseExistingServer` lets a developer keep `pnpm dev` running and re-run the
 * suite against it locally; in CI a fresh server is always started.
 */
const PORT = 8788;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "line" : "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Build, ensure the DB schema exists, then serve the production bundle.
    command:
      "pnpm exec next build && pnpm exec drizzle-kit migrate && pnpm exec next start -p 8788",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
