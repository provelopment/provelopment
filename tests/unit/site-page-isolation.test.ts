import { mkdirSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPageSources } from "@/adapters/content/page-sources";
import { resolveSites, sitePath } from "@/core/site";

/**
 * CROSS-SITE ISOLATION AND SAME-SITE PRECEDENCE (FOUNDATION-S1E3A)
 * ==============================================================
 *
 * A site owns an INDEPENDENT page tree. This suite plants deliberately different bodies at the
 * SAME route name in three site trees and proves, on the real composition:
 *
 *   · each site serves its OWN body, at its own URL;
 *   · a page missing from one site never resolves from another (no cross-site fallback, even for a
 *     site that opted into cross-LOCALE fallback);
 *   · within ONE site, JSON still beats Markdown and an exact locale still beats that site's own
 *     default-locale fallback;
 *   · an explicit locale variant (`fr-fr`) is a distinct page from the simple key (`fr`);
 *   · README files, empty folders and traversal attempts stay inert, per site.
 *
 * The fixture sites are recognized-but-synthetic country codes (`aq`, `tf`, `bv`), so no real
 * authoring tree can collide with a run, and everything created here is removed afterwards.
 */
const root = process.cwd();

const md = (...parts: string[]): string =>
  path.join(root, "content", "pages", "markdown", ...parts);
const json = (...parts: string[]): string => path.join(root, "content", "pages", "json", ...parts);

const AQ = "aq";
const TF = "tf";
const BV = "bv";

const sites = resolveSites({
  input: [
    // Two ordinary independent sites that share the locale key `fr`.
    { code: AQ, locales: ["fr", "fr-fr"], defaultLocale: "fr" },
    { code: TF, locales: ["fr"], defaultLocale: "fr" },
    // …and one site that opted INTO cross-locale fallback — inside its OWN tree only.
    { code: BV, locales: ["fr", "fr-fr"], defaultLocale: "fr", fallback: true },
  ],
  defaultLocale: "fr",
  locales: ["fr", "fr-fr"],
}).sites;

const sources = createPageSources({ sites });

const FILES = [
  md(AQ, "fr", "about.md"),
  md(AQ, "fr-fr", "about.md"),
  md(TF, "fr", "about.md"),
  md(AQ, "fr", "zz-aq-only.md"),
  md(TF, "fr", "zz-tf-only.md"),
  md(AQ, "fr", "zz-both.md"),
  json(AQ, "fr", "zz-both.json"),
  md(BV, "fr", "zz-default-only.md"),
  md(AQ, "fr", "README.md"),
];

const EMPTY_FOLDER = md(AQ, "fr", "zz-empty");

function plant(file: string, contents: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
}

/** Remove a file, then only the directories this suite created while they are empty. */
function removeFile(file: string): void {
  rmSync(file, { force: true });
  const boundary = path.join(root, "content", "pages");
  let directory = path.dirname(file);
  while (directory.startsWith(boundary) && directory !== boundary) {
    try {
      rmdirSync(directory);
    } catch {
      /* not empty, or already gone */
    }
    directory = path.dirname(directory);
  }
}

beforeAll(() => {
  plant(md(AQ, "fr", "about.md"), "# AQ fr\n\nZZ-AQ-FR\n");
  plant(md(AQ, "fr-fr", "about.md"), "# AQ fr-fr\n\nZZ-AQ-FRFR\n");
  plant(md(TF, "fr", "about.md"), "# TF fr\n\nZZ-TF-FR\n");
  plant(md(AQ, "fr", "zz-aq-only.md"), "# Only in AQ\n");
  plant(md(TF, "fr", "zz-tf-only.md"), "# Only in TF\n");
  plant(md(AQ, "fr", "zz-both.md"), "# Markdown version\n\nZZ-MD\n");
  plant(
    json(AQ, "fr", "zz-both.json"),
    `${JSON.stringify(
      { schemaVersion: 1, title: "JSON wins here", sections: [{ type: "prose", body: "ZZ-JSON" }] },
      null,
      2,
    )}\n`,
  );
  plant(md(BV, "fr", "zz-default-only.md"), "# Only in the default locale\n");
  plant(md(AQ, "fr", "README.md"), "# Not a page\n");
  mkdirSync(EMPTY_FOLDER, { recursive: true });
});

afterAll(() => {
  // The empty-folder fixture goes FIRST: while it exists its parent directories are not empty, so
  // the per-file walk below could not prune them.
  rmSync(EMPTY_FOLDER, { recursive: true, force: true });
  for (const file of FILES) removeFile(file);
  // A second pass: the first order can leave a now-empty parent behind.
  for (const file of FILES) removeFile(file);
});

