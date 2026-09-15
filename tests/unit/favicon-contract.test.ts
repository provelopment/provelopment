import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { siteConfig } from "@/config";
import { assetPathFromUrl } from "@/config/assets";

/**
 * FAVICON CONTRACT (owner ruling, 2026-09) — the favicon is DERIVED from the
 * high-resolution branding mark and must stay an UNCROPPED, UNDISTORTED 24x24
 * rendition of it.
 *
 * REGRESSION THIS LOCK EXISTS FOR: the previous favicon kept
 * `width="24" height="24"` but narrowed the viewBox to `256 256 1536 1536` —
 * a 12.5%-per-side crop of a mark whose artwork spans x 131.3..1943.7 and
 * y 161.9..1846.0 in its own 2048-unit space. The circular emblem therefore
 * rendered with FLAT CROPPED SIDES.
 *
 * The invariants below are GEOMETRIC, not cosmetic: same viewBox as the mark,
 * identical path data, uniformly-scaled transforms, no clip/mask contract, and
 * an artwork box strictly INSIDE the canvas with transparent margin on every
 * edge. No SVG-rendering dependency is used — the bounds are computed from the
 * only path commands the mark carries.
 */

const ROOT = process.cwd();
const MARK = "assets/branding/identity/mark.svg";
const IDENTITY_FAVICON = "assets/branding/identity/favicon.svg";
const RUNTIME_FAVICON = "public/assets/favicon.svg";
const read = (relative: string) => readFileSync(path.join(ROOT, ...relative.split("/")), "utf8");

/** `<path d="...">` payloads, whitespace-normalised, document order preserved. */
const pathData = (svg: string) =>
  [...svg.matchAll(/<path[^>]*\bd="([^"]+)"/g)].map((match) => match[1].replace(/\s+/g, " ").trim());

/** The root `viewBox` as numbers. */
function viewBoxOf(svg: string): [number, number, number, number] {
  const match = /viewBox="([^"]+)"/.exec(svg);
  if (!match) throw new Error("no viewBox");
  const parts = match[1].trim().split(/[\s,]+/).map(Number);
  return [parts[0], parts[1], parts[2], parts[3]];
}

/** Composed `translate`/`scale` chain of the group wrappers preceding the artwork. */
function groupTransform(svg: string): (point: [number, number]) => [number, number] {
  const head = svg.slice(0, svg.indexOf("<path"));
  let offset: [number, number] = [0, 0];
  let scale: [number, number] = [1, 1];
  for (const [, transform] of head.matchAll(/transform="([^"]+)"/g)) {
    for (const [, name, args] of transform.matchAll(/(translate|scale)\(([^)]*)\)/g)) {
      const values = args.trim().split(/[\s,]+/).map(Number);
      if (name === "translate") offset = [offset[0] + values[0], offset[1] + (values[1] ?? 0)];
      else scale = [scale[0] * values[0], scale[1] * (values[1] ?? values[0])];
    }
  }
  return ([x, y]) => [offset[0] + x * scale[0], offset[1] + y * scale[1]];
}

/**
 * The artwork bounding box in USER space, from the mark's own path language
 * (`M m L l H h V v C c S s Q q T t A a Z z`). Curve control points bound the
 * curve, so this is a conservative outer box — exactly what a crop check needs.
 */
