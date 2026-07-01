/**
 * PURE, importable Google Meet live-caption parser.
 *
 * This module has NO dependency on chrome.*, the live DOM observer, timers, or
 * the network. It takes DOM element(s) as input and returns plain
 * `{ speaker, text }` objects, so it can be unit-tested deterministically
 * against saved Meet caption DOM fixtures (see tests/fixtures/*.html).
 *
 * Timestamp and `seq` assignment is NOT done here — that belongs to the capture
 * buffer (capture.ts), which knows the session's `startedAt`. The parser only
 * answers "what did the DOM say, and who said it".
 *
 * DESIGN NOTE — why structural, not class-name based:
 *   Google Meet's caption DOM uses obfuscated, unstable, build-hashed class
 *   names (e.g. `.iOzk7`, `.zs7s8d`). Hard-coding one class name is guaranteed
 *   to rot. Instead we parse STRUCTURALLY: a caption "row" is an element that
 *   contains BOTH a speaker-name node and a caption-text node. Meet renders a
 *   row as roughly:
 *
 *     <div>                          ← the row
 *       <img alt="Ada Lovelace" />   ← speaker avatar (name often in alt)
 *       <div>                        ← inner wrapper
 *         <div>Ada Lovelace</div>    ← speaker name (short, name-like)
 *         <div>the caption text…</div>  ← the spoken text (the caption)
 *       </div>
 *     </div>
 *
 *   We locate the name and the text by their role in that structure, tolerating
 *   Meet's variations, rather than by a brittle class. Unrecognized nodes return
 *   `null` (never throw) so a Meet DOM change degrades to "0 lines captured"
 *   (a visible signal) instead of a crash.
 */

/** A single parsed caption row: who spoke and what they said, no timing. */
export interface ParsedCaption {
  speaker: string;
  text: string;
}

/** Fallback speaker label when Meet did not attribute a name to a row. */
export const UNKNOWN_SPEAKER = "Unknown";

/**
 * Data attributes Meet has historically used to tag its caption region and
 * rows. We probe these as HINTS (they make detection cheaper and more robust)
 * but never *require* them — structural parsing is the real fallback.
 */
const CAPTION_REGION_HINTS = [
  '[aria-label*="aption" i]', // "Captions" / "Live caption"
  '[jsname][role="region"]',
  ".caption-region", // our fixtures + a stable-ish hook
];

const CAPTION_ROW_HINTS = [".caption-row", "[data-caption-row]"];

/**
 * Collapse Meet's whitespace: it emits stray newlines / non-breaking spaces
 * inside caption text. Returns "" for nullish input.
 */
function normalizeText(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Heuristic: does this string look like a person's display name (as opposed to
 * a sentence of caption text)? Names are short and have few words. This lets us
 * disambiguate the name node from the text node when their DOM positions vary.
 */
function looksLikeName(s: string): boolean {
  const t = normalizeText(s);
  if (!t) return false;
  if (t.length > 40) return false;
  const words = t.split(" ");
  if (words.length > 5) return false;
  // A caption sentence usually ends with sentence punctuation; a name rarely
  // contains a period/question mark mid-string.
  if (/[.?!]/.test(t.slice(0, -1))) return false;
  return true;
}

/** The direct text-bearing element children of `el`, in document order. */
function textBearingChildren(el: Element): Element[] {
  return Array.from(el.children).filter(
    (child) => normalizeText(child.textContent).length > 0,
  );
}

/**
 * The *leaf* text-bearing elements under `el`, in document order.
 *
 * A "leaf" here is a text-bearing element with no text-bearing element
 * descendants of its own — i.e. the actual node that holds a name or a caption
 * sentence, NOT an ancestor wrapper whose textContent concatenates several
 * children. This is what makes parsing structural: Meet nests the speaker-name
 * node and the caption-text node inside a wrapper `<div>`, so we must look at
 * the leaves, not the wrapper (whose textContent would be "Name + sentence").
 *
 * Recurses to a small bounded depth (caption rows are shallow) and never throws.
 */
function leafTextElements(el: Element): Element[] {
  const out: Element[] = [];
  const walk = (node: Element, depth: number): void => {
    if (depth > 6) return;
    const children = textBearingChildren(node);
    if (children.length === 0) {
      if (normalizeText(node.textContent).length > 0) out.push(node);
      return;
    }
    for (const child of children) walk(child, depth + 1);
  };
  for (const child of textBearingChildren(el)) walk(child, 0);
  return out;
}

/**
 * Extract the speaker's name for a row.
 *
 * Priority:
 *   1. An avatar `<img alt="…">` (Meet puts the display name in the alt).
 *   2. An element explicitly tagged as the speaker (`[data-speaker]`,
 *      `.caption-speaker`).
 *   3. The first short, name-like text-bearing child.
 * Returns UNKNOWN_SPEAKER if none of those yield a plausible name.
 */
function extractSpeaker(row: Element): string {
  // 1. Avatar alt text.
  const avatar = row.querySelector("img[alt]");
  if (avatar) {
    const alt = normalizeText(avatar.getAttribute("alt"));
    if (alt && looksLikeName(alt)) return alt;
  }

  // 2. Explicitly tagged speaker element.
  const tagged =
    row.querySelector("[data-speaker]") ?? row.querySelector(".caption-speaker");
  if (tagged) {
    const name = normalizeText(tagged.textContent);
    if (name) return name;
  }

  // 3. First short, name-like LEAF text element (descend past wrappers so we
  //    read the name node itself, not a wrapper concatenating name + caption).
  for (const leaf of leafTextElements(row)) {
    const name = normalizeText(leaf.textContent);
    if (looksLikeName(name)) return name;
  }

  return UNKNOWN_SPEAKER;
}