describe("each site serves its OWN page at its OWN URL", () => {
  it("gives the same route name different bodies per site", async () => {
    const antarctic = await sources.resolve(AQ, "about", "fr");
    const southern = await sources.resolve(TF, "about", "fr");

    const antarcticBody = antarctic?.kind === "markdown" ? antarctic.body : "";
    const southernBody = southern?.kind === "markdown" ? southern.body : "";
    expect(antarcticBody).toContain("ZZ-AQ-FR");
    expect(southernBody).toContain("ZZ-TF-FR");
    expect(antarcticBody).not.toBe(southernBody);

    // …and the URLs are the sites' own: no shared address, no borrowed page.
    const aqSite = sites.find((site) => site.code === AQ);
    const tfSite = sites.find((site) => site.code === TF);
    expect(sitePath(aqSite!, "fr", "about")).toBe("/aq/fr/about");
    expect(sitePath(tfSite!, "fr", "about")).toBe("/tf/fr/about");
  });

  it("keeps an explicit locale variant distinct from the simple key", async () => {
    const simple = await sources.resolve(AQ, "about", "fr");
    const explicit = await sources.resolve(AQ, "about", "fr-fr");

    expect(simple).toMatchObject({ kind: "markdown", locale: "fr", routePath: "about" });
    expect(explicit).toMatchObject({ kind: "markdown", locale: "fr-fr", routePath: "about" });
    // Two genuinely different pages of ONE site, not two spellings of one file.
    expect(simple?.kind === "markdown" ? simple.body : "").toContain("ZZ-AQ-FR");
    expect(explicit?.kind === "markdown" ? explicit.body : "").toContain("ZZ-AQ-FRFR");
  });
});

describe("no page ever crosses a site boundary", () => {
  it("returns null for a page that exists only in the OTHER site", async () => {
    expect(await sources.resolve(TF, "zz-aq-only", "fr")).toBeNull();
    expect(await sources.resolve(AQ, "zz-tf-only", "fr")).toBeNull();
  });

  it("does not treat a shared locale key as a fallback into another site", async () => {
    // `bv` enabled cross-LOCALE fallback, but its fallback can only read its OWN tree.
    expect(await sources.resolve(BV, "zz-aq-only", "fr")).toBeNull();
    expect(await sources.resolve(BV, "zz-aq-only", "fr-fr")).toBeNull();
    expect(await sources.resolve(BV, "zz-tf-only", "fr")).toBeNull();
  });

  it("refuses an unknown or malformed site code instead of guessing a tree", async () => {
    expect(await sources.resolve("zz", "about", "fr")).toBeNull();
    expect(await sources.resolve("canada", "about", "fr")).toBeNull();
  });
});

describe("precedence INSIDE one site", () => {
  it("keeps JSON above Markdown for the same site + locale + route", async () => {
    const page = await sources.resolve(AQ, "zz-both", "fr");
    expect(page?.kind).toBe("json");
    if (page?.kind !== "json") throw new Error("expected the JSON document to win");
    expect(JSON.stringify(page.document)).toContain("ZZ-JSON");
    // …and the route is published once, not twice.
    const routes = await sources.listRoutes(AQ, "fr");
    expect(routes.filter((route) => route === "zz-both")).toHaveLength(1);
  });

  it("keeps an exact locale above that site's own default-locale fallback", async () => {
    const page = await sources.resolve(BV, "zz-default-only", "fr-fr");
    expect(page).toMatchObject({ locale: "fr", fallback: true });
  });

  it("never applies a fallback a site did not opt into", async () => {
    // `aq` did not enable fallback, so the same lookup finds nothing…
    expect(await sources.resolve(AQ, "zz-default-only", "fr-fr")).toBeNull();
    // …and neither does a site in which the page simply does not exist.
    expect(await sources.resolve(TF, "zz-default-only", "fr")).toBeNull();
  });
});

describe("inert and refused paths, per site", () => {
  it("publishes nothing for a README or an empty folder", async () => {
    expect(await sources.resolve(AQ, "README", "fr")).toBeNull();
    expect(await sources.resolve(AQ, "zz-empty", "fr")).toBeNull();

    const routes = await sources.listRoutes(AQ, "fr");
    expect(routes).not.toContain("README");
    expect(routes.some((route) => route.includes("zz-empty"))).toBe(false);
  });

  it("refuses traversal in the route path and in the locale", async () => {
    expect(await sources.resolve(AQ, "../escape", "fr")).toBeNull();
    expect(await sources.resolve(AQ, "about/../../escape", "fr")).toBeNull();
    expect(await sources.resolve(AQ, "about", "../fr")).toBeNull();
  });
});
