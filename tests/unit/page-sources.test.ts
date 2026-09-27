import { mkdirSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPageSources } from "@/adapters/content/page-sources";

/**
 * THE COMPOSITION, END TO END (FOUNDATION-PAGES-A1).
 *
 * These fixtures live under a test-only locale directory (`zz-test`) in the REAL
 * roots — and, for the legacy cases, in the real `content/pages` collection — so the
 * declared precedence is proven on the real layout, not on stubs. They are removed
 * afterwards.
 */
const root = process.cwd();
// A locale UNIQUE to this suite: vitest runs test FILES in parallel, so two suites
// sharing one fixture locale would overwrite each other's fixtures.
const SOURCES_LOCALE = "zz-sources";
const EMPTY_LOCALE_NAME = "zz-sources-empty";
const createdDirectories = [
  path.join(root, "config", "pages-markdown", SOURCES_LOCALE),
  path.join(root, "config", "pages-json", SOURCES_LOCALE),
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
      path.join(root, "config", "pages-markdown", SOURCES_LOCALE, "about.md"),
      "# About\n\nA safe Markdown page.\n",
    );
    write(
      path.join(root, "config", "pages-markdown", SOURCES_LOCALE, "both.md"),
      "# Markdown version\n",
    );
    write(
      path.join(root, "config", "pages-markdown", SOURCES_LOCALE, "README.md"),
      "# Documentation\n",
    );
    write(
      path.join(root, "config", "pages-markdown", "en", "zz-fallback.md"),
      "# Fallback page\n\nAnswered by the default locale.\n",
    );
    // JSON (first-class) fixtures: one shadowing the Markdown page, one alone.
    write(path.join(root, "config", "pages-json", SOURCES_LOCALE, "both.json"), "{}\n");
    write(path.join(root, "config", "pages-json", SOURCES_LOCALE, "json-only.json"), "{}\n");
    // Legacy content fixtures.
    write(
      path.join(root, "content", "pages", SOURCES_LOCALE, "legacy-only.md"),
      '---\ntitle: Legacy page\ndescription: "legacy summary"\n---\n\nLegacy body\n',
    );
    write(
      path.join(root, "content", "pages", SOURCES_LOCALE, "about.md"),
      "---\ntitle: Legacy about\n---\n\nLegacy body\n",
    );
    write(
      path.join(root, "content", "pages", SOURCES_LOCALE, "legacy-html.md"),
      "---\ntitle: Legacy HTML\n---\n\n<div id=\"raw\">trusted markup</div>\n",
    );
    // An EMPTY locale directory must publish nothing.
    write(path.join(root, "config", "pages-markdown", EMPTY_LOCALE_NAME, ".gitkeep"), "");
  });

  afterAll(() => {
    for (const directory of createdDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
    // The EMPTY locale directory is a fixture too.
    rmSync(path.join(root, "config", "pages-markdown", EMPTY_LOCALE_NAME), {
      recursive: true,
      force: true,
    });
    const fallbackFile = path.join(root, "config", "pages-markdown", "en", "zz-fallback.md");
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

  it("prefers a first-class Markdown page over the legacy content mechanism", async () => {
    const page = await sources.resolve("about", SOURCES_LOCALE);
    // The same slug exists in `content/pages/<locale>/about.md`; Markdown wins.
    expect(page?.kind).toBe("markdown");
    expect(page?.title).toBe("About");
  });

  it("still serves the legacy content mechanism, with its own behaviour preserved", async () => {
    const page = await sources.resolve("legacy-only", SOURCES_LOCALE);
    expect(page?.kind).toBe("content");
    expect(page?.title).toBe("Legacy page");
    // The legacy parser's behaviour is untouched: its `description` is NOT adopted
    // as page metadata, so no existing adopter's page changes shape.
    expect(page?.description).toBeUndefined();

    const html = await sources.resolve("legacy-html", SOURCES_LOCALE);
    expect(html?.kind).toBe("content");
    // Legacy bodies keep their trusted markup, passed through unchanged — the
    // renderer choice happens in ONE place (`PageBody`).
    expect(html?.body).toContain('<div id="raw">trusted markup</div>');
  });

  it("falls back to the default locale last, and marks it", async () => {
    const page = await sources.resolve("zz-fallback", SOURCES_LOCALE);
    expect(page).toMatchObject({ kind: "markdown", locale: "en", fallback: true });
  });

  it("stops loudly when a JSON source would be served, naming the file", async () => {
    // JSON beats Markdown within a locale, so this slug has a JSON winner.
    await expect(sources.resolve("both", SOURCES_LOCALE)).rejects.toThrow(
      new RegExp(`config[\\\\/]pages-json[\\\\/]${SOURCES_LOCALE}[\\\\/]both\\.json`),
    );
    await expect(sources.resolve("both", SOURCES_LOCALE)).rejects.toThrow(/not yet interpreted/);
    // A JSON-only slug behaves the same way: never silently ignored.
    await expect(sources.resolve("json-only", SOURCES_LOCALE)).rejects.toThrow(/json-only\.json/);
  });

  it("lists every publishable slug for a configured locale, and nothing for an empty one", async () => {
    expect(await sources.listSlugs(SOURCES_LOCALE)).toEqual([
      "about",
      "both",
      "json-only",
      "legacy-html",
      "legacy-only",
    ]);
    // README is never listed; an empty locale directory publishes nothing.
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
