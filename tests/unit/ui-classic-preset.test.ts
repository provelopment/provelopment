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
    // P5-5 — the preset drives the three pattern leaves; the control leaves
    // (sidebar/top/bottom mode) are NEUTRAL and preset-agnostic.
    expect(resolved.navigation.desktop).toBe("top");
    expect(resolved.navigation.tablet).toBe("top-compact");
    expect(resolved.navigation.mobile).toBe("drawer");
    expect(resolved.navigation.sidebar.mode).toBe("open");
    expect(resolved.navigation.top.mode).toBe("open");
    expect(resolved.navigation.bottom.mode).toBe("open");
    expect(resolved.shell).toEqual({ header: "standard", footer: "standard", sidebar: { collapsible: false } });
    expect(resolved.cta.style).toBe("standard");
    // P5-3 — Classic now DEFINES its presentation: editorial typography,
    // structured rhythm, paper surfaces, a rule header, split hero, medium
    // corner language (its density/content match the neutral values).
    expect(resolved.density).toBe("comfortable");
    expect(resolved.content.width).toBe("standard");
    expect(resolved.presentation).toEqual({
      typography: "editorial",
      rhythm: "structured",
      surface: "paper",
      header: "rule",
      hero: "split",
    });
    expect(resolved.theme.mode).toBe(FOUNDATION_UI_DEFAULTS.theme.mode);
    expect(resolved.theme.radius).toBe("small");
    expect(resolved.cta.enabled).toBe(false);
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
      expect(resolved.navigation.desktop).toBe(uiPresetProfiles[preset].navigation.desktop);
      expect(resolved.navigation.tablet).toBe(uiPresetProfiles[preset].navigation.tablet);
      expect(resolved.navigation.mobile).toBe(uiPresetProfiles[preset].navigation.mobile);
      // P5-5 — the control leaves (sidebar/top/bottom mode) are neutral and preset-agnostic:
      // they never come from a preset profile (explicit adopter configuration only).
      expect(resolved.navigation.sidebar.mode).toBe("open");
      expect(resolved.navigation.top.mode).toBe("open");
      expect(resolved.navigation.bottom.mode).toBe("open");
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

describe("FS-2 — the shipped Foundation reference site is Adaptive with effective effect", () => {
  it("the reference site ui block resolves preset adaptive with its profile", () => {
    const demoResolved = resolveUiConfig(siteConfig.ui ?? {});
    expect(demoResolved.preset).toBe("adaptive");
    // P5-5 — the profile drives the three pattern leaves; the control leaves
    // (sidebar/top/bottom mode) are neutral + preset-agnostic.
    expect(demoResolved.navigation.desktop).toBe("sidebar");
    expect(demoResolved.navigation.tablet).toBe("collapsed-sidebar");
    expect(demoResolved.navigation.mobile).toBe("bottom-bar");
    expect(demoResolved.navigation.sidebar.mode).toBe("open");
    expect(demoResolved.navigation.top.mode).toBe("open");
    expect(demoResolved.navigation.bottom.mode).toBe("open");
    expect(demoResolved.shell).toEqual(uiPresetProfiles.adaptive.shell);
    // P5-3 — Adaptive is the balanced/general-purpose presentation: its profile
    // matches the Foundation defaults for density/content/radius, so the
    // canonical reference site remains byte-identical.
    expect(demoResolved.density).toBe(FOUNDATION_UI_DEFAULTS.density);
    expect(demoResolved.content.width).toBe(FOUNDATION_UI_DEFAULTS.content.width);
    expect(demoResolved.theme).toEqual(FOUNDATION_UI_DEFAULTS.theme);
    expect(demoResolved.presentation).toEqual(uiPresetProfiles.adaptive.presentation);
  });
});
