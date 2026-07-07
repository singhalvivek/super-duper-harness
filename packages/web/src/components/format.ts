/**
 * Small pure formatting helpers shared by the dashboard's presentational
 * components. Kept dependency-free so they are trivially testable and reusable
 * from both server and client components.
 *
 * All wire timestamps are epoch-ms integers (absolute) except a transcript
 * line's `timestampMs`, which is an OFFSET in ms from the session start
 * (see packages/shared/src/schema.ts). These helpers respect that distinction.
 */

/**
 * Format an absolute epoch-ms timestamp as a human date/time for the library
 * row and the transcript header (e.g. "Jul 1, 2026, 2:30 PM"). Uses the
 * browser/host locale; deterministic enough for display, not for assertions.
 */
export function formatDateTime(epochMs: number): string {
  const d = new Date(epochMs);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Format a duration in ms as a compact human string:
 *   < 1h  → "MM:SS"   (e.g. "07:12")
 *   >= 1h → "Hh MMm"  (e.g. "1h 03m")
 * A duration of 0 renders "0:00" rather than an empty string.
 */
export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Format a transcript line's OFFSET (`timestampMs`, ms from session start) as a
 * monospace-friendly "M:SS" / "MM:SS" / "H:MM:SS" timestamp shown beside each
 * line. This is an offset from start, never an absolute clock time.
 */
export function formatOffset(offsetMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(offsetMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Pluralize "line"/"lines" for the line-count label. */
export function lineCountLabel(count: number): string {
  return `${count} ${count === 1 ? "line" : "lines"}`;
}
