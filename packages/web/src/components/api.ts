import { headers } from "next/headers";
import type {
  MeetingDetail,
  MeetingListResponse,
} from "@meeting-capture/shared";

/**
 * Server-side API client for the dashboard's Server Components.
 *
 * The dashboard and the `/api/*` Route Handlers are the SAME Next.js app on the
 * same origin (:8788). A Server Component `fetch` needs an ABSOLUTE URL, so we
 * derive the current origin from the incoming request headers (host + proto),
 * falling back to the configured dev port. This keeps the pages talking to the
 * real API over HTTP — exactly the path the E2E exercises — with no hard-coded
 * data anywhere.
 *
 * `cache: "no-store"` because the library and a meeting's transcript are live
 * reads that must reflect a session the user just captured (or the E2E just
 * seeded) on the very next request.
 */
async function originBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:8788";
  // Local single-user tool: http on localhost. Respect a forwarded proto if set.
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

/** Fetch the library list (newest-first) from GET /api/sessions. Throws on non-200. */
export async function fetchMeetingList(): Promise<MeetingListResponse> {
  const base = await originBaseUrl();
  const res = await fetch(`${base}/api/sessions`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load meetings (${res.status})`);
  }
  return (await res.json()) as MeetingListResponse;
}

/**
 * Fetch one meeting + its transcript from GET /api/sessions/:id.
 * Returns `null` on 404 (meeting not found) so the page can render the friendly
 * not-found state; throws on any other non-200 so the error boundary shows a
 * retry banner rather than a blank screen.
 */
export async function fetchMeetingDetail(
  id: string,
): Promise<MeetingDetail | null> {
  const base = await originBaseUrl();
  const res = await fetch(`${base}/api/sessions/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Failed to load meeting (${res.status})`);
  }
  return (await res.json()) as MeetingDetail;
}
