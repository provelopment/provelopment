/**
 * WHAT A DIRECTORY MEANS, AND WHAT IT DOES NOT (FOUNDATION-MULTISITE-M20)
 * ======================================================================
 *
 * The authoring tree is only useful if its RULES are explicit, because every one of them is a promise an
 * author relies on:
 *
 *   an empty locale directory   publishes NOTHING and is not an error — a language may be prepared first
 *   an empty nested directory   publishes nothing: a directory is not a Page Hub
 *   README.md / HOW-TO.md       is DOCUMENTATION: never a page, never a route, at any level
 *   an invalid file name        publishes nothing — no route is ever guessed from a file name
 *   JSON over Markdown          ONE route, one page: the JSON representation wins inside one Spoke
 *
 * None of this is a special case in the renderer or the scanner — it follows from recognizing only valid
 * page sources in valid Site/locale coordinates. This test proves the CONSEQUENCE authoring depends on, on
 * a DISPOSABLE tree built for the purpose: no fake locale is added to a real deployment, and a truly empty
 * directory can exist without a Git-tracked placeholder distorting the test.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createPageSources } from "@/adapters/content/page-sources";
import { HOME_CONTENT_SLUG } from "@/core/page-content";

import { syntheticSiteConfig } from "../support/synthetic-deployment";

/** Roots created by this file, removed by exact ownership — never by searching OS temp. */
const owned: string[] = [];
afterEach(() => {
  for (const root of owned.splice(0)) rmSync(root, { recursive: true, force: true });
});

function disposableAuthoringTree(): string {
  const root = mkdtempSync(path.join(tmpdir(), "foundation-m20-authoring-"));
  owned.push(root);
  return root;
}

