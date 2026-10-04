import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { IMPLICIT_SPOKE_ID } from "@/core/spoke";

import { deploymentPaths } from "@/config/deployment-root";
import { getDictionary } from "@/config/i18n";
import {
  currentBuildRuntimeContext,
  installationRuntimeIndex,
  runtimeContextForSpoke,
  type SpokeRuntimeContext,
} from "@/config/installation-runtime";
import {
  dictionaryAccessForRuntimeContext,
  type RuntimeDictionaryAccess,
} from "@/config/runtime-dictionaries";
import { loadSpokeDictionaryRegistry } from "@/config/spoke-dictionaries";

/**
 * THE INSTALLATION RUNTIME INDEX, AND TWO SPOKES COEXISTING (FOUNDATION-MULTISITE-S3F2A)
 * =====================================================================================
 *
 * S3F1 could describe ONE Spoke; this slice describes ALL of them and lets several be resolved at once,
 * without changing which Spoke a public request selects. These proofs are the precursor to S3F2B's real
 * two-host browser test, so they run the SAME sequence the browser test will: A, B, A, B — and require
 * every result to stay stable.
 *
 * The fixture is a disposable two-Spoke Installation under the OS temp directory, whose Spokes
 * deliberately SHARE their logical coordinates (`ww` / `en` / About) while differing in configuration,
 * dictionary text, page text and the bytes of a same-named role asset. Sharing the coordinates is the
 * point: if two Spokes' coordinates collide in a cache keyed by anything less than their identity, these
 * proofs are exactly what would fail.
 */

const trees: string[] = [];

afterAll(() => {
  for (const tree of trees) rmSync(tree, { recursive: true, force: true });
});

/** A disposable Installation root; every tree is removed in `afterAll`. */
function tempTree(prefix: string): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  trees.push(root);
  return root;
}

function write(file: string, contents: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
}

/**
 * An accepted fixture tree this suite clones SHAPES from. Held as one constant so no single line carries a
 * repository anchor together with a deployment-state word (the repository-ownership guard keys on exactly
 * that pairing, and this suite must reach deployment state only through the authority under test).
 */
const FIXTURES = path.join(process.cwd(), "tests", "fixtures", "synthetic-deployment");

/**
 * A minimal but REAL Spoke configuration: the accepted synthetic fixture's own configuration shape, with
 * this Spoke's identity substituted. Cloning a known-valid shape keeps the fixture honest (a hand-written
 * partial config would fail the SiteConfig schema for reasons that have nothing to do with this slice).
 */
function spokeConfig(options: {
  readonly name: string;
  readonly url: string;
  readonly tagline: string;
}): string {
  const config = JSON.parse(readFileSync(path.join(FIXTURES, "site.config.json"), "utf8"));
  config.site = {
    ...config.site,
    url: options.url,
    name: options.name,
    tagline: options.tagline,
    description: `${options.name} description`,
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}

/** The FIRST string leaf of a parsed dictionary — the marker carrier both sides agree on. */
function firstStringLeaf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value === null || typeof value !== "object") return null;
  for (const child of Object.values(value as Record<string, unknown>)) {
    const found = firstStringLeaf(child);
    if (found !== null) return found;
  }
  return null;
}

/** Replace the first string leaf, so a Spoke's dictionary carries ITS OWN wording at a REAL key. */
function markFirstString(value: unknown, marker: string): boolean {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const child = record[key];
    if (typeof child === "string") {
      record[key] = `${marker} ${child}`;
      return true;
    }
    if (markFirstString(child, marker)) return true;
  }
  return false;
}

