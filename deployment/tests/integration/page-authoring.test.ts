import { existsSync, mkdirSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  captureProductionStateManifest,
  productionStateDrift,
} from "../../../tests/support/production-state-manifest";
import { selectDisposableDeploymentCopy } from "../../../tests/support/disposable-deployment";

// DEPLOYMENT SCOPE — this test asserts THIS deployment's own configuration, content and assets, so it
// lives in the deployment capsule (`deployment/tests/**`, FOUNDATION-DEPLOYMENT-ISO-B2A) and runs in the
// `deployment` Vitest project, whose setup selects the REAL installed deployment
// (`tests/setup/real-deployment.ts`, ISO-H2).
//
// WHERE IT WRITES (FOUNDATION-DEPLOYMENT-ISO-B3C2B)
// -------------------------------------------------
// The authoring model is proved by PLANTING pages, so this suite needs writable deployment state — and a
// deployment's shipped configuration, dictionaries, pages and artwork are not writable fixture space
// (ISO-C1 showed why: cleanup is best-effort, and residue in a real page tree is damage, not untidiness).
// The suite therefore selects a DISPOSABLE, byte-identical COPY of the deployment the authority chose
// (`tests/support/disposable-deployment.ts` → the `override` layout, ISO-B1/H2) and plants every fixture
// there. The real deployment stays the SUBJECT — it is read for the copy's source and proved unchanged at
// the end of the run — while the only writable thing in the run is a temp copy that is deleted afterwards.

// A page route signals "nothing answers this URL" through `notFound()`. In a node
// test that is a controlled signal, so it is stubbed — which also lets the
// not-found path be asserted directly.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

// The copy must be selected BEFORE anything reads the config surface, and this project's setup file has
// already read it once (it asserted the REAL deployment) — so the app modules are loaded AFTER a module
// reset, which is what makes them describe the copy rather than the instances the setup warmed.
const disposable = selectDisposableDeploymentCopy();
vi.resetModules();

const page = await import("@/app/[...segments]/page");
const PageRoute = page.default;
const { generateMetadata } = page;
// M17 — the discovered PUBLIC route inventory is a DOMAIN capability now, not an App Router static identity:
// the page route generates nothing (the same pathname is rendered per host), and the inventory the sitemap
// publishes is composed from the request-selected Spoke's own configuration.
const publicRouteInventory = async (): Promise<{ segments: string[] }[]> => {
  const { staticParamsForContext, spokeServerComposition } = await import(
    '@/app/[...segments]/server-composition'
  );
  const { currentBuildRuntimeContext } = await import('@/config/installation-runtime');
  return staticParamsForContext(spokeServerComposition(currentBuildRuntimeContext()));
};
const sitemap = (await import("@/app/sitemap")).default;
const { createPageSources } = await import("@/adapters/content/page-sources");
const { siteConfig } = await import("@/config");
const { deploymentPaths } = await import("@/config/deployment-root");
const { HOME_CONTENT_SLUG } = await import("@/core/page-content");
const { resolveSites } = await import("@/core/site");

/**
 * THE POSTCONDITION, TAKEN TWICE (FOUNDATION-DEPLOYMENT-ISO-B3C2B)
 *
 * Once here: the REAL deployment's authored state, before any fixture is planted. Once in `afterAll`:
 * the same state, after everything this suite did. The whole `deployment` project is already bracketed
 * by `tests/setup/production-state-integrity.ts`; this file — the one that plants fixtures — asserts it
 * for ITSELF as well, so the file that used to write into the real page tree now proves, locally, that it
 * cannot: every mutable path it touches is inside the copy.
 */
