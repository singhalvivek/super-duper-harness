/**
 * PURE, importable capture-buffer + caption-off countdown state machine.
 *
 * No chrome.*, no live DOM, no timers, no network. Timing is INJECTED (the
 * caller passes an absolute epoch-ms `now`), so the whole thing is
 * deterministic and unit-testable. content.ts is the only place that wires this
 * to a MutationObserver, `Date.now()`, and `fetch`.
 *
 * Responsibilities:
 *   - Assign 0-based ascending `seq` and non-decreasing `timestampMs` (offset
 *     from `startedAt`) to each committed line.
 *   - DEDUPE Meet's re-renders: Meet mutates the SAME caption row repeatedly as
 *     a speaker keeps talking (the text grows). We keep the in-progress line for
 *     a given speaker as a single, updatable buffer entry and only "finalize" it
 *     when the speaker changes or capture stops — so one utterance = one line,
 *     not dozens.
 *   - Produce a schema-valid `IngestSession` payload (seq 0-based ascending,
 *     timestampMs non-decreasing, endedAt >= startedAt, >= 1 non-empty line).
 *   - Model the captions-on/off + 15s-countdown lifecycle as a pure reducer.
 */

import type { CaptureLine, IngestSession } from "@meeting-capture/shared";

import type { ParsedCaption } from "./parser";

/** Default caption-off grace period before capture auto-stops (ms). */
export const CAPTION_OFF_GRACE_MS = 15_000;

/** Backend base URL — overridable, but the local dev default. */
export const DEFAULT_BACKEND_BASE_URL = "http://localhost:8788";

// ---------------------------------------------------------------------------
// Capture buffer
// ---------------------------------------------------------------------------

/** A line the buffer is holding, before it becomes a wire `CaptureLine`. */
interface BufferedLine {
  speaker: string;
  text: string;
  /** timestampMs offset from startedAt, clamped non-decreasing. */
  timestampMs: number;
  /** true once this line can no longer be updated by a re-render. */
  finalized: boolean;
}

/**
 * A single capture session. Construct with `startedAt` (absolute epoch ms).
 * Feed it parsed captions with `append(parsed, now)`; on stop call
 * `buildIngestPayload(now)` to get a schema-valid body.
 */
export class CaptureSession {
  readonly startedAt: number;
  private lines: BufferedLine[] = [];
  /** The last non-finalized line's index, so re-renders update in place. */
  private openLineIndex: number | null = null;
  /** Largest offset committed so far — enforces non-decreasing timestamps. */
  private maxOffset = 0;

  constructor(startedAt: number) {
    this.startedAt = startedAt;
  }

  /** Offset (ms) from startedAt for an absolute `now`, clamped non-decreasing. */
  private offsetFor(now: number): number {
    const raw = now - this.startedAt;
    const clamped = raw < 0 ? 0 : raw;
    // Non-decreasing: never emit an offset smaller than one already committed.
    const monotonic = clamped < this.maxOffset ? this.maxOffset : clamped;
    this.maxOffset = monotonic;
    return monotonic;
  }

  /**
   * Append (or update) a parsed caption observed at absolute time `now`.
   *
   * Dedupe rule: while the SAME speaker keeps talking, Meet re-renders the row
   * with progressively longer text. We treat that as ONE in-progress line and
   * update it in place. When the speaker changes (a new person talks), the
   * previous line is finalized and a new in-progress line begins. Identical
   * re-renders (same speaker + same text) are ignored entirely.
   */
  append(parsed: ParsedCaption, now: number): void {
    const speaker = parsed.speaker.trim() || "Unknown";
    const text = parsed.text.trim();
    if (!text) return; // never buffer empty text (schema requires min(1))

    const open =
      this.openLineIndex !== null ? this.lines[this.openLineIndex] : undefined;

    if (open && !open.finalized && open.speaker === speaker) {
      // Same speaker still talking → update the in-progress line's text.
      if (open.text === text) return; // identical re-render → no-op (dedupe)
      open.text = text;
      // Keep the ORIGINAL start timestamp of the utterance (do not advance it
      // on every re-render); just ensure monotonicity is respected globally.
      this.offsetFor(now);
      return;
    }

    // Meet's caption region renders several rows at once (the last ~2–3
    // utterances), and we re-scan the WHOLE region on every mutation. So an
    // already-finalized older row is re-observed after a newer speaker's line
    // has opened. If this exact (speaker, text) matches a recently-finalized
    // line, it's that re-render — ignore it rather than creating a duplicate.
    for (
      let i = this.lines.length - 1, checked = 0;
      i >= 0 && checked < 4;
      i--, checked++
    ) {
      const prior = this.lines[i];
      if (!prior) continue;
      if (prior.finalized && prior.speaker === speaker && prior.text === text) {
        return;
      }
    }

    // A new speaker (or first line): finalize the previous open line and start
    // a fresh in-progress one.
    if (open && !open.finalized) open.finalized = true;

    const timestampMs = this.offsetFor(now);
    this.lines.push({ speaker, text, timestampMs, finalized: false });
    this.openLineIndex = this.lines.length - 1;
  }

  /** Finalize any in-progress line (called on stop). */
  private finalizeOpen(): void {
    if (this.openLineIndex !== null) {
      const open = this.lines[this.openLineIndex];
      if (open) open.finalized = true;
    }
  }

  /** Number of buffered lines (in-progress + finalized). */
  lineCount(): number {
    return this.lines.length;
  }

