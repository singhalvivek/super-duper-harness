import { describe, expect, it } from "vitest";

import { IngestSessionSchema } from "@meeting-capture/shared";

import {
  CAPTION_OFF_GRACE_MS,
  CaptureSession,
  type CaptureState,
  initialState,
  reduce,
  secondsLeft,
} from "../src/capture";

/**
 * Deterministic capture-buffer + countdown tests. Time is injected everywhere
 * (no Date.now / setInterval), so every assertion is reproducible. The
 * buildIngestPayload path asserts against the REAL shared schema so the wire
 * format cannot drift.
 */

// ---------------------------------------------------------------------------
// Capture buffer: seq + timestamp assignment
// ---------------------------------------------------------------------------

describe("CaptureSession — seq + timestamp assignment", () => {
  it("assigns 0-based ascending order and non-decreasing offsets", () => {
    const started = 1_000_000;
    const s = new CaptureSession(started);
    s.append({ speaker: "Ada", text: "First line." }, started + 500);
    s.append({ speaker: "Charles", text: "Second line." }, started + 2000);
    s.append({ speaker: "Ada", text: "Third line." }, started + 5000);

    const lines = s.toCaptureLines();
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.text)).toEqual([
      "First line.",
      "Second line.",
      "Third line.",
    ]);
    // Offsets are ms from startedAt and non-decreasing.
    expect(lines.map((l) => l.timestampMs)).toEqual([500, 2000, 5000]);
  });

  it("clamps an out-of-order (earlier) observation to be non-decreasing", () => {
    const started = 1_000_000;
    const s = new CaptureSession(started);
    s.append({ speaker: "Ada", text: "First." }, started + 3000);
    // A later caption arrives with an earlier clock reading (clock skew / retry):
    s.append({ speaker: "Charles", text: "Second." }, started + 1000);
    const offsets = s.toCaptureLines().map((l) => l.timestampMs);
    expect(offsets[0]).toBe(3000);
    expect(offsets[1]).toBeGreaterThanOrEqual(offsets[0]!); // never decreases
  });

  it("clamps a caption observed before startedAt to offset 0", () => {
    const started = 1_000_000;
    const s = new CaptureSession(started);
    s.append({ speaker: "Ada", text: "Early." }, started - 500);
    expect(s.toCaptureLines()[0]?.timestampMs).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Capture buffer: dedupe of Meet re-renders
// ---------------------------------------------------------------------------

describe("CaptureSession — dedupe of in-progress re-renders", () => {
  it("collapses a growing in-progress utterance into ONE finalized line", () => {
    const started = 0;
    const s = new CaptureSession(started);
    // Meet re-renders the SAME row as the speaker keeps talking (text grows):
    s.append({ speaker: "Ada", text: "Let's" }, 1000);
    s.append({ speaker: "Ada", text: "Let's start" }, 1200);
    s.append({ speaker: "Ada", text: "Let's start with" }, 1500);
    s.append({ speaker: "Ada", text: "Let's start with the roadmap." }, 2000);

    const lines = s.toCaptureLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      seq: 0, // 0-based capture order, required by the shared CaptureLine schema
      speaker: "Ada",
      text: "Let's start with the roadmap.",
      timestampMs: 1000, // keeps the utterance's START time, not the last render
    });
  });

  it("ignores identical re-renders (same speaker + same text)", () => {
    const s = new CaptureSession(0);
    s.append({ speaker: "Ada", text: "Hello there." }, 1000);
    s.append({ speaker: "Ada", text: "Hello there." }, 1100);
    s.append({ speaker: "Ada", text: "Hello there." }, 1200);
    expect(s.lineCount()).toBe(1);
  });

  it("starts a NEW line when the speaker changes", () => {
    const s = new CaptureSession(0);
    s.append({ speaker: "Ada", text: "Let's" }, 1000);
    s.append({ speaker: "Ada", text: "Let's begin." }, 1500);
    s.append({ speaker: "Charles", text: "Agreed." }, 3000);
    s.append({ speaker: "Charles", text: "Agreed, let's go." }, 3200);

    const lines = s.toCaptureLines();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ speaker: "Ada", text: "Let's begin." });
    expect(lines[1]).toMatchObject({ speaker: "Charles", text: "Agreed, let's go." });
  });

  it("labels a blank/whitespace speaker as 'Unknown' and skips empty text", () => {
    const s = new CaptureSession(0);
    s.append({ speaker: "   ", text: "Anonymous line." }, 1000);
    s.append({ speaker: "Ada", text: "   " }, 2000); // empty text → skipped
    const lines = s.toCaptureLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]?.speaker).toBe("Unknown");
  });
});

// ---------------------------------------------------------------------------
// Capture buffer: buildIngestPayload matches the SHARED schema exactly
// ---------------------------------------------------------------------------

