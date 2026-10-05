import { describe, expect, it } from "vitest";

import { deploymentPaths, type RuntimeAssetNamespace } from "@/config/deployment-root";
import {
  catalogInventoryFor,
  catalogNamespaces,
  withRuntimeAssetInventories,
} from "@/config/runtime-asset-catalog";
import { createRuntimeAssetOwnershipResolver } from "@/config/runtime-asset-resolver";
import {
  buildPlan,
  buildRuntimeAssetCatalog,
  checkRuntimeAssetCatalog,
  runtimeNamespaces,
} from "../../scripts/sync-runtime-assets.mjs";

/**
 * M16/M17 (DEFECT B) — THE RUNTIME ASSET CATALOG: ONE PLAN, IMMUTABLE DATA, NO PUBLIC FILESYSTEM
 * ==============================================================================================
 *
 * The production defect this proves fixed: a page render asked whether each configured icon had a matching
 * file by probing `public/assets/**`. Locally that tree exists; in a Vercel serverless function it does not
 * (`public/` is static deployment output served by the CDN, and the function carried the authored
 * deployment files but NO platform namespace), so `/ww/en` and `/de/de/berlin` answered 500 with
 * "configured icon leaf(s) have no matching asset file: icon-home.svg" while the sitemap, robots and
 * metadata routes — which never run the full layout composition — kept returning 200.
 *
 * Three invariants, in the order they matter:
 *   1. ONE SOURCE (no second inventory). The catalog the runtime reads is derived from the SAME plan that
 *      installs the mirror, so "what is generated" and "what the runtime believes exists" cannot disagree.
 *   2. NAMESPACE SEMANTICS UNCHANGED. Platform first and non-shadowable, a Spoke's own namespace second,
 *      one Spoke never able to answer for another, the same basename valid in different Spokes.
 *   3. THE LIVE PATH DOES NOT TOUCH THE FILESYSTEM. A context-bound resolver answers identically whether
 *      the namespace directories exist or not — which is the point, since they do not exist in a function.
 */
