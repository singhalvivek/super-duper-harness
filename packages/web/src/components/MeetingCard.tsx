import Link from "next/link";
import type { MeetingListItem } from "@meeting-capture/shared";
import { formatDateTime, formatDuration, lineCountLabel } from "./format";

/**
 * MeetingCard — one row in the Library list.
 *
 * Renders the Gemini title (or, when `titleStatus === "failed"`, the stored
 * placeholder title plus a subtle "titling failed — re-title" affordance so the
 * user knows the transcript is fine but the auto-title didn't land), plus the
 * date/time, duration and line count. The whole card links to the meeting's
 * transcript view at `/meetings/<id>`.
 *
 * Typed against the shared wire contract (`MeetingListItem`) so the fields
 * cannot drift from the API.
 */
export function MeetingCard({ meeting }: { meeting: MeetingListItem }) {
  const failed = meeting.titleStatus === "failed";

  return (
    <li>
      <Link
        href={`/meetings/${meeting.id}`}
        data-testid="meeting-card"
        data-meeting-id={meeting.id}
        className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            data-testid="meeting-title"
            className="text-base font-semibold text-slate-800"
          >
            {meeting.title}
          </h2>
          {failed && (
            <span
              data-testid="retitle-affordance"
              title="Auto-titling failed — you can re-title this later"
              className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200"
            >
              titling failed · re-title
            </span>
          )}
        </div>
        <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
          <dd data-testid="meeting-date" className="font-medium text-slate-600">
            {formatDateTime(meeting.startedAt)}
          </dd>
          <dd className="text-slate-300" aria-hidden="true">
            •
          </dd>
          <dd data-testid="meeting-duration">
            {formatDuration(meeting.durationMs)}
          </dd>
          <dd className="text-slate-300" aria-hidden="true">
            •
          </dd>
          <dd data-testid="meeting-linecount">
            {lineCountLabel(meeting.lineCount)}
          </dd>
        </dl>
      </Link>
    </li>
  );
}
