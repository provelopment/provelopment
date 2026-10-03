import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  authoringLocaleDirectoriesOf,
  authoringPageRoutesFor,
  authoringSiteDirectoriesOf,
  authoringSourceDiscoveryFor,
  readAuthoringPageFile,
} from "@/adapters/content/authoring-source-discovery";
import { createPageSources } from "@/adapters/content/page-sources";
import { siteConfig } from "@/config";
import { deploymentPaths } from "@/config/deployment-root";
import { getDictionary } from "@/config/i18n";
import { parseSiteConfig } from "@/config/loader";
import { loadSpokeDictionaryRegistry } from "@/config/spoke-dictionaries";
import { spokeResourcePaths, type SpokeResourcePaths } from "@/config/spoke-resources";
import type { SiteConfig } from "@/config/site-config";
import { resolveSites } from "@/core/site";
import { IMPLICIT_SPOKE_ID } from "@/core/spoke";

/**
 * ROOT-PARAMETERIZED CONTENT + DICTIONARY CAPABILITY (FOUNDATION-MULTISITE-S3E1B)
 * =============================================================================
 *
 * Proves the ONE capability this slice adds: the SAME content and dictionary rules, asked of a
 * SUPPLIED pair of roots. Four claims have to hold together, and each has its own block below.
 *
 *  1. LEGACY EQUALITY — for the ACTIVE deployment, the parameterized capability answers exactly what
 *     the legacy entry points answer: the same site directories, locale directories, routes, raw
 *     file text and resolved pages, over the deployment's OWN resolved sites and locales. The
 *     comparison is made against whatever deployment this run selected, never against a fixture's
 *     expectations, so it stays meaningful in the generic project and beside a capsule alike.
 *  2. TWO SPOKES, THE SAME COORDINATES — site `ww`, locale `en`, route `about` in two synthetic
 *     Spokes are two independent pages. A route that exists in both stays two routes; a route that
 *     exists in one is absent from the other; nothing is merged, deduplicated or leaked.
 *  3. ONE DICTIONARY REGISTRY PER SPOKE — the ONE loader, composed from a Spoke's own roots and that
 *     Spoke's own resolved configuration: the same shared dictionary, the same site+locale override,
 *     and the same loud failure for a declared locale without a dictionary, in two independent
 *     populations.
 *  4. STILL UNWIRED — no module under `src/**` reaches either new entry point except the composition
 *     seam itself, so the running application and the build consume exactly the bindings they
 *     consumed before this slice.
 *
 * The two synthetic Spokes live under OS temp and are removed afterwards. The selected deployment,
 * the canonical deployment and the committed fixtures are only ever READ.
 */

/** A disposable Installation root holding this suite's two synthetic Spokes. */
const INSTALLATION = mkdtempSync(path.join(tmpdir(), "foundation-s3e1b-")).split(path.sep).join("/");

/** The AUTHORED RESOURCE PATHS of the two Spokes — S3E1A's model, consumed as a caller would. */
const SPOKE_A: SpokeResourcePaths = spokeResourcePaths({
  id: "spoke-a",
  root: `${INSTALLATION}/spokes/a`,
});
const SPOKE_B: SpokeResourcePaths = spokeResourcePaths({
  id: "spoke-b",
  root: `${INSTALLATION}/spokes/b`,
});

afterAll(() => {
  rmSync(INSTALLATION, { recursive: true, force: true });
});

/** Write one authored file, creating the directories it lives in. */
function writeTree(file: string, contents: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
}


/**
 * One authored Markdown page in ONE Spoke's own tree: site `ww`, locale `en`, the route given.
 *
 * The site code, the locale and the route are the SAME in both Spokes below — that is the point: a
 * route coordinate is an authored identity, not a globally unique key.
 */
function writeMarkdownPage(roots: SpokeResourcePaths, route: string, title: string): void {
  writeTree(
    path.join(roots.markdownPagesRoot, "ww", "en", `${route}.md`),
    `---\ntitle: ${title}\ndescription: A synthetic page for the S3E1B proof.\n---\n\n# ${title}\n\nBody of ${title}.\n`,
  );
}