describe("M16/M17 — the runtime asset catalog is derived from the mirror plan", () => {
  it("is committed, versioned, and publishes the files the production failure named", () => {
    // The catalog is a source module, so it is ALWAYS present in a checkout and in every server function's
    // bundle (a traced `public/**` file is not). Its freshness against the plan is gated by `pnpm
    // assets:check`, which runs in the deployment the build serves — this suite asserts the CONTENT rules.
    const report = checkRuntimeAssetCatalog();
    expect(report.present).toBe(true);
    const catalog = report.catalog as {
      version: number;
      namespaces: Record<string, Record<string, unknown>>;
    };
    expect(catalog.version).toBe(1);
    expect(Object.keys(catalog.namespaces).length).toBeGreaterThan(0);
    // Every published namespace is well-formed: a plain object of basename → size-or-null.
    for (const [urlBase, inventory] of Object.entries(catalog.namespaces)) {
      expect(urlBase.startsWith("/")).toBe(true);
      expect(Object.keys(inventory).length).toBeGreaterThan(0);
      for (const value of Object.values(inventory)) {
        if (value === null) continue;
        expect(value).toMatchObject({ width: expect.any(Number), height: expect.any(Number) });
      }
    }
    // The platform namespace is published, and the two files production reported missing are in it — read
    // from the COMMITTED catalog (the module the runtime imports), not from a re-derivation.
    const committed = catalogInventoryFor("/assets");
    expect(committed, "the committed catalog must publish the platform namespace").toBeDefined();
    expect(committed?.["icon-home.svg"]).toMatchObject({
      width: expect.any(Number),
      height: expect.any(Number),
    });
    expect(committed?.["icon-about.svg"]).toMatchObject({
      width: expect.any(Number),
      height: expect.any(Number),
    });
    expect(catalogNamespaces()).toContain("/assets");
  });

  it("covers every namespace and every declared file of the plan — no more, no less", () => {
    // Derived in-process for the deployment THIS run serves: the catalog the build publishes and the plan
    // that installs the mirror are the same knowledge, so their namespace sets and file sets are identical
    // BY CONSTRUCTION (that is what "no second inventory" means).
    const catalog = buildRuntimeAssetCatalog() as {
      namespaces: Record<string, Record<string, unknown>>;
    };
    const plan = buildPlan() as { namespace: string; to: string }[];
    const live = deploymentPaths().runtimeAssetNamespaces;

    // Every namespace the runtime declares is published, and nothing else is.
    expect(Object.keys(catalog.namespaces).sort()).toEqual(
      [...live.map((namespace) => namespace.urlBase)].sort(),
    );

    // Every planned file is published under the namespace the plan installs it into, keyed by that
    // namespace's own URL base — so a file cannot be installed without the runtime knowing it exists.
    const urlBaseByKey = new Map(runtimeNamespaces().map((namespace) => [namespace.key, namespace.urlBase]));
    const expected = new Map<string, string[]>();
    for (const row of plan) {
      const urlBase = urlBaseByKey.get(row.namespace);
      if (urlBase === undefined) throw new Error(`unknown plan namespace: ${row.namespace}`);
      expected.set(urlBase, [...(expected.get(urlBase) ?? []), row.to]);
    }
    expect(expected.size).toBeGreaterThan(0);
    for (const [urlBase, files] of expected) {
      expect(Object.keys(catalog.namespaces[urlBase]).sort()).toEqual([...files].sort());
    }
  });

  it("gives every LIVE runtime namespace its inventory — the binding is not optional", () => {
    // A namespace WITHOUT an inventory is the compatibility case (a synthetic fixture). In production that
    // would mean probing a filesystem the function does not have, so the live authority must bind one.
    const bound = withRuntimeAssetInventories(deploymentPaths().runtimeAssetNamespaces);
    expect(bound.length).toBeGreaterThan(0);
    for (const namespace of bound) {
      expect(namespace.inventory, `no catalog inventory for ${namespace.urlBase}`).toBeDefined();
      expect(catalogInventoryFor(namespace.urlBase)).toBe(namespace.inventory);
    }
    // Platform first, and the platform namespace is published in its own right.
    expect(bound[0].urlBase).toBe("/assets");
  });
});
/**
 * A synthetic MULTI-Spoke catalog — the shape a two-Spoke Installation produces (platform, Alpha, Beta) —
 * with the platform and BOTH Spokes deliberately shipping the SAME basename, and every directory pointing at
 * a path that CANNOT exist: exactly the condition a serverless function is in.
 */
function multiSpokeNamespaces() {
  const platform = {
    directory: "/nonexistent/platform/assets",
    urlBase: "/assets",
    inventory: {
      "icon-home.svg": { width: 24, height: 24 },
      "shared.svg": { width: 10, height: 10 },
    },
  };
  const alpha = {
    directory: "/nonexistent/spokes/alpha/assets",
    urlBase: "/spokes/alpha/assets",
    inventory: {
      "favicon.svg": { width: 32, height: 32 },
      "shared.svg": { width: 11, height: 11 },
    },
  };
  const beta = {
    directory: "/nonexistent/spokes/beta/assets",
    urlBase: "/spokes/beta/assets",
    inventory: {
      "favicon.svg": { width: 64, height: 64 },
      "shared.svg": { width: 12, height: 12 },
    },
  };
  return { platform, alpha, beta };
}

