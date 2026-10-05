import { describe, expect, it } from "vitest";

import {
  assertConfiguredIconAssetsExist,
  assetPathFromUrl,
  availableIconName,
  iconAssetAvailable,
  type IconConfigSource,
} from "@/config/assets";
import { siteConfig } from "@/config";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * The icon names THIS installation publishes in its own platform namespace.
 *
 * DERIVED, never listed (FOUNDATION-MULTISITE-M21 §10): the contract is "every icon the installation
 * ships is available to the renderer", not "this repository happens to ship these two names". A
 * deployment that replaces or extends its icon library therefore keeps this suite meaningful.
 */
function publishedIconNames(): string[] {
  const platformAssets = path.join(process.cwd(), "public", "assets");
  if (!existsSync(platformAssets)) return [];
  return readdirSync(platformAssets)
    .filter((name) => /^icon-.+\.svg$/i.test(name))
    .sort();
}

/**
 * P6-1 — the icon-asset availability contract (framework layer):
 *  - a configured icon leaf must be backed by a real `public/assets/` file —
 *    otherwise the configuration FAILS LOUDLY at build time (P5-5A invalid →
 *    loud) instead of rendering a broken-image placeholder;
 *  - `""` / absent leaves are DELIBERATE absence and never fail;
 *  - `availableIconName` (the render boundary projection) returns "" when the
 *    asset is unavailable, so components are never handed a name that could
 *    produce a broken `<img>`.
 */
describe("P6-1 — configured icon assets", () => {
  it("the shipped PLATFORM icons are real files under public/assets", () => {
    // The icon LIBRARY is platform/shared artwork (S3E1C), so it is installed into the platform namespace
    // of EVERY installation. WHICH names exist is the installation's own business: they are read from the
    // namespace it publishes, so replacing the library never invalidates this check (M21 §10).
    const icons = publishedIconNames();
    expect(icons.length, "the installation publishes an icon library").toBeGreaterThan(0);
    for (const icon of icons) expect(iconAssetAvailable(icon), icon).toBe(true);
  });

  it("availableIconName preserves missing/empty verbatim and neutralizes unavailable names (never a broken image)", () => {
    const [published] = publishedIconNames();
    expect(published, "the installation publishes an icon library").toBeDefined();
    expect(availableIconName(published)).toBe(published);
    expect(availableIconName("definitely-missing-icon.svg")).toBe("");
    expect(availableIconName("")).toBe("");
    expect(availableIconName(undefined)).toBeUndefined();
  });

  it("a config with ONLY existing/empty/absent icon leaves validates", () => {
    const [open, close] = publishedIconNames();
    expect(open, "the installation publishes an icon library").toBeDefined();
    expect(() =>
      assertConfiguredIconAssetsExist(minimalConfigWithIcons({ open, close })),
    ).not.toThrow();
    expect(() => assertConfiguredIconAssetsExist(minimalConfigWithIcons({}))).not.toThrow();
    expect(() =>
      assertConfiguredIconAssetsExist(minimalConfigWithIcons({ open: "", close, cta: "" })),
    ).not.toThrow();
  });

  it("a configured icon without a backing file FAILS LOUDLY, naming the exact leaf", () => {
    const config = minimalConfigWithIcons({ open: "nope-icon.svg" });
    expect(() => assertConfiguredIconAssetsExist(config)).toThrow(/nope-icon\.svg/);
    expect(() => assertConfiguredIconAssetsExist(config)).toThrow(/ui\.navigation\.sidebar\.open\.icon/);
  });

  it("navigation[] item icons are also validated", () => {
    const config = minimalConfigWithIcons({}, { icon: "missing-item-icon.svg" });
    expect(() => assertConfiguredIconAssetsExist(config)).toThrow(/navigation\[0\]\.icon/);
  });
});

interface IconOverrides {
  readonly open?: string;
  readonly close?: string;
  readonly cta?: string;
}

