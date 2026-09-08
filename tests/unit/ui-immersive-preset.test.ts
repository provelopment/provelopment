import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config";
import { FOUNDATION_UI_DEFAULTS } from "@/core/ui/defaults";
import { resolveUiConfig, uiPresetProfiles, UI_PRESETS } from "@/core/ui";

/**
 * UI-09 — Immersive preset (premium visual-first personality) — RESOLUTION proof.
 *
 * Owner-approved contract (plan/todo-milestone-ui-09.md §2, §4):
 *  - `{"ui":{"preset":"immersive"}}` resolves the full Immersive profile
 *    (`floating / floating / overlay`, `minimal / standard` shell, standard CTA)
 *    through the existing pipeline;
 *  - per-leaf overrides win without canceling the personality;
 *  - inherited Foundation defaults (density/content/theme) remain intact;
 *  - the CTA stays business-neutral (enabled false, no action/label/href
 *    invented);
 *  - all shipped presets still resolve; the Adaptive default is untouched; the
 *    shipped demo (explicit Classic) is untouched.
 *
 * This is a pure DECLARATIVE profile proof — resolution runs on the existing
 * machinery with no production-code change. It proves what the architecture
 * actually guarantees (the profile resolves), not any invented visual contract
 * for `floating`/`minimal` (both remain deferred — see todo-milestone-ui-09.md §5).
 */
describe("UI-09 — explicit Immersive selection (declarative profile)", () => {
  it("preset-only immersive resolves the full Immersive profile", () => {
    const resolved = resolveUiConfig({ preset: "immersive" });
    expect(resolved.preset).toBe("immersive");
    // P5-5 — the preset drives the three pattern leaves; the control leaves
    // (sidebar/top/bottom mode) are NEUTRAL and preset-agnostic.
    expect(resolved.navigation.desktop).toBe("floating");
    expect(resolved.navigation.tablet).toBe("floating");
    expect(resolved.navigation.mobile).toBe("overlay");
    expect(resolved.navigation.sidebar.mode).toBe("open");
    expect(resolved.navigation.top.mode).toBe("open");
    expect(resolved.navigation.bottom.mode).toBe("open");
    expect(resolved.shell).toEqual({ header: "minimal", footer: "standard", sidebar: { collapsible: false } });
    expect(resolved.cta.style).toBe("standard");
    // P5-3 — Immersive now DEFINES its spacious/visual presentation:
    // spacious density, a wide content column, large corner language, layered
    // surfaces, an elevated header and a showcase hero.
    expect(resolved.density).toBe("spacious");
    expect(resolved.content.width).toBe("wide");
    expect(resolved.presentation).toEqual({
      typography: "expressive",
      rhythm: "spacious",
      surface: "layered",
      header: "elevated",
      hero: "showcase",
    });
    expect(resolved.theme.mode).toBe(FOUNDATION_UI_DEFAULTS.theme.mode);
    expect(resolved.theme.radius).toBe("large");
    expect(resolved.cta.enabled).toBe(false);
    expect(resolved.cta.action).toBeUndefined();
    expect(resolved.cta.label).toBeUndefined();
    expect(resolved.cta.href).toBeUndefined();
  });

  it("leaf overrides win without canceling the immersive personality", () => {
    const resolved = resolveUiConfig({
      preset: "immersive",
      navigation: { desktop: "top" },
      shell: { header: "standard" },
      density: "compact",
    });
    expect(resolved.preset).toBe("immersive"); // personality preserved
    expect(resolved.navigation.desktop).toBe("top"); // override wins
    expect(resolved.navigation.tablet).toBe("floating"); // profile
    expect(resolved.navigation.mobile).toBe("overlay"); // profile
    expect(resolved.shell.header).toBe("standard"); // override wins
    expect(resolved.shell.footer).toBe("standard"); // profile + Foundation agree
    expect(resolved.density).toBe("compact"); // override wins
  });

  it("Immersive never invents an action, label, or href (neutral CTA default)", () => {
    const resolved = resolveUiConfig({ preset: "immersive" });
    expect(resolved.cta.enabled).toBe(false);
    expect(resolved.cta.action).toBeUndefined();
    expect(resolved.cta.label).toBeUndefined();
    expect(resolved.cta.href).toBeUndefined();
    expect(resolved.cta.style).toBe("standard");
  });

  it("an explicit adopter CTA (with href) still resolves — the kept UI-07 contract", () => {
    const resolved = resolveUiConfig({
      preset: "immersive",
      cta: { enabled: true, action: "book", label: "Book", href: "/booking" },
    });
    expect(resolved.cta.enabled).toBe(true);
    expect(resolved.cta.href).toBe("/booking");
    expect(resolved.cta.style).toBe("standard"); // immersive profile stays standard
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

  it("the Adaptive resolved default (Part B) is untouched by Immersive", () => {
    expect(FOUNDATION_UI_DEFAULTS.defaultPreset).toBe("adaptive");
    expect(resolveUiConfig({}).preset).toBe("adaptive");
  });

  it("the shipped Foundation reference site (Adaptive) is unchanged by UI-09", () => {
    const demoResolved = resolveUiConfig(siteConfig.ui ?? {});
    expect(demoResolved.preset).toBe("adaptive");
    expect(demoResolved.cta.label).toBe("Book Now");
    expect(demoResolved.cta.href).toBe("https://example.com/book"); // display/example destination (FS-2 reference CTA)
    expect(demoResolved.cta.style).toBe("standard");
  });
});