  /**
   * The committed lines as wire `CaptureLine[]`.
   *
   * NOTE: the frozen shared contract (`CaptureLineSchema` in
   * @meeting-capture/shared) REQUIRES a `seq` field — 0-based ascending capture
   * order — alongside `speaker`, `text`, and `timestampMs`, and
   * `IngestSessionSchema` refines `lines.every((line, i) => line.seq === i)`.
   * `seq` is therefore assigned here from each line's 0-based array index so the
   * emitted body satisfies the schema exactly. (Earlier this method omitted
   * `seq`, which made `IngestSessionSchema.safeParse` reject the payload.)
   */
  toCaptureLines(): CaptureLine[] {
    return this.lines.map((l, i) => ({
      seq: i,
      speaker: l.speaker,
      text: l.text,
      timestampMs: l.timestampMs,
    }));
  }

  /**
   * Build the schema-valid `IngestSession` body for POST /api/sessions.
   *
   * Guarantees (matching @meeting-capture/shared IngestSessionSchema):
   *   - `source: "google-meet"`
   *   - `endedAt >= startedAt` (endedAt clamped up to startedAt if `now` is
   *     somehow earlier)
   *   - `lines[i]` has 0-based ascending index (array order == seq) with
   *     non-decreasing `timestampMs`, non-empty speaker + text.
   *
   * Throws only if there are zero buffered lines — the caller (content.ts) must
   * check `lineCount()` first and surface "0 lines captured" to the popup
   * rather than POSTing an empty session.
   */
  buildIngestPayload(now: number): IngestSession {
    this.finalizeOpen();
    if (this.lines.length === 0) {
      throw new Error("Cannot build ingest payload: no caption lines captured.");
    }
    const endedAt = now < this.startedAt ? this.startedAt : now;
    return {
      source: "google-meet",
      startedAt: this.startedAt,
      endedAt,
      lines: this.toCaptureLines(),
    };
  }
}

// ---------------------------------------------------------------------------
// Captions on/off + 15s countdown state machine (pure reducer)
// ---------------------------------------------------------------------------

export type CaptureStatus = "idle" | "recording" | "warning" | "stopped";

/** The full capture-state snapshot shared with the popup. */
export interface CaptureState {
  status: CaptureStatus;
  captionsOn: boolean;
  /** When status === "warning", ms remaining until auto-stop; else null. */
  warningMsLeft: number | null;
  /** Absolute epoch ms when a caption-off countdown began; else null. */
  countdownStartedAt: number | null;
}

export type CaptureEvent =
  | { type: "START" } // user pressed Start (only valid when captions on)
  | { type: "STOP" } // user pressed Stop
  | { type: "CAPTIONS_ON" } // captions became present in the DOM
  | { type: "CAPTIONS_OFF" } // captions disappeared from the DOM
  | { type: "TICK" }; // clock advanced; recompute countdown

/** The initial state before any recording starts. */
export function initialState(captionsOn: boolean): CaptureState {
  return {
    status: "idle",
    captionsOn,
    warningMsLeft: null,
    countdownStartedAt: null,
  };
}

/**
 * Pure reducer for the capture lifecycle. `now` is the injected clock (epoch
 * ms) — no `Date.now()` or `setInterval` inside. The caller ticks it.
 *
 * Rules encoded (see capability spec):
 *   - START is only accepted when captions are ON (captions-on-to-start gate).
 *     START while captions OFF is a no-op here; content.ts turns that into the
 *     "turn on captions first" popup prompt.
 *   - CAPTIONS_OFF while recording → enter `warning` and start a 15s countdown.
 *   - CAPTIONS_ON while warning → cancel the countdown, back to `recording`.
 *   - TICK while warning → recompute msLeft; at <= 0 → `stopped`.
 *   - STOP from any active state → `stopped`.
 */
export function reduce(
  state: CaptureState,
  event: CaptureEvent,
  now: number,
  graceMs: number = CAPTION_OFF_GRACE_MS,
): CaptureState {
  switch (event.type) {
    case "CAPTIONS_ON": {
      if (state.status === "warning") {
        // Re-enabling captions cancels the countdown.
        return {
          ...state,
          captionsOn: true,
          status: "recording",
          warningMsLeft: null,
          countdownStartedAt: null,
        };
      }
      return { ...state, captionsOn: true };
    }

    case "CAPTIONS_OFF": {
      if (state.status === "recording") {
        // Start the 15s grace countdown.
        return {
          ...state,
          captionsOn: false,
          status: "warning",
          warningMsLeft: graceMs,
          countdownStartedAt: now,
        };
      }
      return { ...state, captionsOn: false };
    }

    case "START": {
      // Captions-on-to-start gate: START is a no-op unless captions are on.
      if (!state.captionsOn) return state;
      if (state.status === "idle" || state.status === "stopped") {
        return {
          ...initialState(true),
          status: "recording",
        };
      }
      return state;
    }

    case "STOP": {
      if (state.status === "recording" || state.status === "warning") {
        return {
          ...state,
          status: "stopped",
          warningMsLeft: null,
          countdownStartedAt: null,
        };
      }
      return state;
    }

    case "TICK": {
      if (state.status === "warning" && state.countdownStartedAt !== null) {
        const elapsed = now - state.countdownStartedAt;
        const left = graceMs - elapsed;
        if (left <= 0) {
          // Countdown expired → auto-stop.
          return {
            ...state,
            status: "stopped",
            warningMsLeft: 0,
            countdownStartedAt: null,
          };
        }
        return { ...state, warningMsLeft: left };
      }
      return state;
    }

    default:
      return state;
  }
}

/**
 * Convenience: given a warning state and `now`, the whole-seconds countdown to
 * show in the popup ("Recording will stop in Ns…"). Returns 0 when not warning.
 */
export function secondsLeft(state: CaptureState, now: number): number {
  if (state.status !== "warning" || state.countdownStartedAt === null) return 0;
  const left = CAPTION_OFF_GRACE_MS - (now - state.countdownStartedAt);
  return Math.max(0, Math.ceil(left / 1000));
}