const shippedBefore = captureProductionStateManifest(disposable.sourceRoot);
/**
 * THE ONE PAGE MODEL, THROUGH THE REAL APPLICATION (FOUNDATION-PAGES-A1/A1E).
 *
 * A1E succeeds only if a REAL file under `content/pages/markdown/<locale>/…`
 * produces a REAL generated page — a static route, its metadata, its sitemap entry —
 * through the normal Foundation application, at ANY depth, without a bespoke route or
 * a second content store. These fixtures prove in particular:
 *
 *   · a NESTED page (`zz-section/website-design.md`) is discovered, statically
 *     generated, served and sitemapped exactly like a top-level one;
 *   · a nested JSON page is ordered above Markdown and stops the build naming the file
 *     (the JSON vocabulary is A2's);
 *   · the document capability an author uses survives routing (a heading fragment on a
 *     NESTED page is reachable);
 *   · a page-shaped file OUTSIDE the two mode roots publishes NOTHING (no route, no
 *     sitemap entry, a 404), and so do an EMPTY locale directory and an UNCONFIGURED
 *     one;
 *   · the locale root still renders the authored home page content-first.
 *
 * Every fixture here is created and removed by THIS suite, inside the DISPOSABLE COPY of the selected
 * deployment it plants them in (see WHERE IT WRITES above); the real deployment's authored reference pages
 * are never opened for writing at all, so a run can neither overwrite nor delete shipped content. Removal
 * is then ASSERTED, not assumed (ISO-C1A1): a run that leaves a fixture file or directory behind FAILS.
 */
/**
 * WHERE THESE FIXTURES GO (FOUNDATION-DEPLOYMENT-ISO-B2A, re-pointed by ISO-B3C2B)
 * ------------------------------------------------------------------------------
 * The deployment's authoring roots are asked of the ONE deployment-root authority
 * (`@/config/deployment-root`, ISO-B1) — never spelled as a repository-root path here — so a run
 * fixture is planted in that deployment's own page tree wherever the deployment is kept, and never in
 * a path this file invented. The authority now answers with the disposable copy this file selected, and
 * the assertion below refuses to continue if it answers with anything else.
 */
const copyPaths = deploymentPaths();
if (path.resolve(copyPaths.root) !== path.resolve(disposable.root)) {
  throw new Error(
    "FOUNDATION-DEPLOYMENT-ISO-B3C2B: this suite plants fixtures into a disposable copy of the selected " +
      `deployment, but the runtime authority answers with "${copyPaths.root}" instead of ` +
      `"${disposable.root}". Refusing to run: a writable authoring experiment must never touch the real ` +
      "deployment.",
  );
}
const PAGES_ROOT = path.dirname(copyPaths.markdownPagesRoot);
const MARKDOWN_PAGES_ROOT = copyPaths.markdownPagesRoot;
const JSON_PAGES_ROOT = copyPaths.jsonPagesRoot;

// S1 - these fixtures live in ONE site tree: the deployment default site.
const SITE = siteConfig.defaultSite.code;
const MARKDOWN_SLUG = "zz-authoring-fixture";
const HOME_FIXTURE = "zz-home-fixture";
// A nested section, so the whole chain (discovery → params → route → sitemap) is
// exercised at a depth greater than one.
const NESTED_SECTION = "zz-section";
const NESTED_SLUG = "website-design";
const NESTED_ROUTE_PATH = `${NESTED_SECTION}/${NESTED_SLUG}`;
const NESTED_JSON_SLUG = "zz-json-only";
// A file planted outside the two mode roots.
const OUTSIDE_ROOT_SLUG = "zz-outside-root-fixture";
const EMPTY_LOCALE_NAME = "zz-empty";
// A well-formed language tag that the site does NOT configure (subtags are 2–8
// characters), holding a page that must therefore never be published.
const UNCONFIGURED_LOCALE_NAME = "zz-unconf";
// Fixture identities a `finally`-cleaned probe needs again as a PATH, so the residue
// postcondition below and the probe itself name the same file (never two literals).
// `gs` is a recognized country code no other suite uses.
const HOME_FIXTURE_SITE = "gs";
const HOME_FIXTURE_LOCALE = "zz-home";
const UNCONFIGURED_LOCALE_PAGE = "a-page.md";
// A declarative document that does NOT satisfy the vocabulary: refused by name.
const INVALID_JSON_SLUG = "zz-invalid";

