// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  UNKNOWN_SPEAKER,
  captionsArePresent,
  parseCaptionNode,
  parseCaptionRegion,
} from "../src/parser";

/**
 * Deterministic caption-parser tests against saved Google Meet caption DOM
 * fixtures. No live Meet, no network. This is the Success-Criterion "≥90% of
 * caption lines correctly attributed" gate — every fixture line's speaker AND
 * text is asserted exactly.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/** Load a fixture HTML file into jsdom and return its root caption-region element. */
function loadFixture(name: string): Element {
  const html = readFileSync(join(HERE, "fixtures", name), "utf8");
  const container = document.createElement("div");
  container.innerHTML = html;
  // The fixture's top-level element is the caption region.
  const region = container.querySelector('[role="region"]');
  if (!region) throw new Error(`fixture ${name} has no caption region`);
  return region;
}

describe("parseCaptionRegion — two speakers", () => {
  it("extracts both speakers with correct names and text, in order", () => {
    const region = loadFixture("meet-captions-two-speakers.html");
    const lines = parseCaptionRegion(region);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({
      speaker: "Ada Lovelace",
      text: "Let's start with the roadmap for this quarter.",
    });
    expect(lines[1]).toEqual({
      speaker: "Charles Babbage",
      text: "Sounds good — I have the analytical engine numbers ready.",
    });
  });

  it("attributes 100% of lines (>= 90% success criterion)", () => {
    const region = loadFixture("meet-captions-two-speakers.html");
    const lines = parseCaptionRegion(region);
    const attributed = lines.filter(
      (l) => l.speaker && l.speaker !== UNKNOWN_SPEAKER && l.text.length > 0,
    );
    expect(attributed.length / lines.length).toBeGreaterThanOrEqual(0.9);
  });
});

describe("parseCaptionRegion — single speaker", () => {
  it("extracts the one line with correct speaker and text", () => {
    const region = loadFixture("meet-captions-single.html");
    const lines = parseCaptionRegion(region);
    expect(lines).toEqual([
      {
        speaker: "Grace Hopper",
        text: "The compiler is finally passing all the tests.",
      },
    ]);
  });
});

describe("parseCaptionRegion — structural only (no convenience hooks)", () => {
  it("still attributes speakers using only avatar alt + structure", () => {
    const region = loadFixture("meet-captions-structural-only.html");
    const lines = parseCaptionRegion(region);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({
      speaker: "Alan Turing",
      text: "I think the machine can be taught to imitate a human convincingly.",
    });
    expect(lines[1]).toEqual({
      speaker: "Katherine Johnson",
      text: "Let me double check the trajectory calculations before we commit.",
    });
  });
});

describe("parseCaptionRegion — unknown speaker (edge case)", () => {
  it("captures the text and labels an unattributed row 'Unknown'", () => {
    const region = loadFixture("meet-captions-unknown-speaker.html");
    const lines = parseCaptionRegion(region);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.speaker).toBe(UNKNOWN_SPEAKER);
    expect(lines[0]?.text).toBe(
      "Okay everyone, can you hear me now that I have joined the call?",
    );
  });
});

describe("parseCaptionRegion — empty region (edge case)", () => {
  it("returns no lines when captions are on but nobody has spoken", () => {
    const region = loadFixture("meet-captions-empty.html");
    expect(parseCaptionRegion(region)).toEqual([]);
  });
});

describe("parseCaptionNode — error path / resilience", () => {
  it("returns null for null / undefined input (never throws)", () => {
    expect(parseCaptionNode(null)).toBeNull();
    expect(parseCaptionNode(undefined)).toBeNull();
  });

  it("returns null for a garbage / non-caption element", () => {
    const junk = document.createElement("div");
    junk.innerHTML = "<span></span><hr />"; // no text-bearing caption content
    expect(parseCaptionNode(junk)).toBeNull();
  });

  it("returns null for an avatar-only row with no caption text", () => {
    const row = document.createElement("div");
    row.innerHTML = '<img alt="Ada Lovelace" />'; // name but no spoken text
    expect(parseCaptionNode(row)).toBeNull();
  });

  it("does not throw on deeply nested arbitrary markup", () => {
    const weird = document.createElement("section");
    weird.innerHTML = "<article><footer><b>x</b></footer></article>";
    expect(() => parseCaptionNode(weird)).not.toThrow();
  });
});

describe("captionsArePresent", () => {
  it("is true when a caption region with rows is present", () => {
    const region = loadFixture("meet-captions-two-speakers.html");
    expect(captionsArePresent(region)).toBe(true);
  });

  it("is true for an empty-but-mounted caption region", () => {
    const region = loadFixture("meet-captions-empty.html");
    expect(captionsArePresent(region)).toBe(true);
  });

  it("is false for a document with no caption region", () => {
    const doc = document.implementation.createHTMLDocument("no captions");
    doc.body.innerHTML = "<main><p>just a normal page</p></main>";
    expect(captionsArePresent(doc)).toBe(false);
  });
});
