import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config";
import { FOUNDATION_UI_DEFAULTS } from "@/core/ui/defaults";
import { resolveUiConfig, uiPresetProfiles, UI_PRESETS } from "@/core/ui";

/**
 * UI-05 — the resolved default personality decision (Part B).
 *
 * Founder-approved contract (plan/todo-milestone-ui-05.md §2, UI-06 §2):
 *  - when no preset is supplied, the resolver selects Adaptive as the
 *    Foundation's default personality;
 *  - this NEVER changes the effective composition of a config whose explicit
 *    leaves already decide the behavior (personality != effective);
 *  - all five presets remain explicitly selectable and unaffected;
 *  - explicit developer overrides continue to win over the default personality.
 *  - UI-06: the shipped demo now EXPLICITLY selects classic (personality
 *    "classic"), while its explicit classic leaves keep the byte-identical
 *    effective composition.
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

  it("the shipped demo resolves the classic personality (explicit preset, UI-06)", () => {
    // `site.config.json` now sets `"preset": "classic"` explicitly (D1 Option B,
    // UI-06) and keeps its explicit classic leaves. The effective composition is
    // byte-identical to the pre-UI-06 demo — only the truthful personality
    // changed (adaptive → classic).
    const demoResolved = resolveUiConfig(siteConfig.ui ?? {});
    expect(demoResolved.preset).toBe("classic");
    expect(demoResolved.navigation).toEqual(uiPresetProfiles.classic.navigation);
    expect(demoResolved.navigation).not.toEqual(uiPresetProfiles.adaptive.navigation);
    expect(demoResolved.shell).toEqual(uiPresetProfiles.classic.shell);
  });
});