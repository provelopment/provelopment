import { describe, expect, it } from "vitest";

import {
  HEADING_ANCHOR_FALLBACK,
  HEADING_ANCHOR_MAX_LENGTH,
  HEADING_ANCHOR_PATTERN,
  createHeadingAnchors,
  headingAnchorSlug,
  isHeadingAnchor,
} from "@/core/heading-anchor";

/**
 * HEADING FRAGMENTS — THE RULE (FOUNDATION-PAGES-A1D).
 *
 * An author links to their own sections (`[hours](#opening-hours)`), and an id is a
 * PUBLIC contract: it must be predictable, documented, unique inside a page and free
 * of anything that could carry markup. These assertions are that contract — the
 * renderer's own behaviour is asserted separately, through the real renderer.
 */
describe("the heading-anchor rule", () => {
  it("derives the documented slug from ordinary heading text", () => {
    expect(headingAnchorSlug("Opening Hours")).toBe("opening-hours");
    expect(headingAnchorSlug("opening hours")).toBe("opening-hours");
    expect(headingAnchorSlug("  Opening   Hours  ")).toBe("opening-hours");
    expect(headingAnchorSlug("Opening-Hours")).toBe("opening-hours");
    expect(headingAnchorSlug("Prices (2026)")).toBe("prices-2026");
    expect(headingAnchorSlug("What? Why! How…")).toBe("what-why-how");
  });

  it("ignores accents and letter case, so an author's two spellings link the same way", () => {
    expect(headingAnchorSlug("Café Hours")).toBe("cafe-hours");
    expect(headingAnchorSlug("CAFE HOURS")).toBe("cafe-hours");
    expect(headingAnchorSlug("Über uns")).toBe("uber-uns");
    // Non-Latin letters are kept as they are: the fragment is still usable.
    expect(headingAnchorSlug("私たちについて")).toBe("私たちについて");
  });

  it("keeps inline markup out of the id and never leaves a broken edge", () => {
    expect(headingAnchorSlug("**Bold** heading")).toBe("bold-heading");
    expect(headingAnchorSlug("A `code` name")).toBe("a-code-name");
    expect(headingAnchorSlug("- leading and trailing -")).toBe("leading-and-trailing");
    expect(headingAnchorSlug("a---b")).toBe("a-b");
  });

  it("falls back to a stable id when a heading has no usable characters", () => {
    expect(headingAnchorSlug("!!!")).toBe(HEADING_ANCHOR_FALLBACK);
    expect(headingAnchorSlug("—")).toBe(HEADING_ANCHOR_FALLBACK);
    expect(headingAnchorSlug("")).toBe(HEADING_ANCHOR_FALLBACK);
  });

  it("truncates long headings to the documented maximum, never ending on a hyphen", () => {
    const slug = headingAnchorSlug("word ".repeat(60));
    expect(slug.length).toBeLessThanOrEqual(HEADING_ANCHOR_MAX_LENGTH);
    expect(slug.endsWith("-")).toBe(false);
    // The same input always yields the same id.
    expect(headingAnchorSlug("word ".repeat(60))).toBe(slug);
  });

  it("emits only ids that match the declared pattern, for hostile heading text", () => {
    for (const heading of [
      '"><script>alert(1)</script>',
      "<img src=x onerror=alert(1)>",
      "a<b>c</b>d",
      "onclick=steal()",
      '"quoted"',
      "100% & more",
      "私たちについて",
      "Über uns",
      "!!!",
    ]) {
      const slug = headingAnchorSlug(heading);
      expect(HEADING_ANCHOR_PATTERN.test(slug), `${heading} → ${slug}`).toBe(true);
      expect(isHeadingAnchor(slug), `${heading} → ${slug}`).toBe(true);
    }
  });

  it("allocates UNIQUE ids per document, disambiguating repeats in document order", () => {
    const anchors = createHeadingAnchors();
    expect(anchors("Notes")).toBe("notes");
    expect(anchors("Notes")).toBe("notes-2");
    expect(anchors("Notes")).toBe("notes-3");
    expect(anchors("Other")).toBe("other");
  });

  it("never collides with an id a LATER heading would have claimed naturally", () => {
    const anchors = createHeadingAnchors();
    expect(anchors("Notes")).toBe("notes");
    // A heading literally called `Notes 2` keeps its natural id…
    expect(anchors("Notes 2")).toBe("notes-2");
    // …so the NEXT repeat of `Notes` cannot take it and searches further.
    expect(anchors("Notes")).toBe("notes-3");
    expect(anchors("Notes")).toBe("notes-4");
  });

  it("keeps every allocated id inside the pattern and the maximum length", () => {
    const anchors = createHeadingAnchors();
    const long = "word ".repeat(60);
    const ids = [long, long, long, "!!!", "!!!", "Café", "Cafe"].map((text) => anchors(text));
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
    for (const id of ids) {
      expect(isHeadingAnchor(id), id).toBe(true);
      expect(id.length).toBeLessThanOrEqual(HEADING_ANCHOR_MAX_LENGTH);
    }
  });

  it("is deterministic: a fresh allocator reproduces the same sequence", () => {
    const sequence = (texts: readonly string[]) => {
      const anchors = createHeadingAnchors();
      return texts.map((text) => anchors(text));
    };
    const texts = ["Intro", "Intro", "Details", "Intro", "Details 2"];
    expect(sequence(texts)).toEqual(sequence(texts));
  });

  it("refuses an id that is not one this rule could have produced", () => {
    expect(isHeadingAnchor("opening-hours")).toBe(true);
    expect(isHeadingAnchor("notes-2")).toBe(true);
    for (const bad of ["", "has space", 'has"quote', "<script>", "-leading", "trailing-", "a--b", "a".repeat(81)]) {
      expect(isHeadingAnchor(bad), bad).toBe(false);
    }
  });
});
