import { describe, expect, it } from "vitest";
import {
  ApiErrorSchema,
  CaptureLineSchema,
  HealthResponseSchema,
  IngestResponseSchema,
  IngestSessionSchema,
  MeetingDetailSchema,
  MeetingListItemSchema,
  MeetingListResponseSchema,
  TranscriptLineSchema,
} from "../src/index";

/**
 * Pure/offline contract tests. Every case uses `safeParse` and asserts on the
 * boolean `.success` (plus the applied default where relevant), so the suite is
 * fully deterministic — no LLM, no network, no DB. These schemas are the wire
 * contract the extension and web slices import, so a break here breaks both.
 * Shapes are authored against spec/api.md (the binding contract).
 */

/** A well-formed ingest payload used as the happy-path baseline. */
function validIngest() {
  return {
    source: "google-meet" as const,
    startedAt: 1_719_840_600_000,
    endedAt: 1_719_844_200_000,
    lines: [
      { seq: 0, speaker: "Alice Chen", text: "Let's start with the roadmap.", timestampMs: 1200 },
      { seq: 1, speaker: "Bob Ray", text: "Sounds good.", timestampMs: 4800 },
    ],
  };
}

describe("IngestSessionSchema — happy path", () => {
  it("parses a valid ingest payload", () => {
    expect(IngestSessionSchema.safeParse(validIngest()).success).toBe(true);
  });

  it("defaults source to 'google-meet' when omitted", () => {
    const { source: _omit, ...noSource } = validIngest();
    const result = IngestSessionSchema.safeParse(noSource);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source).toBe("google-meet");
    }
  });

  it("accepts a single line (minimum length)", () => {
    const payload = { ...validIngest(), lines: [validIngest().lines[0]] };
    expect(IngestSessionSchema.safeParse(payload).success).toBe(true);
  });

  it("accepts endedAt === startedAt (zero-length boundary)", () => {
    const payload = { ...validIngest(), startedAt: 1000, endedAt: 1000 };
    expect(IngestSessionSchema.safeParse(payload).success).toBe(true);
  });

  it("accepts equal consecutive timestampMs (non-decreasing boundary)", () => {
    const payload = {
      ...validIngest(),
      lines: [
        { seq: 0, speaker: "A", text: "one", timestampMs: 500 },
        { seq: 1, speaker: "B", text: "two", timestampMs: 500 },
      ],
    };
    expect(IngestSessionSchema.safeParse(payload).success).toBe(true);
  });
});

