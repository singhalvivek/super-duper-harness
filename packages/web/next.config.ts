import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

/**
 * Load the gitignored REPO-ROOT `.env` (two levels up from `packages/web`) into
 * the server process at config-load time.
 *
 * Why here and not `instrumentation.ts`: the real secrets (`GEMINI_API_KEY`,
 * optional `GEMINI_MODEL`, `DATABASE_URL`, `SLACK_WEBHOOK_URL`) live in the
 * repo-root `.env`, which Next does not auto-load (it only reads
 * `packages/web/.env`, which must not hold the secret). `next.config.ts` runs
 * in PLAIN Node during `next dev` / `next build` / `next start` startup and is
 * NEVER webpack-bundled — so `dotenv`/`node:path` work freely here. Putting the
 * loader in `instrumentation.ts` instead breaks `next dev`: instrumentation is
 * compiled for the Edge runtime too, where `node:fs`/bare-`require('path')`
 * throw at build time, crashing every request with a 500. Loading in the config
 * runs once in the same process that serves requests, so Route Handlers see the
 * vars at request time. dotenv does not override already-set vars, so an
 * explicit env (CI, tests) still wins.
 */
loadEnv({ path: resolve(process.cwd(), "..", "..", ".env") });

/**
 * Next.js 15 App Router config for the Meeting Capture Assistant web app.
 *
 * The `/api/*` Route Handlers each pin `export const runtime = "nodejs"`
 * (they use the libSQL native driver + Node crypto, which the Edge runtime
 * cannot load). `serverExternalPackages` keeps the native `@libsql/client`
 * binding out of the server bundle so it is required at runtime from
 * node_modules rather than being (incorrectly) traced/bundled.
 *
 * `@meeting-capture/shared` is imported as workspace TypeScript source, so it
 * is transpiled by Next rather than being pre-built.
 */
const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "libsql"],
  transpilePackages: ["@meeting-capture/shared"],
};

export default nextConfig;