const MARKDOWN_LOCALE_DIRECTORY = path.join(MARKDOWN_PAGES_ROOT, SITE, "en");
const EMPTY_LOCALE_DIRECTORY = path.join(MARKDOWN_PAGES_ROOT, SITE, EMPTY_LOCALE_NAME);
const UNCONFIGURED_LOCALE_DIRECTORY = path.join(
  MARKDOWN_PAGES_ROOT,
  SITE,
  UNCONFIGURED_LOCALE_NAME,
);

const createdPaths = [
  path.join(MARKDOWN_LOCALE_DIRECTORY, `${MARKDOWN_SLUG}.md`),
  path.join(MARKDOWN_LOCALE_DIRECTORY, NESTED_SECTION, `${NESTED_SLUG}.md`),
  path.join(MARKDOWN_LOCALE_DIRECTORY, NESTED_SECTION, "README.md"),
  path.join(MARKDOWN_LOCALE_DIRECTORY, NESTED_SECTION, `${NESTED_JSON_SLUG}.md`),
  path.join(JSON_PAGES_ROOT, SITE, "en", NESTED_SECTION, `${NESTED_JSON_SLUG}.json`),
  path.join(PAGES_ROOT, SITE, "en", `${OUTSIDE_ROOT_SLUG}.md`),
];

/**
 * EVERY PATH THIS SUITE CREATES, and therefore every path it must leave nothing of
 * (ISO-C1A1). The fixture files first, then the directory chains only these fixtures ever
 * made — including the C1 residue chains `markdown/gs`, `markdown/ww/en/zz-section`,
 * `json/ww/en/zz-section` and `pages/ww`.
 *
 * Directories the DEPLOYMENT itself ships are deliberately NOT listed: `markdown/ww/en`
 * holds `about.md`, so this list is a claim about this suite's residue only. Every entry is
 * derived from the fixture identities above with `path.join`, so no machine-specific path
 * (and no second copy of a fixture name) appears here.
 */
const TEST_OWNED_PATHS = [
  ...createdPaths,
  path.join(MARKDOWN_LOCALE_DIRECTORY, `${HOME_CONTENT_SLUG}.md`),
  path.join(JSON_PAGES_ROOT, SITE, "en", `${INVALID_JSON_SLUG}.json`),
  path.join(UNCONFIGURED_LOCALE_DIRECTORY, UNCONFIGURED_LOCALE_PAGE),
  path.join(
    MARKDOWN_PAGES_ROOT,
    HOME_FIXTURE_SITE,
    HOME_FIXTURE_LOCALE,
    `${HOME_CONTENT_SLUG}.md`,
  ),
  path.join(MARKDOWN_LOCALE_DIRECTORY, NESTED_SECTION),
  path.join(JSON_PAGES_ROOT, SITE, "en", NESTED_SECTION),
  path.join(PAGES_ROOT, SITE),
  path.join(PAGES_ROOT, SITE, "en"),
  EMPTY_LOCALE_DIRECTORY,
  UNCONFIGURED_LOCALE_DIRECTORY,
  path.join(MARKDOWN_PAGES_ROOT, HOME_FIXTURE_SITE),
  path.join(MARKDOWN_PAGES_ROOT, HOME_FIXTURE_SITE, HOME_FIXTURE_LOCALE),
];

function write(file: string, contents: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
}

/** A minimal VALID declarative document, exactly as an author would write one. */
function jsonDocument(title: string, sections: readonly unknown[]): string {
  return `${JSON.stringify({ schemaVersion: 1, title, sections }, null, 2)}\n`;
}

