import type { TranscriptLine } from "@meeting-capture/shared";
import { formatOffset } from "./format";

/**
 * TranscriptLineRow — one speaker-labelled, timestamped line of the transcript.
 *
 * Each line renders in capture order and shows:
 *  - a monospace TIMESTAMP (the line's `timestampMs` offset from session start),
 *  - the SPEAKER label,
 *  - the caption TEXT.
 *
 * The row carries a stable DOM id `line-<line.id>` (and `data-line-id`) so a
 * later phase's jump-to-moment citation can scroll straight to a cited line.
 * `showSpeaker` lets the transcript collapse a run of consecutive lines from the
 * same speaker into one visible label while keeping every line individually
 * anchored and timestamped.
 */
export function TranscriptLineRow({
  line,
  showSpeaker,
}: {
  line: TranscriptLine;
  showSpeaker: boolean;
}) {
  return (
    <div
      id={`line-${line.id}`}
      data-line-id={line.id}
      data-testid="transcript-line"
      className="group grid grid-cols-[3.5rem_1fr] gap-x-3 rounded px-2 py-1 hover:bg-slate-50"
    >
      <time
        data-testid="line-timestamp"
        className="pt-0.5 text-right font-mono text-xs tabular-nums text-slate-400"
      >
        {formatOffset(line.timestampMs)}
      </time>
      <div className="min-w-0">
        {showSpeaker && (
          <div
            data-testid="line-speaker"
            className="text-sm font-semibold text-slate-700"
          >
            {line.speaker}
          </div>
        )}
        <p
          data-testid="line-text"
          className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800"
        >
          {line.text}
        </p>
      </div>
    </div>
  );
}
