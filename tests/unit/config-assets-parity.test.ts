import { existsSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  assetPathFromUrl,
  availableBackgroundMap,
  availableBackgroundPath,
  availableBannerPath,
  availableFooterGraphicPath,
  availableHeaderGraphicPath,
  availableIconName,
  availableIconUrl,
  availableStatusGraphicPath,
  iconAssetAvailable,
  namespaceOwning,
  readImageDimensions,
  resolveIconControlUrl,
  runtimeAssetPath,
  runtimeAssetUrl,
} from "@/config/assets";
import { deploymentPaths } from "@/config/deployment-root";
import { createRuntimeAssetOwnershipResolver } from "@/config/runtime-asset-resolver";

/**
 * S3F2A2-R4 — PRODUCTION API PARITY WITH THE RUNTIME RESOLVER
 * ==========================================================
 *
 * The cutover replaces the live module's own runtime-asset engine with the proved resolver, so the question
 * this suite answers is exactly: does every public `@/config/assets` export still give the SAME answer as a
 * resolver built from the SAME `deploymentPaths().runtimeAssetNamespaces`? The comparison runs over the REAL
 * generated namespaces — so platform-owned AND Spoke-owned artwork are both represented — and includes
 * deliberate absences, so an unavailable answer is compared too.
 */

const namespaces = deploymentPaths().runtimeAssetNamespaces;
const resolver = createRuntimeAssetOwnershipResolver(namespaces);

/** Every basename the current deployment's generated namespaces ship. */
const shipped = [
  ...new Set(
    namespaces.flatMap((namespace) =>
      existsSync(namespace.directory) ? readdirSync(namespace.directory) : [],
    ),
  ),
].sort();

const absent = "definitely-missing-asset.svg";

