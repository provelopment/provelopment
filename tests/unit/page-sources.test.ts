import { mkdirSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPageSources } from "@/adapters/content/page-sources";

/**
 * THE COMPOSITION, END TO END (FOUNDATION-PAGES-A1; two-mode contract, A1C).
 *
 * These fixtures live under a test-only locale directory (`zz-sources`) in the REAL
 * authoring roots, so the declared precedence is proven on the real layout, not on
 * stubs. A fixture is ALSO planted under `content/pages/<locale>/` to prove the
 * collection path is not a page source at all: it can neither serve a page nor shadow
 * one. Everything is removed afterwards.
 */
const root = process.cwd();
// A locale UNIQUE to this suite: vitest runs test FILES in parallel, so two suites
// sharing one fixture locale would overwrite each other's fixtures.
const SOURCES_LOCALE = "zz-sources";
const EMPTY_LOCALE_NAME = "zz-sources-empty";
const createdDirectories = [
  path.join(root, "content", "pages", "markdown", SOURCES_LOCALE),
  path.join(root, "content", "pages", "json", SOURCES_LOCALE),
  path.join(root, "content", "pages", SOURCES_LOCALE),
];

const sources = createPageSources({
  defaultLocale: "en",
  locales: ["en", SOURCES_LOCALE, EMPTY_LOCALE_NAME],
});

function write(file: string, contents: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
}

