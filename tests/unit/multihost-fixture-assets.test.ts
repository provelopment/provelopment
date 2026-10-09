/**
 * THE MULTIHOST FIXTURE'S ARTWORK AND THE CATALOG IT PUBLISHES (FOUNDATION-MULTISITE-M16/M17)
 * ==========================================================================================
 *
 * The multi-host browser proof serves a disposable two-Spoke Installation whose artwork must be installed by
 * the ONE asset contract the platform ships: `buildPlan` decides which authored source becomes which runtime
 * basename in which namespace, `assets:sync` installs exactly that plan, and the PUBLISHED catalog the running
 * application imports is what the runtime believes exists.
 *
 * TWO DEFECTS THIS SUITE KEEPS CLOSED.
 *
 *  1. Artwork must be DECLARED where the contract accepts it. A custom file dropped into
 *     `content/assets/placeholders/**` is not part of the supported role inventory, so the plan installs
 *     nothing for it — and a namespace that carries a published INVENTORY answers ownership from the catalog,
 *     never from disk, so the file is invisible even though it exists. The fixture therefore authors each
 *     Spoke's own mark in the SUPPORTED Spoke-owned location (`content/assets/branding/**`).
 *  2. The guard must judge the PUBLISHED catalog, not a fresh copy of the plan. A catalog recomputed from the
 *     plan describes what the plan WOULD produce; comparing two plan-derived copies cannot see a stale file.
 *     `spokeNamespaceAgreement`/`assertSpokeNamespaceAgreesWithCatalog` read the generated file the runtime
 *     imports, so a stale or wrongly-owned publication is detected — which the negative cases below prove.
 *
 * The negative cases use DISPOSABLE TEST-OWNED generated state (a copy in this suite's own temp directory), so
 * the canonical repository's generated catalog is never written; the disposable Installation is released with
 * the suite. What the assertions establish is the CONTRACT the browser rows then observe.
 */
import path from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

import { afterAll, describe, expect, it } from "vitest";

import {
  assertSpokeNamespaceAgreesWithCatalog,
  materializeMultihostInstallation,
  readPublishedCatalog,
  spokeNamespaceAgreement,
  spokeNamespacePlan,
} from "../support/multihost-installation.mjs";

/** The catalog as the build publishes it: a shape version and one inventory per namespace URL base. */
type PublishedCatalog = {
  version: number;
  namespaces: Record<string, Record<string, unknown>>;
};

/** The disposable Installation every assertion below describes; released when the suite ends. */
const fixture = materializeMultihostInstallation({ repositoryRoot: process.cwd() });

/** This suite's own disposable PUBLISHED catalogs (never the repository's generated one). */
const scratch = mkdtempSync(path.join(tmpdir(), "foundation-multihost-catalog-"));

afterAll(() => {
  fixture.cleanup();
  rmSync(scratch, { recursive: true, force: true });
});

