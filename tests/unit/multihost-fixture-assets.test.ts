/**
 * THE MULTIHOST FIXTURE'S ARTWORK IS THE CANONICAL PLAN'S ARTWORK (FOUNDATION-MULTISITE-M16/M17)
 * =============================================================================================
 *
 * The multi-host browser proof serves a disposable two-Spoke Installation whose artwork must be installed by
 * the ONE asset contract the platform ships: `buildPlan` decides which authored source becomes which runtime
 * basename in which namespace, `assets:sync` installs exactly that plan, and the build-time catalog the runtime
 * reads is derived from the same plan.
 *
 * WHY THIS SUITE EXISTS. A custom artwork file dropped into `content/assets/placeholders/**` is not part of the
 * supported role inventory, so the canonical plan installs nothing for it — and a namespace that carries a
 * build-time INVENTORY answers ownership from the catalog, never from disk, so the file is invisible even
 * though it exists. That is exactly how the shell's custom navigation icon broke a clean room: the file was
 * materialised, and every Spoke page still refused to compose. The fixture therefore authors each Spoke's own
 * mark in the SUPPORTED Spoke-owned location (`content/assets/branding/**`), and these assertions keep it
 * there — declared before the runtime inventory is finalised, not added afterwards.
 *
 * The suite is READ-ONLY (the fixture owns its own temp root), so it neither writes generated state nor needs a
 * place in the harness's writer inventory. What it proves is the CONTRACT the browser rows then observe:
 * artwork sources, ownership, mirror/catalog agreement, and the platform namespace not claiming replaceable
 * role artwork.
 */
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertSpokeNamespaceAgreesWithCatalog,
  installationAssetContract,
  materializeMultihostInstallation,
  spokeNamespacePlan,
} from "../support/multihost-installation.mjs";

/** The disposable Installation every assertion below describes. */
const fixture = materializeMultihostInstallation({ repositoryRoot: process.cwd() });

/** One source path, spelled with forward slashes so the assertions read the same on every platform. */
function sourceOf(row: { from: string }): string {
  return row.from.split(path.sep).join("/");
}

describe("the multi-Spoke fixture's artwork", () => {
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

  it("agrees with the build-time catalog the runtime reads", () => {
    for (const spoke of fixture.spokes) {
      const agreement = assertSpokeNamespaceAgreesWithCatalog(fixture.root, spoke.id);
      expect(agreement.missing, `${spoke.id}: nothing the plan installs is missing from the catalog`).toEqual([]);
      expect(agreement.files).toContain(spoke.mark);
      // This fixture describes an EXPLICIT Installation, so the plan publishes a namespace per Spoke — which
      // means the catalog must know this Spoke's artwork, or the runtime could never serve it.
      expect(agreement.inventoried, `${spoke.id}: the catalog publishes ${agreement.urlBase}`).toBe(true);
    }
  });

  it("keeps the replaceable role artwork out of the shared platform namespace", async () => {
    // The REPLACEABLE roles come from the ONE authority, never from a list restated here.
    const { MIRRORED } = await import("../../scripts/sync-runtime-assets.mjs");
    const replaceable = [...new Set(MIRRORED.map((row) => row.to))];
    expect(replaceable.length).toBeGreaterThan(0);

    const platform = installationAssetContract(fixture.root).namespaces.find((entry) => entry.key === "platform");
    expect(platform?.inventory, "the platform namespace carries a published inventory").toBeTruthy();
    // In an explicit Installation the platform namespace owns the SHARED artwork only: not one replaceable
    // role may be claimed by it, which is the ownership fact the browser rows assert per Spoke.
    expect(replaceable.filter((name) => platform!.inventory!.includes(name))).toEqual([]);
  });

  it("publishes the platform-owned artwork every Spoke shares", () => {
    const namespaces = installationAssetContract(fixture.root).namespaces;
    const platform = namespaces.find((entry) => entry.key === "platform");
    expect(platform?.inventory).toContain("icon-home.svg");
    for (const spoke of fixture.spokes) {
      expect(namespaces.some((entry) => entry.key === `spoke:${spoke.id}`)).toBe(true);
    }
  });
});
