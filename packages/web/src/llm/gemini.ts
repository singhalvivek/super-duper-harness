import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { logGeminiCall } from "../log";

/**
 * Google Gemini client wrapper (see spec/agent.md).
 *
 * Plain single-call pipeline — NO agent framework. Phase 1 exposes exactly one
 * surface: `titleTranscript()`. The auth-error contract is strict:
 *
 *  - NEVER pre-validate the key's shape. The provided GEMINI_API_KEY may not be
 *    the usual `AIza…` AI Studio format; we attempt the real call regardless.
 *  - On an auth failure (401/403/invalid key) THROW an actionable error that
 *    names the cause and points at `.env` / the AI Studio key page. Never mask
 *    it, never silently return a canned title.
 *  - One retry on transient (429/5xx) with a short backoff, then surface.
 *
 * The titling caller (the ingest handler) treats ANY throw here as non-fatal:
 * the transcript is still saved with a placeholder title. This module's job is
 * only to make a real call and surface real failures clearly.
 */

const DEFAULT_MODEL = "gemini-2.5-flash";
const AUTH_ERROR_MESSAGE =
  "Gemini authentication failed. Check GEMINI_API_KEY in .env — get a key at https://aistudio.google.com/apikey.";

/** The prompts dir lives at src/prompts; this file is at src/llm. */
const PROMPTS_DIR = resolve(__dirname, "..", "prompts");

function loadPrompt(name: string): string {
  return readFileSync(resolve(PROMPTS_DIR, name), "utf8");
}

function getModelId(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

/** Best-effort classification of a provider error as an auth failure. */
function isAuthError(err: unknown): boolean {
  const status = extractStatus(err);
  if (status === 401 || status === 403) return true;
  const msg = errorText(err).toLowerCase();
  return (
    msg.includes("api key not valid") ||
    msg.includes("api_key_invalid") ||
    msg.includes("invalid api key") ||
    msg.includes("permission denied") ||
    msg.includes("unauthenticated") ||
    msg.includes("authentication")
  );
}

/** Whether an error is transient and worth one retry (429 / 5xx). */
function isTransientError(err: unknown): boolean {
  const status = extractStatus(err);
  if (status === 429) return true;
  if (status !== undefined && status >= 500 && status <= 599) return true;
  const msg = errorText(err).toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("resource_exhausted") ||
    msg.includes("unavailable") ||
    msg.includes("overloaded") ||
    msg.includes("internal error")
  );
}

function extractStatus(err: unknown): number | undefined {
  if (err && typeof err === "object") {
    const anyErr = err as Record<string, unknown>;
    for (const key of ["status", "code", "statusCode"]) {
      const v = anyErr[key];
      if (typeof v === "number") return v;
    }
    // The SDK sometimes stringifies an HTTP status into the message, e.g.
    // "got status: 403 Forbidden" or a JSON blob with "code": 403.
    const m = errorText(err).match(/\b(4\d\d|5\d\d)\b/);
    if (m) return Number(m[1]);
  }
  return undefined;
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/** Normalize the model's title output to a clean short plain-text string. */
function cleanTitle(raw: string): string {
  return raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "") // strip wrapping quotes/backticks
    .replace(/^title:\s*/i, "") // strip an accidental "Title:" prefix
    .replace(/\s+/g, " ")
    .trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Generate a short meeting title from the transcript text (speaker: text lines).
 *
 * @throws an Error with the actionable auth message on an auth failure, or the
 *   surfaced provider error after one retry on a transient failure. The caller
 *   (ingest) is responsible for treating a throw as non-fatal to persistence.
 */
export async function titleTranscript(transcriptText: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY ?? "";
  // Do NOT pre-validate the key shape; only guard the truly-empty case so the
  // error is actionable rather than an opaque SDK crash.
  if (apiKey.length === 0) {
    throw new Error(AUTH_ERROR_MESSAGE);
  }

  const model = getModelId();
  const systemPrompt = loadPrompt("title.md");
  const ai = new GoogleGenAI({ apiKey });
  const inputChars = transcriptText.length;
  const started = Date.now();

  const attempt = async (): Promise<string> => {
    const response = await ai.models.generateContent({
      model,
      contents: transcriptText,
      config: {
        systemInstruction: systemPrompt,
        // A title is a few words. gemini-2.5-flash spends "thinking" tokens
        // from the output budget by default, which truncated short answers;
        // disable thinking for this trivial task and give the visible answer a
        // comfortable budget so the full title comes through.
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 256,
        temperature: 0.4,
      },
    });
    const text = response.text ?? "";
    const title = cleanTitle(text);
    if (title.length === 0) {
      throw new Error("Gemini returned an empty title.");
    }
    return title;
  };

  try {
    let lastErr: unknown;
    for (let tries = 0; tries < 2; tries++) {
      try {
        const title = await attempt();
        logGeminiCall({
          surface: "titleTranscript",
          inputChars,
          latencyMs: Date.now() - started,
          ok: true,
        });
        return title;
      } catch (err) {
        lastErr = err;
        // Auth failures never retry — surface immediately with the actionable
        // message so the user knows exactly what to fix.
        if (isAuthError(err)) {
          throw new Error(`${AUTH_ERROR_MESSAGE} (provider: ${errorText(err)})`);
        }
        // One retry on a transient error, otherwise surface.
        if (tries === 0 && isTransientError(err)) {
          await sleep(500);
          continue;
        }
        throw err instanceof Error ? err : new Error(errorText(err));
      }
    }
    // Unreachable in practice; the loop either returns or throws.
    throw lastErr instanceof Error ? lastErr : new Error(errorText(lastErr));
  } catch (err) {
    logGeminiCall({
      surface: "titleTranscript",
      inputChars,
      latencyMs: Date.now() - started,
      ok: false,
      error: errorText(err),
    });
    throw err;
  }
}
