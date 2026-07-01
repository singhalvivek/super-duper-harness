import { test, expect } from "@playwright/test";
import { seedSession } from "./seed";

/**
 * Phase-1 dashboard E2E — the REAL gate (not a 200-only check).
 *
 * Flow:
 *   1. SEED a real session by POSTing a contract-valid IngestSession to the
 *      real /api/sessions route (2 speakers, ascending seq, non-decreasing
 *      timestamps). This exercises the real Gemini titling end-to-end.
 *   2. LIBRARY: navigate to `/` and assert the seeded meeting appears with its
 *      REAL title, and its duration + line count render.
 *   3. TRANSCRIPT: open `/meetings/<id>` and assert the REAL seeded lines render
 *      — specific speaker names AND caption text AND shown timestamps.
 *   4. STUBS: assert the AI Summary + Q&A panels (and the top Search box) are
 *      present and marked "Coming soon" (proving they render as labelled stubs,
 *      not bugs).
 */

test("library lists a real seeded meeting and links to its transcript", async ({
  page,
  request,
}) => {
  const marker = `lib-${Date.now()}`;
  const ingest = await seedSession(request, marker);

  await page.goto("/");

  // The library is not empty and shows our seeded meeting with its REAL title.
  await expect(page.getByTestId("library-empty")).toHaveCount(0);

  const card = page.locator(`[data-meeting-id="${ingest.id}"]`);
  await expect(card).toBeVisible();

  // REAL title from the ingest response (Gemini-generated, non-empty) renders.
  await expect(card.getByTestId("meeting-title")).toHaveText(ingest.title);

  // Duration (8 minutes → "8:00") and line count (4) render as real data.
  await expect(card.getByTestId("meeting-duration")).toHaveText("8:00");
  await expect(card.getByTestId("meeting-linecount")).toHaveText("4 lines");
  await expect(card.getByTestId("meeting-date")).not.toBeEmpty();

  // Clicking the card navigates to the transcript view for this meeting.
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/meetings/${ingest.id}$`));
});

test("transcript view renders the real speaker-labelled, timestamped lines", async ({
  page,
  request,
}) => {
  const marker = `tx-${Date.now()}`;
  const ingest = await seedSession(request, marker);

  await page.goto(`/meetings/${ingest.id}`);

  // Header shows the REAL title, duration and line count.
  await expect(page.getByTestId("meeting-title")).toHaveText(ingest.title);
  await expect(page.getByTestId("meeting-duration")).toHaveText("8:00");
  await expect(page.getByTestId("meeting-linecount")).toHaveText("4 lines");

  const transcript = page.getByTestId("transcript");
  await expect(transcript).toBeVisible();

  // REAL speaker labels appear (both distinct seeded speakers).
  await expect(
    transcript.getByText(`Alice Chen ${marker}`, { exact: true }).first(),
  ).toBeVisible();
  await expect(
    transcript.getByText(`Bob Ray ${marker}`, { exact: true }).first(),
  ).toBeVisible();

  // REAL caption TEXT appears (specific seeded lines, not a shell).
  await expect(
    transcript.getByText(`Let's kick off the ${marker} roadmap review.`),
  ).toBeVisible();
  await expect(
    transcript.getByText(`We closed the ${marker} quarter up eighteen percent.`),
  ).toBeVisible();

  // TIMESTAMPS are shown for the lines (offsets from start, mm:ss).
  const timestamps = page.getByTestId("line-timestamp");
  await expect(timestamps).toHaveCount(4);
  // First line offset 1200ms → "0:01"; a later line offset 21000ms → "0:21".
  await expect(timestamps.nth(0)).toHaveText("0:01");
  await expect(timestamps.nth(3)).toHaveText("0:21");

  // Every line exposes a stable `line-<id>` anchor (Phase-3 jump-to-moment).
  const lines = page.getByTestId("transcript-line");
  await expect(lines).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    const lineId = await lines.nth(i).getAttribute("data-line-id");
    expect(lineId, "each transcript line must carry a stable id").toBeTruthy();
    await expect(page.locator(`#line-${lineId}`)).toBeVisible();
  }
});

test("meeting detail shows the AI Summary and Q&A panels as labelled 'Coming soon' stubs", async ({
  page,
  request,
}) => {
  const marker = `stub-${Date.now()}`;
  const ingest = await seedSession(request, marker);

  await page.goto(`/meetings/${ingest.id}`);

  // The two detail-page stub panels (AI Summary + Q&A) live inside <main>. We
  // scope to <main> so the top header Search box — which is ALSO a labelled
  // `data-stub` but belongs to the shared chrome, not this view — is excluded.
  const panelStubs = page.locator('main [data-stub="true"]');
  await expect(panelStubs).toHaveCount(2); // AI Summary + Q&A panels only.

  await expect(page.getByText("AI Summary", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Ask about this meeting", { exact: true }),
  ).toBeVisible();

  // Each StubPanel carries the explicit "Coming soon" badge (the header Search
  // stub uses a different marker — `search-coming-soon` — so these two badges
  // are exactly the two content panels).
  const badges = page.getByTestId("coming-soon-badge");
  await expect(badges).toHaveCount(2);
  await expect(badges.first()).toHaveText("Coming soon");
});

test("the top cross-meeting Search box is a disabled, labelled 'Coming soon' stub", async ({
  page,
}) => {
  await page.goto("/");

  const searchStub = page.getByTestId("search-stub");
  await expect(searchStub).toBeVisible();

  // The input is present but disabled (a placeholder, not a working control).
  const input = searchStub.locator("input");
  await expect(input).toBeDisabled();

  // And it is explicitly marked "Coming soon".
  await expect(page.getByTestId("search-coming-soon")).toHaveText(
    "Coming soon",
  );
});

test("an unknown meeting id renders the friendly not-found state", async ({
  page,
}) => {
  await page.goto("/meetings/does-not-exist-00000000");

  await expect(page.getByTestId("meeting-not-found")).toBeVisible();
  await expect(
    page.getByText("That meeting doesn't exist"),
  ).toBeVisible();
  // A link back to the library is offered (never a dead end).
  await expect(page.getByTestId("back-to-library")).toBeVisible();
});
