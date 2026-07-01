import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meeting Capture Assistant",
  description:
    "Capture Google Meet transcripts from live captions, store them locally, and browse, read, summarize, and query your meetings.",
};

/**
 * Root layout for the dashboard.
 *
 * Provides the app chrome shared by every page: a sticky header with the app
 * name (a link home) and the top cross-meeting Search box. In Phase 1 that
 * Search box is a LABELLED STUB — a disabled, greyed input with an explicit
 * "coming soon" affordance — so it reads unmistakably as a not-yet-built
 * feature and never as a broken control (it becomes real in Phase 5).
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-full bg-slate-50 text-slate-800">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href="/"
              className="text-lg font-semibold tracking-tight text-slate-900 hover:text-slate-700"
            >
              Meeting Capture Assistant
            </Link>

            {/* Cross-meeting search — LABELLED STUB (real in Phase 5). */}
            <div
              data-stub="true"
              data-testid="search-stub"
              className="relative w-full sm:w-72"
            >
              <input
                type="search"
                disabled
                aria-disabled="true"
                readOnly
                placeholder="Search across all meetings…"
                className="w-full cursor-not-allowed rounded-md border border-dashed border-slate-300 bg-slate-100 px-3 py-1.5 text-sm text-slate-400 placeholder:text-slate-400"
              />
              <span
                data-testid="search-coming-soon"
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500"
              >
                Coming soon
              </span>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