describe("CaptureSession — buildIngestPayload against the real shared schema", () => {
  it("produces a body that IngestSessionSchema.safeParse ACCEPTS (happy path)", () => {
    const started = 1_719_840_600_000;
    const s = new CaptureSession(started);
    s.append({ speaker: "Ada Lovelace", text: "Let's start with the roadmap." }, started + 1200);
    s.append({ speaker: "Charles Babbage", text: "Sounds good." }, started + 4800);

    const payload = s.buildIngestPayload(started + 3_600_000);
    const result = IngestSessionSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source).toBe("google-meet");
      expect(result.data.lines).toHaveLength(2);
      // seq is implied by array order (0-based ascending); the backend maps it.
      expect(result.data.lines.map((l) => l.timestampMs)).toEqual([1200, 4800]);
      expect(result.data.endedAt).toBeGreaterThanOrEqual(result.data.startedAt);
    }
  });

  it("clamps endedAt up to startedAt if stop time is earlier (edge case)", () => {
    const started = 2_000;
    const s = new CaptureSession(started);
    s.append({ speaker: "Ada", text: "One." }, started + 100);
    const payload = s.buildIngestPayload(started - 5_000); // stop clock earlier
    expect(payload.endedAt).toBe(started);
    expect(IngestSessionSchema.safeParse(payload).success).toBe(true);
  });

  it("throws (error path) when there are zero captured lines", () => {
    const s = new CaptureSession(0);
    expect(() => s.buildIngestPayload(1000)).toThrow(/no caption lines/i);
  });

  it("payload from a deduped multi-utterance session is schema-valid", () => {
    const started = 500_000;
    const s = new CaptureSession(started);
    // Simulate re-renders interleaved with speaker changes.
    s.append({ speaker: "Ada", text: "Hi" }, started + 200);
    s.append({ speaker: "Ada", text: "Hi everyone." }, started + 600);
    s.append({ speaker: "Charles", text: "Hello" }, started + 1500);
    s.append({ speaker: "Charles", text: "Hello, glad to be here." }, started + 1800);
    s.append({ speaker: "Ada", text: "Great, let's begin." }, started + 3000);

    const payload = s.buildIngestPayload(started + 4000);
    expect(payload.lines).toHaveLength(3);
    // Non-decreasing timestamps across the whole array.
    const ts = payload.lines.map((l) => l.timestampMs);
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i]!).toBeGreaterThanOrEqual(ts[i - 1]!);
    }
    expect(IngestSessionSchema.safeParse(payload).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Countdown state machine (captions on/off + 15s)
// ---------------------------------------------------------------------------

describe("capture state machine — START gate (captions-on-to-start)", () => {
  it("blocks START when captions are OFF (no-op, stays idle)", () => {
    const state = initialState(false); // captions off
    const next = reduce(state, { type: "START" }, 0);
    expect(next.status).toBe("idle"); // start blocked
  });

  it("allows START when captions are ON", () => {
    const state = initialState(true);
    const next = reduce(state, { type: "START" }, 0);
    expect(next.status).toBe("recording");
  });
});

describe("capture state machine — 15s caption-off countdown", () => {
  function recording(): CaptureState {
    return reduce(initialState(true), { type: "START" }, 0);
  }

  it("starts a 15s countdown when captions go OFF while recording", () => {
    const state = reduce(recording(), { type: "CAPTIONS_OFF" }, 10_000);
    expect(state.status).toBe("warning");
    expect(state.warningMsLeft).toBe(CAPTION_OFF_GRACE_MS);
    expect(state.countdownStartedAt).toBe(10_000);
    expect(secondsLeft(state, 10_000)).toBe(15);
  });

  it("cancels the countdown when captions come back ON", () => {
    const off = reduce(recording(), { type: "CAPTIONS_OFF" }, 10_000);
    const back = reduce(off, { type: "CAPTIONS_ON" }, 12_000);
    expect(back.status).toBe("recording");
    expect(back.warningMsLeft).toBeNull();
    expect(back.countdownStartedAt).toBeNull();
  });

  it("counts down on TICK and auto-stops when the 15s expire", () => {
    const off = reduce(recording(), { type: "CAPTIONS_OFF" }, 10_000);
    // 5s in — still warning.
    const mid = reduce(off, { type: "TICK" }, 15_000);
    expect(mid.status).toBe("warning");
    expect(secondsLeft(mid, 15_000)).toBe(10);
    // 15s in — expires → stopped.
    const expired = reduce(off, { type: "TICK" }, 25_000);
    expect(expired.status).toBe("stopped");
    expect(expired.warningMsLeft).toBe(0);
  });

  it("does not auto-stop if captions return before expiry (ticks then ON)", () => {
    const off = reduce(recording(), { type: "CAPTIONS_OFF" }, 10_000);
    const ticked = reduce(off, { type: "TICK" }, 20_000); // 10s in, warning
    expect(ticked.status).toBe("warning");
    const back = reduce(ticked, { type: "CAPTIONS_ON" }, 21_000);
    expect(back.status).toBe("recording");
  });

  it("STOP from recording or warning goes to stopped", () => {
    expect(reduce(recording(), { type: "STOP" }, 100).status).toBe("stopped");
    const off = reduce(recording(), { type: "CAPTIONS_OFF" }, 10_000);
    expect(reduce(off, { type: "STOP" }, 11_000).status).toBe("stopped");
  });
});