/** Writes one disposable published catalog and returns its path. */
function publishedCatalog(name: string, catalog: PublishedCatalog): string {
  const file = path.join(scratch, name);
  writeFileSync(file, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  return file;
}

/** The catalog THIS Installation's plan produces — the text a canonical `assets:sync` would publish. */
async function catalogThePlanProduces(): Promise<PublishedCatalog> {
  const { buildRuntimeAssetCatalog, CATALOG_VERSION } = await import("../../scripts/sync-runtime-assets.mjs");
  return { version: CATALOG_VERSION, namespaces: buildRuntimeAssetCatalog(fixture.root).namespaces };
}

/** An independent copy, so each case starts from the same publication text. */
function copyOf(catalog: PublishedCatalog): PublishedCatalog {
  return JSON.parse(JSON.stringify(catalog)) as PublishedCatalog;
}

/** One source path, spelled with forward slashes so the assertions read the same on every platform. */
function sourceOf(row: { from: string }): string {
  return row.from.split(path.sep).join("/");
}

describe("a correctly published explicit Installation", () => {
  it("agrees: the published catalog carries every file the plan installs per Spoke", async () => {
    const file = publishedCatalog("published.json", await catalogThePlanProduces());
    for (const spoke of fixture.spokes) {
      const agreement = assertSpokeNamespaceAgreesWithCatalog(fixture.root, spoke.id, file);
      expect(agreement.consistent, `${spoke.id}: published and expected agree`).toBe(true);
      expect(agreement.missing).toEqual([]);
      expect(agreement.inventoried, `${spoke.id}: the publication carries ${agreement.urlBase}`).toBe(true);
      expect(agreement.publishedInventory).toContain(spoke.mark);
      // The replaceable roles are owned by THAT Spoke, not by the shared platform namespace.
      expect(agreement.publishedInventory).toEqual(
        expect.arrayContaining(["sidebar-open.svg", "sidebar-close.svg"]),
      );
      expect(agreement.platformClaims).toEqual([]);
    }
  });

  it("authors each Spoke's own mark where the canonical contract accepts it", () => {
    for (const spoke of fixture.spokes) {
      const plan = spokeNamespacePlan(fixture.root, spoke.id);
      const mark = plan.find((row) => row.to === spoke.mark);
      expect(mark, `${spoke.id}: the canonical plan installs ${spoke.mark}`).toBeDefined();
      // …from the SPOKE-OWNED branding directory: the supported source for replaceable brand artwork.
      expect(sourceOf(mark!)).toContain(`spokes/${spoke.segment}/content/assets/branding/`);
    }
  });

  it("hands a Spoke's namespace only artwork that Spoke authored", () => {
    for (const spoke of fixture.spokes) {
      const other = spoke.segment === "alpha" ? "beta" : "alpha";
      const plan = spokeNamespacePlan(fixture.root, spoke.id);
      expect(plan.length, `${spoke.id}: the plan installs its namespace`).toBeGreaterThan(0);
      for (const row of plan) {
        const source = sourceOf(row);
        expect(source, `${spoke.id}: ${row.to} is authored inside its own root`).toContain(
          `spokes/${spoke.segment}/`,
        );
        expect(source, `${spoke.id}: ${row.to} never comes from the other Spoke`).not.toContain(
          `spokes/${other}/`,
        );
      }
    }
  });

  it("publishes the shared platform artwork every Spoke serves", async () => {
    const file = publishedCatalog("platform.json", await catalogThePlanProduces());
    const agreement = spokeNamespaceAgreement(fixture.root, "alpha", file);
    expect(agreement.platformPublished).toContain("icon-home.svg");
    expect(agreement.replaceableRoles).toEqual(
      expect.arrayContaining(["sidebar-open.svg", "sidebar-close.svg"]),
    );
  });

});

describe("a STALE published catalog", () => {
  it("is refused even though a fresh plan-derived catalog would contain the asset", async () => {
    const catalog = copyOf(await catalogThePlanProduces());
    delete catalog.namespaces["/spokes/alpha/assets"]["alpha-spoke.svg"];
    const stale = publishedCatalog("stale.json", catalog);

    // THE POINT OF THIS SUITE: the plan still declares the asset, so a catalog RECOMPUTED from the plan would
    // contain it and report agreement. Only the PUBLISHED file can reveal the disagreement.
    expect(spokeNamespacePlan(fixture.root, "alpha").map((row) => row.to)).toContain("alpha-spoke.svg");

    const agreement = spokeNamespaceAgreement(fixture.root, "alpha", stale);
    expect(agreement.consistent).toBe(false);
    expect(agreement.inventoried).toBe(true);
    expect(agreement.missing).toEqual(["alpha-spoke.svg"]);

    expect(() => assertSpokeNamespaceAgreesWithCatalog(fixture.root, "alpha", stale)).toThrow(
      /STALE for the Installation being served/,
    );
    // …naming the asset, the Installation and the published catalog it judged.
    expect(() => assertSpokeNamespaceAgreesWithCatalog(fixture.root, "alpha", stale)).toThrow(/alpha-spoke\.svg/);
    expect(() => assertSpokeNamespaceAgreesWithCatalog(fixture.root, "alpha", stale)).toThrow(fixture.root);
    expect(() => assertSpokeNamespaceAgreesWithCatalog(fixture.root, "alpha", stale)).toThrow(
      /runtime-asset-catalog/,
    );
  });
});

describe("a published catalog with INCORRECT platform ownership", () => {
  it("is refused: the shared namespace may not claim a Spoke-owned replaceable role", async () => {
    const catalog = copyOf(await catalogThePlanProduces());
    catalog.namespaces["/assets"]["sidebar-open.svg"] = null;
    const wrong = publishedCatalog("wrong-owner.json", catalog);

    const agreement = spokeNamespaceAgreement(fixture.root, "beta", wrong);
    expect(agreement.missing, "the Spoke namespace itself is complete").toEqual([]);
    expect(agreement.platformClaims).toEqual(["sidebar-open.svg"]);
    expect(agreement.consistent).toBe(false);

    expect(() => assertSpokeNamespaceAgreesWithCatalog(fixture.root, "beta", wrong)).toThrow(
      /replaceable role artwork that this explicit Installation gives to its Spokes/,
    );
    expect(() => assertSpokeNamespaceAgreesWithCatalog(fixture.root, "beta", wrong)).toThrow(/sidebar-open\.svg/);
  });
});

describe("the accepted COMPATIBILITY case", () => {
  it("an unrelated published reference catalog does not claim a fixture Spoke namespace", async () => {
    const { CATALOG_VERSION } = await import("../../scripts/sync-runtime-assets.mjs");
    const reference: PublishedCatalog = {
      version: CATALOG_VERSION,
      namespaces: {
        "/assets": { "icon-home.svg": null },
        "/spokes/foundation/assets": { "sidebar-open.svg": null },
      },
    };
    const file = publishedCatalog("reference.json", reference);

    // The PUBLISHED file is the authority, and it carries no inventory for THIS Installation's Spokes.
    expect(readPublishedCatalog(file).namespaces["/spokes/alpha/assets"]).toBeUndefined();
    for (const spoke of fixture.spokes) {
      const agreement = assertSpokeNamespaceAgreesWithCatalog(fixture.root, spoke.id, file);
      expect(agreement.inventoried, `${spoke.id}: no published inventory for ${agreement.urlBase}`).toBe(false);
      expect(agreement.publishedInventory).toBeNull();
      expect(agreement.missing).toEqual([]);
      expect(agreement.platformClaims).toEqual([]);
      expect(agreement.consistent).toBe(true);
    }
  });

  it("leaves the filesystem compatibility path intact for a namespace no catalog publishes", async () => {
    const { withRuntimeAssetInventories } = await import("@/config/runtime-asset-catalog");
    const namespace = { directory: "unused", urlBase: "/spokes/no-catalog-publishes-this/assets" };
    // A namespace the published catalog does not carry is returned UNCHANGED (identity preserved) — the
    // supported filesystem behaviour every uninventoried namespace keeps.
    expect(withRuntimeAssetInventories([namespace])[0]).toBe(namespace);
  });
});
