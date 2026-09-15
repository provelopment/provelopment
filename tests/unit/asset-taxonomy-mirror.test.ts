import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { MIRRORED, MIRRORED_DIRECTORIES, RUNTIME_ONLY, buildPlan, checkMirrors } from "../../scripts/sync-runtime-assets.mjs";

/**
 * ASSET LIBRARY TAXONOMY + RUNTIME MIRROR (owner-directed, 2026-09).
 *
 * The Foundation has FOUR source asset categories with distinct ownership, and
 * ONE deterministic relationship to the runtime delivery directory:
 *
 *   assets/branding/        deployment/business-specific artwork (Provelopment
 *                           Foundation marks, logos, page graphics)
 *   assets/icon-library/    reusable, NON-business-specific generic icons — ALL
 *                           retained, used or not (the template's icon store)
 *   assets/placeholders/    blank/generic defaults for a fresh installation
 *   assets/platform-marks/  royalty-free platform/social-service marks
 *   public/assets/**        BYTE-IDENTICAL derivative of the above; never a
 *                           second, independently maintained authority
 *
 * This suite is the enforcement point for that model: it fails if the two trees
 * drift, if an undeclared asset library appears under `public/assets/`, if the
 * generic icons are pruned, or if a category boundary is crossed.
 */

const ROOT = process.cwd();
const dir = (...segments: string[]) => path.join(ROOT, "assets", ...segments);
const names = (...segments: string[]) =>
  readdirSync(dir(...segments), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
const readSource = (...segments: string[]) => readFileSync(dir(...segments), "utf8");
const readRuntime = (file: string) => readFileSync(path.join(ROOT, "public", "assets", file), "utf8");

describe("asset taxonomy — the four source categories exist and stay distinct", () => {
  it("carries one directory per ownership category", () => {
    const subdirectories = (category: string) =>
      readdirSync(dir(category), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    // Each category is populated either with role files or with its own
    // sub-structure (branding groups identity/logos/page-graphics).
    expect(subdirectories("branding")).toEqual(["identity", "logos", "page-graphics"]);
    expect(subdirectories("icon-library")).toEqual(["icons", "licensing"]);
    expect(names("placeholders").length).toBeGreaterThan(0);
    expect(names("platform-marks").length).toBeGreaterThan(0);
  });

  it("keeps the deployment's branding artwork in assets/branding/", () => {
    expect(names("branding", "identity")).toContain("mark.svg");
    expect(names("branding", "identity")).toContain("favicon.svg");
    expect(names("branding", "logos").length).toBeGreaterThanOrEqual(8);
    for (const graphic of ["background-all.svg", "status-graphic.svg", "header-graphic.svg", "footer-graphic.svg"]) {
      expect(names("branding", "page-graphics")).toContain(graphic);
    }
    // Business branding never holds generic library icons or blank placeholders.
    const branding = [...names("branding"), ...names("branding", "identity"), ...names("branding", "logos")];
    expect(branding.filter((name) => /^icon-/.test(name))).toEqual([]);
    expect(branding.filter((name) => /placeholder/i.test(name))).toEqual([]);
  });

  it("keeps ALL generic reusable icons in assets/icon-library/ (used or unused)", () => {
    const icons = names("icon-library", "icons").filter((name) => name.endsWith(".svg"));
    expect(icons.length).toBeGreaterThanOrEqual(80);
    expect(icons.every((name) => /^icon-[a-z0-9-]+\.svg$/.test(name))).toBe(true);
    // Explicit retention of icons the current navigation does NOT use — they are
    // the template's reusable store and must never be pruned for being unused.
    const UNUSED_BY_NAVIGATION = ["icon-rooms.svg", "icon-courses.svg", "icon-donate.svg", "icon-volunteer.svg", "icon-wellness.svg"];
    for (const unused of UNUSED_BY_NAVIGATION) {
      expect(icons, `${unused} must be retained even though no configured page uses it`).toContain(unused);
    }
    // Licensing provenance lives with the library, not in the runtime directory.
    expect(names("icon-library", "licensing").length).toBeGreaterThan(0);
  });

  it("keeps platform/social marks OUT of the generic icon library and vice versa", () => {
    const marks = names("platform-marks");
    expect(marks.length).toBe(7);
    for (const mark of marks) {
      expect(mark, `${mark} must not use the generic icon namespace`).not.toMatch(/^icon-/);
    }
    const icons = names("icon-library", "icons");
    for (const platform of ["whatsapp", "telegram", "messenger", "facebook", "instagram", "linkedin", "github"]) {
      expect(icons.some((name) => name.includes(platform)), platform).toBe(false);
    }
  });

  it("keeps placeholders blank and unbranded", () => {
    const placeholders = names("placeholders");
    for (const name of placeholders) {
      if (!name.endsWith(".svg")) continue;
      const svg = readSource("placeholders", name);
      expect(svg, `${name} must be valid SVG`).toContain("<svg");
      expect(svg).toContain("</svg>");
      // No deployment branding colours and no opaque full-canvas background.
      expect(svg, `${name} must carry no brand colour`).not.toMatch(/#4F7CAC/i);
      expect(svg, `${name} must stay transparent`).not.toMatch(/<rect[^>]*width="100%"[^>]*fill="#[0-9a-fA-F]{6}"/i);
    }
    // The decorative header/footer defaults are genuinely EMPTY graphics.
    for (const blank of ["header-graphic.svg", "footer-graphic.svg"]) {
      const svg = readSource("placeholders", blank);
      expect(svg, `${blank} must draw nothing`).not.toMatch(/<(path|rect|circle|g|image)\b/);
      expect(svg).toMatch(/viewBox="[^"]+"/);
      expect(statSync(dir("placeholders", blank)).size).toBeLessThan(1024);
    }
  });
});

describe("runtime mirror — one deterministic source → derivative relationship", () => {
  it("declares a source for every runtime role the template serves", () => {
    expect(MIRRORED.length).toBeGreaterThanOrEqual(10);
    expect(MIRRORED_DIRECTORIES.map((entry) => entry.from)).toEqual([
      "assets/icon-library/icons",
      "assets/platform-marks",
    ]);
    // Every explicitly mirrored role file carries a human explanation.
    for (const row of [...MIRRORED, ...MIRRORED_DIRECTORIES]) expect(row.note.length).toBeGreaterThan(0);
  });

  it("ships every runtime file byte-identical to its declared source", () => {
    const report = checkMirrors();
    expect(report.missingSources, "declared sources must exist").toEqual([]);
    expect(report.created, "runtime copies must be present").toEqual([]);
    expect(report.updated, "runtime copies must not drift from their sources").toEqual([]);
    expect(report.current.length).toBe(buildPlan().length);
  });

  it("allows no undeclared asset library under public/assets/", () => {
    // Anything without a declared source must be justified in RUNTIME_ONLY —
    // this is what prevents a second, uncontrolled asset tree from appearing.
    const report = checkMirrors();
    expect(report.unexpected).toEqual([]);
    for (const entry of RUNTIME_ONLY) expect(entry.note.length).toBeGreaterThan(0);
  });

  it("mirrors the whole icon library, so every generic icon is runtime-available", () => {
    const library = names("icon-library", "icons").filter((name) => name.endsWith(".svg"));
    const planned = new Set(buildPlan().map((row) => row.to));
    for (const icon of library) expect(planned.has(icon), `${icon} must be mirrored`).toBe(true);
  });

  it("documents the source of truth in the shipped placeholder files themselves", () => {
    for (const role of ["header-graphic.svg", "footer-graphic.svg"]) {
      expect(readRuntime(role)).toContain(`assets/placeholders/${role}`);
      expect(readRuntime(role)).toContain("scripts/sync-runtime-assets.mjs");
    }
    // No runtime file claims to be brand authority.
    expect(readRuntime("header-graphic.svg")).toMatch(/NOT BRAND AUTHORITY/);
  });
});
