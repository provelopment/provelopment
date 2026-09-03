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
 * UI-02 - Configuration Infrastructure resolution-behavior tests.
 *
 * These tests encode the DOCUMENTED RESOLUTION CONTRACT
 * (plan/todo-milestone-ui-02.md):
 *   1. no preset -> Foundation defaults; preset stays undefined;
 *   2. overrides win over preset profiles win over Foundation defaults,
 *      deterministically and purely;
 *   3. all five explicit presets resolve their full profiles;
 *   4. no preset is ever injected (schema/loader/constants keep
 *      `resolveUiConfig({})` at `preset === undefined`);
 *   5. CTA stays business-neutral (enabled false, action/label undefined);
 *   6. completeness fails loudly; vocab-backed resolved leaves stay within
 *      the shipped vocabulary;
 *   7. the resolution sources contain no adaptive fallback (source-scan).
 */

describe("UI-02 - no preset -> Foundation defaults", () => {
  it("resolveUiConfig({}) yields preset undefined and every leaf from the Foundation defaults", () => {
    const resolved = resolveUiConfig({});
    expect(resolved.preset).toBeUndefined();
    expect(resolved).toEqual({
      preset: undefined,
      shell: FOUNDATION_UI_DEFAULTS.shell,
      navigation: FOUNDATION_UI_DEFAULTS.navigation,
      density: FOUNDATION_UI_DEFAULTS.density,
      content: FOUNDATION_UI_DEFAULTS.content,
      cta: {
        enabled: false,
        action: undefined,
        label: undefined,
        style: "standard",
      },
      theme: FOUNDATION_UI_DEFAULTS.theme,
    });
  });

  it("overrides merge over the Foundation defaults without selecting a preset", () => {
    const resolved = resolveUiConfig({ density: "spacious" });
    expect(resolved.preset).toBeUndefined();
    expect(resolved.density).toBe("spacious");
    expect(resolved.shell).toEqual(FOUNDATION_UI_DEFAULTS.shell);
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

  it("explicit config works WITHOUT a preset (roadmap Level-3 case)", () => {
    const resolved = resolveUiConfig({ navigation: { desktop: "sidebar" } });
    expect(resolved.preset).toBeUndefined();
    expect(resolved.navigation.desktop).toBe("sidebar");
    expect(resolved.navigation.tablet).toBe("top-compact"); // Foundation
    expect(resolved.navigation.mobile).toBe("drawer"); // Foundation
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
  it("never invents a business action: enabled false, action/label undefined, style standard", () => {
    const plain = resolveUiConfig({});
    expect(plain.cta.enabled).toBe(false);
    expect(plain.cta.action).toBeUndefined();
    expect(plain.cta.label).toBeUndefined();
    expect(plain.cta.style).toBe("standard");

    const presetOnly = resolveUiConfig({ preset: "focus" });
    expect(presetOnly.cta.enabled).toBe(false); // presets do not define enabled
    expect(presetOnly.cta.action).toBeUndefined();
    expect(presetOnly.cta.label).toBeUndefined();
    expect(presetOnly.cta.style).toBe("prominent"); // focus profile requests prominence
  });

  it("an explicit adopter CTA override is preserved", () => {
    const resolved = resolveUiConfig({
      cta: { enabled: true, action: "book", label: "Book Now", style: "standard" },
    });
    expect(resolved.cta.enabled).toBe(true);
    expect(resolved.cta.action).toBe("book");
    expect(resolved.cta.label).toBe("Book Now");
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
        expect(resolved.preset).toBeUndefined();
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
      shell: { header: "standard", footer: "standard" },
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

describe("UI-02 - no preset may be selected (decision encoded in tests)", () => {
  it("resolveUiConfig({}) keeps preset undefined", () => {
    expect(resolveUiConfig({}).preset).toBeUndefined();
    expect(resolveUiConfig({ density: "comfortable" }).preset).toBeUndefined();
  });

  it("no DEFAULT_PRESET symbol exists in src/core/ui", () => {
    const dir = path.join(process.cwd(), "src", "core", "ui");
    const files = ["index.ts", "vocabulary.ts", "presets.ts", "defaults.ts", "resolve.ts"];
    for (const file of files) {
      const source = readFileSync(path.join(dir, file), "utf8");
      // The decision is about a SYMBOL (constant/variable declaration), not the
      // prose phrase appearing in doc comments (UI-01 documents "deliberately no
      // DEFAULT_PRESET" — which itself asserts the decision).
      expect(source.match(/DEFAULT_PRESET\s*(?:=|:)/), file).toBeNull();
    }
  });

  it("neither defaults.ts nor resolve.ts selects adaptive as a fallback (source-scan)", () => {
    for (const file of ["defaults.ts", "resolve.ts"]) {
      const source = readFileSync(path.join(process.cwd(), "src", "core", "ui", file), "utf8");
      expect(source.includes("adaptive"), file).toBe(false);
    }
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