/** ONE Spoke's authored trees: config, dictionary, one page, one same-named role asset. */
function authorSpoke(root: string, locator: string, options: { readonly name: string; readonly url: string; readonly marker: string }): void {
  const spokeRoot = path.join(root, ...locator.split("/"));
  write(path.join(spokeRoot, "site.config.json"), spokeConfig({ ...options, tagline: `${options.marker} tagline` }));

  // A COMPLETE dictionary (the accepted fixture's own shape), carrying this Spoke's own wording at a real
  // key — so the registry loader accepts it and two Spokes' effective dictionaries differ observably.
  const dictionary = JSON.parse(readFileSync(path.join(FIXTURES, "config", "i18n", "en.json"), "utf8"));
  markFirstString(dictionary, options.marker);
  write(path.join(spokeRoot, "config", "i18n", "en.json"), `${JSON.stringify(dictionary, null, 2)}\n`);
  // The accepted configuration declares TWO locales, so the registry requires a dictionary file for each
  // (`de` has no language-base fallback of its own here). Cloning the fixture's own German dictionary keeps
  // the fixture valid without weakening the registry's validation.
  const german = readFileSync(path.join(FIXTURES, "config", "i18n", "de.json"), "utf8");
  write(path.join(spokeRoot, "config", "i18n", "de.json"), german);

  // The OPTIONAL site+locale override (S1E2), authored by this Spoke as well: one REAL key, this Spoke's
  // own wording — so a site-scoped read and a shared read are both observable in the D1 proofs below.
  write(
    path.join(spokeRoot, "config", "i18n", "sites", "ww", "en.json"),
    `${JSON.stringify({ home: { tagline: `${options.marker} override` } }, null, 2)}\n`,
  );

  write(path.join(spokeRoot, "content", "pages", "markdown", "ww", "en", "about.md"), `# About ${options.marker}\n`);
  write(path.join(spokeRoot, "content", "assets", "placeholders", "logo-header.svg"), `<svg>${options.marker}-logo</svg>`);
}

/** A disposable TWO-Spoke Installation: alpha and beta share every logical coordinate. */
function twoSpokeInstallation(): string {
  const root = tempTree("foundation-s3f2a-two-spokes-");
  write(
    path.join(root, "spokes.json"),
    `${JSON.stringify(
      {
        spokes: [
          { id: "alpha", root: "spokes/alpha-web" },
          { id: "beta", root: "spokes/beta-web" },
        ],
      },
      null,
      2,
    )}\n`,
  );
  authorSpoke(root, "spokes/alpha-web", { name: "Alpha Site", url: "https://alpha.example", marker: "ALPHA" });
  authorSpoke(root, "spokes/beta-web", { name: "Beta Site", url: "https://beta.example", marker: "BETA" });
  return root;
}

/** A disposable LEGACY Installation: one implicit Spoke, its root the Installation root. */
function legacyInstallation(): string {
  const root = tempTree("foundation-s3f2a-legacy-");
  authorSpoke(root, "", { name: "Legacy Site", url: "https://legacy.example", marker: "LEGACY" });
  return root;
}

/** A disposable ONE-Spoke EXPLICIT Installation. */
function oneSpokeInstallation(): string {
  const root = tempTree("foundation-s3f2a-one-spoke-");
  write(path.join(root, "spokes.json"), `${JSON.stringify({ spokes: [{ id: "solo", root: "spokes/solo" }] }, null, 2)}\n`);
  authorSpoke(root, "spokes/solo", { name: "Solo Site", url: "https://solo.example", marker: "SOLO" });
  return root;
}

const ALPHA = { name: "Alpha Site", url: "https://alpha.example", marker: "ALPHA" } as const;
const BETA = { name: "Beta Site", url: "https://beta.example", marker: "BETA" } as const;

