import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { FOUNDATION_UI_DEFAULTS } from "@/core/ui/defaults";
import {
  CONTENT_WIDTHS,
  CTA_ACTIONS,
  CTA_STYLES,
  DESKTOP_NAVIGATION_PATTERNS,
  MOBILE_NAVIGATION_PATTERNS,
  SHELL_VARIANTS,
  TABLET_NAVIGATION_PATTERNS,
  THEME_MODES,
  THEME_RADII,
  UI_DENSITIES,
  UI_PRESETS,
  assertResolvedUiConfigComplete,
  resolveUiConfig,
  uiPresetProfiles,
  UiConfigResolutionError,
} from "@/core/ui";
import type { ResolvedUiConfig } from "@/core/ui";

/**
 * UI-02 - Configuration Infrastructure resolution-behavior tests
 * (amended at UI-05 — default preset decision).
 *
 * These tests encode the DOCUMENTED RESOLUTION CONTRACT
 * (plan/todo-milestone-ui-02.md, amended at plan/todo-milestone-ui-05.md):
 *   1. no explicit preset -> the FOUNDATION DEFAULT PERSONALITY (Adaptive,
 *      fixed at UI-05) fills the leaves; `resolveUiConfig({}).preset` is the
 *      default personality (NOT undefined — amended at UI-05);
 *   2. overrides win over preset profiles win over Foundation defaults,
 *      deterministically and purely (personality != effective: overriding a
 *      leaf does not cancel the preset);
 *   3. all five explicit presets resolve their full profiles;
 *   4. the default preset is selected at EXACTLY ONE point (the resolver's
 *      `raw.preset ?? FOUNDATION_UI_DEFAULTS.defaultPreset`); the schema,
 *      loader, and every other module inject nothing;
 *   5. CTA stays business-neutral (enabled false, action/label undefined);
 *   6. completeness fails loudly; vocab-backed resolved leaves stay within
 *      the shipped vocabulary.
 */

describe("UI-02/UI-05 - no explicit preset -> Adaptive default personality", () => {
  it("resolveUiConfig({}) resolves the default personality (adaptive) with its full profile", () => {
    const resolved = resolveUiConfig({});
    expect(resolved.preset).toBe("adaptive");
    expect(resolved.navigation).toEqual(uiPresetProfiles.adaptive.navigation);
    expect(resolved.shell).toEqual(uiPresetProfiles.adaptive.shell);
    // Leaves the preset does NOT define fall through to Foundation defaults:
    expect(resolved.density).toBe(FOUNDATION_UI_DEFAULTS.density);
    expect(resolved.content.width).toBe(FOUNDATION_UI_DEFAULTS.content.width);
    expect(resolved.cta.enabled).toBe(false);
    expect(resolved.theme).toEqual(FOUNDATION_UI_DEFAULTS.theme);
  });

  it("explicit per-leaf overrides still win over the default personality (personality != effective)", () => {
    const resolved = resolveUiConfig({ density: "spacious" });
    expect(resolved.preset).toBe("adaptive"); // personality preserved
    expect(resolved.density).toBe("spacious"); // effective leaf overridden
    expect(resolved.shell).toEqual(uiPresetProfiles.adaptive.shell);
    expect(resolved.theme).toEqual(FOUNDATION_UI_DEFAULTS.theme);
  });
});

describe("UI-02 - all five explicit presets resolve their profiles", () => {
  it("preset-only resolves every profile leaf and preserves the explicit preset", () => {
    for (const preset of UI_PRESETS) {
      const resolved = resolveUiConfig({ preset });
      expect(resolved.preset).toBe(preset);
      const profile = uiPresetProfiles[preset];
      expect(resolved.navigation).toEqual(profile.navigation);
      expect(resolved.shell).toEqual(profile.shell);
      expect(resolved.cta.style).toBe(profile.cta.style);
    }
  });

  it("an explicit preset selection never leaks into the density/content/cta-enabled/theme leaves", () => {
    for (const preset of UI_PRESETS) {
      const resolved = resolveUiConfig({ preset });
      // Presets do NOT define these: they must fall through to the Foundation
      // defaults (deterministic; no invented values).
      expect(resolved.density).toBe("comfortable");
      expect(resolved.content.width).toBe("standard");
      expect(resolved.cta.enabled).toBe(false);
      expect(resolved.theme.mode).toBe("system");
    }
  });
});

