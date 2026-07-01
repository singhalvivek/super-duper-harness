import type { ReactNode } from "react";

/**
 * StubPanel — the reusable, UNMISTAKABLY-labelled "coming soon" placeholder.
 *
 * Phase 1 ships the AI Summary and Q&A panels (and the top Search box) as
 * NON-FUNCTIONAL stubs so the user sees the product vision. Per spec/ui.md a
 * stub must NEVER look like a broken or empty real feature: it is visibly
 * greyed/disabled, carries an explicit "Coming soon" badge, states the phase in
 * which it lands, and shows the intended shape of the eventual feature.
 *
 * We mark the whole region `aria-disabled` and `data-stub` so the Playwright
 * E2E can assert these render as labelled stubs (present + "Coming soon"), not
 * as interactive controls.
 */
export function StubPanel({
  title,
  phase,
  description,
  children,
}: {
  title: string;
  /** Human phase label, e.g. "Phase 2" — shown so the user knows when it lands. */
  phase: string;
  /** One-line description of what the real feature will do. */
  description: string;
  /** The greyed intended-shape preview (bullets, a disabled input, etc.). */
  children?: ReactNode;
}) {
  return (
    <section
      data-stub="true"
      aria-disabled="true"
      className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 opacity-90"
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-500">{title}</h3>
        <span
          data-testid="coming-soon-badge"
          className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500"
        >
          Coming soon
        </span>
      </header>
      <p className="mb-3 text-xs text-slate-400">
        {description} — coming soon in {phase}.
      </p>
      {/* Greyed intended-shape preview; pointer-events disabled so nothing here
          is interactive (proving it is a placeholder, not a live control). */}
      <div className="pointer-events-none select-none text-slate-400">
        {children}
      </div>
    </section>
  );
}
