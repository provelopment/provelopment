import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config";
import { FOUNDATION_UI_DEFAULTS } from "@/core/ui/defaults";
import { resolveUiConfig, uiPresetProfiles, UI_PRESETS } from "@/core/ui";

/**
 * UI-06 — Classic preset (the first non-default preset, purely declarative).
 *
 * Founder-approved contract (plan/todo-milestone-ui-06.md §1–§5):
 *  - `{"ui":{"preset":"classic"}}` flows through the existing resolution
 *    pipeline with NO production-code change (no capability gap);
 *  - the Classic profile (`top/top-compact/drawer`, standard shell/CTA) fills
 *    the leaves; overrides win per-leaf without canceling the personality;
 *  - CTA stays business-neutral unless explicitly enabled;
 *  - the shipped demo now explicitly selects classic (D1 Option B) and its
 *    effective composition is byte-identical to the pre-UI-06 demo;
 *  - the Adaptive default (Part B) is untouched by this milestone.
 */
describe("UI-06 — explicit Classic selection (declarative preset)", () => {
  it("preset-only classic resolves the full Classic profile", () => {
    const resolved = resolveUiConfig({ preset: "classic" });
    expect(resolved.preset).toBe("classic");
    expect(resolved.navigation).toEqual(uiPresetProfiles.classic.navigation);
    expect(resolved.navigation).toEqual({
      desktop: "top",
      tablet: "top-compact",
      mobile: "drawer",
    });
    expect(resolved.shell).toEqual({ header: "standard", footer: "standard", sidebar: { collapsible: false } });
    expect(resolved.cta.style).toBe("standard");
    // Leaves Classic does not define fall to Foundation defaults:
    expect(resolved.density).toBe(FOUNDATION_UI_DEFAULTS.density);
    expect(resolved.content.width).toBe(FOUNDATION_UI_DEFAULTS.content.width);
    expect(resolved.cta.enabled).toBe(false);
    expect(resolved.theme).toEqual(FOUNDATION_UI_DEFAULTS.theme);
  });

  it("leaf overrides win without canceling the classic personality", () => {
    const resolved = resolveUiConfig({
      preset: "classic",
      navigation: { mobile: "bottom-bar" },
      density: "compact",
    });
    expect(resolved.preset).toBe("classic"); // personality preserved
    expect(resolved.navigation.desktop).toBe("top"); // profile
    expect(resolved.navigation.tablet).toBe("top-compact"); // profile
    expect(resolved.navigation.mobile).toBe("bottom-bar"); // override wins
    expect(resolved.density).toBe("compact"); // override wins
    expect(resolved.shell).toEqual(uiPresetProfiles.classic.shell);
  });

  it("an aside/adaptive override on classic renders the OTHER machinery without changing identity", () => {
    const resolved = resolveUiConfig({
      preset: "classic",
      navigation: { desktop: "sidebar", tablet: "collapsed-sidebar" },
    });
    expect(resolved.preset).toBe("classic"); // personality stays classic
    expect(resolved.navigation.desktop).toBe("sidebar"); // overrides win
    expect(resolved.navigation.tablet).toBe("collapsed-sidebar");
    expect(resolved.navigation.mobile).toBe("drawer"); // profile
  });

  it("five-preset regression: every preset still resolves its own profile", () => {
    for (const preset of UI_PRESETS) {
      const resolved = resolveUiConfig({ preset });
      expect(resolved.preset).toBe(preset);
      expect(resolved.navigation).toEqual(uiPresetProfiles[preset].navigation);
      expect(resolved.shell).toEqual(uiPresetProfiles[preset].shell);
      expect(resolved.cta.style).toBe(uiPresetProfiles[preset].cta.style);
    }
  });

  it("the Adaptive resolved default (Part B) is untouched by Classic", () => {
    expect(FOUNDATION_UI_DEFAULTS.defaultPreset).toBe("adaptive");
    expect(resolveUiConfig({}).preset).toBe("adaptive");
  });
});

describe("UI-06 — Classic CTA neutrality (D1/D2)", () => {
  it("never invents a business action for preset-only classic", () => {
    const resolved = resolveUiConfig({ preset: "classic" });
    expect(resolved.cta.enabled).toBe(false);
    expect(resolved.cta.action).toBeUndefined();
    expect(resolved.cta.label).toBeUndefined();
    expect(resolved.cta.style).toBe("standard");
  });

  it("an explicit classic CTA override is preserved", () => {
    const resolved = resolveUiConfig({
      preset: "classic",
      cta: { enabled: true, action: "book", label: "Book Now", style: "standard" },
    });
    expect(resolved.cta.enabled).toBe(true);
    expect(resolved.cta.action).toBe("book");
    expect(resolved.cta.label).toBe("Book Now");
    expect(resolved.cta.style).toBe("standard");
  });
});

describe("UI-06 — the shipped demo is explicit Classic with byte-identical effect", () => {
  it("the demo ui block resolves preset classic with its classic leaves", () => {
    const demoResolved = resolveUiConfig(siteConfig.ui ?? {});
    expect(demoResolved.preset).toBe("classic");
    expect(demoResolved.navigation).toEqual(uiPresetProfiles.classic.navigation);
    // The explicit leaves equal the profile, so the EFFECTIVE composition is
    // the same as the pre-UI-06 (preset-less) demo:
    expect(demoResolved.navigation).toEqual({
      desktop: "top",
      tablet: "top-compact",
      mobile: "drawer",
    });
    expect(demoResolved.shell).toEqual(uiPresetProfiles.classic.shell);
    expect(demoResolved.density).toBe(FOUNDATION_UI_DEFAULTS.density);
    expect(demoResolved.content.width).toBe(FOUNDATION_UI_DEFAULTS.content.width);
    expect(demoResolved.theme).toEqual(FOUNDATION_UI_DEFAULTS.theme);
  });
});