/**
 * Remove a file, then the folders it needed ONLY while they are empty — never a
 * recursive delete and never past the page roots, so a developer's own pages are safe
 * and a run leaves no fixture directory behind.
 *
 * THE COMPARISON IS NORMALISED (ISO-C1). `@/config/deployment-root` publishes its
 * deployment-owned paths with FORWARD slashes (`${root}/content/pages/markdown`) while the
 * fixture paths above are composed with `path.join`, which uses the platform separator. On
 * Windows the raw `startsWith` therefore never matched, the walk pruned NOTHING, and every
 * directory this suite created stayed behind in the real deployment's page tree
 * (`markdown/gs/zz-home`, `markdown/ww/en/zz-section`, `json/ww/en/zz-section`, `ww/en`).
 * Comparing `path.resolve`d paths with an explicit separator boundary is correct on every
 * platform, and cannot match a sibling whose name merely shares a prefix.
 */
function cleanUp(file: string): void {
  rmSync(file, { force: true });
  const rootsDirectory = path.resolve(PAGES_ROOT);
  let directory = path.resolve(path.dirname(file));
  while (directory.startsWith(rootsDirectory + path.sep)) {
    try {
      rmdirSync(directory);
    } catch {
      /* not empty, or already gone: leave it exactly as it is */
    }
    directory = path.dirname(directory);
  }
}

/** The route params for a page URL, from its segments (`/en/a/b` → `["a","b"]`). */
const params = (...segments: string[]) => ({
  params: Promise.resolve({ segments: [SITE, "en", ...segments] }),
});

const urlFor = (routePath: string) => `${siteConfig.url}/${SITE}/en/${routePath}`;

