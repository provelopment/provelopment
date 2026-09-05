import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const globalsPath = path.join(process.cwd(), "src", "app", "globals.css");
const globals = readFileSync(globalsPath, "utf8");

/**
 * Extracts the `--token: #hex;` declarations from one scheme block of
 * globals.css. Tests the ACTUAL emitted values, not mere variable presence.
 */
function tokenBlock(scheme: "light" | "dark"): Readonly<Record<string, string>> {
  const from =
    scheme === "dark"
      ? globals.indexOf("@media (prefers-color-scheme: dark)")
      : 0;
  const rootStart = globals.indexOf(":root", from);
  const blockStart = globals.indexOf("{", rootStart);
  const blockEnd = globals.indexOf("}", blockStart);
  const block = globals.slice(blockStart + 1, blockEnd);

  const tokens: Record<string, string> = {};
  for (const entry of block.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    tokens[entry[1]] = entry[2];
  }
  return tokens;
}

function rgb(hex: string): { r: number; g: number; b: number } {
  let value = hex.replace("#", "");
  if (value.length === 3) {
    value = value
      .split("")
      .map((channel) => channel + channel)
      .join("");
  }
  const n = parseInt(value, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const linear = (channel: number) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrastRatio(a: string, b: string): number {
  const la = luminance(rgb(a));
  const lb = luminance(rgb(b));
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The complete public token API. Each name is a stable downstream surface
 * (CUSTOMIZING.md §3) and MUST exist in BOTH schemes.
 */
const REQUIRED_TOKENS = [
  "--background",
  "--foreground",
  "--muted",
  "--muted-foreground",
  "--card",
  "--card-foreground",
  "--border",
  "--input",
  "--accent",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--success",
  "--destructive",
  "--destructive-foreground",
  "--ring",
] as const;

/**
 * Readability pairs that MUST meet WCAG 2.1 AA contrast in both schemes
 * (4.5:1 normal text; the pairs below are all normal-size surface/text uses).
 */
const CONTRAST_PAIRS: ReadonlyArray<{ fg: string; bg: string }> = [
  { fg: "--foreground", bg: "--background" },
  { fg: "--muted-foreground", bg: "--background" },
  { fg: "--muted-foreground", bg: "--muted" },
  { fg: "--muted-foreground", bg: "--card" },
  { fg: "--card-foreground", bg: "--card" },
  { fg: "--primary-foreground", bg: "--primary" },
  { fg: "--secondary-foreground", bg: "--secondary" },
  { fg: "--destructive-foreground", bg: "--destructive" },
  { fg: "--success", bg: "--background" },
  { fg: "--primary", bg: "--background" },
];

describe("Phase D — design tokens (src/app/globals.css)", () => {
  const light = tokenBlock("light");
  const dark = tokenBlock("dark");

  it("preserves the legacy seven token names unchanged (backward compatibility)", () => {
    for (const name of [
      "--background",
      "--foreground",
      "--muted-foreground",
      "--border",
      "--accent",
      "--primary",
      "--primary-foreground",
    ]) {
      expect(light[name], `light ${name}`).toBeDefined();
      expect(dark[name], `dark ${name}`).toBeDefined();
    }
  });

  it("declares every public token in BOTH light and dark schemes", () => {
    for (const name of REQUIRED_TOKENS) {
      expect(light[name], `light ${name}`).toMatch(/^#[0-9a-fA-F]{3,8}$/);
      expect(dark[name], `dark ${name}`).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    }
  });

  it("sets color-scheme in both schemes (native controls match the theme)", () => {
    expect(globals).toMatch(/:root\s*\{[^}]*color-scheme:\s*light/);
    expect(globals).toMatch(
      /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{[^}]*color-scheme:\s*dark/,
    );
  });

  it("meets WCAG AA contrast (>= 4.5:1) for every documented pair in LIGHT mode", () => {
    for (const { fg, bg } of CONTRAST_PAIRS) {
      const ratio = contrastRatio(light[fg], light[bg]);
      expect(
        ratio,
        `light ${fg} on ${bg} = ${ratio.toFixed(2)}:1 (need >= 4.5)`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("meets WCAG AA contrast (>= 4.5:1) for every documented pair in DARK mode", () => {
    for (const { fg, bg } of CONTRAST_PAIRS) {
      const ratio = contrastRatio(dark[fg], dark[bg]);
      expect(
        ratio,
        `dark ${fg} on ${bg} = ${ratio.toFixed(2)}:1 (need >= 4.5)`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("maps every semantic color token into @theme inline utilities", () => {
    const names = ["background", "foreground", "muted", "muted-foreground", "card",
      "card-foreground", "border", "input", "accent", "primary", "primary-foreground",
      "secondary", "secondary-foreground", "success", "destructive",
      "destructive-foreground", "ring"];
    for (const name of names) {
      expect(globals, `--color-${name}`).toContain(`--color-${name}: var(--${name});`);
    }
  });

  it("shares a single focus ring contract and does not ship manual theme JS", () => {
    // One global :focus-visible rule using the semantic ring token; the theme
    // is CSS/system-only (no class toggle, no data-theme, no client script).
    expect(globals).toMatch(/:focus-visible\s*\{[^}]*var\(--ring\)/);
    expect(globals).not.toContain("data-theme");
    expect(globals).not.toContain("localStorage");
    expect(globals).not.toContain("matchMedia");
  });

  it("the focus-visible ring is the SINGLE source (no duplicate rule + no focus removal)", () => {
    // P1-3 — the visible focus-ring contract is one global rule driven by the
    // `--ring` token. Both directions of drift are banned:
    //  - a second `:focus-visible { outline: ... }` block would create a
    //    competing/overridden ring (duplication → inconsistency);
    //  - any `outline-none` in CSS/TSX would remove the indicator for keyboard
    //    users (focus must never be stripped cosmetically).
    const focusVisibleBlocks = globals.match(/:focus-visible\s*\{/g) ?? [];
    expect(focusVisibleBlocks.length).toBeGreaterThanOrEqual(1);
    expect(
      focusVisibleBlocks.length,
      `expected exactly one :focus-visible block in globals.css; found ${focusVisibleBlocks.length}`,
    ).toBe(1);
    expect(globals, "globals.css must not remove the focus indicator").not.toMatch(/outline-none\s*[;{]/);

    // No TSX component may remove the focus indicator (e.g. `outline-none`).
    const srcRoot = path.join(process.cwd(), "src");
    const tsxCandidates: string[] = [];
    const visit = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) visit(full);
        else if (entry.name.endsWith(".tsx")) tsxCandidates.push(full);
      }
    };
    visit(srcRoot);
    for (const file of tsxCandidates) {
      const source = readFileSync(file, "utf8");
      expect(source, `${path.relative(process.cwd(), file)} must not remove the keyboard focus indicator`).not.toContain("outline-none");
    }
  });
});