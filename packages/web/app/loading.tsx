/**
 * Library loading skeleton — shown by the App Router while the `/` Server
 * Component awaits GET /api/sessions. A few pulsing card placeholders so the
 * library never flashes a blank page during the fetch (spec/ui.md: loading
 * shows a skeleton/spinner).
 */
export default function LibraryLoading() {
  return (
    <div className="space-y-4" data-testid="library-loading">
      <div className="flex items-baseline justify-between">
        <div className="h-6 w-24 animate-pulse rounded bg-slate-200" />
      </div>
      <ul className="space-y-3">
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="h-5 w-2/3 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-slate-100" />
          </li>
        ))}
      </ul>
    </div>
  );
}
