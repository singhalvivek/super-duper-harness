import { resolve } from "node:path";

/**
 * Next.js instrumentation hook — runs ONCE at server startup (before any Route
 * Handler), on the Node.js runtime, for both `next dev` and `next start`.
 *
 * Why this exists: the real secrets (`GEMINI_API_KEY`, optional `GEMINI_MODEL`,
 * `DATABASE_URL`, `SLACK_WEBHOOK_URL`) live in the gitignored REPO-ROOT `.env`
 * (two levels up from `packages/web`). Next.js only auto-loads `.env` from the
 * app dir (`packages/web/.env`), which does NOT exist — and we must NOT create
 * one with the secret (that would duplicate/commit the key). So the running web
 * app never saw `GEMINI_API_KEY` at runtime → `/api/health` reported
 * `geminiKeyPresent:false` and titling would auth-fail.
 *
 * This loads the repo-root `.env` into the server process at startup. dotenv
 * does NOT override already-set `process.env` values (`override` defaults to
 * false), so a value injected by the environment (CI, tests, an explicit
 * `DATABASE_URL`) still wins. It is guarded to the Node.js runtime so it never
 * runs on the Edge runtime.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // dotenv is a runtime dependency; import lazily so the Edge bundle never
  // pulls in Node-only code.
  const { config } = await import("dotenv");

  // cwd is `packages/web` at dev/start time; the repo root is two levels up.
  config({ path: resolve(process.cwd(), "..", "..", ".env") });
}