function artworkBounds(svg: string): { minX: number; minY: number; maxX: number; maxY: number } {
  const apply = groupTransform(svg);
  const args: Record<string, number> = {
    M: 2, m: 2, L: 2, l: 2, T: 2, t: 2, H: 1, h: 1, V: 1, v: 1,
    C: 6, c: 6, S: 4, s: 4, Q: 4, q: 4, A: 7, a: 7,
  };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const track = (x: number, y: number) => {
    const [ux, uy] = apply([x, y]);
    minX = Math.min(minX, ux);
    minY = Math.min(minY, uy);
    maxX = Math.max(maxX, ux);
    maxY = Math.max(maxY, uy);
  };
  for (const d of pathData(svg)) {
    const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
    let index = 0;
    let command = "";
    let x = 0;
    let y = 0;
    let startX = 0;
    let startY = 0;
    while (index < tokens.length) {
      if (/[A-Za-z]/.test(tokens[index])) {
        command = tokens[index];
        index += 1;
        continue;
      }
      const a = tokens.slice(index, index + args[command]).map(Number);
      index += args[command];
      const relative = command === command.toLowerCase() && command !== "";
      if (command === "M" || command === "m") {
        x = relative ? x + a[0] : a[0];
        y = relative ? y + a[1] : a[1];
        startX = x;
        startY = y;
        command = relative ? "l" : "L";
        track(x, y);
      } else if (command === "L") track((x = a[0]), (y = a[1]));
      else if (command === "l") track((x += a[0]), (y += a[1]));
      else if (command === "H") track((x = a[0]), y);
      else if (command === "h") track((x += a[0]), y);
      else if (command === "V") track(x, (y = a[0]));
      else if (command === "v") track(x, (y += a[0]));
      else if (command === "C" || command === "c") {
        const dx = command === "C" ? 0 : x;
        const dy = command === "C" ? 0 : y;
        track(dx + a[0], dy + a[1]);
        track(dx + a[2], dy + a[3]);
        track((x = dx + a[4]), (y = dy + a[5]));
      } else if (command === "S" || command === "s") {
        const dx = command === "S" ? 0 : x;
        const dy = command === "S" ? 0 : y;
        track(dx + a[0], dy + a[1]);
        track((x = dx + a[2]), (y = dy + a[3]));
      } else if (command === "Q" || command === "q") {
        const dx = command === "Q" ? 0 : x;
        const dy = command === "Q" ? 0 : y;
        track(dx + a[0], dy + a[1]);
        track((x = dx + a[2]), (y = dy + a[3]));
      } else if (command === "T" || command === "t") {
        x = command === "T" ? a[0] : x + a[0];
        y = command === "T" ? a[1] : y + a[1];
        track(x, y);
      } else if (command === "A" || command === "a") {
        x = command === "A" ? a[5] : x + a[5];
        y = command === "A" ? a[6] : y + a[6];
        track(x, y);
      } else if (command === "Z" || command === "z") {
        x = startX;
        y = startY;
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

const mark = read(MARK);
const favicon = read(IDENTITY_FAVICON);

describe("favicon contract — the source mark is the untouched authority", () => {
  it("the high-resolution mark still exists at its branding path and is a full-frame 2048 SVG", () => {
    expect(existsSync(path.join(ROOT, ...MARK.split("/")))).toBe(true);
    expect(mark).toContain("<svg");
    expect(viewBoxOf(mark)).toEqual([0, 0, 2048, 2048]);
    // The artwork is the only drawn content of the mark (no raster, no text).
    expect(mark).not.toMatch(/<image|<text|<rect|<circle/i);
  });

  it("the favicon never replaces, rescales or rewrites the mark", () => {
    const [mx, my, mw, mh] = viewBoxOf(mark);
    const [fx, fy, fw, fh] = viewBoxOf(favicon);
    // Same framing → the favicon cannot crop the mark.
    expect([fx, fy, fw, fh]).toEqual([mx, my, mw, mh]);
    // Same artwork → the favicon is the mark, not an unrelated placeholder.
    expect(pathData(favicon)).toEqual(pathData(mark));
    expect(pathData(favicon).length).toBeGreaterThan(0);
  });
});

describe("favicon contract — a 24x24 uncropped, undistorted rendition", () => {
  it("declares a 24x24 canvas whose viewBox is square (aspect ratio preserved)", () => {
    expect(/<svg\b[^>]*\bwidth="24"/.test(favicon)).toBe(true);
    expect(/<svg\b[^>]*\bheight="24"/.test(favicon)).toBe(true);
    const [, , width, height] = viewBoxOf(favicon);
    expect(width).toBe(height);
  });

  it("uses no crop/clip/mask contract and never distorts the artwork", () => {
    expect(favicon).not.toMatch(/<clipPath|<mask|clip-path=/i);
    expect(favicon).not.toMatch(/preserveAspectRatio="none"/i);
    // Every transform scales X and Y by the SAME magnitude (uniform scaling).
    for (const [, transform] of favicon.matchAll(/transform="([^"]+)"/g)) {
      for (const [, args] of transform.matchAll(/scale\(([^)]*)\)/g)) {
        const [sx, sy = sx] = args.trim().split(/[\s,]+/).map(Number);
        expect(Math.abs(Math.abs(sx) - Math.abs(sy)), `non-uniform scale in "${transform}"`).toBeLessThan(1e-9);
      }
    }
  });

  it("keeps the whole circular mark inside the canvas with transparent breathing room", () => {
    // Measured, not assumed: this is the exact check the old crop failed.
    const { minX, minY, maxX, maxY } = artworkBounds(favicon);
    const [vx, vy, vw, vh] = viewBoxOf(favicon);
    expect(minX).toBeGreaterThan(vx);
    expect(minY).toBeGreaterThan(vy);
    expect(maxX).toBeLessThan(vx + vw);
    expect(maxY).toBeLessThan(vy + vh);
    // The canvas is transparent (no opaque background rectangle).
    expect(favicon).not.toMatch(/<rect[^>]*fill="#[0-9a-fA-F]{6}"/i);
  });
});

describe("favicon contract — one live favicon, wired from configuration", () => {
  it("resolves the configured favicon to the runtime role file", () => {
    expect(assetPathFromUrl(siteConfig.assets?.favicon)).toBe("/assets/favicon.svg");
    expect(existsSync(path.join(ROOT, ...RUNTIME_FAVICON.split("/")))).toBe(true);
  });

  it("the runtime favicon is byte-identical to its branding source (one authority)", () => {
    expect(read(RUNTIME_FAVICON)).toBe(favicon);
  });

  it("no competing favicon source can take precedence", () => {
    expect(existsSync(path.join(ROOT, "src", "app", "icon.svg"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src", "app", "favicon.ico"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src", "app", "icon.png"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src", "app", "[locale]", "icon.svg"))).toBe(false);
    const layout = read("src/app/[locale]/layout.tsx");
    expect(layout).toContain("icon: assetPathFromUrl(siteConfig.assets?.favicon)");
    // Exactly ONE favicon declaration in the layout's metadata.
    expect((layout.match(/assetPathFromUrl\(siteConfig\.assets\?\.favicon\)/g) ?? []).length).toBe(1);
  });
});