describe("the one page model, through the real application", () => {
  beforeAll(() => {
    // A flat page with hostile fragments in it, and an author's own fragment link.
    write(
      path.join(MARKDOWN_LOCALE_DIRECTORY, `${MARKDOWN_SLUG}.md`),
      [
        "---",
        "title: Authored fixture page",
        "description: A summary written by the author.",
        "---",
        "",
        "Ordinary **Markdown** with a [link](/about).",
        "",
        "| Day | Opens |",
        "| --- | --- |",
        "| Monday | 9:00 |",
        "",
        "See [details](#details-heading) below.",
        "",
        "## Details heading",
        "",
        "The paragraph the author's fragment link must reach.",
        "",
        "<script>window.__authorScript = true;</script>",
        "",
        '<div onclick="window.__authorHandler = true">raw html text</div>',
        "",
      ].join("\n"),
    );
    // A NESTED page: its URL is built from the folder it is authored in.
    write(
      path.join(MARKDOWN_LOCALE_DIRECTORY, NESTED_SECTION, `${NESTED_SLUG}.md`),
      [
        "# Nested fixture page",
        "",
        "See [the section](#nested-details).",
        "",
        "## Nested details",
        "",
        "Served at a nested route, with its own fragment target.",
        "",
      ].join("\n"),
    );
    // Documentation beside nested pages is inert, not content.
    write(path.join(MARKDOWN_LOCALE_DIRECTORY, NESTED_SECTION, "README.md"), "# Not a page\n");
    // A NESTED JSON page: a valid document, so it wins over the Markdown file with the
    // same route and is served by the declarative composer.
    write(
      path.join(JSON_PAGES_ROOT, SITE, "en", NESTED_SECTION, `${NESTED_JSON_SLUG}.json`),
      jsonDocument("Nested JSON fixture page", [
        { type: "prose", body: "The declarative page wins." },
      ]),
    );
    // A Markdown file at the SAME nested route: never served while the JSON wins.
    write(
      path.join(MARKDOWN_LOCALE_DIRECTORY, NESTED_SECTION, `${NESTED_JSON_SLUG}.md`),
      "# Markdown version\n\nThe Markdown file must not be served.\n",
    );
    // A page-shaped file OUTSIDE the two mode roots: never a page source.
    write(
      path.join(PAGES_ROOT, SITE, "en", `${OUTSIDE_ROOT_SLUG}.md`),
      `---\ntitle: Outside-root page\n---\n\nThis must never be published.\n`,
    );
    // An EMPTY locale directory, and a locale the site does not configure.
    mkdirSync(EMPTY_LOCALE_DIRECTORY, { recursive: true });
    write(path.join(UNCONFIGURED_LOCALE_DIRECTORY, UNCONFIGURED_LOCALE_PAGE), "# Not published\n");
  });

  afterAll(() => {
  // The directory fixtures go FIRST: while they exist their parents are not empty, so the
  // per-file walk below could not prune them.
  rmSync(EMPTY_LOCALE_DIRECTORY, { recursive: true, force: true });
  rmSync(UNCONFIGURED_LOCALE_DIRECTORY, { recursive: true, force: true });
  for (const file of createdPaths) cleanUp(file);

  // THE POSTCONDITION (ISO-C1A1). The cleanup above prunes directory by directory and stops
  // at the first parent that is not empty, swallowing the error that says so — which is
  // exactly how C1's path-comparison bug failed SILENTLY: the files went, the directories
  // stayed, every assertion in this file still passed, and residue accumulated in the real
  // deployment's page tree.
  //
  // So the suite now OBSERVES the result instead of trusting the walk: direct existence
  // checks on the paths it owns, deliberately not a rerun of `cleanUp`'s own arithmetic
  // (which would inherit any future bug in it). A leftover fixture file — or the smallest
  // leftover fixture directory — fails this file, whatever the cause, even though cleanup
  // itself reported success.
  const residue = TEST_OWNED_PATHS.filter((candidate) => existsSync(candidate));
  expect(
    residue,
    `fixture residue left in the copy's page tree: ${residue.join(", ")}`,
  ).toEqual([]);

  // AND THE BYTES OF THE REAL DEPLOYMENT (FOUNDATION-DEPLOYMENT-ISO-B3C2B). The copy is disposable, so
  // residue there is untidiness at worst — but the selected deployment is not, and THIS suite is the one
  // that used to write into its page tree. The manifest taken at import time is compared with the same
  // state now: one changed, added or removed authored byte fails this file, whatever caused it.
  const shippedDrift = productionStateDrift(
    shippedBefore,
    captureProductionStateManifest(disposable.sourceRoot),
  );
  expect(
    shippedDrift,
    `this suite mutated the selected deployment's authored state: ${shippedDrift.join(", ")}`,
  ).toEqual([]);

  // The temp copy is the only writable thing this run had; it goes last, so the assertion above is not
  // affected by its removal.
  disposable.cleanup();
});

  it("generates a real static route for a flat AND a nested page", async () => {
    const generated = await publicRouteInventory();
    const paths = generated
      .filter((route) => route.segments[0] === SITE && route.segments[1] === "en")
      .map((route) => route.segments.slice(2).join("/"));

    expect(paths).toContain(MARKDOWN_SLUG);
    expect(paths).toContain(NESTED_ROUTE_PATH);
    // The home page is served at the locale root, never as `/{locale}/home`.
    expect(paths).not.toContain("home");
    // Documentation is inert at every level, and a file outside the mode roots is not
    // a page, so neither can produce a route.
    expect(paths).not.toContain(`${NESTED_SECTION}/README`);
    expect(paths).not.toContain("README");
    expect(paths.some((routePath) => routePath.includes(OUTSIDE_ROOT_SLUG))).toBe(false);
  });

  it("serves the authored title and summary as the page's metadata", async () => {
    const metadata = await generateMetadata(params(MARKDOWN_SLUG));
    expect(metadata.title).toBe("Authored fixture page");
    expect(metadata.description).toBe("A summary written by the author.");

    // A nested page derives its title from its OWN name, never its folder.
    const nested = await generateMetadata(params(NESTED_SECTION, NESTED_SLUG));
    expect(nested.title).toBe("Nested fixture page");
  });

  it("renders the authored Markdown page, with raw HTML inert", async () => {
    const html = renderToStaticMarkup(await PageRoute(params(MARKDOWN_SLUG)));

    expect(html).toContain("Authored fixture page");
    expect(html).toContain("<strong>Markdown</strong>");
    expect(html).toContain('<a href="/about">link</a>');
    // The hostile parts of the fixture are shown as TEXT, never as markup.
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/<[a-zA-Z][^>]*\son[a-z]+\s*=/i);
    expect(html).toContain("window.__authorScript");
  });

  it("renders the authored page's table and its own fragment target", async () => {
    const html = renderToStaticMarkup(await PageRoute(params(MARKDOWN_SLUG)));

    // The documented capability, through the real route: a GFM table…
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Day</th>");
    expect(html).toContain("<td>Monday</td>");
    // …and a heading the author's own `[details](#details-heading)` can reach.
    expect(html).toContain('<h3 id="details-heading">Details heading</h3>');
    expect(html).toContain('<a href="#details-heading">details</a>');
  });

  it("serves a NESTED page through the same route, with its fragment target intact", async () => {
    const html = renderToStaticMarkup(await PageRoute(params(NESTED_SECTION, NESTED_SLUG)));

    expect(html).toContain("Nested fixture page");
    expect(html).toContain("Served at a nested route, with its own fragment target.");
    // Nesting must not weaken the authoring capability: the generated heading id and
    // the author's fragment link work exactly as they do on a top-level page.
    expect(html).toContain('<h3 id="nested-details">Nested details</h3>');
    expect(html).toContain('<a href="#nested-details">the section</a>');
  });

  it("orders JSON above Markdown at a NESTED route, and serves the JSON document", async () => {
    // The JSON fixture is a valid document, so it WINS and renders: the Markdown file at
    // the same nested route is never served.
    const html = renderToStaticMarkup(await PageRoute(params(NESTED_SECTION, NESTED_JSON_SLUG)));
    expect(html).toContain("Nested JSON fixture page");
    expect(html).toContain("The declarative page wins.");
    expect(html).not.toContain("The Markdown file must not be served.");
  });

  it("stops the build when a JSON document is invalid, naming the file and the property", async () => {
    write(
      path.join(JSON_PAGES_ROOT, SITE, "en", `${INVALID_JSON_SLUG}.json`),
      `${JSON.stringify({ schemaVersion: 2, title: "Wrong version", sections: [] }, null, 2)}\n`,
    );
    try {
      await expect(PageRoute(params(INVALID_JSON_SLUG))).rejects.toThrow(/zz-invalid\.json/);
      await expect(PageRoute(params(INVALID_JSON_SLUG))).rejects.toThrow(/schemaVersion/);
    } finally {
      cleanUp(path.join(JSON_PAGES_ROOT, SITE, "en", `${INVALID_JSON_SLUG}.json`));
    }
  });

  it("never publishes a README, in any shape, and never serves an unknown path", async () => {
    const generated = await publicRouteInventory();
    for (const readme of ["README", "readme"]) {
      expect(generated.some((route) => route.segments.slice(2).join("/") === readme), readme).toBe(false);
    }
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.some((url) => /\/readme$/i.test(url))).toBe(false);

    // The three documentation files really are present and really are not pages.
    for (const readme of ["README.md", "pages/markdown/README.md", "pages/json/README.md"]) {
      expect(existsSync(path.join(copyPaths.contentRoot, ...readme.split("/"))), readme).toBe(true);
    }

    // An unknown path, a traversal attempt and the reserved home segment are all 404s.
    await expect(PageRoute(params("does-not-exist"))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(PageRoute(params("README"))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(PageRoute(params(".."))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(PageRoute(params(NESTED_SECTION, "not a slug"))).rejects.toThrow("NEXT_NOT_FOUND");
    // `/{site}/{locale}/home` is not one of them: it is EXCLUDED from the generated
    // route set (asserted above and in the sitemap test), so with `dynamicParams =
    // false` the deployment never serves it — the home page's URL is the locale root.
  });

  it("publishes no phantom page from an empty or unconfigured locale directory", async () => {
    expect(existsSync(EMPTY_LOCALE_DIRECTORY)).toBe(true);
    const generated = await publicRouteInventory();

    for (const route of generated) {
      expect(route.segments[1], JSON.stringify(route)).not.toBe(EMPTY_LOCALE_NAME);
      expect(route.segments[1], JSON.stringify(route)).not.toBe(UNCONFIGURED_LOCALE_NAME);
    }
    expect(generated.some((route) => route.segments.includes("a-page"))).toBe(false);
  });

  it("lists the authored pages in the sitemap, nested paths included, and nothing else", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls).toContain(urlFor(MARKDOWN_SLUG));
    expect(urls).toContain(urlFor(NESTED_ROUTE_PATH));
    // A file outside the mode roots advertises nothing…
    expect(urls.some((url) => url.includes(OUTSIDE_ROOT_SLUG))).toBe(false);
    // …and neither does an unconfigured locale, a prepared-empty one or a README.
    expect(urls.some((url) => url.includes(UNCONFIGURED_LOCALE_NAME))).toBe(false);
    expect(urls.some((url) => url.includes("a-page"))).toBe(false);
    expect(urls.some((url) => url.endsWith("/README"))).toBe(false);
    expect(urls.some((url) => url.endsWith("/home"))).toBe(false);
  });

  it("serves the repository's authored JSON home page at the locale root (content-first, never the starter)", async () => {
    // R1A — the repository now authors its own reference Home page in the JSON mode,
    // so the locale root IS the content-first path here, and the generic starter
    // homepage must not render beside it.
    const html = renderToStaticMarkup(
      await PageRoute({ params: Promise.resolve({ segments: [SITE, "en"] }) }),
    );
    expect(html).not.toContain("home-hero");
    // A section only the DECLARATIVE vocabulary can produce (the starter has none).
    expect(html).toContain("Two ways to create a page");
    // …and the reserved home slug never becomes its own URL.
    const paths = (await publicRouteInventory()).map((route) => route.segments.join("/"));
    expect(paths).not.toContain(`${SITE}/en/${HOME_CONTENT_SLUG}`);
  });

  it("never lets a Markdown file at the home slug displace the JSON home page", async () => {
    // The declared precedence applies at the home slug exactly as everywhere else: a
    // Markdown `home.md` beside the JSON home page is NOT served, and the page it
    // would replace stays intact (this fixture is an extra file, removed below —
    // never a destructive rewrite of the shipped page).
    const fixture = path.join(MARKDOWN_LOCALE_DIRECTORY, `${HOME_CONTENT_SLUG}.md`);
    write(fixture, `# Markdown home fixture\n\nThis must not displace the JSON home page.\n`);
    try {
      const html = renderToStaticMarkup(
        await PageRoute({ params: Promise.resolve({ segments: [SITE, "en"] }) }),
      );
      expect(html).not.toContain("Markdown home fixture");
      expect(html).not.toContain("home-hero");
      expect(html).toContain("Two ways to create a page");
    } finally {
      cleanUp(fixture);
    }
  });

  it("lets a Markdown file author the home page when a site authors no JSON home (composition)", async () => {
    // The Markdown-home capability, proved on the SAME composition the locale root
    // uses, with a fixture site (a recognized country code no other suite uses) whose
    // tree holds only `home.md`: the reserved slug resolves to that Markdown page.
    const file = path.join(
      MARKDOWN_PAGES_ROOT,
      HOME_FIXTURE_SITE,
      HOME_FIXTURE_LOCALE,
      `${HOME_CONTENT_SLUG}.md`,
    );
    write(file, `# ${HOME_FIXTURE}\n\nA safe Markdown home page.\n`);
    try {
      const sites = resolveSites({
        input: [{ code: HOME_FIXTURE_SITE }],
        defaultLocale: "en",
        locales: ["en", HOME_FIXTURE_LOCALE],
      }).sites;
      const pages = createPageSources({ sites });
      const home = await pages.resolve(
        HOME_FIXTURE_SITE,
        HOME_CONTENT_SLUG,
        HOME_FIXTURE_LOCALE,
      );
      expect(home?.kind).toBe("markdown");
      expect(home?.title).toBe(HOME_FIXTURE);
    } finally {
      cleanUp(file);
    }
  });
});