/**
 * Extract the caption text for a row: the longest / sentence-like text node
 * that is NOT the speaker name. We deliberately prefer the text child that is
 * explicitly tagged, then fall back to the last text-bearing child (Meet places
 * the caption after the name).
 */
function extractText(row: Element, speaker: string): string {
  // Explicitly tagged caption text.
  const tagged =
    row.querySelector("[data-caption-text]") ??
    row.querySelector(".caption-text");
  if (tagged) {
    const t = normalizeText(tagged.textContent);
    if (t) return t;
  }

  // Choose the LEAF text element whose content differs from the speaker name
  // and is the most "caption-like" (longest). Reading leaves (not wrappers)
  // means we get the caption sentence WITHOUT the speaker-name prefix that a
  // wrapper's textContent would include. Tolerates name-before-text, text-only
  // rows, and hook-less (obfuscated-class-only) markup.
  let best = "";
  for (const leaf of leafTextElements(row)) {
    const t = normalizeText(leaf.textContent);
    if (!t || t === speaker) continue;
    if (t.length > best.length) best = t;
  }
  if (best) return best;

  // Last resort: the row's whole text minus the leading speaker name.
  const whole = normalizeText(row.textContent);
  if (speaker !== UNKNOWN_SPEAKER && whole.startsWith(speaker)) {
    const remainder = normalizeText(whole.slice(speaker.length));
    if (remainder) return remainder;
  }
  return whole;
}

/**
 * Parse ONE caption row element → `{ speaker, text }` or `null`.
 *
 * Returns `null` (never throws) when:
 *   - `el` is nullish or not an Element, or
 *   - the element yields no caption text at all (an unrecognized / non-caption
 *     node — e.g. a spacer, an avatar-only element, arbitrary garbage).
 *
 * When Meet did not attribute a speaker, `speaker` is `"Unknown"`.
 */
export function parseCaptionNode(
  el: Element | null | undefined,
): ParsedCaption | null {
  if (!el || typeof (el as Element).querySelector !== "function") return null;

  const speaker = extractSpeaker(el);
  const text = extractText(el, speaker);
  if (!text) return null;

  // If the only text we found IS the speaker name (no actual caption yet),
  // there is nothing to capture.
  if (text === speaker) return null;

  return { speaker: speaker || UNKNOWN_SPEAKER, text };
}

/**
 * Find the candidate caption-row elements inside a caption region (or the whole
 * document). Uses row hints first; if none match, treats each direct child of
 * the detected region that has both name-ish and text-ish content as a row.
 */
function findCaptionRows(root: Element | Document): Element[] {
  // Row hints (fixtures + any stable hook).
  for (const sel of CAPTION_ROW_HINTS) {
    const hinted = Array.from(root.querySelectorAll(sel));
    if (hinted.length > 0) return hinted;
  }

  // Otherwise locate the caption region, then take its element children as rows.
  let region: Element | null = null;
  if (root instanceof Element) {
    // An Element passed directly IS treated as the caption region (this is what
    // parseCaptionRegion receives in tests and what content.ts passes live).
    region = root;
  } else {
    // For a whole Document, only a matched caption-region hint counts as the
    // region. We deliberately do NOT fall back to <body>: Meet mounts the
    // caption region only while captions are ON, so the absence of a region
    // means "no captions", not "scan the whole page" (which would mistake
    // ordinary page content for caption rows).
    for (const sel of CAPTION_REGION_HINTS) {
      const found = root.querySelector(sel);
      if (found) {
        region = found;
        break;
      }
    }
  }
  if (!region) return [];

  // Each text-bearing element child of the region is a candidate caption row;
  // parseCaptionNode decides whether it is actually a caption.
  return textBearingChildren(region);
}

/**
 * Parse a whole caption region → the list of `{ speaker, text }` currently
 * rendered, in document (visual) order. Unrecognized rows are skipped (they
 * yield `null` and are filtered out). Returns `[]` for an empty / caption-less
 * region — never throws.
 *
 * NOTE: this is a snapshot of what the DOM shows *now*. Deduping repeated
 * re-renders of the same in-progress line across snapshots is the capture
 * buffer's job (capture.ts), not the parser's.
 */
export function parseCaptionRegion(root: Element | Document): ParsedCaption[] {
  if (!root) return [];
  const rows = findCaptionRows(root);
  const out: ParsedCaption[] = [];
  for (const row of rows) {
    const parsed = parseCaptionNode(row);
    if (parsed) out.push(parsed);
  }
  return out;
}

/**
 * Best-effort structural detection of whether Meet captions are currently ON:
 * captions are ON iff a caption region with at least one recognizable row is
 * present (Meet only mounts the caption region while captions are enabled).
 * Pure — safe to call from tests against fixtures.
 */
export function captionsArePresent(root: Element | Document): boolean {
  if (!root) return false;
  // Captions are ON iff an actual caption REGION or caption ROW hint matches.
  // We deliberately do NOT use the generic body-children fallback here: an
  // arbitrary page that merely has text (but no caption region) must read as
  // captions-OFF, otherwise the captions-on-to-start gate would never block.
  for (const sel of [...CAPTION_REGION_HINTS, ...CAPTION_ROW_HINTS]) {
    if (root instanceof Document) {
      if (root.querySelector(sel)) return true;
    } else if (root.matches(sel) || root.querySelector(sel)) {
      return true;
    }
  }
  return false;
}
