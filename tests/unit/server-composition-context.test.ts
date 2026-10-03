import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it } from "vitest";

import {
  layoutMetadataForContext,
  pageForContext,
  pageMetadataForContext,
  spokeServerComposition,
  staticParamsForContext,
} from "@/app/[...segments]/server-composition";
import {
  installationRuntimeIndex,
  runtimeContextForSpoke,
  type SpokeRuntimeContext,
} from "@/config/installation-runtime";

/**
 * THE SERVER RENDER GRAPH IS CONTEXT-BOUND — TWO SPOKES, ONE PROCESS (FOUNDATION-MULTISITE-M13)
 * ==============================================================================================
 *
 * The page route and the root layout used to derive their Spoke-specific facts from module-global state
 * (the compatibility `siteConfig`, `getDictionary`, the compatibility asset resolver). They now hand ONE
 * explicit `SpokeRuntimeContext` to a shared server composition, and this suite is the end-to-end proof of
 * that: TWO disposable Installations share the SAME logical coordinates (`ww` / `en` / About) while
 * differing in configuration, dictionary wording, page text and canonical origin, and the SAME sequence the
 * browser test will run — A, B, A, B — must give `A1 == A2`, `B1 == B2` and `A != B` for every deliberately
 * distinct authored value. No mutable global is reset between calls: the composition IS the scope.
 *
 * Nothing here reaches the running deployment: the contexts are resolved through the accepted runtime
 * authority (`installationRuntimeIndex` + `runtimeContextForSpoke`) on disposable trees.
 */

const trees: string[] = [];

afterAll(() => {
  for (const tree of trees) rmSync(tree, { recursive: true, force: true });
});

function tempTree(prefix: string): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  trees.push(root);
  return root;
}

function write(file: string, contents: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
}

/** The accepted synthetic fixture tree: cloned SHAPES keep the fixture schema-valid. */
const FIXTURES = path.join(process.cwd(), "tests", "fixtures", "synthetic-deployment");

interface SpokeFixture {
  readonly name: string;
  readonly url: string;
  readonly tagline: string;
  readonly marker: string;
  readonly aboutTitle: string;
  readonly aboutBody: string;
}

/** One disposable Installation declaring exactly ONE Spoke, with its own config, words and page. */
function installation(fixture: SpokeFixture): string {
  const root = tempTree("m13-spoke-");
  const spokeRoot = path.join(root, "spokes", "foundation");

  write(
    path.join(root, "spokes.json"),
    `${JSON.stringify({ spokes: [{ id: "foundation", root: "spokes/foundation" }] }, null, 2)}\n`,
  );

  const config = JSON.parse(readFileSync(path.join(FIXTURES, "site.config.json"), "utf8"));
  config.site = {
    ...config.site,
    url: fixture.url,
    name: fixture.name,
    tagline: fixture.tagline,
    description: `${fixture.name} description`,
  };
  write(path.join(spokeRoot, "site.config.json"), `${JSON.stringify(config, null, 2)}\n`);

  const dictionary = JSON.parse(
    readFileSync(path.join(FIXTURES, "config", "i18n", "en.json"), "utf8"),
  );
  dictionary.home = { ...dictionary.home, tagline: fixture.marker };
  write(
    path.join(spokeRoot, "config", "i18n", "en.json"),
    `${JSON.stringify(dictionary, null, 2)}\n`,
  );
  // The fixture configuration declares `de` too, so its dictionary must exist (a declared locale without a
  // file is a loud registry failure — exactly as it is for any deployment).
  write(
    path.join(spokeRoot, "config", "i18n", "de.json"),
    readFileSync(path.join(FIXTURES, "config", "i18n", "de.json"), "utf8"),
  );

  write(
    path.join(spokeRoot, "content", "pages", "markdown", "ww", "en", "about.md"),
    `# ${fixture.aboutTitle}\n\n${fixture.aboutBody}\n`,
  );

  return root;
}

/** The ONE Spoke of a fixture Installation, through the accepted runtime authority. */
function contextOf(installationRoot: string): SpokeRuntimeContext {
  const context = runtimeContextForSpoke(installationRuntimeIndex(installationRoot), "foundation");
  if (context === null) throw new Error("the fixture Installation must describe its Spoke");
  return context;
}

const ALPHA: SpokeFixture = {
  name: "Alpha Spoke",
  url: "https://alpha.example",
  tagline: "Alpha tagline",
  marker: "ALPHA_WORDING",
  aboutTitle: "Alpha About",
  aboutBody: "Alpha body copy.",
};

const BETA: SpokeFixture = {
  name: "Beta Spoke",
  url: "https://beta.example",
  tagline: "Beta tagline",
  marker: "BETA_WORDING",
  aboutTitle: "Beta About",
  aboutBody: "Beta body copy.",
};