describe("R4 — production asset exports answer exactly as the runtime resolver does", () => {
  it("compares against a real generated tree (platform namespace first, Spoke namespaces after)", () => {
    // This project proves the generic contract against a SYNTHETIC deployment, so the platform namespace can
    // be the whole context here; the canonical deployment's two-namespace boundary is asserted by that
    // deployment's own suite (`deployment/tests/unit/asset-taxonomy-mirror.test.ts`).
    expect(namespaces.length).toBeGreaterThan(0);
    expect(namespaces[0]?.urlBase).toBe("/assets");
    expect(shipped.length).toBeGreaterThan(20);
    expect(shipped).toContain("icon-home.svg");
  });

  it("projects icons, paths and ownership identically", () => {
    const candidates: readonly (string | undefined)[] = [...shipped, absent, "", undefined];
    for (const name of candidates) {
      const label = JSON.stringify(name);
      expect(iconAssetAvailable(name), label).toBe(resolver.iconAssetAvailable(name));
      expect(availableIconName(name), label).toBe(resolver.availableIconName(name));
      expect(availableIconUrl(name), label).toBe(resolver.availableIconUrl(name));
      expect(runtimeAssetPath(name), label).toBe(resolver.runtimeAssetPath(name));
      expect(namespaceOwning(name ?? "", namespaces)?.urlBase, label).toBe(
        resolver.namespaceOwning(name ?? "")?.urlBase,
      );
    }
  });

  it("resolves configured asset URLs identically (absolute, Spoke-namespaced, bare path, junk)", () => {
    const urls = [
      ...shipped
        .slice(0, 12)
        .map((name) => `https://foundation-template.provelopment.com/assets/${name}`),
      ...shipped
        .slice(0, 6)
        .map((name) => `https://foundation-template.provelopment.com/spokes/foundation/assets/${name}`),
      ...shipped.slice(0, 6).map((name) => `/assets/${name}`),
    ];
    for (const url of urls) {
      expect(runtimeAssetUrl(url), url).toBe(resolver.runtimeAssetUrl(url));
      expect(assetPathFromUrl(url), url).toBe(resolver.assetPathFromUrl(url));
    }
    for (const value of [undefined, "", "not a url"]) {
      expect(runtimeAssetUrl(value)).toBe(resolver.runtimeAssetUrl(value));
      expect(assetPathFromUrl(value)).toBe(resolver.assetPathFromUrl(value));
    }
  });

  it("resolves every page-role graphic identically (banner, background, map, footer, header, status)", () => {
    const roleValues: readonly (string | undefined)[] = [
      ...shipped.map((name) => `https://foundation-template.provelopment.com/assets/${name}`),
      `https://foundation-template.provelopment.com/assets/${absent}`,
      "https://foundation-template.provelopment.com/custom/role.svg",
      undefined,
      "",
    ];
    for (const value of roleValues) {
      const label = JSON.stringify(value);
      expect(availableBannerPath(value), label).toBe(resolver.availableBannerPath(value));
      expect(availableBackgroundPath(value), label).toBe(resolver.availableBackgroundPath(value));
      expect(availableFooterGraphicPath(value), label).toBe(
        resolver.availableFooterGraphicPath(value),
      );
      expect(availableHeaderGraphicPath(value), label).toBe(
        resolver.availableHeaderGraphicPath(value),
      );
      expect(availableStatusGraphicPath(value), label).toBe(
        resolver.availableStatusGraphicPath(value),
      );
    }

    const configured = Object.fromEntries(
      roleValues.slice(0, 12).map((value, index) => [`role-${index}`, value ?? ""]),
    );
    expect(availableBackgroundMap(configured)).toEqual(resolver.availableBackgroundMap(configured));
    expect(availableBackgroundMap(undefined)).toEqual(resolver.availableBackgroundMap(undefined));
  });

  it("reads intrinsic dimensions and icon-control defaults identically", () => {
    for (const value of [
      runtimeAssetPath("icon-home.svg"),
      runtimeAssetPath("logo-header.svg"),
      `/assets/${absent}`,
      undefined,
    ]) {
      expect(readImageDimensions(value), String(value)).toEqual(resolver.readImageDimensions(value));
    }

    for (const [configured, shippedDefault] of [
      [undefined, "sidebar-open.svg"],
      ["", "sidebar-open.svg"],
      ["icon-sidebar-open.svg", "sidebar-open.svg"],
      [absent, "sidebar-open.svg"],
    ] as const) {
      expect(resolveIconControlUrl(configured, shippedDefault)).toBe(
        resolver.resolveIconControlUrl(configured, shippedDefault),
      );
    }
  });

  it("preserves the context's namespace boundaries, byte for byte", () => {
    // Platform artwork is served from the platform namespace …
    expect(availableIconUrl("icon-home.svg")).toBe("/assets/icon-home.svg");
    expect(
      runtimeAssetUrl("https://foundation-template.provelopment.com/assets/icon-about.svg"),
    ).toBe("/assets/icon-about.svg");

    // … and artwork a declared Spoke owns is served from THAT Spoke's namespace, never from the platform
    // path that does not hold it — asserted for every namespace this context declares.
    for (const namespace of namespaces.slice(1)) {
      expect(namespace.urlBase).toMatch(/^\/spokes\/[^/]+\/assets$/);
      expect(availableIconUrl("sidebar-open.svg")).toBe(`${namespace.urlBase}/sidebar-open.svg`);
      expect(
        runtimeAssetUrl("https://foundation-template.provelopment.com/assets/sidebar-open.svg"),
      ).toBe(`${namespace.urlBase}/sidebar-open.svg`);
    }

    // A configured-but-unowned path keeps its configured pathname (direct public serving) …
    expect(runtimeAssetUrl("https://foundation-template.provelopment.com/custom/role.svg")).toBe(
      "/custom/role.svg",
    );
    // … while the same value is UNAVAILABLE as a page role, and a missing role never resolves.
    expect(
      availableBannerPath("https://foundation-template.provelopment.com/custom/role.svg"),
    ).toBeUndefined();
    expect(
      availableHeaderGraphicPath(`https://foundation-template.provelopment.com/assets/${absent}`),
    ).toBeUndefined();
  });
});
