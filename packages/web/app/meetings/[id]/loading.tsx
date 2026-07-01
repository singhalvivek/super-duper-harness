/**
 * Meeting-detail loading skeleton — shown while the `/meetings/:id` Server
 * Component awaits GET /api/sessions/:id, so the transcript view never flashes
 * a blank page during the fetch.
 */
export default function MeetingLoading() {
  return (
    <div className="space-y-6" data-testid="meeting-loading">
      <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
      <div className="space-y-2">
        <div className="h-6 w-1/2 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="mb-3 space-y-1">
              <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <div className="h-32 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-32 animate-pulse rounded-lg bg-slate-100" />
        </div>
      </div>
    </div>
  );
}