/** EVERY server answer this milestone must keep isolated, as one comparable snapshot. */
async function snapshot(composition: ReturnType<typeof spokeServerComposition>) {
  const about = await pageForContext(composition, ["ww", "en", "about"]);
  const home = await pageForContext(composition, ["ww", "en"]);
  const metadata = await pageMetadataForContext(composition, ["ww", "en", "about"]);
  const layoutMetadata = await layoutMetadataForContext(composition, ["ww", "en", "about"]);
  const params = await staticParamsForContext(composition);

  return {
    siteName: composition.siteConfig.name,
    canonicalHostname: composition.context.canonicalHostname,
    dictionaryTagline: composition.dictionaries.get("en").home.tagline,
    content: renderToStaticMarkup(about as ReactElement),
    home: renderToStaticMarkup(home as ReactElement),
    title: metadata.title,
    description: metadata.description,
    canonical: metadata.alternates?.canonical,
    ogSiteName: metadata.openGraph?.siteName,
    ogUrl: metadata.openGraph?.url,
    metadataBase: String(layoutMetadata.metadataBase),
    staticParams: params.map((entry) => entry.segments.join("/")).sort(),
    assetNamespaces: composition.assets.namespaces.map((namespace) => namespace.urlBase),
    resourceRoot: composition.context.resources.markdownPagesRoot,
  };
}

describe("M13 — one process composes TWO Spokes through the shared server renderer", () => {
  const compositionA = spokeServerComposition(contextOf(installation(ALPHA)));
  const compositionB = spokeServerComposition(contextOf(installation(BETA)));

  it("keeps A/B/A/B stable per context and distinct between them, with NO global reset", async () => {
    const a1 = await snapshot(compositionA);
    const b1 = await snapshot(compositionB);
    const a2 = await snapshot(compositionA);
    const b2 = await snapshot(compositionB);

    // Interleaved A/B/A/B: nothing about composing B may disturb A (or vice versa).
    expect(a1).toEqual(a2);
    expect(b1).toEqual(b2);
    expect(a1).not.toEqual(b1);
  });

  it("isolates the SiteConfig identity and the canonical origin", async () => {
    const a = await snapshot(compositionA);
    const b = await snapshot(compositionB);

    expect(a.siteName).toBe(ALPHA.name);
    expect(b.siteName).toBe(BETA.name);
    expect(a.canonicalHostname).toBe("alpha.example");
    expect(b.canonicalHostname).toBe("beta.example");
    expect(a.metadataBase).toBe("https://alpha.example/");
    expect(b.metadataBase).toBe("https://beta.example/");
    expect(a.canonical).toContain("https://alpha.example");
    expect(b.canonical).toContain("https://beta.example");
    expect(a.ogUrl).not.toBe(b.ogUrl);
    expect(a.ogSiteName).toBe(ALPHA.name);
    expect(b.ogSiteName).toBe(BETA.name);
  });

  it("isolates the rendered content and the dictionary wording", async () => {
    const a = await snapshot(compositionA);
    const b = await snapshot(compositionB);

    expect(a.content).toContain("Alpha About");
    expect(a.content).toContain("Alpha body copy.");
    expect(b.content).toContain("Beta About");
    expect(b.content).toContain("Beta body copy.");
    // No cross-Spoke leakage in either direction — not in a page, not in a title, not in a fallback.
    expect(a.content).not.toContain("Beta");
    expect(b.content).not.toContain("Alpha");
    expect(a.title).toBe("Alpha About");
    expect(b.title).toBe("Beta About");
    expect(a.dictionaryTagline).toBe(ALPHA.marker);
    expect(b.dictionaryTagline).toBe(BETA.marker);
    // …and the starter home page speaks this Spoke's own locale words and name.
    expect(a.home).toContain(ALPHA.marker);
    expect(b.home).toContain(BETA.marker);
    expect(a.home).toContain(ALPHA.name);
    expect(b.home).toContain(BETA.name);
  });

  it("isolates the content roots and the asset-namespace projection", async () => {
    const a = await snapshot(compositionA);
    const b = await snapshot(compositionB);

    // Each context reads ITS OWN authored tree …
    expect(a.resourceRoot).not.toBe(b.resourceRoot);
    expect(a.resourceRoot).toContain(path.join("spokes", "foundation"));
    // … and resolves artwork from its OWN declared namespaces: the URL bases follow the Spoke's runtime
    // SEGMENT (the fixtures deliberately declare the same identity, so the bases agree), and the resolver's
    // snapshot IS that context's own list — never a module-global namespace set.
    expect(a.assetNamespaces[0]).toBe("/assets");
    expect(a.assetNamespaces[1]).toBe("/spokes/foundation/assets");
    expect(compositionA.assets.namespaces).toEqual(compositionA.context.runtimeAssetNamespaces);
    expect(compositionB.assets.namespaces).toEqual(compositionB.context.runtimeAssetNamespaces);
  });

  it("keeps the discovered static inventory per context (no shared route table)", async () => {
    const a = await snapshot(compositionA);
    const b = await snapshot(compositionB);

    expect(a.staticParams).toContain("ww/en");
    expect(a.staticParams).toContain("ww/en/about");
    expect(a.staticParams).toEqual(b.staticParams);
  });
});