/** One authored declarative page in ONE Spoke's own tree, site `ww`, locale `en`. */
function writeJsonPage(roots: SpokeResourcePaths, route: string, title: string): void {
  const document = {
    schemaVersion: 1,
    title,
    sections: [{ type: "prose", heading: title, body: `Body of ${title}.` }],
  };
  writeTree(
    path.join(roots.jsonPagesRoot, "ww", "en", `${route}.json`),
    `${JSON.stringify(document, null, 2)}\n`,
  );
}

/**
 * One COMPLETE, schema-valid dictionary, carrying this run's own shared wording with exactly ONE
 * leaf changed — so a missing or renamed key can never pass this suite as an "independent value".
 */
function writeDictionary(roots: SpokeResourcePaths, marker: string): void {
  const base = getDictionary(siteConfig.defaultLocale);
  const marked = { ...base, home: { ...base.home, tagline: marker } };
  writeTree(path.join(roots.dictionaryRoot, "en.json"), `${JSON.stringify(marked, null, 2)}\n`);
}

/** The OPTIONAL site+locale override of ONE Spoke — one leaf, exactly as an author writes it. */
function writeDictionaryOverride(
  roots: SpokeResourcePaths,
  site: string,
  locale: string,
  marker: string,
): void {
  const override = { home: { tagline: marker } };
  writeTree(
    path.join(roots.dictionaryOverrideRoot, site, `${locale}.json`),
    `${JSON.stringify(override, null, 2)}\n`,
  );
}

/** The RAW configuration a synthetic Spoke authors, before the EXISTING loader resolves it (S3D1A). */
const RAW_SPOKE_CONFIG = {
  site: {
    url: "https://spoke.example.com",
    name: "Synthetic Spoke",
    tagline: "A Spoke used to prove root-parameterized resource consumption",
    description: "A synthetic Spoke for the S3E1B proof.",
  },
  i18n: { defaultLocale: "en", locales: [{ code: "en", label: "English" }] },
  contact: { email: "hello@example.com" },
  socialLinks: [{ platform: "github", label: "GitHub", href: "https://github.com/example" }],
  navigation: [{ label: "Home", href: "/" }],
  sites: [{ code: "ww", label: "Global" }],
} as const;

/**
 * The RESOLVED configuration of a synthetic Spoke: one site `ww`, one locale `en`. Composed through
 * the EXISTING loader, exactly as a Spoke's own `site.config.json` would be resolved (S3D1A) — the
 * capabilities below never parse a configuration themselves.
 */
function spokeConfig(): SiteConfig {
  return parseSiteConfig(RAW_SPOKE_CONFIG);
}

/** The same Spoke, declaring MORE locales than it ships dictionaries for. */
function spokeConfigWithLocales(codes: readonly string[]): SiteConfig {
  return parseSiteConfig({
    ...RAW_SPOKE_CONFIG,
    i18n: { defaultLocale: "en", locales: codes.map((code) => ({ code, label: code })) },
  });
}

const SPOKE_SITES = resolveSites({
  input: [{ code: "ww" }],
  defaultLocale: "en",
  locales: ["en"],
}).sites;

// ── Spoke A: its own `about`, its own nested route, and BOTH modes at one route ────────────────
writeMarkdownPage(SPOKE_A, "about", "About A");
writeMarkdownPage(SPOKE_A, "offerings/website-design", "Nested A");
writeMarkdownPage(SPOKE_A, "precedence", "Markdown A");
writeJsonPage(SPOKE_A, "precedence", "JSON A");
writeDictionary(SPOKE_A, "A shared");
writeDictionaryOverride(SPOKE_A, "ww", "en", "A override");

// ── Spoke B: the SAME coordinates, different content — and one route only it holds ─────────────
writeMarkdownPage(SPOKE_B, "about", "About B");
writeMarkdownPage(SPOKE_B, "only-in-b", "Only B");
writeMarkdownPage(SPOKE_B, "precedence", "Markdown B");
writeDictionary(SPOKE_B, "B shared");
writeDictionaryOverride(SPOKE_B, "ww", "en", "B override");

