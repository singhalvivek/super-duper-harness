import { fetchMeetingList } from "@/components/api";
import { MeetingCard } from "@/components/MeetingCard";
import { ErrorBanner } from "@/components/ErrorBanner";

/**
 * Library (home, `/`) — Phase 1, REAL.
 *
 * A Server Component that reads GET /api/sessions (same-origin, no-store) and
 * renders the captured meetings newest-first as cards. It handles the three
 * non-happy states spec/ui.md requires:
 *   - EMPTY: a friendly "no meetings captured yet" message (never a blank page),
 *   - ERROR: an inline retry banner if the API/network fails (never a white
 *     screen),
 *   - LOADING: handled by the sibling `loading.tsx` skeleton while this
 *     Server Component awaits the fetch.
 *
 * No fake meetings are ever hard-coded here — every row is real data from the
 * API, which is exactly what the Playwright E2E seeds and asserts.
 */

// This page is a live read of the local DB via the API; never statically cached.
export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  let data;
  try {
    data = await fetchMeetingList();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load your meetings.";
    return (
      <div className="space-y-4">
        <PageHeading total={null} />
        <ErrorBanner message={message} />
      </div>
    );
  }

  const { meetings, total } = data;

  return (
    <div className="space-y-4">
      <PageHeading total={total} />

      {meetings.length === 0 ? (
        <EmptyState />
      ) : (
        <ul data-testid="meeting-list" className="space-y-3">
          {meetings.map((meeting) => (
            <MeetingCard key={meeting.id} meeting={meeting} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PageHeading({ total }: { total: number | null }) {
  return (
    <div className="flex items-baseline justify-between">
      <h1 className="text-xl font-semibold text-slate-900">Library</h1>
      {total !== null && (
        <span className="text-sm text-slate-500">
          {total} {total === 1 ? "meeting" : "meetings"}
        </span>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      data-testid="library-empty"
      className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center"
    >
      <h2 className="text-base font-semibold text-slate-700">
        No meetings captured yet
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
        Load the extension and start a Google Meet with captions on. When you
        stop capture, the meeting will appear here — auto-titled, speaker-labelled
        and timestamped.
      </p>
    </div>
  );
}