describe("M16/M17 — catalog-backed ownership keeps every namespace rule", () => {
  it("Alpha sees platform and Alpha, never Beta — and Beta never sees Alpha", () => {
    const { platform, alpha, beta } = multiSpokeNamespaces();
    const alphaResolver = createRuntimeAssetOwnershipResolver([platform, alpha]);
    const betaResolver = createRuntimeAssetOwnershipResolver([platform, beta]);

    // Platform ownership, answered from data alone.
    expect(alphaResolver.iconAssetAvailable("icon-home.svg")).toBe(true);
    expect(betaResolver.iconAssetAvailable("icon-home.svg")).toBe(true);
    expect(alphaResolver.availableIconUrl("icon-home.svg")).toBe("/assets/icon-home.svg");

    // A Spoke's OWN artwork answers with ITS namespace's URL base, and only its own.
    expect(alphaResolver.availableIconUrl("favicon.svg")).toBe("/spokes/alpha/assets/favicon.svg");
    expect(betaResolver.availableIconUrl("favicon.svg")).toBe("/spokes/beta/assets/favicon.svg");

    // THE CROSS-SPOKE RULE: one Spoke can never resolve another's file, and a file nobody declares is
    // unavailable — no URL is invented and no placeholder is produced.
    expect(alphaResolver.namespaceOwning("favicon.svg")?.urlBase).toBe("/spokes/alpha/assets");
    expect(betaResolver.namespaceOwning("favicon.svg")?.urlBase).toBe("/spokes/beta/assets");
    expect(alphaResolver.iconAssetAvailable("beta-only.svg")).toBe(false);
    expect(alphaResolver.availableIconUrl("beta-only.svg")).toBe("");

    // THE PLATFORM RULE: a basename the platform owns stays platform-owned in every Spoke's context, so a
    // Spoke can never shadow platform artwork.
    for (const resolver of [alphaResolver, betaResolver]) {
      expect(resolver.namespaceOwning("shared.svg")?.urlBase).toBe("/assets");
      expect(resolver.namespaceOwning("icon-home.svg")?.urlBase).toBe("/assets");
    }
  });

  it("answers A, B, A, B stably — and each context measures only artwork it may serve", () => {
    const { platform, alpha, beta } = multiSpokeNamespaces();
    const alphaResolver = createRuntimeAssetOwnershipResolver([platform, alpha]);
    const betaResolver = createRuntimeAssetOwnershipResolver([platform, beta]);

    for (let round = 0; round < 2; round += 1) {
      expect(alphaResolver.availableIconUrl("favicon.svg")).toBe("/spokes/alpha/assets/favicon.svg");
      expect(betaResolver.availableIconUrl("favicon.svg")).toBe("/spokes/beta/assets/favicon.svg");
      // The SAME basename, owned by BOTH Spokes, measures differently in each context: the size cache is
      // the resolver's own, so one Spoke's answer can never be served to the other.
      expect(alphaResolver.readImageDimensions("/spokes/alpha/assets/favicon.svg")).toEqual({
        width: 32,
        height: 32,
      });
      expect(betaResolver.readImageDimensions("/spokes/beta/assets/favicon.svg")).toEqual({
        width: 64,
        height: 64,
      });
      // A role graphic whose BASENAME this resolver does not own is unavailable — never a placeholder, never
      // reserved space, never a broken image. A basename it DOES own is projected through its OWN URL base,
      // even when the configured pathname pointed at another Spoke's namespace: the basename is the rule.
      expect(alphaResolver.availableHeaderGraphicPath("/spokes/alpha/assets/not-here.svg")).toBeUndefined();
      expect(alphaResolver.availableHeaderGraphicPath("/spokes/beta/assets/favicon.svg")).toBe(
        "/spokes/alpha/assets/favicon.svg",
      );
      expect(alphaResolver.availableHeaderGraphicPath("/spokes/alpha/assets/favicon.svg")).toBe(
        "/spokes/alpha/assets/favicon.svg",
      );
    }
  });
});
describe("M16/M17 — the LIVE render path never establishes availability from the filesystem", () => {
  it("answers identically when the namespace directories do not exist", () => {
    const live = withRuntimeAssetInventories(deploymentPaths().runtimeAssetNamespaces);
    const real = createRuntimeAssetOwnershipResolver(live);
    // The SAME namespaces, with every directory pointed somewhere that cannot exist: what a serverless
    // function's filesystem looks like. If ANY answer came from `existsSync`/`statSync`/`openSync`/
    // `readSync`, these two resolvers would disagree — and that disagreement IS the production 500.
    const withoutFilesystem = createRuntimeAssetOwnershipResolver(
      live.map((namespace) => ({
        ...namespace,
        directory: `/nonexistent${namespace.urlBase.replace(/\W+/g, "-")}`,
      })),
    );

    const names: (string | undefined)[] = [
      "icon-home.svg",
      "icon-about.svg",
      "logo-header.svg",
      "favicon.svg",
      "sidebar-open.svg",
      "sidebar-close.svg",
      "not-declared-anywhere.svg",
      "",
      undefined,
    ];
    for (const name of names) {
      expect(withoutFilesystem.iconAssetAvailable(name)).toBe(real.iconAssetAvailable(name));
      expect(withoutFilesystem.availableIconName(name)).toBe(real.availableIconName(name));
      expect(withoutFilesystem.availableIconUrl(name)).toBe(real.availableIconUrl(name));
      expect(withoutFilesystem.runtimeAssetUrl(name === undefined ? undefined : `/assets/${name}`)).toBe(
        real.runtimeAssetUrl(name === undefined ? undefined : `/assets/${name}`),
      );
    }

    // …and the intrinsic sizes a page graphic presents with are BUILD data too, not a header read: they
    // come from the installation's OWN artwork, so what is asserted is that they are REAL (a positive
    // pair) and that the filesystem-free resolver agrees — never a particular size (M21 §10).
    const iconUrl = real.availableIconUrl("icon-home.svg") ?? "";
    expect(iconUrl).not.toBe("");
    const dimensions = real.readImageDimensions(iconUrl);
    expect(dimensions?.width ?? 0).toBeGreaterThan(0);
    expect(dimensions?.height ?? 0).toBeGreaterThan(0);
    expect(withoutFilesystem.readImageDimensions(iconUrl)).toEqual(dimensions);

    // Role projections are ownership answers too, so they are identical without the tree — for a basename
    // the live inventory holds and for one it does not.
    for (const name of ["icon-home.svg", "not-declared-anywhere.svg"]) {
      const graphic = `${live[live.length - 1].urlBase}/${name}`;
      expect(withoutFilesystem.availableHeaderGraphicPath(graphic)).toBe(
        real.availableHeaderGraphicPath(graphic),
      );
      expect(withoutFilesystem.availableFooterGraphicPath(graphic)).toBe(
        real.availableFooterGraphicPath(graphic),
      );
      expect(withoutFilesystem.availableBannerPath(graphic)).toBe(real.availableBannerPath(graphic));
      expect(withoutFilesystem.availableStatusGraphicPath(graphic)).toBe(
        real.availableStatusGraphicPath(graphic),
      );
    }
  });

  it("leaves the compatibility path intact for a namespace that carries no inventory", () => {
    // The unit fixtures build namespaces over temporary directories. Those namespaces carry NO inventory and
    // keep the accepted filesystem rule, so nothing that was proved before this change stops being true.
    const inventoryless = { directory: "/nonexistent/legacy/assets", urlBase: "/assets" };
    const resolver = createRuntimeAssetOwnershipResolver([inventoryless]);
    expect(resolver.iconAssetAvailable("icon-home.svg")).toBe(false);
    expect(resolver.readImageDimensions("/assets/icon-home.svg")).toBeUndefined();
  });
});

