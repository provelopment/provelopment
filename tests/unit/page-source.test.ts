import { describe, expect, it } from "vitest";

import {
  PAGE_AUTHORING_EXTENSIONS,
  PAGE_AUTHORING_MODES,
  PAGE_AUTHORING_ROOTS,
  PAGE_RESOLUTION_ORDER,
  authoringLocaleDirectories,
  pageResolutionCandidates,
  pageSlugsInLocaleDirectory,
  pageSourceDirectory,
  pageSourceFile,
} from "@/core/page-source";

/**
 * THE PAGE-SOURCE CONTRACT (FOUNDATION-PAGES-A1/A1C).
 *
 * The rule the whole authoring architecture rests on: TWO first-class modes and no
 * third kind, in ONE declared order. These assertions are policy, not implementation:
 * the resolver, the routes and the sitemap all consume this contract.
 */
describe("exactly two first-class authoring modes", () => {
  it("declares the two modes, JSON first", () => {
    expect(PAGE_AUTHORING_MODES).toEqual(["json", "markdown"]);
    expect(PAGE_AUTHORING_ROOTS.markdown).toBe("content/pages/markdown");
    expect(PAGE_AUTHORING_ROOTS.json).toBe("content/pages/json");
    expect(PAGE_AUTHORING_EXTENSIONS).toEqual({ json: "json", markdown: "md" });
    expect(Object.keys(PAGE_AUTHORING_ROOTS).sort()).toEqual(["json", "markdown"]);
  });

  it("declares NO third kind and no compatibility kind", () => {
    // The two modes are the complete set of page-source kinds: every step names one
    // of them, and nothing in the order can answer from a path outside the two roots.
    for (const step of PAGE_RESOLUTION_ORDER) {
      expect(PAGE_AUTHORING_MODES, step.kind).toContain(step.kind);
    }
    expect(PAGE_RESOLUTION_ORDER.some((step) => (step.kind as string) === "content")).toBe(false);
    expect(PAGE_AUTHORING_MODES).toHaveLength(2);
  });

  it("declares the order as exactly the two-mode expansion, requested locale first", () => {
    expect(PAGE_RESOLUTION_ORDER).toEqual([
      { kind: "json", locale: "requested" },
      { kind: "markdown", locale: "requested" },
      { kind: "json", locale: "default" },
      { kind: "markdown", locale: "default" },
    ]);
  });
});

describe("the resolution order", () => {
  it("is JSON → Markdown, requested locale before default, with no third source", () => {
    expect(PAGE_RESOLUTION_ORDER.map((step) => step.kind)).toEqual([
      "json",
      "markdown",
      "json",
      "markdown",
    ]);
    expect(PAGE_RESOLUTION_ORDER.map((step) => step.locale)).toEqual([
      "requested",
      "requested",
      "default",
      "default",
    ]);
  });

  it("expands to the requested locale first and the default locale second, marking the fallback", () => {
    expect(pageResolutionCandidates({ slug: "about", locale: "de", defaultLocale: "en" })).toEqual([
      { kind: "json", locale: "de", fallback: false },
      { kind: "markdown", locale: "de", fallback: false },
      { kind: "json", locale: "en", fallback: true },
      { kind: "markdown", locale: "en", fallback: true },
    ]);
  });

  it("omits the fallback steps when fallback is not permitted", () => {
    const candidates = pageResolutionCandidates({
      slug: "about",
      locale: "de",
      defaultLocale: "en",
      fallback: false,
    });
    expect(candidates).toHaveLength(2);
    expect(candidates.every((candidate) => candidate.fallback === false)).toBe(true);
  });

  it("omits them when the requested locale IS the default locale", () => {
    const candidates = pageResolutionCandidates({
      slug: "about",
      locale: "en",
      defaultLocale: "en",
    });
    expect(candidates.map((candidate) => candidate.locale)).toEqual(["en", "en"]);
    expect(candidates.every((candidate) => candidate.fallback === false)).toBe(true);
  });

  it("JSON wins over Markdown within one locale", () => {
    const exact = pageResolutionCandidates({ slug: "about", locale: "de", defaultLocale: "en" })
      .filter((candidate) => !candidate.fallback)
      .map((candidate) => candidate.kind);
    expect(exact).toEqual(["json", "markdown"]);
  });

  it("makes an exact-locale page beat a default-locale one, whatever the format", () => {
    const candidates = pageResolutionCandidates({ slug: "about", locale: "de", defaultLocale: "en" });
    const lastExact = candidates.map((candidate) => candidate.fallback).lastIndexOf(false);
    const firstFallback = candidates.findIndex((candidate) => candidate.fallback);
    expect(lastExact).toBeLessThan(firstFallback);
  });

  it("refuses a request that names no usable page or language", () => {
    for (const request of [
      { slug: "README", locale: "en", defaultLocale: "en" },
      { slug: ".gitkeep", locale: "en", defaultLocale: "en" },
      { slug: "Not A Slug", locale: "en", defaultLocale: "en" },
      { slug: "about", locale: "../etc", defaultLocale: "en" },
      { slug: "about", locale: "en", defaultLocale: "not a locale" },
    ]) {
      expect(pageResolutionCandidates(request), JSON.stringify(request)).toEqual([]);
    }
  });
});

describe("the discovery primitives", () => {
  it("reads the language directories from a listing, ignoring everything else", () => {
    expect(
      authoringLocaleDirectories([
        { name: "en", directory: true },
        { name: "de", directory: true },
        { name: "README.md", directory: false },
        { name: "not a locale", directory: true },
        { name: "en", directory: true },
      ]),
    ).toEqual(["de", "en"]);
  });

  it("reads slugs from a locale listing, ignoring README, placeholders and wrong modes", () => {
    expect(
      pageSlugsInLocaleDirectory("markdown", [
        "about.md",
        "README.md",
        ".gitkeep",
        "Not A Slug.md",
        "notes.txt",
        "about.md",
      ]),
    ).toEqual(["about"]);
    expect(pageSlugsInLocaleDirectory("json", ["about.json", "about.md"])).toEqual(["about"]);
    // An EMPTY locale directory is a legitimate state, never an error.
    expect(pageSlugsInLocaleDirectory("markdown", [])).toEqual([]);
  });

  it("builds exactly two segments below the root, so a root-level file can never be a source", () => {
    for (const mode of PAGE_AUTHORING_MODES) {
      const file = pageSourceFile(mode, "en", "about") ?? "";
      const belowRoot = file.slice(`${PAGE_AUTHORING_ROOTS[mode]}/`.length);
      // `<locale>/<slug>.<ext>` — a file directly under the root has no locale
      // segment and therefore can never be a page.
      expect(belowRoot.split("/")).toHaveLength(2);
    }
    expect(pageSourceFile("markdown", "en", "about")).toBe("content/pages/markdown/en/about.md");
    expect(pageSourceFile("json", "de", "about")).toBe("content/pages/json/de/about.json");
    expect(pageSourceDirectory("markdown", "en")).toBe("content/pages/markdown/en");
  });

  it("never builds a path from a value it has not validated", () => {
    expect(pageSourceDirectory("markdown", "../etc")).toBeNull();
    expect(pageSourceFile("markdown", "en", "README")).toBeNull();
    expect(pageSourceFile("markdown", "en", "../escape")).toBeNull();
    expect(pageSourceFile("markdown", "not a locale", "about")).toBeNull();
  });
});
