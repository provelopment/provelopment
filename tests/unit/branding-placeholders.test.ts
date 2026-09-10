import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { iconAssetAvailable } from "@/config/assets";

/**
 * P6-2A — generic branding asset-role placeholder architecture.
 *
 * This locks in the FILE/ROLE contract only (asset roles + filenames are
 * replaceable, valid, non-empty, and — for the sidebar roles — already
 * wired through the existing icon-asset resolution path). It intentionally
 * asserts NOTHING about visual content: these are placeholders the owner
 * will replace manually, one at a time (see CUSTOMIZING.md → "Generic
 * branding asset roles (P6-2A)").
 */
describe("P6-2A — generic branding asset-role placeholders", () => {
  const assetsDir = path.join(process.cwd(), "public", "assets");

  it("a placeholder file exists for every generic branding role and is non-empty", () => {
    const roles: Array<[string, string]> = [
      ["logo-header", "logo-header.svg"],
      ["logo-footer", "logo-footer.svg"],
      ["logo-title", "logo-title.jpg"],
      ["sidebar-open", "sidebar-open.svg"],
      ["sidebar-close", "sidebar-close.svg"],
      ["favicon", "favicon.svg"],
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

  it("the logo-title placeholder is a REAL JPEG (magic bytes), not a renamed SVG", () => {
    const bytes = readFileSync(path.join(assetsDir, "logo-title.jpg"));
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

  it("the new logo placeholders are NOT yet wired into any component (P6-2A is placeholders-only)", () => {
    const componentsDir = path.join(process.cwd(), "src", "components");
    const appDir = path.join(process.cwd(), "src", "app");
    const offenders: string[] = [];
    const scan = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) scan(full);
        else if (/\.(tsx?|mjs)$/.test(entry.name)) {
          const text = readFileSync(full, "utf8");
          if (/logo-header|logo-footer|logo-title/.test(text)) offenders.push(full);
        }
      }
    };
    scan(componentsDir);
    scan(appDir);
    expect(offenders, "no component/app source should reference the new logo placeholder roles yet").toEqual([]);
  });
});
