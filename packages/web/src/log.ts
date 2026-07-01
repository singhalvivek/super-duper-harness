import pino from "pino";

/**
 * Structured JSON logging to stdout (see spec/architecture.md → Observability).
 *
 * Every `/api/*` handler logs a request/response line (method, path, status,
 * latency) and every Gemini call logs a line (surface, input char count,
 * latency, ok/error). Secrets are NEVER logged — the Gemini API key is never
 * passed to these helpers and never appears in any field.
 */

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  // Compact single-line JSON to stdout; readable in dev, machine-parseable
  // everywhere. No secret redaction needed because secrets never reach here.
  base: { service: "meeting-capture-web" },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDev
    ? {}
    : {}),
});

/** Log one API request/response with timing. */
export function logApiRequest(fields: {
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  error?: string;
}): void {
  const { error, ...rest } = fields;
  if (error) {
    logger.error({ kind: "api", ...rest, error }, "api request failed");
  } else {
    logger.info({ kind: "api", ...rest }, "api request");
  }
}

/** Log one Gemini call — never the key, never the transcript content. */
export function logGeminiCall(fields: {
  surface: string;
  inputChars: number;
  latencyMs: number;
  ok: boolean;
  error?: string;
}): void {
  const { error, ...rest } = fields;
  if (fields.ok) {
    logger.info({ kind: "gemini", ...rest }, "gemini call ok");
  } else {
    logger.error({ kind: "gemini", ...rest, error }, "gemini call failed");
  }
}