describe("the page-sources composition", () => {
  beforeAll(() => {
    // Markdown (first-class) fixtures, flat AND nested.
    write(
      path.join(root, "content", "pages", "markdown", SOURCES_LOCALE, "about.md"),
      "# About\n\nA safe Markdown page.\n",
    );
    write(
      path.join(root, "content", "pages", "markdown", SOURCES_LOCALE, "both.md"),
      "# Markdown version\n",
    );
    write(
      path.join(root, "content", "pages", "markdown", SOURCES_LOCALE, "README.md"),
      "# Documentation\n",
    );
    write(
      path.join(root, "content", "pages", "markdown", SOURCES_LOCALE, "offerings.md"),
      "# Offerings\n\nA nested page.\n",
    );
    write(
      path.join(root, "content", "pages", "markdown", SOURCES_LOCALE, "offerings", "website-design.md"),
      "# Website design\n\nA nested page.\n",
    );
    write(
      path.join(root, "content", "pages", "markdown", SOURCES_LOCALE, "offerings", "shared.md"),
      "# Shared\n\nOnly in the requested locale.\n",
    );
    write(
      path.join(root, "content", "pages", "markdown", SOURCES_LOCALE, "offerings", "README.md"),
      "# Not a page\n",
    );
    write(
      path.join(root, "content", "pages", "markdown", "en", "zz-fallback.md"),
      "# Fallback page\n\nAnswered by the default locale.\n",
    );
    write(
      path.join(root, "content", "pages", "markdown", "en", "offerings", "fallback-page.md"),
      "# Nested fallback page\n\nAnswered by the default locale.\n",
    );
    // The default locale also has `offerings/shared`; the REQUESTED locale's page must
    // still win, whatever the other locale holds.
    write(
      path.join(root, "content", "pages", "markdown", "en", "offerings", "shared.md"),
      "# Shared (default locale)\n\nOnly in the default locale.\n",
    );
    // JSON (first-class) fixtures: one shadowing the Markdown page, one alone, and one
    // NESTED — the precedence applies to the complete route path.
    write(path.join(root, "content", "pages", "json", SOURCES_LOCALE, "both.json"), "{}\n");
    write(path.join(root, "content", "pages", "json", SOURCES_LOCALE, "json-only.json"), "{}\n");
    write(
      path.join(root, "content", "pages", "json", SOURCES_LOCALE, "offerings", "json-only.json"),
      "{}\n",
    );
    // NOT page sources: files planted OUTSIDE the two mode roots, one with a route that
    // also exists as a real page (it must not shadow it) and one with a route that
    // exists nowhere else (it must publish nothing at all).
    write(
      path.join(root, "content", "pages", SOURCES_LOCALE, "about.md"),
      "---\ntitle: Collection-path about\n---\n\nThis must never be served.\n",
    );
    write(
      path.join(root, "content", "pages", SOURCES_LOCALE, "zz-shadow.md"),
      "---\ntitle: Collection-path only\n---\n\nThis must never be served.\n",
    );
    // An EMPTY locale directory must publish nothing.
    write(path.join(root, "content", "pages", "markdown", EMPTY_LOCALE_NAME, ".gitkeep"), "");
  });

  afterAll(() => {
    for (const directory of createdDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
    // The EMPTY locale directory is a fixture too.
    rmSync(path.join(root, "content", "pages", "markdown", EMPTY_LOCALE_NAME), {
      recursive: true,
      force: true,
    });
    // Never leave a page-shaped file outside the two mode roots behind: `content/pages`
    // holds only the two mode roots, so no run may make it look like a collection.
    try {
      rmdirSync(path.join(root, "content", "pages", SOURCES_LOCALE));
    } catch {
      /* not empty, or already gone: leave it exactly as it is */
    }
    // The default-locale fixtures, flat and nested.
    for (const file of [
      path.join(root, "content", "pages", "markdown", "en", "zz-fallback.md"),
      path.join(root, "content", "pages", "markdown", "en", "offerings", "fallback-page.md"),
      path.join(root, "content", "pages", "markdown", "en", "offerings", "shared.md"),
    ]) {
      rmSync(file, { force: true });
    }
    // Remove a directory ONLY if the fixture left it empty — never a recursive delete,
    // so a developer's own pages in that directory are safe.
    for (const directory of [
      path.join(root, "content", "pages", "markdown", "en", "offerings"),
      path.join(root, "content", "pages", "markdown", "en"),
    ]) {
      try {
        rmdirSync(directory);
      } catch {
        /* not empty (or already gone): leave it exactly as it is */
      }
    }
  });

  it("resolves a safe Markdown page from the first-class root", async () => {
    const page = await sources.resolve("about", SOURCES_LOCALE);
    expect(page).toMatchObject({
      kind: "markdown",
      title: "About",
      locale: SOURCES_LOCALE,
      fallback: false,
    });
    expect(page?.body).toContain("A safe Markdown page.");
  });

  it("resolves a NESTED page through the same composition", async () => {
    const page = await sources.resolve("offerings/website-design", SOURCES_LOCALE);
    expect(page).toMatchObject({
      kind: "markdown",
      routePath: "offerings/website-design",
      title: "Website design",
      locale: SOURCES_LOCALE,
      fallback: false,
    });
    expect(page?.body).toContain("A nested page.");
  });

  it("publishes NOTHING from an obsolete collection-shaped path, and lets it shadow no page", async () => {
    // The same route exists as a file under `content/pages/<locale>/`; the real page
    // still wins, and a path that is not one of the two mode roots is never consulted.
    const page = await sources.resolve("about", SOURCES_LOCALE);
    expect(page?.title).toBe("About");
    expect(page?.body).toContain("A safe Markdown page.");
    expect(page?.body).not.toContain("This must never be served.");

    // A route that exists ONLY there is not a page at all.
    expect(await sources.resolve("zz-shadow", SOURCES_LOCALE)).toBeNull();
  });

  it("falls back to the default locale last, and marks it — nested routes included", async () => {
    expect(await sources.resolve("zz-fallback", SOURCES_LOCALE)).toMatchObject({
      kind: "markdown",
      locale: "en",
      fallback: true,
    });
    expect(await sources.resolve("offerings/fallback-page", SOURCES_LOCALE)).toMatchObject({
      kind: "markdown",
      routePath: "offerings/fallback-page",
      locale: "en",
      fallback: true,
    });
  });

  it("lets an exact-locale nested page beat a default-locale one", async () => {
    // `offerings/shared` exists in BOTH locales: the visitor asked for SOURCES_LOCALE,
    // so that locale's page answers even though the default locale has one too.
    const page = await sources.resolve("offerings/shared", SOURCES_LOCALE);
    expect(page).toMatchObject({ locale: SOURCES_LOCALE, fallback: false });
    expect(page?.body).toContain("Only in the requested locale.");
  });

  it("stops loudly when a JSON source would be served, naming the file", async () => {
    // JSON beats Markdown within a locale, so this route has a JSON winner.
    await expect(sources.resolve("both", SOURCES_LOCALE)).rejects.toThrow(
      new RegExp(`content[\\\\/]pages[\\\\/]json[\\\\/]${SOURCES_LOCALE}[\\\\/]both\\.json`),
    );
    await expect(sources.resolve("both", SOURCES_LOCALE)).rejects.toThrow(/not yet interpreted/);
    // A JSON-only route behaves the same way: never silently ignored.
    await expect(sources.resolve("json-only", SOURCES_LOCALE)).rejects.toThrow(/json-only\.json/);
    // …and so does a NESTED JSON route: the rule is about the route, not its depth.
    await expect(sources.resolve("offerings/json-only", SOURCES_LOCALE)).rejects.toThrow(
      /offerings[\\\\/]json-only\.json/,
    );
  });

  it("lists every publishable route for a configured locale, nested paths included", async () => {
    // The inventory is PER LOCALE: a default-locale page (`offerings/fallback-page`,
    // which this locale resolves through fallback) is not listed as this locale's own.
    expect(await sources.listRoutes(SOURCES_LOCALE)).toEqual([
      "about",
      "both",
      "json-only",
      "offerings",
      "offerings/json-only",
      "offerings/shared",
      "offerings/website-design",
    ]);
    // A README (at ANY level), a `.gitkeep`-only directory and an obsolete
    // collection-shaped path are never listed.
    const routes = await sources.listRoutes(SOURCES_LOCALE);
    expect(routes).not.toContain("zz-shadow");
    expect(routes).not.toContain("README");
    expect(routes).not.toContain("offerings/README");
    expect(await sources.listRoutes(EMPTY_LOCALE_NAME)).toEqual([]);
  });

  it("publishes NOTHING for a locale the site does not configure", async () => {
    const configuredOnly = createPageSources({ defaultLocale: "en", locales: ["en"] });
    expect(await configuredOnly.resolve("about", SOURCES_LOCALE)).toBeNull();
    expect(await configuredOnly.listRoutes(SOURCES_LOCALE)).toEqual([]);
  });

  it("returns null for a page that exists nowhere, and for an unusable route", async () => {
    expect(await sources.resolve("does-not-exist", SOURCES_LOCALE)).toBeNull();
    expect(await sources.resolve("about", "zz-unknown")).toBeNull();
    for (const attempt of ["../about", "offerings/../../about", "offerings/", "/about", "README"]) {
      expect(await sources.resolve(attempt, SOURCES_LOCALE), attempt).toBeNull();
    }
  });
});