// An authored but EMPTY directory in B's declarative tree: prepared, and still publishing nothing.
mkdirSync(path.join(SPOKE_B.jsonPagesRoot, "ww", "en", "hold"), { recursive: true });

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 1 — LEGACY EQUALITY: the supplied-root capability answers what today's entry points answer
// ────────────────────────────────────────────────────────────────────────────────────────────────

/** The ACTIVE deployment's own authored roots — what the legacy binding reads, and nothing else. */
const ACTIVE_ROOTS = {
  markdownPagesRoot: deploymentPaths().markdownPagesRoot,
  jsonPagesRoot: deploymentPaths().jsonPagesRoot,
};

const activeDiscovery = authoringSourceDiscoveryFor(ACTIVE_ROOTS);

describe("legacy content equality — the supplied-root capability answers today's answers", () => {
  it("walks the ACTIVE deployment's own trees: same sites, same locales, same routes", async () => {
    let authoredRoutes = 0;

    for (const mode of ["markdown", "json"] as const) {
      const sites = await authoringSiteDirectoriesOf(mode);
      expect(await activeDiscovery.siteDirectoriesOf(mode)).toEqual(sites);

      for (const site of sites) {
        const locales = await authoringLocaleDirectoriesOf(mode, site);
        expect(await activeDiscovery.localeDirectoriesOf(mode, site)).toEqual(locales);

        for (const locale of locales) {
          const routes = await authoringPageRoutesFor(mode, site, locale);
          expect(await activeDiscovery.pageRoutesFor(mode, site, locale)).toEqual(routes);
          authoredRoutes += routes.length;
        }
      }
    }

    // A comparison of two empty inventories would prove nothing: the selected deployment authors pages.
    expect(authoredRoutes).toBeGreaterThan(0);
  });

  it("reads the ACTIVE deployment's own files: same text, same availability, same refusals", async () => {
    let readableFiles = 0;

    for (const mode of ["markdown", "json"] as const) {
      for (const site of await authoringSiteDirectoriesOf(mode)) {
        for (const locale of await authoringLocaleDirectoriesOf(mode, site)) {
          for (const route of await authoringPageRoutesFor(mode, site, locale)) {
            const legacy = await readAuthoringPageFile(mode, site, locale, route);
            expect(await activeDiscovery.readPageFile(mode, site, locale, route)).toBe(legacy);
            expect(await activeDiscovery.hasSource(mode, site, locale, route)).toBe(legacy !== null);
            if (legacy !== null) readableFiles += 1;
          }
        }
      }
    }

    expect(readableFiles).toBeGreaterThan(0);

    // A malformed site, locale or route — including a traversal attempt — is refused by BOTH, before
    // any path is built.
    const refusals = [
      ["../escape", "en", "about"],
      ["ww", "../escape", "about"],
      ["ww", "en", "../escape"],
      ["WW", "en", "about"],
      ["ww", "en", ""],
    ] as const;

    for (const [site, locale, route] of refusals) {
      expect(await activeDiscovery.readPageFile("markdown", site, locale, route)).toBeNull();
      expect(await readAuthoringPageFile("markdown", site, locale, route)).toBeNull();
    }
  });

  it("resolves the ACTIVE deployment's pages identically through the composition", async () => {
    const legacy = createPageSources({ sites: siteConfig.sites });
    const supplied = createPageSources({ sites: siteConfig.sites, roots: ACTIVE_ROOTS });

    for (const site of siteConfig.sites) {
      for (const locale of site.locales) {
        const routes = await legacy.listRoutes(site.code, locale.path);
        expect(await supplied.listRoutes(site.code, locale.path)).toEqual(routes);

        for (const route of routes) {
          expect(await supplied.resolve(site.code, route, locale.path)).toEqual(
            await legacy.resolve(site.code, route, locale.path),
          );
        }
      }
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 2 — TWO SPOKES, THE SAME COORDINATES: independent authored populations, no leakage
// ────────────────────────────────────────────────────────────────────────────────────────────────

const sourcesA = createPageSources({ sites: SPOKE_SITES, roots: SPOKE_A });
const sourcesB = createPageSources({ sites: SPOKE_SITES, roots: SPOKE_B });

describe("two Spokes hold the same site, locale and route — independently", () => {
  it("is NOT a cross-Spoke uniqueness rule: /about answers twice, with different pages", async () => {
    const aboutA = await sourcesA.resolve("ww", "about", "en");
    const aboutB = await sourcesB.resolve("ww", "about", "en");

    expect(aboutA).toMatchObject({ title: "About A", body: expect.stringContaining("Body of About A.") });
    expect(aboutB).toMatchObject({ title: "About B", body: expect.stringContaining("Body of About B.") });
    expect(aboutA).not.toEqual(aboutB);
  });

  it("lists each Spoke's OWN routes — nested ones included — and never the other's", async () => {
    expect(await sourcesA.listRoutes("ww", "en")).toEqual([
      "about",
      "offerings/website-design",
      "precedence",
    ]);
    expect(await sourcesB.listRoutes("ww", "en")).toEqual(["about", "only-in-b", "precedence"]);
  });

  it("keeps JSON-over-Markdown precedence INSIDE each tree", async () => {
    // A authors both modes at one route; B authors only Markdown there. Neither answer travels.
    expect(await sourcesA.resolve("ww", "precedence", "en")).toMatchObject({
      kind: "json",
      title: "JSON A",
    });
    expect(await sourcesB.resolve("ww", "precedence", "en")).toMatchObject({
      kind: "markdown",
      title: "Markdown B",
    });
  });

  it("answers nothing for a route, site or locale that THIS tree does not hold", async () => {
    expect(await sourcesA.resolve("ww", "only-in-b", "en")).toBeNull();
    expect(await sourcesB.resolve("ww", "only-in-a", "en")).toBeNull();
    // A site nobody configured here, a locale this Spoke's site does not serve, and B's empty folder.
    expect(await sourcesA.resolve("ca", "about", "en")).toBeNull();
    expect(await sourcesB.resolve("ww", "about", "de")).toBeNull();
    expect(await sourcesA.resolve("ww", "hold", "en")).toBeNull();
  });

  it("treats an authored but EMPTY directory as inert, in the tree that holds it", async () => {
    // B authored `content/pages/json/ww/en/hold/` and put nothing in it: a directory is not a page.
    expect(await sourcesB.listRoutes("ww", "en")).not.toContain("hold");
    expect(await sourcesB.resolve("ww", "hold", "en")).toBeNull();
    // The site directory still exists in B's own declarative tree — discovery reports the tree, not
    // a publication.
    expect(await authoringSourceDiscoveryFor(SPOKE_B).siteDirectoriesOf("json")).toEqual(["ww"]);
  });

  it("remembers nothing between calls: interleaved questions never answer for the other tree", async () => {
    for (let pass = 0; pass < 3; pass += 1) {
      expect((await sourcesA.resolve("ww", "about", "en"))?.title).toBe("About A");
      expect((await sourcesB.resolve("ww", "about", "en"))?.title).toBe("About B");
      expect(await sourcesA.listRoutes("ww", "en")).not.toContain("only-in-b");
      expect(await sourcesB.listRoutes("ww", "en")).not.toContain("offerings/website-design");
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 3 — ONE DICTIONARY REGISTRY PER SPOKE: the ONE loader, rooted in each Spoke
// ────────────────────────────────────────────────────────────────────────────────────────────────

/** Two Spokes, each with its OWN resolved configuration for the SAME site `ww` and locale `en`. */
const configA = spokeConfig();
const configB = spokeConfig();

describe("one dictionary registry per Spoke", () => {
  it("composes the ONE loader from a Spoke's own roots and its own resolved configuration", () => {
    const registryA = loadSpokeDictionaryRegistry(SPOKE_A, configA);
    const registryB = loadSpokeDictionaryRegistry(SPOKE_B, configB);

    // The shared dictionary and the site+locale override, each read from THIS Spoke's own roots.
    expect(registryA.get("en").home.tagline).toBe("A shared");
    expect(registryA.get("en", "ww").home.tagline).toBe("A override");
    expect(registryB.get("en").home.tagline).toBe("B shared");
    expect(registryB.get("en", "ww").home.tagline).toBe("B override");
  });

  it("keeps the same dictionary coordinates independent in BOTH directions", () => {
    const registryA = loadSpokeDictionaryRegistry(SPOKE_A, configA);
    const registryB = loadSpokeDictionaryRegistry(SPOKE_B, configB);

    // The SAME coordinates: one shared dictionary per locale, one override per (site, locale).
    expect([...registryA.all().keys()]).toEqual(["en"]);
    expect([...registryB.all().keys()]).toEqual(["en"]);
    expect([...registryA.overrides().keys()]).toEqual(["ww/en"]);
    expect([...registryB.overrides().keys()]).toEqual(["ww/en"]);

    const seenByB = `${JSON.stringify(registryB.all())}${JSON.stringify(registryB.overrides())}`;
    const seenByA = `${JSON.stringify(registryA.all())}${JSON.stringify(registryA.overrides())}`;
    expect(seenByB).not.toContain("A shared");
    expect(seenByB).not.toContain("A override");
    expect(seenByA).not.toContain("B shared");
    expect(seenByA).not.toContain("B override");
  });

  it("keeps a declared locale without a dictionary the SAME loud failure, per Spoke", () => {
    const twoLocales = spokeConfigWithLocales(["en", "fr"]);

    expect(() => loadSpokeDictionaryRegistry(SPOKE_A, twoLocales)).toThrow(/no dictionary file: fr/);
    expect(() => loadSpokeDictionaryRegistry(SPOKE_B, twoLocales)).toThrow(/no dictionary file: fr/);
  });

  it("answers exactly what the ACTIVE runtime binding answers, for every site and locale", () => {
    // The implicit Spoke IS the ACTIVE deployment (S3E1A), so this compares the runtime's own
    // registry — built at module load from the deployment authority — with the per-Spoke helper.
    const implicitSpoke = spokeResourcePaths({ id: IMPLICIT_SPOKE_ID, root: deploymentPaths().root });
    const registry = loadSpokeDictionaryRegistry(implicitSpoke, siteConfig);

    expect(registry.all().size).toBeGreaterThan(0);
    expect(registry.get(siteConfig.defaultLocale)).toEqual(getDictionary(siteConfig.defaultLocale));

    for (const locale of siteConfig.locales) {
      expect(registry.get(locale.code)).toEqual(getDictionary(locale.code));
      for (const site of siteConfig.sites) {
        expect(registry.get(locale.code, site.code)).toEqual(getDictionary(locale.code, site.code));
      }
    }

    // A locale nobody declared follows the SAME fallback as the runtime binding.
    expect(registry.get("zz")).toEqual(getDictionary("zz"));
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 4 — STILL UNWIRED: no production module reaches the new capability
// ────────────────────────────────────────────────────────────────────────────────────────────────

/** Every executable source file under `src/**` — where a production importer would appear. */
function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (/\.(ts|tsx|mjs)$/.test(full)) found.push(full);
  }
  return found;
}

const relative = (file: string): string =>
  path.relative(process.cwd(), file).split(path.sep).join("/");

describe("still unwired — the per-Spoke capability has no runtime or build consumer", () => {
  it("names every module that mentions the new entry points: the two definitions and the seam", () => {
    const mentioning = sourceFiles(path.join(process.cwd(), "src"))
      .filter((file) =>
        /authoringSourceDiscoveryFor|loadSpokeDictionaryRegistry/.test(readFileSync(file, "utf8")),
      )
      .map(relative)
      .sort();

    // `page-sources` is the ONE consumer, and only on the branch where a caller SUPPLIES roots: with no
    // `roots` — which is what every current runtime and build call site does — the legacy entry points
    // answer exactly as before. `src/app/**` and `src/proxy.ts` reach neither new entry point.
    expect(mentioning).toEqual([
      "src/adapters/content/authoring-source-discovery.ts",
      "src/adapters/content/page-sources.ts",
      "src/config/spoke-dictionaries.ts",
    ]);
  });
});
