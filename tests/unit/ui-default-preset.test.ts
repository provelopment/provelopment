import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config";
import { FOUNDATION_UI_DEFAULTS } from "@/core/ui/defaults";
import { resolveUiConfig, uiPresetProfiles, UI_PRESETS } from "@/core/ui";

/**
 * UI-05 — the resolved default personality decision (Part B).
 *
 * Founder-approved contract (plan/todo-milestone-ui-05.md §2):
 *  - when no preset is supplied, the resolver selects Adaptive as the
 *    Foundation's default personality;
 *  - this NEVER changes the effective composition of a config whose explicit
 *    leaves already decide the behavior (personality != effective);
 *  - all five presets remain explicitly selectable and unaffected;
 *  - explicit developer overrides continue to win over the default personality.
 */
describe("UI-05 — the deliberate Adaptive default decision", () => {
  it("FOUNDATION_UI_DEFAULTS fixes the default preset to adaptive", () => {
    expect(FOUNDATION_UI_DEFAULTS.defaultPreset).toBe("adaptive");
  });

  it("omitting preset resolves the adaptive personality; shipping no ui block behaves the same", () => {
    expect(resolveUiConfig({}).preset).toBe("adaptive");
    expect(resolveUiConfig({} as Parameters<typeof resolveUiConfig>[0]).navigation).toEqual(
      uiPresetProfiles.adaptive.navigation,
    );
  });

  it("explicit per-leaf overrides still win over the default personality", () => {
    const resolved = resolveUiConfig({
      navigation: { mobile: "drawer" },
      density: "compact",
    });
    expect(resolved.preset).toBe("adaptive"); // personality preserved
    expect(resolved.navigation.desktop).toBe("sidebar"); // adaptive profile fills
    expect(resolved.navigation.mobile).toBe("drawer"); // override wins
    expect(resolved.density).toBe("compact"); // override wins
  });

  it("all five explicit presets resolve their profiles untouched by the default decision", () => {
    for (const preset of UI_PRESETS) {
      const resolved = resolveUiConfig({ preset });
      expect(resolved.preset).toBe(preset);
      expect(resolved.navigation).toEqual(uiPresetProfiles[preset].navigation);
      expect(resolved.shell).toEqual(uiPresetProfiles[preset].shell);
      expect(resolved.cta.style).toBe(uiPresetProfiles[preset].cta.style);
    }
  });

  it("the shipped demo stays effective-classic because its explicit leaves win", () => {
    // `site.config.json` declares explicit classic leaves and NO preset. After
    // the UI-05 default decision, `resolved.preset` is the adaptive personality,
    // but the EFFECTIVE composition remains the classic top-bar shell — so the
    // demo renders byte-identically before and after the decision.
    const demoResolved = resolveUiConfig(siteConfig.ui ?? {});
    expect(demoResolved.preset).toBe("adaptive");
    expect(demoResolved.navigation).toEqual({
      desktop: "top",
      tablet: "top-compact",
      mobile: "drawer",
    });
    expect(demoResolved.navigation).not.toEqual(uiPresetProfiles.adaptive.navigation);
  });
});