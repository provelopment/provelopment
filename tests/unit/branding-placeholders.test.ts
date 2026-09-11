import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { iconAssetAvailable } from "@/config/assets";

/**
 * P6-2A/P6-2C/P6-2D — generic branding asset-role architecture.
 *
 * Locks in the FILE/ROLE contract (asset roles + filenames are replaceable,
 * valid, non-empty, and — for the sidebar roles — already wired through the
 * existing icon-asset resolution path) AND the config-driven composition
 * invariant added at P6-2D: components consume the generic roles ONLY
 * through `siteConfig.assets?.*`, never a hard-coded Provelopment-specific
 * filename (see CUSTOMIZING.md → "Generic branding asset roles").
 */
describe("P6-2A/P6-2D — generic branding asset-role architecture", () => {
  const assetsDir = path.join(process.cwd(), "public", "assets");

  it("a placeholder file exists for every generic branding role and is non-empty", () => {
    const roles: Array<[string, string]> = [
      ["logo-header", "logo-header.svg"],
      ["logo-footer", "logo-footer.svg"],
      ["banner-home", "banner-home.jpg"],
      ["sidebar-open", "sidebar-open.svg"],
      ["sidebar-close", "sidebar-close.svg"],
      ["favicon", "favicon.svg"],
      ["sidebar-default-icon-open", "sidebar-default-icon-open.svg"],
      ["sidebar-default-icon-closed", "sidebar-default-icon-closed.svg"],
    ];
    for (const [role, file] of roles) {
      const full = path.join(assetsDir, file);
      expect(existsSync(full), `${role} → ${file} must exist under public/assets/`).toBe(true);
      expect(statSync(full).size, `${role} → ${file} must not be empty`).toBeGreaterThan(0);
    }
  });

  it("the SVG placeholders are syntactically valid SVG documents", () => {
    for (const file of ["logo-header.svg", "logo-footer.svg", "favicon.svg"]) {
      const text = readFileSync(path.join(assetsDir, file), "utf8");
      expect(text).toContain("<svg");
      expect(text).toContain("</svg>");
    }
  });

  it("the banner-home placeholder is a REAL JPEG (magic bytes), not a renamed SVG", () => {
    const bytes = readFileSync(path.join(assetsDir, "banner-home.jpg"));
    // JPEG files begin with the SOI marker 0xFFD8 followed by an APP/marker 0xFF.
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
    expect(bytes[2]).toBe(0xff);
  });

  it("the sidebar roles were already generic and remain resolvable through the existing icon-asset contract", () => {
    // These two roles predate P6-2A (already generic filenames, already wired
    // via DEFAULT_SIDEBAR_OPEN_ICON/DEFAULT_SIDEBAR_CLOSE_ICON) — P6-2A adds
    // no new code path for them, only documents the existing one.
    expect(iconAssetAvailable("sidebar-open.svg")).toBe(true);
    expect(iconAssetAvailable("sidebar-close.svg")).toBe(true);
  });

  it("P6-3B — the banner + logo-footer roles are wired through site.assets.*, never a hard-coded filename", () => {
    // P6-2A shipped these as placeholders-only; P6-2D/P6-3B compose them into
    // SiteFooter / PageBanner. The invariant that must hold FOREVER is not
    // "never referenced" but "never a hard-coded Provelopment-specific
    // filename" — every consumer must read the generic role through
    // `siteConfig.assets?.banners`/`logoFooter` (config-driven), never the
    // literal string baked into component source.
    const pageBanner = readFileSync(
      path.join(process.cwd(), "src", "components", "site", "page-banner.tsx"),
      "utf8",
    );
    // The banner map is resolved on the server and passed in as a prop — the
    // component itself never hard-codes a banner filename.
    expect(pageBanner).toContain("banners");

    const siteFooter = readFileSync(
      path.join(process.cwd(), "src", "components", "site", "site-footer.tsx"),
      "utf8",
    );
    expect(siteFooter).toContain("siteConfig.assets?.logoFooter");
    expect(siteFooter).not.toMatch(/["'`]logo-footer\.svg["'`]/);

    // No OTHER component/app source may hard-code the generic role
    // filenames as literal string values (the sanctioned consumers above are
    // exhaustive; doc-comment mentions elsewhere are fine).
    const componentsDir = path.join(process.cwd(), "src", "components");
    const appDir = path.join(process.cwd(), "src", "app");
    const sanctioned = new Set([
      path.join("components", "site", "site-footer.tsx"),
    ]);
    const literalPattern = /["'`](logo-header\.svg|logo-footer\.svg|banner-home\.jpg)["'`]/;
    const offenders: string[] = [];
    const scan = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) scan(full);
        else if (/\.(tsx?|mjs)$/.test(entry.name)) {
          const relative = path.relative(process.cwd(), full).replace(/^src[\\/]/, "");
          if (sanctioned.has(relative)) continue;
          const text = readFileSync(full, "utf8");
          if (literalPattern.test(text)) offenders.push(full);
        }
      }
    };
    scan(componentsDir);
    scan(appDir);
    expect(offenders, "no OTHER component/app source may hard-code the generic logo/banner role filenames as a literal").toEqual([]);
  });
});
