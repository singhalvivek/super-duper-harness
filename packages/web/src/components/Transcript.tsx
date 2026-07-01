import type { TranscriptLine } from "@meeting-capture/shared";
import { TranscriptLineRow } from "./TranscriptLineRow";

/**
 * Transcript — the primary column of the meeting-detail page.
 *
 * Renders every captured line in capture order (the API already returns lines
 * ordered by `seq` ascending). Consecutive lines from the same speaker share a
 * single visible speaker label for readability, but EVERY line keeps its own
 * timestamp and its own stable `line-<id>` anchor so long (1–2h) transcripts
 * stay scannable and each line remains a citation target.
 *
 * A defensive empty state renders if a stored meeting somehow has zero lines
 * (the ingest contract requires ≥1, so this should not happen with real data —
 * but a blank column would look broken, so we guard it).
 */
export function Transcript({ lines }: { lines: TranscriptLine[] }) {
  if (lines.length === 0) {
    return (
      <p data-testid="transcript-empty" className="text-sm text-slate-500">
        This meeting has no transcript lines.
      </p>
    );
  }

  return (
    <div data-testid="transcript" className="flex flex-col gap-0.5">
      {lines.map((line, i) => {
        const prev = lines[i - 1];
        const showSpeaker = i === 0 || prev?.speaker !== line.speaker;
        return (
          <TranscriptLineRow
            key={line.id}
            line={line}
            showSpeaker={showSpeaker}
          />
        );
      })}
    </div>
  );
}