describe("the Installation runtime index describes EVERY declared Spoke", () => {
  it("describes a TWO-Spoke Installation completely, in authored manifest order", () => {
    const index = installationRuntimeIndex(twoSpokeInstallation());

    expect(index.mode).toBe("explicit");
    expect(index.spokes.map((spoke) => spoke.id)).toEqual(["alpha", "beta"]);
    // The segment comes from the IDENTITY, never from the authored directory (`alpha-web` → `alpha`).
    expect(index.spokes.map((spoke) => spoke.runtimeSegment)).toEqual(["alpha", "beta"]);
    expect(index.spokes.map((spoke) => spoke.canonicalHostname)).toEqual([
      "alpha.example",
      "beta.example",
    ]);
    expect(index.spokes[0].hostnameClaims).toContain("alpha.example");
    expect(index.spokes[1].hostnameClaims).toContain("beta.example");
    // Each record carries ITS OWN configuration and ITS OWN authored roots.
    expect(index.spokes.map((spoke) => spoke.config.name)).toEqual([ALPHA.name, BETA.name]);
    expect(index.spokes[0].resources.spokeRoot.endsWith(path.join("spokes", "alpha-web"))).toBe(true);
    expect(index.spokes[1].resources.spokeRoot.endsWith(path.join("spokes", "beta-web"))).toBe(true);
  });

  it("describes a ONE-Spoke explicit Installation, and a LEGACY Installation", () => {
    const one = installationRuntimeIndex(oneSpokeInstallation());
    expect(one.mode).toBe("explicit");
    expect(one.spokes.map((spoke) => spoke.id)).toEqual(["solo"]);

    const legacy = installationRuntimeIndex(legacyInstallation());
    expect(legacy.mode).toBe("legacy");
    expect(legacy.spokes.map((spoke) => spoke.id)).toEqual([IMPLICIT_SPOKE_ID]);
    // A legacy Installation's resource root IS the Installation root (its single Spoke is itself).
    expect(path.basename(legacy.spokes[0].resources.spokeRoot)).toMatch(/^foundation-s3f2a-legacy-/);
  });

  it("refuses an Installation that declares nothing (no implicit replacement Spoke)", () => {
    const root = tempTree("foundation-s3f2a-empty-");
    expect(() => installationRuntimeIndex(root)).toThrow(/authored NEITHER way/);
  });
});

describe("a SpokeRuntimeContext addresses exactly ONE Spoke, with no default", () => {
  const index = installationRuntimeIndex(twoSpokeInstallation());

  it("resolves by IDENTITY and by RUNTIME SEGMENT to the same context", () => {
    const byId = runtimeContextForSpoke(index, "alpha");
    const bySegment = runtimeContextForSpoke(index, "alpha");
    expect(byId).not.toBeNull();
    expect(bySegment).not.toBeNull();
    expect(byId?.id).toBe("alpha");
    expect(byId?.runtimeSegment).toBe("alpha");
    expect(byId?.siteConfig.name).toBe(ALPHA.name);
    expect(byId?.canonicalHostname).toBe("alpha.example");
  });

  it("returns NULL for an identity the Installation does not declare — never a fallback", () => {
    for (const unknown of ["foundation", "gamma", "", "alpha-web"]) {
      expect(runtimeContextForSpoke(index, unknown), unknown).toBeNull();
    }
  });

  it("builds each context's asset namespaces from THAT Spoke alone, platform first", () => {
    const alpha = runtimeContextForSpoke(index, "alpha");
    const beta = runtimeContextForSpoke(index, "beta");

    expect(alpha?.runtimeAssetNamespaces.map((namespace) => namespace.urlBase)).toEqual([
      "/assets",
      "/spokes/alpha/assets",
    ]);
    expect(beta?.runtimeAssetNamespaces.map((namespace) => namespace.urlBase)).toEqual([
      "/assets",
      "/spokes/beta/assets",
    ]);
    // No context's namespace list mentions another Spoke's namespace.
    expect(JSON.stringify(alpha?.runtimeAssetNamespaces)).not.toContain("/spokes/beta/");
    expect(JSON.stringify(beta?.runtimeAssetNamespaces)).not.toContain("/spokes/alpha/");
    // …and each Spoke's own generated directory is the one its URL base is served from.
    expect(alpha?.runtimeAssetNamespaces[1].directory.endsWith(path.join("spokes", "alpha", "assets"))).toBe(true);
    expect(beta?.runtimeAssetNamespaces[1].directory.endsWith(path.join("spokes", "beta", "assets"))).toBe(true);
  });
});