function minimalConfigWithIcons(
  icons: IconOverrides,
  navItem?: { readonly icon?: string; readonly label?: string; readonly href?: string },
): IconConfigSource {
  return {
    ui: {
      navigation: {
        sidebar: {
          open: { icon: icons.open },
          close: { icon: icons.close },
        },
      },
      cta: { icon: icons.cta },
    },
    navigation: [
      navItem ?? { label: "Home", href: "/" },
    ],
  };
}

/**
 * P6-2D — `assetPathFromUrl` behavior (same-origin rendering of configured
 * absolute asset URLs).
 *
 * `site.assets.*` leaves are FS-4 ABSOLUTE URLs (validated against `site.url`).
 * They are correct for canonical/JSON-LD/OpenGraph, but a rendered `<img src>`
 * fetches the literal value — so when `site.url` is a placeholder or the
 * deployment is previewed under a different host, the absolute URL would 404.
 * This helper re-derives the pathname so the image always fetches from the
 * CURRENT origin. These tests assert BEHAVIOR, not source text.
 */
describe("P6-2D — assetPathFromUrl", () => {
  it("passes through the deliberate-absence values verbatim", () => {
    expect(assetPathFromUrl(undefined)).toBeUndefined();
    expect(assetPathFromUrl("")).toBe("");
  });

  it("reduces an absolute asset URL to its same-origin pathname", () => {
    expect(assetPathFromUrl("https://www.example.com/assets/logo-title.jpg")).toBe(
      "/assets/logo-title.jpg",
    );
    expect(assetPathFromUrl("https://foundation.provelopment.com/assets/logo-footer.svg")).toBe(
      "/assets/logo-footer.svg",
    );
  });

  it("is decoupled from the configured site.url host (placeholder/mismatch still resolves)", () => {
    // The same pathname is derived regardless of which host names the asset —
    // this is the whole point: an `<img src>` must not depend on `site.url`.
    const a = assetPathFromUrl("https://www.example.com/assets/favicon.svg");
    const b = assetPathFromUrl("https://localhost:3000/assets/favicon.svg");
    expect(a).toBe("/assets/favicon.svg");
    expect(b).toBe("/assets/favicon.svg");
    expect(a).toBe(b);
  });

  it("strips query and hash from an absolute URL (only the path is fetched)", () => {
    expect(assetPathFromUrl("https://cdn.example.com/assets/logo-header.svg?v=2#mark")).toBe(
      "/assets/logo-header.svg",
    );
  });

  it("preserves a nested path component (any origin/CDN, any sub-path)", () => {
    expect(assetPathFromUrl("https://cdn.example.com/brand/runtime/assets/logo.svg")).toBe(
      "/brand/runtime/assets/logo.svg",
    );
  });

  it("returns a non-absolute/relative input verbatim (URL parse failure is safe)", () => {
    // A bare path has no base, so `new URL` throws — the helper must not crash
    // and must hand back exactly what it was given.
    expect(assetPathFromUrl("/assets/logo.svg")).toBe("/assets/logo.svg");
    expect(assetPathFromUrl("not a url")).toBe("not a url");
  });

  it("configures exactly the identity roles the reference deployment owns assets for", () => {
    // FS1: a generic template ships `assets: {}` and every role resolves to its
    // shipped default. R1A: the public repository is ITS OWN reference deployment
    // (live at foundation-template.provelopment.com), so it configures the ONE role
    // it owns an asset for — the favicon — which is what makes a browser's implicit
    // `/favicon.ico` probe resolve instead of 404ing. Every other role stays
    // unconfigured, and the configured URL still projects to its runtime path.
    expect(assetPathFromUrl(siteConfig.assets?.favicon)).toBe("/assets/favicon.svg");
    expect(siteConfig.assets?.logo).toBeUndefined();
    expect(siteConfig.assets?.logoFooter).toBeUndefined();
    expect(siteConfig.assets?.ogImage).toBeUndefined();
    expect(siteConfig.assets?.banners).toBeUndefined();
  });
});