describe("UI-02 - deterministic precedence (override > profile > Foundation)", () => {
  it("adaptive with overrides merges deterministically", () => {
    const resolved = resolveUiConfig({
      preset: "adaptive",
      navigation: { mobile: "drawer" },
      density: "compact",
    });
    expect(resolved.navigation.desktop).toBe("sidebar"); // from the adaptive profile
    expect(resolved.navigation.mobile).toBe("drawer"); // override wins
    expect(resolved.density).toBe("compact"); // override wins
    expect(resolved.shell.header).toBe("standard"); // profile and Foundation agree
  });

  it("explicit config works WITHOUT a preset (default personality fills the rest)", () => {
    const resolved = resolveUiConfig({ navigation: { desktop: "sidebar" } });
    expect(resolved.preset).toBe("adaptive"); // default personality
    expect(resolved.navigation.desktop).toBe("sidebar"); // override wins
    expect(resolved.navigation.tablet).toBe("collapsed-sidebar"); // adaptive profile fills the rest
    expect(resolved.navigation.mobile).toBe("bottom-bar"); // adaptive profile fills the rest
  });

  it("is pure and deterministic: same input twice -> deep-equal outputs; input never mutated", () => {
    const raw: Parameters<typeof resolveUiConfig>[0] = {
      preset: "classic",
      navigation: { mobile: "bottom-bar" },
    };
    const a = resolveUiConfig(raw);
    const b = resolveUiConfig(raw);
    expect(a).toEqual(b);
    expect(raw).toEqual({ preset: "classic", navigation: { mobile: "bottom-bar" } });
  });
});

describe("UI-02 - neutral CTA (D1)", () => {
  it("never invents a business action: enabled false, action/label/href undefined, style standard", () => {
    const plain = resolveUiConfig({});
    expect(plain.cta.enabled).toBe(false);
    expect(plain.cta.action).toBeUndefined();
    expect(plain.cta.label).toBeUndefined();
    expect(plain.cta.href).toBeUndefined(); // UI-07 D1: destination adopter-owned
    expect(plain.cta.style).toBe("standard");

    const presetOnly = resolveUiConfig({ preset: "focus" });
    expect(presetOnly.cta.enabled).toBe(false); // presets do not define enabled
    expect(presetOnly.cta.action).toBeUndefined();
    expect(presetOnly.cta.label).toBeUndefined();
    expect(presetOnly.cta.href).toBeUndefined();
    expect(presetOnly.cta.style).toBe("prominent"); // focus profile requests prominence
  });

  it("an explicit adopter CTA override is preserved (incl. the UI-07 href destination)", () => {
    const resolved = resolveUiConfig({
      cta: { enabled: true, action: "book", label: "Book Now", href: "/booking", style: "standard" },
    });
    expect(resolved.cta.enabled).toBe(true);
    expect(resolved.cta.action).toBe("book");
    expect(resolved.cta.label).toBe("Book Now");
    expect(resolved.cta.href).toBe("/booking");
  });
});
describe("UI-02 - completeness matrix (every leaf defined, vocab-backed leaves in vocabulary)", () => {
  const cases = [
    {},
    { preset: "classic" },
    { preset: "adaptive" },
    { preset: "focus" },
    { preset: "workspace" },
    { preset: "immersive" },
    { density: "compact", navigation: { mobile: "bottom-bar" } },
    { preset: "adaptive", cta: { enabled: true, action: "contact", style: "prominent" } },
  ];

  it("resolves every case without throwing and every leaf is defined", () => {
    for (const cfg of cases) {
      const resolved = resolveUiConfig(cfg as Parameters<typeof resolveUiConfig>[0]);
      if (typeof (cfg as { preset?: string }).preset === "string") {
        expect(resolved.preset).toBe((cfg as { preset: string }).preset);
      } else {
        expect(resolved.preset).toBe("adaptive"); // UI-05 default personality
      }
      expect(resolved.shell.header).toBeDefined();
      expect(resolved.shell.footer).toBeDefined();
      expect(resolved.navigation.desktop).toBeDefined();
      expect(resolved.navigation.tablet).toBeDefined();
      expect(resolved.navigation.mobile).toBeDefined();
      expect(resolved.density).toBeDefined();
      expect(resolved.content.width).toBeDefined();
      expect(resolved.cta.enabled).toBeDefined();
      expect(resolved.cta.style).toBeDefined();
      expect(resolved.theme.mode).toBeDefined();
      expect(resolved.theme.radius).toBeDefined();
    }
  });

  it("every vocab-backed resolved leaf is a member of its shipped vocabulary", () => {
    for (const cfg of cases) {
      const resolved = resolveUiConfig(cfg as Parameters<typeof resolveUiConfig>[0]);
      expect(SHELL_VARIANTS).toContain(resolved.shell.header);
      expect(SHELL_VARIANTS).toContain(resolved.shell.footer);
      expect(DESKTOP_NAVIGATION_PATTERNS).toContain(resolved.navigation.desktop);
      expect(TABLET_NAVIGATION_PATTERNS).toContain(resolved.navigation.tablet);
      expect(MOBILE_NAVIGATION_PATTERNS).toContain(resolved.navigation.mobile);
      expect(UI_DENSITIES).toContain(resolved.density);
      expect(CONTENT_WIDTHS).toContain(resolved.content.width);
      expect(CTA_STYLES).toContain(resolved.cta.style);
      if (resolved.cta.action !== undefined) {
        expect(CTA_ACTIONS).toContain(resolved.cta.action);
      }
      expect(THEME_MODES).toContain(resolved.theme.mode);
      expect(THEME_RADII).toContain(resolved.theme.radius);
    }
  });
});

