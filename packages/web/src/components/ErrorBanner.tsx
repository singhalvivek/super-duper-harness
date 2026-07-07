"use client";

/**
 * ErrorBanner — an inline, retryable error surface.
 *
 * Per spec/ui.md an API/network failure must show an inline banner with a retry
 * action, NEVER a blank white screen. This is a client component so the "Retry"
 * button can re-run the failed request by refreshing the current route (the
 * Server Component then re-fetches from the API).
 */
import { useRouter } from "next/navigation";

export function ErrorBanner({ message }: { message: string }) {
  const router = useRouter();
  return (
    <div
      role="alert"
      data-testid="error-banner"
      className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
    >
      <p className="font-medium">Something went wrong</p>
      <p className="mt-1 text-red-700">{message}</p>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
      >
        Retry
      </button>
    </div>
  );
}
