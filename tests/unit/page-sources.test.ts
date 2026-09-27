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
    // Markdown (first-class) fixtures.
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
      path.join(root, "content", "pages", "markdown", "en", "zz-fallback.md"),
      "# Fallback page\n\nAnswered by the default locale.\n",
    );
    // JSON (first-class) fixtures: one shadowing the Markdown page, one alone.
    write(path.join(root, "content", "pages", "json", SOURCES_LOCALE, "both.json"), "{}\n");
    write(path.join(root, "content", "pages", "json", SOURCES_LOCALE, "json-only.json"), "{}\n");
    // NOT page sources: files planted under `content/pages`, one with a slug that also
    // exists as a real page (it must not shadow it) and one with a slug that exists
    // nowhere else (it must publish nothing at all).
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
    // Never leave the page-specific collection directory behind: `content/pages` is
    // not a collection, so no run should make it look like one.
    try {
      rmdirSync(path.join(root, "content", "pages"));
    } catch {
      /* not empty, or already gone: leave it exactly as it is */
    }
    const fallbackFile = path.join(root, "content", "pages", "markdown", "en", "zz-fallback.md");
    rmSync(fallbackFile, { force: true });
    // Remove the locale directory ONLY if the fixture left it empty — never a
    // recursive delete, so a developer's own pages in that directory are safe.
    try {
      rmdirSync(path.dirname(fallbackFile));
    } catch {
      /* not empty (or already gone): leave it exactly as it is */
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

  it("publishes NOTHING from `content/pages`, and lets it shadow no page", async () => {
    // The same slug exists under `content/pages/<locale>/`; the real page still wins,
    // and the collection path is never consulted.
    const page = await sources.resolve("about", SOURCES_LOCALE);
    expect(page?.title).toBe("About");
    expect(page?.body).toContain("A safe Markdown page.");
    expect(page?.body).not.toContain("This must never be served.");

    // A slug that exists ONLY under `content/pages` is not a page at all.
    expect(await sources.resolve("zz-shadow", SOURCES_LOCALE)).toBeNull();
  });

  it("falls back to the default locale last, and marks it", async () => {
    const page = await sources.resolve("zz-fallback", SOURCES_LOCALE);
    expect(page).toMatchObject({ kind: "markdown", locale: "en", fallback: true });
  });

  it("stops loudly when a JSON source would be served, naming the file", async () => {
    // JSON beats Markdown within a locale, so this slug has a JSON winner.
    await expect(sources.resolve("both", SOURCES_LOCALE)).rejects.toThrow(
      new RegExp(`content[\\\\/]pages[\\\\/]json[\\\\/]${SOURCES_LOCALE}[\\\\/]both\\.json`),
    );
    await expect(sources.resolve("both", SOURCES_LOCALE)).rejects.toThrow(/not yet interpreted/);
    // A JSON-only slug behaves the same way: never silently ignored.
    await expect(sources.resolve("json-only", SOURCES_LOCALE)).rejects.toThrow(/json-only\.json/);
  });

  it("lists every publishable slug for a configured locale, and nothing for an empty one", async () => {
    expect(await sources.listSlugs(SOURCES_LOCALE)).toEqual(["about", "both", "json-only"]);
    // A README, a `.gitkeep`-only directory and anything under `content/pages` are
    // never listed.
    expect(await sources.listSlugs(SOURCES_LOCALE)).not.toContain("zz-shadow");
    expect(await sources.listSlugs(SOURCES_LOCALE)).not.toContain("README");
    expect(await sources.listSlugs(EMPTY_LOCALE_NAME)).toEqual([]);
  });

  it("publishes NOTHING for a locale the site does not configure", async () => {
    const configuredOnly = createPageSources({ defaultLocale: "en", locales: ["en"] });
    expect(await configuredOnly.resolve("about", SOURCES_LOCALE)).toBeNull();
    expect(await configuredOnly.listSlugs(SOURCES_LOCALE)).toEqual([]);
  });

  it("returns null for a page that exists nowhere", async () => {
    expect(await sources.resolve("does-not-exist", SOURCES_LOCALE)).toBeNull();
    expect(await sources.resolve("about", "zz-unknown")).toBeNull();
  });
});
