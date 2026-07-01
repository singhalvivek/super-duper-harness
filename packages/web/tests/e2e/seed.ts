import type { APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";
import {
  IngestSessionSchema,
  IngestResponseSchema,
  type IngestResponse,
} from "@meeting-capture/shared";

/**
 * A deterministic, contract-valid ingest payload used to seed a real session
 * via the API before the dashboard assertions run.
 *
 * It has TWO distinct speakers and several lines with:
 *  - `seq` 0-based ascending (IngestSessionSchema requires seq === index), and
 *  - `timestampMs` (offset from startedAt) non-decreasing,
 * so it passes IngestSessionSchema exactly. Speaker names and caption text are
 * unique/recognizable so the E2E can assert the REAL rendered content (not a
 * 200-only check). We validate the payload against the shared schema here so a
 * contract drift fails loudly in the test rather than at the API.
 */
export function makeSeedPayload(marker: string) {
  const startedAt = 1_719_840_600_000; // fixed for deterministic duration
  const payload = {
    source: "google-meet" as const,
    startedAt,
    endedAt: startedAt + 8 * 60_000, // 8 minutes → duration renders "8:00"
    lines: [
      {
        seq: 0,
        speaker: `Alice Chen ${marker}`,
        text: `Let's kick off the ${marker} roadmap review.`,
        timestampMs: 1_200,
      },
      {
        seq: 1,
        speaker: `Bob Ray ${marker}`,
        text: "Sounds good — I have the metrics ready to share.",
        timestampMs: 4_800,
      },
      {
        seq: 2,
        speaker: `Alice Chen ${marker}`,
        text: "Great. Let's start with the growth numbers.",
        timestampMs: 12_500,
      },
      {
        seq: 3,
        speaker: `Bob Ray ${marker}`,
        text: `We closed the ${marker} quarter up eighteen percent.`,
        timestampMs: 21_000,
      },
    ],
  };

  // Fail loudly if our seed ever drifts from the shared wire contract.
  const parsed = IngestSessionSchema.safeParse(payload);
  expect(
    parsed.success,
    parsed.success ? "" : JSON.stringify(parsed.error?.format()),
  ).toBe(true);

  return payload;
}

/**
 * POST the seed payload to the REAL ingest route and return the validated
 * ingest response (id + Gemini title + header). Titling runs against real
 * Gemini, so we do NOT hard-code the exact title — callers assert it is a
 * non-empty string.
 */
export async function seedSession(
  request: APIRequestContext,
  marker: string,
): Promise<IngestResponse> {
  const res = await request.post("/api/sessions", {
    data: makeSeedPayload(marker),
  });
  expect(
    res.ok(),
    `ingest POST /api/sessions failed: ${res.status()} ${await res.text()}`,
  ).toBeTruthy();

  const body = await res.json();
  const parsed = IngestResponseSchema.safeParse(body);
  expect(
    parsed.success,
    parsed.success
      ? ""
      : `ingest response drifted from contract: ${JSON.stringify(body)}`,
  ).toBe(true);

  const ingest = parsed.data!;
  // Title comes from real Gemini (or a placeholder on auth failure) — either
  // way it must be a non-empty string; we never assert an exact Gemini output.
  expect(ingest.title.length).toBeGreaterThan(0);
  expect(ingest.lineCount).toBe(4);
  return ingest;
}