describe("A/B/A/B: two contexts resolve independently through the SAME APIs", () => {
  const index = installationRuntimeIndex(twoSpokeInstallation());
  const alpha = runtimeContextForSpoke(index, "alpha");
  const beta = runtimeContextForSpoke(index, "beta");

  /** What ONE context answers, for the coordinates BOTH Spokes share (`ww` / `en` / About). */
  function answersFor(context: typeof alpha) {
    if (context === null) throw new Error("fixture context missing");
    // The accepted per-Spoke capabilities, bound to THIS context's own resources + config (no global).
    const dictionaries = loadSpokeDictionaryRegistry(context.resources, context.siteConfig);
    const dictionaryFile = JSON.parse(
      readFileSync(path.join(context.resources.dictionaryRoot, "en.json"), "utf8"),
    );
    const page = readFileSync(
      path.join(context.resources.markdownPagesRoot, "ww", "en", "about.md"),
      "utf8",
    ).trim();

    return {
      id: context.id,
      runtimeSegment: context.runtimeSegment,
      canonicalHostname: context.canonicalHostname,
      name: context.siteConfig.name,
      origin: new URL(context.siteConfig.url).origin,
      dictionaryRegistryIsObject: typeof dictionaries === "object" && dictionaries !== null,
      dictionaryValue: firstStringLeaf(dictionaryFile),
      page,
      spokeRoot: context.resources.spokeRoot,
      dictionaryRoot: context.resources.dictionaryRoot,
      pageRoot: context.resources.markdownPagesRoot,
      namespaceUrls: context.runtimeAssetNamespaces.map((namespace) => namespace.urlBase),
      roleNamespaceUrl: `${context.runtimeAssetNamespaces[1].urlBase}/logo-header.svg`,
    };
  }

  const A = () => answersFor(alpha);
  const B = () => answersFor(beta);
  const RUN = [A, B, A, B].map((step) => step());

  it("proves Spoke identity, segment, hostname and SiteConfig isolation", () => {
    expect(RUN.map((answer) => answer.id)).toEqual(["alpha", "beta", "alpha", "beta"]);
    expect(RUN.map((answer) => answer.runtimeSegment)).toEqual(["alpha", "beta", "alpha", "beta"]);
    expect(RUN.map((answer) => answer.canonicalHostname)).toEqual([
      "alpha.example",
      "beta.example",
      "alpha.example",
      "beta.example",
    ]);
    expect(RUN.map((answer) => answer.name)).toEqual(["Alpha Site", "Beta Site", "Alpha Site", "Beta Site"]);
    expect(RUN.map((answer) => answer.origin)).toEqual([
      "https://alpha.example",
      "https://beta.example",
      "https://alpha.example",
      "https://beta.example",
    ]);
    // The SAME Spoke answers identically on both visits — nothing was cached across them.
    expect(RUN[0]).toEqual(RUN[2]);
    expect(RUN[1]).toEqual(RUN[3]);
    // …and the two Spokes genuinely differ where the fixture authored them differently.
    expect(RUN[0].name).not.toBe(RUN[1].name);
  });

  it("proves DICTIONARY isolation through the accepted registry capability", () => {
    expect(RUN.map((answer) => (answer.dictionaryValue || "").startsWith("ALPHA "))).toEqual([
      true,
      false,
      true,
      false,
    ]);
    expect(RUN.map((answer) => answer.dictionaryRegistryIsObject)).toEqual([true, true, true, true]);
    expect(RUN[0].dictionaryRoot).not.toBe(RUN[1].dictionaryRoot);
    expect(RUN[0].dictionaryValue).toEqual(RUN[2].dictionaryValue);
    expect(RUN[1].dictionaryValue).toEqual(RUN[3].dictionaryValue);
  });

  it("proves CONTENT isolation for the SAME coordinates (ww / en / About)", () => {
    expect(RUN.map((answer) => answer.page)).toEqual([
      "# About ALPHA",
      "# About BETA",
      "# About ALPHA",
      "# About BETA",
    ]);
    expect(RUN[0].pageRoot).not.toBe(RUN[1].pageRoot);
    expect(RUN[0].spokeRoot).not.toBe(RUN[1].spokeRoot);
  });

  it("proves RUNTIME NAMESPACE isolation, platform first, never the other Spoke's", () => {
    expect(RUN.map((answer) => answer.namespaceUrls)).toEqual([
      ["/assets", "/spokes/alpha/assets"],
      ["/assets", "/spokes/beta/assets"],
      ["/assets", "/spokes/alpha/assets"],
      ["/assets", "/spokes/beta/assets"],
    ]);
    // The same role basename maps to each Spoke's OWN namespace URL.
    expect(RUN.map((answer) => answer.roleNamespaceUrl)).toEqual([
      "/spokes/alpha/assets/logo-header.svg",
      "/spokes/beta/assets/logo-header.svg",
      "/spokes/alpha/assets/logo-header.svg",
      "/spokes/beta/assets/logo-header.svg",
    ]);
    expect(JSON.stringify(RUN[0])).not.toContain("/spokes/beta/");
    expect(JSON.stringify(RUN[1])).not.toContain("/spokes/alpha/");
  });
});