describe("IngestSessionSchema — edge & error paths", () => {
  it("rejects an empty lines array", () => {
    const payload = { ...validIngest(), lines: [] };
    expect(IngestSessionSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects endedAt < startedAt", () => {
    const payload = { ...validIngest(), startedAt: 2000, endedAt: 1000 };
    expect(IngestSessionSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects a line with empty text", () => {
    const payload = {
      ...validIngest(),
      lines: [{ seq: 0, speaker: "Alice", text: "", timestampMs: 0 }],
    };
    expect(IngestSessionSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects a line with empty speaker", () => {
    const payload = {
      ...validIngest(),
      lines: [{ seq: 0, speaker: "", text: "hello", timestampMs: 0 }],
    };
    expect(IngestSessionSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects a negative timestampMs", () => {
    const payload = {
      ...validIngest(),
      lines: [{ seq: 0, speaker: "Alice", text: "hello", timestampMs: -1 }],
    };
    expect(IngestSessionSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects a non-integer timestampMs", () => {
    const payload = {
      ...validIngest(),
      lines: [{ seq: 0, speaker: "Alice", text: "hello", timestampMs: 12.5 }],
    };
    expect(IngestSessionSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects seq that is not 0-based ascending", () => {
    const payload = {
      ...validIngest(),
      lines: [
        { seq: 0, speaker: "A", text: "one", timestampMs: 0 },
        { seq: 2, speaker: "B", text: "two", timestampMs: 10 },
      ],
    };
    expect(IngestSessionSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects lines whose first seq is not 0", () => {
    const payload = {
      ...validIngest(),
      lines: [{ seq: 1, speaker: "A", text: "one", timestampMs: 0 }],
    };
    expect(IngestSessionSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects decreasing timestampMs across lines", () => {
    const payload = {
      ...validIngest(),
      lines: [
        { seq: 0, speaker: "A", text: "one", timestampMs: 5000 },
        { seq: 1, speaker: "B", text: "two", timestampMs: 100 },
      ],
    };
    expect(IngestSessionSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects a source other than 'google-meet'", () => {
    const payload = { ...validIngest(), source: "zoom" };
    expect(IngestSessionSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects a missing startedAt", () => {
    const { startedAt: _omit, ...noStart } = validIngest();
    expect(IngestSessionSchema.safeParse(noStart).success).toBe(false);
  });
});

describe("CaptureLineSchema", () => {
  it("parses a valid capture line", () => {
    const line = { seq: 0, speaker: "Alice", text: "hello", timestampMs: 0 };
    expect(CaptureLineSchema.safeParse(line).success).toBe(true);
  });

  it("rejects a missing seq", () => {
    const line = { speaker: "Alice", text: "hello", timestampMs: 0 };
    expect(CaptureLineSchema.safeParse(line).success).toBe(false);
  });
});

describe("TranscriptLineSchema", () => {
  it("parses a valid stored line", () => {
    const line = {
      id: "l1-uuid",
      seq: 0,
      speaker: "Alice Chen",
      text: "Let's start with the roadmap.",
      timestampMs: 1200,
    };
    expect(TranscriptLineSchema.safeParse(line).success).toBe(true);
  });

  it("rejects a missing id", () => {
    const line = { seq: 0, speaker: "Alice", text: "hi", timestampMs: 0 };
    expect(TranscriptLineSchema.safeParse(line).success).toBe(false);
  });
});

describe("MeetingListItemSchema + MeetingListResponseSchema", () => {
  const item = {
    id: "b3f1-uuid",
    title: "Q3 Roadmap Planning",
    titleStatus: "ok" as const,
    startedAt: 1_719_840_600_000,
    durationMs: 3_600_000,
    lineCount: 128,
  };

  it("parses a valid list item", () => {
    expect(MeetingListItemSchema.safeParse(item).success).toBe(true);
  });

  it("parses a 'failed' titleStatus", () => {
    expect(MeetingListItemSchema.safeParse({ ...item, titleStatus: "failed" }).success).toBe(true);
  });

  it("rejects an out-of-enum titleStatus", () => {
    expect(MeetingListItemSchema.safeParse({ ...item, titleStatus: "pending" }).success).toBe(false);
  });

  it("parses the list response envelope", () => {
    expect(MeetingListResponseSchema.safeParse({ meetings: [item], total: 1 }).success).toBe(true);
  });

  it("parses an empty library list", () => {
    expect(MeetingListResponseSchema.safeParse({ meetings: [], total: 0 }).success).toBe(true);
  });
});

describe("MeetingDetailSchema", () => {
  it("parses a valid meeting detail with a lines array", () => {
    const detail = {
      id: "b3f1-uuid",
      title: "Q3 Roadmap Planning",
      titleStatus: "ok" as const,
      source: "google-meet",
      startedAt: 1_719_840_600_000,
      endedAt: 1_719_844_200_000,
      durationMs: 3_600_000,
      lineCount: 2,
      lines: [
        { id: "l1", seq: 0, speaker: "Alice Chen", text: "Let's start.", timestampMs: 1200 },
        { id: "l2", seq: 1, speaker: "Bob Ray", text: "Sounds good.", timestampMs: 4800 },
      ],
    };
    expect(MeetingDetailSchema.safeParse(detail).success).toBe(true);
  });

  it("rejects a detail with a malformed line (missing id)", () => {
    const detail = {
      id: "b3f1-uuid",
      title: "Q3 Roadmap Planning",
      titleStatus: "ok" as const,
      source: "google-meet",
      startedAt: 1000,
      endedAt: 2000,
      durationMs: 1000,
      lineCount: 1,
      lines: [{ seq: 0, speaker: "Alice", text: "hi", timestampMs: 0 }],
    };
    expect(MeetingDetailSchema.safeParse(detail).success).toBe(false);
  });
});

describe("IngestResponseSchema", () => {
  const base = {
    id: "b3f1-uuid",
    title: "Q3 Roadmap Planning",
    titleStatus: "ok" as const,
    source: "google-meet",
    startedAt: 1_719_840_600_000,
    endedAt: 1_719_844_200_000,
    durationMs: 3_600_000,
    lineCount: 2,
    createdAt: 1_719_844_205_000,
  };

  it("parses a successful 201 response", () => {
    expect(IngestResponseSchema.safeParse(base).success).toBe(true);
  });

  it("parses a titling-failed response (titleStatus 'failed')", () => {
    const failed = { ...base, title: "Meeting on 2026-07-01 14:30", titleStatus: "failed" as const };
    expect(IngestResponseSchema.safeParse(failed).success).toBe(true);
  });

  it("rejects a missing createdAt", () => {
    const { createdAt: _omit, ...noCreated } = base;
    expect(IngestResponseSchema.safeParse(noCreated).success).toBe(false);
  });
});

describe("HealthResponseSchema", () => {
  it("parses a valid health response", () => {
    const health = { ok: true, geminiKeyPresent: true, dbReady: true };
    expect(HealthResponseSchema.safeParse(health).success).toBe(true);
  });

  it("parses a degraded health response (no key)", () => {
    const health = { ok: true, geminiKeyPresent: false, dbReady: true };
    expect(HealthResponseSchema.safeParse(health).success).toBe(true);
  });

  it("rejects a non-boolean field", () => {
    const health = { ok: "yes", geminiKeyPresent: true, dbReady: true };
    expect(HealthResponseSchema.safeParse(health).success).toBe(false);
  });
});

describe("ApiErrorSchema", () => {
  it("parses a valid error envelope", () => {
    const err = { error: { code: "VALIDATION_ERROR", message: "lines must not be empty" } };
    expect(ApiErrorSchema.safeParse(err).success).toBe(true);
  });

  it("rejects a bare error string (not the envelope shape)", () => {
    const err = { error: "boom" };
    expect(ApiErrorSchema.safeParse(err).success).toBe(false);
  });
});
