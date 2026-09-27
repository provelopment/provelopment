import { describe, expect, it } from "vitest";

import {
  PAGE_ROUTE_PATH_MAX_LENGTH,
  PAGE_ROUTE_PATH_MAX_SEGMENTS,
  PAGE_ROUTE_PATH_SEPARATOR,
  isPageRoutePath,
  pageRouteChildDirectories,
  pageRouteLeaf,
  pageRoutePath,
  pageRoutePathFromFile,
  pageRoutePathSegments,
} from "@/core/page-route-path";

/**
 * THE PAGE-ROUTE-PATH CONTRACT (FOUNDATION-PAGES-A1E).
 *
 * "If authored content has its own URL, it is a page" — and a page's URL is built
 * from the folders it is authored in. This module is the ONE rule for that value, so
 * these assertions are the traversal and safety boundary: a value that reaches a
 * filesystem path AND a URL must never escape the authoring root.
 */
describe("the page-route-path rule", () => {
  it("accepts one segment or several, and never a leading/trailing separator", () => {
    expect(isPageRoutePath("about")).toBe(true);
    expect(isPageRoutePath("offerings/website-design")).toBe(true);
    expect(isPageRoutePath("blog/2026/choosing-a-domain")).toBe(true);
    expect(pageRoutePathSegments("offering-s/website-design")).toEqual([
      "offering-s",
      "website-design",
    ]);

    // The canonical value never carries a leading or trailing separator, which is why
    // discovery, routing and the sitemap can concatenate it without a second rule.
    for (const value of ["/about", "about/", "/about/", "offerings//website-design"]) {
      expect(isPageRoutePath(value), value).toBe(false);
      expect(pageRoutePathSegments(value), value).toEqual([]);
    }
    expect(PAGE_ROUTE_PATH_SEPARATOR).toBe("/");
  });

  it("refuses every traversal and escape form", () => {
    for (const value of [
      "..",
      "../etc",
      "about/..",
      "about/../about",
      "./about",
      "about/.",
      "blog/../../etc/passwd",
      "blog\\post",
      "..\\escape",
      "%2e%2e/escape",
      "%2E%2E",
      "about%2Fpost",
      "about post",
      "about.",
      ".hidden",
      "About",
      "about_post",
      "about--post",
    ]) {
      expect(isPageRoutePath(value), value).toBe(false);
      expect(pageRoutePathSegments(value), value).toEqual([]);
    }
  });

  it("documents and enforces a maximum depth and a maximum length", () => {
    expect(PAGE_ROUTE_PATH_MAX_SEGMENTS).toBe(4);
    expect(isPageRoutePath("a/b/c/d")).toBe(true);
    expect(isPageRoutePath("a/b/c/d/e")).toBe(false);

    const longest = "a".repeat(PAGE_ROUTE_PATH_MAX_LENGTH);
    expect(isPageRoutePath(longest)).toBe(true);
    expect(isPageRoutePath("a".repeat(PAGE_ROUTE_PATH_MAX_LENGTH + 1))).toBe(false);
  });

  it("builds a canonical route path from segments, or nothing at all", () => {
    expect(pageRoutePath("about")).toBe("about");
    expect(pageRoutePath("offerings", "website-design")).toBe("offerings/website-design");
    expect(pageRoutePath("a", "b", "c", "d")).toBe("a/b/c/d");

    // Nothing to build, one segment too many, or any unusable segment → null. A caller
    // never joins segments itself, so an unvalidated path can never exist.
    expect(pageRoutePath()).toBeNull();
    expect(pageRoutePath("a", "b", "c", "d", "e")).toBeNull();
    for (const bad of ["", "..", "About", "not a slug", "blog\\post", ".hidden"]) {
      expect(pageRoutePath("blog", bad), bad).toBeNull();
    }
    // ONE argument is ONE segment: a value carrying its own separator is refused, so a
    // second segment (or a traversal) cannot be smuggled through a single argument.
    for (const smuggled of ["blog/post", "about/..", "blog/", "/blog"]) {
      expect(pageRoutePath(smuggled), smuggled).toBeNull();
      expect(pageRoutePath("blog", smuggled), smuggled).toBeNull();
    }
  });

  it("reads a page's own name from the LAST segment, not its folder", () => {
    expect(pageRouteLeaf("about")).toBe("about");
    expect(pageRouteLeaf("offerings/website-design")).toBe("website-design");
    expect(pageRouteLeaf("blog/2026/choosing-a-domain")).toBe("choosing-a-domain");
    expect(pageRouteLeaf("not a route path")).toBe("");
  });

  it("maps a file in a directory to a route path, and ignores everything else", () => {
    expect(pageRoutePathFromFile("", "about.md", "md")).toBe("about");
    expect(pageRoutePathFromFile("offerings", "website-design.md", "md")).toBe(
      "offerings/website-design",
    );
    expect(pageRoutePathFromFile("", "about.json", "json")).toBe("about");

    // Documentation and placeholders are inert at EVERY level, not only at the root.
    for (const name of ["README.md", ".gitkeep", "not a slug.md", "notes.txt", "about.json"]) {
      expect(pageRoutePathFromFile("blog", name, "md"), name).toBeNull();
    }
    expect(pageRoutePathFromFile("blog", "README.md", "md")).toBeNull();
    // A folder chain that would exceed the depth cap produces nothing.
    expect(pageRoutePathFromFile("a/b/c/d", "deep.md", "md")).toBeNull();
  });

  it("lists the child folders that may contain pages, ignoring unusable ones", () => {
    const listing = [
      { name: "blog", directory: true },
      { name: "offerings", directory: true },
      { name: "Not A Slug", directory: true },
      { name: ".hidden", directory: true },
      { name: "README.md", directory: false },
      { name: "about.md", directory: false },
      { name: "blog", directory: true },
    ];
    expect(pageRouteChildDirectories("", listing)).toEqual(["blog", "offerings"]);
    expect(pageRouteChildDirectories("blog", [{ name: "2026", directory: true }])).toEqual([
      "blog/2026",
    ]);
    // A folder that would take a page past the depth cap is not a child.
    expect(pageRouteChildDirectories("a/b/c/d", [{ name: "e", directory: true }])).toEqual([]);
    expect(pageRouteChildDirectories("", [])).toEqual([]);
  });

  it("is deterministic: the same inputs always produce the same route path", () => {
    expect(pageRoutePath("blog", "choosing-a-domain")).toBe(
      pageRoutePath("blog", "choosing-a-domain"),
    );
    expect(pageRouteLeaf("blog/choosing-a-domain")).toBe("choosing-a-domain");
  });
});