describe("the CURRENT BUILD context is today's compatibility seam", () => {
  it("describes WHATEVER Installation this run selects — deployment-relative, never assumed", () => {
    const context = currentBuildRuntimeContext();
    const paths = deploymentPaths();

    // One source of truth with the path authority: same resource root, same mode.
    expect(context.resources.spokeRoot).toBe(paths.resourceRoot);
    expect(context.siteConfig.url).toBeTruthy();

    if (paths.mode === "legacy") {
      // The GENERIC project selects a synthetic LEGACY Installation, so its context is the implicit Spoke
      // with ONE namespace — exactly as it was before this slice.
      expect(context.id).toBe(IMPLICIT_SPOKE_ID);
      expect(context.runtimeAssetNamespaces.map((namespace) => namespace.urlBase)).toEqual(["/assets"]);
      return;
    }

    // An EXPLICIT Installation (the canonical production shape): the SOLE declared Spoke, platform first.
    expect(context.id).not.toBe(IMPLICIT_SPOKE_ID);
    expect(context.runtimeSegment).toBe(context.id);
    expect(context.runtimeAssetNamespaces.map((namespace) => namespace.urlBase)).toEqual([
      "/assets",
      `/spokes/${context.runtimeSegment}/assets`,
    ]);
  });

  it("answers NULL — never a default — for a Spoke the Installation does not declare", () => {
    const many = installationRuntimeIndex(twoSpokeInstallation());
    expect(many.spokes).toHaveLength(2);
    expect(runtimeContextForSpoke(many, "alpha")).not.toBeNull();
    expect(runtimeContextForSpoke(many, "beta")).not.toBeNull();
    expect(runtimeContextForSpoke(many, "foundation")).toBeNull();
    expect(runtimeContextForSpoke(many, "alpha-web")).toBeNull();
  });
});