describe("M16/M17 — a MULTI-Spoke Installation publishes one catalog per declared namespace", () => {
  it("covers platform, Alpha and Beta independently — with no Foundation assumption anywhere", async () => {
    // The SAME disposable two-Spoke installation the multi-host browser proof builds: a real manifest, real
    // authored artwork per Spoke. The catalog is derived from the plan for THAT installation, so "which
    // Spokes exist" is answered by the manifest and never by a name baked into the code.
    const { materializeMultihostInstallation } = await import("../support/multihost-installation.mjs");
    const installation = materializeMultihostInstallation({ repositoryRoot: process.cwd() });
    try {
      const catalog = buildRuntimeAssetCatalog(installation.root) as {
        namespaces: Record<string, Record<string, unknown>>;
      };
      expect(Object.keys(catalog.namespaces).sort()).toEqual([
        "/assets",
        "/spokes/alpha/assets",
        "/spokes/beta/assets",
      ]);
      // No Foundation namespace exists here, because no Foundation Spoke is declared here.
      expect(Object.keys(catalog.namespaces).some((base) => base.includes("foundation"))).toBe(false);

      // The platform namespace is shared and holds the reusable icon library…
      // (measured from THIS installation's own source artwork, so no dimension is assumed).
      expect(catalog.namespaces["/assets"]["icon-home.svg"]).toMatchObject({
        width: expect.any(Number),
        height: expect.any(Number),
      });

      // …while each Spoke's own namespace holds ITS replaceable role artwork, published separately.
      for (const spoke of installation.spokes) {
        const inventory = catalog.namespaces[`/spokes/${spoke.segment}/assets`];
        expect(inventory, `no catalog namespace for ${spoke.id}`).toBeDefined();
        expect(Object.keys(inventory).length).toBeGreaterThan(0);
      }

      // From the catalog ALONE, the two Spokes stay independent: the platform first and non-shadowable,
      // each Spoke answering through its own URL base, and never through the other's.
      const live = withRuntimeAssetInventories(
        Object.entries(catalog.namespaces).map(([urlBase, inventory]) => ({
          directory: `/nonexistent${urlBase.replace(/\W+/g, "-")}`,
          urlBase,
          inventory,
        })) as readonly RuntimeAssetNamespace[],
      );
      const platform = live[0];
      const alpha = live.find((namespace) => namespace.urlBase === "/spokes/alpha/assets");
      const beta = live.find((namespace) => namespace.urlBase === "/spokes/beta/assets");
      expect(platform?.urlBase).toBe("/assets");
      expect(alpha).toBeDefined();
      expect(beta).toBeDefined();

      const alphaResolver = createRuntimeAssetOwnershipResolver([platform!, alpha!]);
      const betaResolver = createRuntimeAssetOwnershipResolver([platform!, beta!]);
      // Each Spoke answers for its OWN namespace — every basename it ships resolves through its own URL
      // base, and through no other. Cross-Spoke refusal is proved synthetically below; here the point is
      // COVERAGE: the catalog was derived per declared namespace, not from a name baked into the code.
      for (const [spoke, resolver] of [
        [installation.spokes[0], alphaResolver],
        [installation.spokes[1], betaResolver],
      ] as const) {
        const names = Object.keys(catalog.namespaces[`/spokes/${spoke.segment}/assets`]);
        expect(names.length).toBeGreaterThan(0);
        for (const name of names) {
          const owner = resolver.namespaceOwning(name);
          // COVERAGE and NON-SHADOWABILITY, derived from the resolver's own answers: every basename this
          // Spoke ships is owned by ONE of ITS two declared namespaces (the shared platform one first,
          // then its own) — never by another Spoke's, and never by nothing (M21 §10).
          expect(owner, name).toBeDefined();
          expect(["/assets", `/spokes/${spoke.segment}/assets`], name).toContain(owner?.urlBase);
          expect(resolver.availableIconUrl(name)).toBe(`${owner?.urlBase}/${name}`);
        }
      }
      // The shared platform namespace is non-shadowable, whatever the Spokes ship.
      for (const resolver of [alphaResolver, betaResolver]) {
        expect(resolver.namespaceOwning("icon-home.svg")?.urlBase).toBe("/assets");
        expect(resolver.availableIconUrl("icon-home.svg")).toBe("/assets/icon-home.svg");
      }
      // …and every answer above came from data, with NO namespace directory on disk at all.
    } finally {
      installation.cleanup();
    }
  });
});