function write(root: string, relative: string, content: string): void {
  const absolute = path.join(root, ...relative.split("/"));
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

/**
 * The SYNTHETIC deployment's own validated sites (`ww` + `ca`, each with configured locales), so the
 * coordinates this tree uses are real configured ones — a disposable TREE varies, the Site model does not.
 */
const SITES = syntheticSiteConfig.sites;

/**
 * A Site whose FIRST locale has pages, plus configured locales and a whole configured Site with nothing
 * in them: `ww/de` is a configured locale of `ww` with no file at all, and `ca` is a configured Site with
 * neither an English page nor a nested directory.
 */

/** The disposable tree: one populated locale, empty locales, nested empties, documentation, invalid names. */
function buildTree(): { roots: { markdownPagesRoot: string; jsonPagesRoot: string } } {
  const root = disposableAuthoringTree();
  const roots = {
    markdownPagesRoot: path.join(root, "markdown"),
    jsonPagesRoot: path.join(root, "json"),
  };

  // POPULATED: a Home Page Hub, one Markdown page, and a JSON/Markdown PAIR for the same route.
  write(root, "json/ww/en/home.json", `${JSON.stringify({ schemaVersion: 1, title: "Home", sections: [] })}\n`);
  write(root, "markdown/ww/en/about.md", "---\ntitle: About\n---\n\nAbout this site.\n");
  write(root, "markdown/ww/en/services.md", "---\ntitle: Services (Markdown)\n---\n\nOld prose.\n");
  write(
    root,
    "json/ww/en/services.json",
    `${JSON.stringify(
      { schemaVersion: 1, title: "Services (JSON)", sections: [{ type: "prose", body: "Fresh." }] },
      null,
      2,
    )}\n`,
  );

  // EMPTY COORDINATES: `ww/de` is a configured locale with NOTHING in it; `ca/en` is a configured
  // site+locale with nothing in it; and `ww/en/guide` is an empty nested directory beside real pages.
  for (const mode of ["markdown", "json"]) {
    mkdirSync(path.join(root, mode, "ww", "de"), { recursive: true });
    mkdirSync(path.join(root, mode, "ca", "en"), { recursive: true });
    mkdirSync(path.join(root, mode, "ww", "en", "guide"), { recursive: true });
  }

  // DOCUMENTATION at intermediate roots: never pages, whatever they are named.
  write(root, "markdown/README.md", "# Markdown pages\n");
  write(root, "json/README.md", "# JSON pages\n");
  write(root, "markdown/ww/README.md", "# Site ww\n");
  write(root, "json/ww/README.md", "# Site ww (JSON)\n");
  write(root, "markdown/ww/en/README.md", "# English pages\n");
  write(root, "markdown/ww/en/HOW-TO.md", "# How to\n");
  write(root, "json/ww/en/README.md", "# English JSON pages\n");
  write(root, "markdown/ww/en/guide/README.md", "# Guide section\n");

  // NOT PAGES: names that are not valid page names, and a page in no configured locale.


  write(root, "markdown/ww/en/Not-A-Page.md", "---\ntitle: Nope\n---\n");
  write(root, "markdown/README-extra.md", "# docs\n");
  write(root, "markdown/ww/xx/about.md", "---\ntitle: No such locale\n---\n");

  return { roots };
}

describe("M20 — the authoring directory contract", () => {
  it("scans a tree with EMPTY locale directories without failing, and publishes nothing for them", async () => {
    const { roots } = buildTree();
    const pages = createPageSources({ sites: SITES, roots });

    // The populated locale publishes exactly its own valid pages…
    expect([...(await pages.listRoutes("ww", "en"))].sort()).toEqual(["about", "home", "services"]);
    // …while an empty configured locale (and a whole configured Site with nothing in it) publishes
    // nothing at all.
    expect(await pages.listRoutes("ww", "de")).toEqual([]);
    expect(await pages.listRoutes("ca", "en")).toEqual([]);
  });

  it("does not treat a directory, or a name that is not a page, as a PUBLISHABLE page", async () => {
    const { roots } = buildTree();
    const pages = createPageSources({ sites: SITES, roots });
    const routes = await pages.listRoutes("ww", "en");

    // A nested directory — empty, or holding only documentation — is not a Page Hub: it publishes no route.
    expect(routes.some((route) => route.startsWith("guide"))).toBe(false);
    // A name that is not a well-formed page slug publishes nothing (this is also why documentation is
    // intrinsically non-routable: `README` is not a slug, at ANY level of the tree).
    expect(routes.some((route) => /readme|how-to|not-a-page/i.test(route))).toBe(false);
    // A configured Site with nothing in it publishes no route at all.
    expect(await pages.listRoutes("ca", "en")).toEqual([]);
    // A page in a folder that is not a configured locale of this Site is not published.
    expect(await pages.resolve("ww", "about", "xx")).toBeNull();
  });

  it("never publishes documentation: README/HOW-TO are not routes in any configured coordinate", async () => {
    const { roots } = buildTree();
    const pages = createPageSources({ sites: SITES, roots });

    // The PUBLICATION contract, which is what a sitemap and a link inventory are built from. It is decided
    // by the slug rule, so it holds on every filesystem — including the case-insensitive one a developer
    // runs locally, where a PATH LOOKUP for the slug `readme` can still find an uppercase `README.md`
    // (production serves a case-sensitive filesystem, and no special-case filter is added for it here:
    // the generic rule is the protection, exactly as §21 of the milestone requires).
    for (const [site, locale] of [
      ["ww", "en"],
      ["ww", "de"],
      ["ca", "en"],
    ] as const) {
      const routes = await pages.listRoutes(site, locale);
      expect(
        routes.some((route) => /readme|how-to/i.test(route)),
        `${site}/${locale}`,
      ).toBe(false);
    }
  });

  it("keeps JSON over Markdown for one route inside one Spoke", async () => {
    const { roots } = buildTree();
    const pages = createPageSources({ sites: SITES, roots });

    const services = await pages.resolve("ww", "services", "en");
    expect(services?.kind).toBe("json");
    expect(services?.title).toBe("Services (JSON)");
    // ONE route either way: the Markdown page for the same route is not a second route.
    expect((await pages.listRoutes("ww", "en")).filter((route) => route === "services")).toHaveLength(1);
  });

  it("resolves the Home Page Hub where a representation exists, and invents none where it does not", async () => {
    const { roots } = buildTree();
    const pages = createPageSources({ sites: SITES, roots });

    expect((await pages.resolve("ww", HOME_CONTENT_SLUG, "en"))?.title).toBe("Home");
    // The empty locale invents nothing: the SITE's own fallback answers with its DEFAULT locale's
    // representation and says so — there is no German page on disk and none is fabricated.
    const throughFallback = await pages.resolve("ww", HOME_CONTENT_SLUG, "de");
    expect(throughFallback?.locale).toBe("en");
    expect(throughFallback?.fallback).toBe(true);
  });
});