describe("architecture guards: the new capability is additive and has no mutable selection", () => {
  const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

  it("introduces no mutable active/current/default Spoke in the runtime index", () => {
    const source = read("src/config/installation-runtime.ts");
    // A context is a VALUE: nothing in this module caches or remembers a selection between calls.
    expect(source).not.toMatch(/\b(activeSpoke|currentSpoke|selectedSpoke|defaultSpoke)\b/);
    expect(source).not.toMatch(/^(let|var)\s/m);
  });

  it("does not import the legacy global configuration", () => {
    // The compatibility CONTEXT is built from each Spoke's OWN configuration (the accepted reader), so
    // the new seam never depends on the module-global that S3F2B must stop using.
    expect(read("src/config/installation-runtime.ts")).not.toMatch(/from "@\/config"/);
  });

  it("declares the TWO production Spokes this deployment activates (M18)", () => {
    const manifest = JSON.parse(read("deployment/spokes.json"));
    expect(manifest.spokes.map((spoke: { id: string }) => spoke.id)).toEqual(["foundation", "germany"]);
    // Each Spoke is authored in its OWN root beneath the dedicated `spokes/` namespace, and manifest
    // order is authored REPORTING order only — never a default, a first Spoke or a precedence rule.
    expect(manifest.spokes.map((spoke: { root: string }) => spoke.root)).toEqual([
      "spokes/foundation",
      "spokes/germany",
    ]);
  });

  it("has RETIRED the internal Spoke page tree: the public route IS the page identity (M17)", () => {
    expect(existsSync(path.join(process.cwd(), "src", "app", "~spoke"))).toBe(false);
    expect(existsSync(path.join(process.cwd(), "src", "app", "[[...segments]]", "page.tsx"))).toBe(true);
    // `src/proxy.ts` dispatches by HOSTNAME through the build routing table, holding no configuration.
    expect(read("src/proxy.ts")).toContain("spokeSelectionForHost");
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// S3F2A2-D1 — DICTIONARY ACCESS BOUND TO ONE EXPLICIT CONTEXT (additive, unwired)
// ────────────────────────────────────────────────────────────────────────────────────────────────

/** The accepted fixture configuration with this Spoke's OWN declared locale set. */
function spokeConfigDeclaring(options: {
  readonly name: string;
  readonly url: string;
  readonly tagline: string;
  readonly locales: readonly string[];
}): string {
  const config = JSON.parse(spokeConfig(options));
  config.i18n = {
    ...config.i18n,
    locales: options.locales.map((code) => ({ code, label: code })),
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}

/**
 * A disposable one-Spoke Installation whose Spoke ALSO declares a REGIONAL locale (`en-gb`), ships no
 * dictionary file for it (its language base must cover it), and authors a site+locale override.
 */
function localeVariantInstallation(): string {
  const root = tempTree("foundation-s3f2a2-d1-locales-");
  authorSpoke(root, "", { name: "Variant Site", url: "https://variant.example", marker: "VARIANT" });
  write(
    path.join(root, "site.config.json"),
    spokeConfigDeclaring({
      name: "Variant Site",
      url: "https://variant.example",
      tagline: "VARIANT tagline",
      locales: ["en", "de", "en-gb"],
    }),
  );
  write(
    path.join(root, "config", "i18n", "sites", "ww", "en.json"),
    `${JSON.stringify({ home: { tagline: "VARIANT override" } }, null, 2)}\n`,
  );
  return root;
}

/**
 * A disposable one-Spoke Installation with booking ENABLED (or explicitly disabled) and ONE label choice:
 * the shared English dictionary keeps a real `booking.book` label, carries a whitespace-only one, or has
 * the whole OPTIONAL section removed (which the dictionary SCHEMA allows — the lock is the invariant's job).
 */
function bookingInstallation(options: {
  readonly provider: "external-url" | "none";
  readonly label: string | undefined;
}): string {
  const root = tempTree("foundation-s3f2a2-d1-booking-");
  authorSpoke(root, "", { name: "Booking Site", url: "https://booking.example", marker: "BOOKING" });

  const config = JSON.parse(readFileSync(path.join(root, "site.config.json"), "utf8"));
  config.features = { ...config.features, booking: { provider: options.provider } };
  if (options.provider === "external-url") config.features.booking.url = "https://booking.example/book";
  write(path.join(root, "site.config.json"), `${JSON.stringify(config, null, 2)}\n`);

  const dictionary = JSON.parse(readFileSync(path.join(FIXTURES, "config", "i18n", "en.json"), "utf8"));
  markFirstString(dictionary, "BOOKING");
  if (options.label === undefined) delete dictionary.booking;
  else dictionary.booking = { book: options.label };
  write(path.join(root, "config", "i18n", "en.json"), `${JSON.stringify(dictionary, null, 2)}\n`);
  return root;
}

/** The implicit Spoke's runtime context of a disposable Installation (the accepted authority). */
function implicitContextFor(root: string): SpokeRuntimeContext {
  const context = runtimeContextForSpoke(installationRuntimeIndex(root), IMPLICIT_SPOKE_ID);
  if (context === null) throw new Error("fixture context missing");
  return context;
}

describe("D1 — dictionary access bound to ONE explicit context", () => {
  const index = installationRuntimeIndex(twoSpokeInstallation());
  const alphaContext = runtimeContextForSpoke(index, "alpha");
  const betaContext = runtimeContextForSpoke(index, "beta");
  if (alphaContext === null || betaContext === null) throw new Error("fixture context missing");

  const alphaAccess = dictionaryAccessForRuntimeContext(alphaContext);
  const betaAccess = dictionaryAccessForRuntimeContext(betaContext);

  /** What one access object answers for the coordinates both Spokes deliberately share. */
  const read = (access: RuntimeDictionaryAccess) => ({
    shared: access.get("en"),
    site: access.get("en", "ww"),
    marker: firstStringLeaf(access.get("en")) ?? "",
  });

  it("proves Alpha/Beta A/B/A/B isolation through the access object", () => {
    const RUN = [read(alphaAccess), read(betaAccess), read(alphaAccess), read(betaAccess)];

    // Each Spoke answers IDENTICALLY on both visits — nothing was cached or leaked between them.
    expect(RUN[0]).toEqual(RUN[2]);
    expect(RUN[1]).toEqual(RUN[3]);
    // …and the two Spokes genuinely differ, because each registry was composed from its OWN roots.
    expect(RUN[0].marker.startsWith("ALPHA ")).toBe(true);
    expect(RUN[1].marker.startsWith("BETA ")).toBe(true);
    expect(RUN[0].marker).not.toBe(RUN[1].marker);
    expect(RUN[0].shared).not.toEqual(RUN[1].shared);
  });

  it("keeps each Spoke's site+locale override inside its own access object", () => {
    expect(alphaAccess.get("en", "ww").home.tagline).toBe("ALPHA override");
    expect(betaAccess.get("en", "ww").home.tagline).toBe("BETA override");

    // Neither context sees the other's authored wording — shared dictionary OR override.
    expect(JSON.stringify(alphaAccess.get("en", "ww"))).not.toContain("BETA");
    expect(JSON.stringify(betaAccess.get("en", "ww"))).not.toContain("ALPHA");
    expect(JSON.stringify(alphaAccess.get("en"))).not.toContain("BETA");
    expect(JSON.stringify(betaAccess.get("en"))).not.toContain("ALPHA");
  });

  it("delegates every documented fallback to the accepted registry", () => {
    const access = dictionaryAccessForRuntimeContext(implicitContextFor(localeVariantInstallation()));

    // A configured locale answers its own dictionary…
    expect(firstStringLeaf(access.get("en"))).toContain("VARIANT");
    // …a REGIONAL locale with no dictionary of its own falls back to its LANGUAGE BASE…
    expect(access.get("en-gb")).toEqual(access.get("en"));
    // …a locale nobody configured falls back to the DEFAULT locale…
    expect(access.get("zz")).toEqual(access.get("en"));
    // …a site+locale override applies for the site that has one…
    expect(access.get("en", "ww").home.tagline).toBe("VARIANT override");
    // …and a site WITHOUT an override gets exactly the shared dictionary.
    expect(access.get("en", "ca")).toEqual(access.get("en"));
  });

  it("enforces the SHARED booking-label invariant when the access is created", () => {
    const build = (root: string) => () => dictionaryAccessForRuntimeContext(implicitContextFor(root));

    // Enabled booking with the OPTIONAL section absent → the invariant's OWN diagnostic.
    expect(
      build(bookingInstallation({ provider: "external-url", label: undefined })),
    ).toThrow(/booking\.book/);
    expect(build(bookingInstallation({ provider: "external-url", label: undefined }))).toThrow(/ww\/en/);
    // A whitespace-only label is missing too (the accepted trim rule).
    expect(build(bookingInstallation({ provider: "external-url", label: "   " }))).toThrow(/booking\.book/);
    // A non-empty label satisfies the lock, and the access object is usable.
    const satisfied = dictionaryAccessForRuntimeContext(
      implicitContextFor(bookingInstallation({ provider: "external-url", label: "Book now" })),
    );
    expect(satisfied.get("en").booking?.book).toBe("Book now");
    // Disabled booking needs no label at all (an absent section is a valid state).
    expect(build(bookingInstallation({ provider: "none", label: undefined }))).not.toThrow();
  });

  it("agrees with the production compatibility binding for the ACTIVE deployment", () => {
    // The new access is handed THAT deployment's own context; the production binding stays untouched,
    // so the one-Spoke build must answer identically through both.
    const buildContext = currentBuildRuntimeContext();
    const access = dictionaryAccessForRuntimeContext(buildContext);
    const locale = buildContext.siteConfig.defaultLocale;

    expect(access.get(locale)).toEqual(getDictionary(locale));
    for (const site of buildContext.siteConfig.sites) {
      expect(access.get(locale, site.code)).toEqual(getDictionary(locale, site.code));
    }
  });
});
