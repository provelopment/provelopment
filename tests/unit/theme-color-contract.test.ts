import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * FOUNDATION THEME COLOUR — the SINGLE-SOURCE contract (owner-directed, 2026-09).
 *
 * The owner requirement is an architectural invariant, not a colour value:
 *
 *   ONE configured Foundation theme colour
 *               ↓
 *        semantic theme token (--ui-brand-accent)
 *           ↙            ↘
 *    wordmark          UI highlights
 *
 * Changing that ONE value must re-colour the Foundation wordmark AND every
 * application-controlled selection/focus highlight, so a future deployment owner
 * cannot leave the two out of step. Crimson `#C5161D` is the provelopment.com
 * expression (brand-system governance maps `Provelopment Foundation ->
 * Foundation Blue`), so it must not appear in a Foundation branding/emphasis
 * role — while `--destructive` stays red for errors/danger.
 *
 * These assertions test the RELATIONSHIP, not one exact hex string: the value is
 * free to change, and when it does, both consumers must follow.
 */
const ROOT = process.cwd();
const read = (...segments: string[]) => readFileSync(path.join(ROOT, ...segments), "utf8");
const globals = read("src", "app", "globals.css");

/** The two scheme scopes of globals.css, in declaration order. */
function schemes(): { light: string; dark: string } {
  const darkAt = globals.indexOf("@media (prefers-color-scheme: dark)");
  expect(darkAt, "globals.css must declare a dark scheme block").toBeGreaterThan(0);
  return { light: globals.slice(0, darkAt), dark: globals.slice(darkAt) };
}

const accentValue = (block: string) =>
  /--ui-brand-accent\s*:\s*(#[0-9a-fA-F]{6})\s*;/.exec(block)?.[1] ?? null;


describe("Foundation theme colour — ONE authoritative source", () => {
  it("declares the theme colour exactly ONCE per scheme (one place to change)", () => {
    const { light, dark } = schemes();
    const count = (block: string) => (block.match(/--ui-brand-accent\s*:/g) ?? []).length;
    expect(count(light), "light scheme").toBe(1);
    expect(count(dark), "dark scheme").toBe(1);
    expect(accentValue(light)).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(accentValue(dark)).toMatch(/^#[0-9a-fA-F]{6}$/);
    // The dark canvas needs a lifted tint, so the two schemes may differ — but
    // they must not collapse to one shared hex by accident (that is how
    // inaccessible dark-mode brand text appears).
    expect(accentValue(light)).not.toBe(accentValue(dark));
  });

  it("makes BOTH consumers DERIVE from it (wordmark + UI highlights)", () => {
    const { light, dark } = schemes();
    for (const [scheme, block] of Object.entries({ light, dark })) {
      // The brand-text token and the focus/selection token are INDIRECTIONS, never
      // copies — that is what makes a one-line re-brand propagate. A literal here
      // would silently freeze one of the two roles.
      expect(block, `${scheme} --primary`).toMatch(/--primary:\s*var\(--ui-brand-accent\)\s*;/);
      expect(block, `${scheme} --ring`).toMatch(/--ring:\s*var\(--ui-brand-accent\)\s*;/);
    }
  });

  it("stores the theme value in exactly one DECLARATION (no copy a one-line change would miss)", () => {
    const { light } = schemes();
    const accent = accentValue(light) as string;
    const declarations = globals.match(new RegExp(`--[\\w-]+\\s*:\\s*${accent}\\s*;`, "gi")) ?? [];
    expect(
      declarations,
      `the Foundation theme value ${accent} must appear as exactly one declaration; found ${declarations.length}`,
    ).toHaveLength(1);
  });

  it("keeps the theme colour out of the semantic STATUS colours (errors stay red)", () => {
    const { light, dark } = schemes();
    expect(light).toMatch(/--destructive:\s*#dc2626\s*;/);
    expect(dark).toMatch(/--destructive:\s*#[0-9a-fA-F]{6}\s*;/);
    expect(accentValue(light)).not.toBe("#dc2626");
    // Danger/destructive is a DISTINCT role from brand emphasis.
    expect(light).not.toMatch(/--destructive:\s*var\(--ui-brand-accent\)/);
  });

  it("carries NO Provelopment Crimson in a Foundation branding/emphasis role", () => {
    // No token DECLARATION may use the crimson brand hexes. Comments may name
    // them (the governance mapping is worth documenting) — declarations may not.
    const crimsonDeclarations = globals.match(/--[\w-]+\s*:\s*#(c5161d|a11217)\s*;/gi) ?? [];
    expect(crimsonDeclarations).toEqual([]);
  });
});

describe("Foundation theme colour — the visible wordmark consumes it", () => {
  const home = read("src", "app", "[locale]", "page.tsx");

  it("renders the configured Foundation name through the brand text token", () => {
    // The live defect was this exact element: the Foundation name rendered in
    // crimson. It resolves through `text-primary` → `var(--ui-brand-accent)`.
    expect(home).toMatch(/text-primary[^>]*>\s*\{siteConfig\.name\}/);
  });

  it("does not carry its own brand colour (no crimson, no token copy)", () => {
    expect(home).not.toMatch(/#c5161d|#a11217/i);
    expect(home).not.toMatch(/--ui-brand-accent\s*:/);
  });
});

describe("Foundation theme colour — the selector controls consume it", () => {
  const SWITCHERS: ReadonlyArray<readonly [string, string]> = [
    ["preset-switcher.tsx", "preset"],
    ["location-switcher.tsx", "location"],
    ["language-switcher.tsx", "language"],
  ];

  it("paints application-controlled selection emphasis from the theme token", () => {
    expect(globals).toMatch(/select\[data-selector\]\s*\{[^}]*accent-color:\s*var\(--ui-brand-accent\)/);
    expect(globals).toMatch(
      /select\[data-selector\]:hover[\s\S]{0,160}?border-color:\s*var\(--ui-brand-accent\)/,
    );
    expect(globals).toMatch(
      /select\[data-selector\]:focus-visible[\s\S]{0,160}?border-color:\s*var\(--ui-brand-accent\)/,
    );
  });

  it("keeps all three selectors on the shared hook, with no per-control colour", () => {
    for (const [file, value] of SWITCHERS) {
      const source = read("src", "components", "site", file);
      expect(source, `${file} must opt into the shared hook`).toContain(`data-selector="${value}"`);
      expect(source, `${file} must not hardcode crimson`).not.toMatch(/#c5161d|#a11217/i);
      expect(source, `${file} must not declare its own theme token`).not.toMatch(/--ui-brand-accent\s*:/);
    }
  });
});