describe("UI-02 - controlled error surface (completeness fails loudly)", () => {
  it("throws UiConfigResolutionError with the missing leaf path on a partial resolved object", () => {
    const partial: Partial<ResolvedUiConfig> = {
      shell: { header: "standard", footer: "standard", sidebar: { collapsible: false } },
    };
    expect(() => assertResolvedUiConfigComplete(partial)).toThrow(UiConfigResolutionError);
    try {
      assertResolvedUiConfigComplete(partial);
    } catch (err) {
      expect(err).toBeInstanceOf(UiConfigResolutionError);
      const error = err as UiConfigResolutionError;
      expect(error.issues.some((issue) => issue.path === "navigation.desktop")).toBe(true);
      expect(error.issues.some((issue) => issue.message.includes("missing resolved value"))).toBe(true);
    }
  });

  it("rejects a vocab-invalid resolved value (guards bad constants)", () => {
    expect(() =>
      assertResolvedUiConfigComplete({
        ...resolveUiConfig({}),
        navigation: { ...resolveUiConfig({}).navigation, desktop: "mega-menu" },
      } as unknown as Partial<ResolvedUiConfig>),
    ).toThrow(/mega-menu/);
  });
});

describe("UI-05 - the default preset is selected at exactly one point", () => {
  it("resolveUiConfig({}) resolves the adaptive default personality", () => {
    expect(resolveUiConfig({}).preset).toBe("adaptive");
    expect(resolveUiConfig({ density: "comfortable" }).preset).toBe("adaptive");
  });

  it("defaults.ts fixes defaultPreset adaptive; resolve.ts is the single selection point", () => {
    const dir = path.join(process.cwd(), "src", "core", "ui");
    const defaultsSource = readFileSync(path.join(dir, "defaults.ts"), "utf8");
    const resolveSource = readFileSync(path.join(dir, "resolve.ts"), "utf8");
    // The default personality constant lives in the Foundation defaults table.
    expect(defaultsSource).toMatch(/defaultPreset\s*:\s*"adaptive"/);
    // `raw.preset ?? FOUNDATION_UI_DEFAULTS.defaultPreset` is the ONLY place a
    // default preset enters resolution — no other fallback/selection string.
    expect(resolveSource).toContain("raw.preset ?? FOUNDATION_UI_DEFAULTS.defaultPreset");
    expect(resolveSource.match(/preset\s*=\s*raw\.preset\s*\?\?/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("no other core-ui module selects a preset (source-scan)", () => {
    const dir = path.join(process.cwd(), "src", "core", "ui");
    // The default personality is declared ONLY in defaults.ts and selected ONLY
    // in resolve.ts. (vocabulary.ts/presets.ts legitimately DOCUMENT the decision
    // in prose; the scan targets modules that must have no selection code.)
    for (const file of ["index.ts", "shell.ts"]) {
      const source = readFileSync(path.join(dir, file), "utf8");
      expect(source.includes("defaultPreset"), file).toBe(false);
    }
    const presets = readFileSync(path.join(dir, "presets.ts"), "utf8");
    expect(presets).not.toMatch(/defaultPreset\s*[:=]/);
  });
});

describe("UI-02 - profile-coverage guarantee (future additions fail loudly)", () => {
  it("a preset profile missing a leaf fails completeness (never silently resolves to undefined)", () => {
    const sansDesktop = {
      shell: { header: "standard", footer: "standard" },
      navigation: { tablet: "top-compact", mobile: "drawer" },
      density: "comfortable",
      content: { width: "standard" },
      cta: { enabled: false, style: "standard" },
      theme: { mode: "system", radius: "medium" },
    } as unknown as Partial<ResolvedUiConfig>;
    expect(() => assertResolvedUiConfigComplete(sansDesktop)).toThrow(/navigation\.desktop/);
  });
});

describe("P0-1 — the sidebar capability leaf is declarative and shared (no preset identity)", () => {
  it("the default personality (adaptive) resolves collapsible=true; non-collapsible profiles resolve false", () => {
    expect(resolveUiConfig({}).shell.sidebar.collapsible).toBe(true);
    expect(resolveUiConfig({ preset: "classic" }).shell.sidebar.collapsible).toBe(false);
    expect(resolveUiConfig({ preset: "focus" }).shell.sidebar.collapsible).toBe(false);
    expect(resolveUiConfig({ preset: "workspace" }).shell.sidebar.collapsible).toBe(true);
    expect(resolveUiConfig({ preset: "immersive" }).shell.sidebar.collapsible).toBe(false);
  });

  it("an explicit override wins over the profile (same capability, configured per composition)", () => {
    const off = resolveUiConfig({ preset: "adaptive", shell: { sidebar: { collapsible: false } } });
    expect(off.preset).toBe("adaptive"); // personality preserved
    expect(off.shell.sidebar.collapsible).toBe(false); // effective leaf overridden
    const on = resolveUiConfig({ preset: "classic", shell: { sidebar: { collapsible: true } } });
    expect(on.preset).toBe("classic");
    expect(on.shell.sidebar.collapsible).toBe(true);
  });

  it("a custom (non-preset) configuration expresses the same sidebar capability", () => {
    const custom = resolveUiConfig({
      navigation: { desktop: "sidebar", tablet: "collapsed-sidebar", mobile: "drawer" },
      shell: { sidebar: { collapsible: true } },
      cta: { enabled: true, action: "book", label: "Book Now", style: "standard" },
    });
    expect(custom.shell.sidebar.collapsible).toBe(true);
    expect(custom.navigation.desktop).toBe("sidebar");
    // No preset was selected; the leaves ARE the composition.
    expect(custom.preset).toBe("adaptive"); // personality only — effective = custom
  });

  it("completeness requires the sidebar leaf (a missing value fails loudly)", () => {
    const sansSidebar = {
      ...resolveUiConfig({}),
      shell: { header: "standard", footer: "standard" },
    } as unknown as Partial<ResolvedUiConfig>;
    expect(() => assertResolvedUiConfigComplete(sansSidebar)).toThrow(/shell\.sidebar\.collapsible/);
  });
});
