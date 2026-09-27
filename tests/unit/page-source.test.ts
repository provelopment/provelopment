import { describe, expect, it } from "vitest";

import {
  PAGE_AUTHORING_EXTENSIONS,
  PAGE_AUTHORING_MODES,
  PAGE_AUTHORING_ROOTS,
  PAGE_RESOLUTION_ORDER,
  authoringLocaleDirectories,
  pageResolutionCandidates,
  pageSourceDirectory,
  pageSourceFile,
} from "@/core/page-source";

/**
 * THE PAGE-SOURCE CONTRACT (FOUNDATION-PAGES-A1/A1C/A1E).
 *
 * The rule the whole authoring architecture rests on: TWO first-class modes and no
 * third kind, in ONE declared order, addressed by a page ROUTE PATH that mirrors the
 * folders the page is authored in. These assertions are policy, not implementation:
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
    expect(
      pageResolutionCandidates({ siteId: "main", routePath: "about", locale: "de", defaultLocale: "en" }),
    ).toEqual([
      { kind: "json", locale: "de", fallback: false },
      { kind: "markdown", locale: "de", fallback: false },
      { kind: "json", locale: "en", fallback: true },
      { kind: "markdown", locale: "en", fallback: true },
    ]);
  });

  it("applies the same order to a NESTED route path", () => {
    // A nested page is resolved exactly as a top-level one: the route path is the
    // request, and the order does not know how deep it is.
    expect(
      pageResolutionCandidates({
      siteId: "main",
        routePath: "offerings/website-design",
        locale: "de",
        defaultLocale: "en",
      }),
    ).toEqual([
      { kind: "json", locale: "de", fallback: false },
      { kind: "markdown", locale: "de", fallback: false },
      { kind: "json", locale: "en", fallback: true },
      { kind: "markdown", locale: "en", fallback: true },
    ]);
  });

  it("omits the fallback steps when fallback is not permitted", () => {
    const candidates = pageResolutionCandidates({
      siteId: "main",
      routePath: "about",
      locale: "de",
      defaultLocale: "en",
      fallback: false,
    });
    expect(candidates).toHaveLength(2);
    expect(candidates.every((candidate) => candidate.fallback === false)).toBe(true);
  });

  it("omits them when the requested locale IS the default locale", () => {
    const candidates = pageResolutionCandidates({
      siteId: "main",
      routePath: "about",
      locale: "en",
      defaultLocale: "en",
    });
    expect(candidates.map((candidate) => candidate.locale)).toEqual(["en", "en"]);
    expect(candidates.every((candidate) => candidate.fallback === false)).toBe(true);
  });

  it("JSON wins over Markdown within one locale", () => {
    const exact = pageResolutionCandidates({ siteId: "main", routePath: "about", locale: "de", defaultLocale: "en" })
      .filter((candidate) => !candidate.fallback)
      .map((candidate) => candidate.kind);
    expect(exact).toEqual(["json", "markdown"]);
  });

  it("makes an exact-locale page beat a default-locale one, whatever the format", () => {
    const candidates = pageResolutionCandidates({
      siteId: "main",
      routePath: "about",
      locale: "de",
      defaultLocale: "en",
    });
    const lastExact = candidates.map((candidate) => candidate.fallback).lastIndexOf(false);
    const firstFallback = candidates.findIndex((candidate) => candidate.fallback);
    expect(lastExact).toBeLessThan(firstFallback);
  });

  it("refuses a request that names no usable page route or language", () => {
    for (const routePath of [
      "README",
      ".gitkeep",
      "Not A Slug",
      "../escape",
      "blog/../../escape",
      "blog//post",
      "/blog",
      "blog/",
      "blog\\post",
      "%2e%2e/escape",
      "a/b/c/d/e",
    ]) {
      expect(
        pageResolutionCandidates({ siteId: "main", routePath, locale: "en", defaultLocale: "en" }),
        routePath,
      ).toEqual([]);
    }
    for (const request of [
      { routePath: "about", locale: "../etc", defaultLocale: "en" },
      { routePath: "about", locale: "en", defaultLocale: "not a locale" },
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

  it("builds the source file of a page route path, nested paths included", () => {
    expect(pageSourceFile("markdown", "main", "en", "about")).toBe("content/pages/markdown/main/en/about.md");
    expect(pageSourceFile("json", "main", "de", "about")).toBe("content/pages/json/main/de/about.json");
    expect(pageSourceFile("markdown", "main", "en", "offerings/website-design")).toBe(
      "content/pages/markdown/main/en/offerings/website-design.md",
    );
    expect(pageSourceFile("json", "main", "en", "blog/2026/choosing-a-domain")).toBe(
      "content/pages/json/main/en/blog/2026/choosing-a-domain.json",
    );
    expect(pageSourceDirectory("markdown", "main", "en")).toBe("content/pages/markdown/main/en");
  });

  it("keeps every source file UNDER a locale directory, at every depth", () => {
    for (const mode of PAGE_AUTHORING_MODES) {
      const file = pageSourceFile(mode, "main", "en", "blog/post") ?? "";
      const belowRoot = file.slice(`${PAGE_AUTHORING_ROOTS[mode]}/`.length);
      // `<locale>/…/<slug>.<ext>` — the first segment is always the locale, so a file
      // directly under a root (its README) can never be a page.
      expect(belowRoot.split("/")[0]).toBe("en");
      expect(belowRoot.endsWith(`.${PAGE_AUTHORING_EXTENSIONS[mode]}`)).toBe(true);
    }
  });

  it("never builds a path from a value it has not validated", () => {
    expect(pageSourceDirectory("markdown", "main", "../etc")).toBeNull();
    expect(pageSourceFile("markdown", "main", "en", "README")).toBeNull();
    expect(pageSourceFile("markdown", "main", "en", "../escape")).toBeNull();
    expect(pageSourceFile("markdown", "main", "en", "blog/../../escape")).toBeNull();
    expect(pageSourceFile("markdown", "main", "en", "blog\\post")).toBeNull();
    expect(pageSourceFile("markdown", "main", "not a locale", "about")).toBeNull();
  });
});
