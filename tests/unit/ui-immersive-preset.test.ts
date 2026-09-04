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
    expect(resolved.navigation).toEqual(uiPresetProfiles.immersive.navigation);
    expect(resolved.navigation).toEqual({
      desktop: "floating",
      tablet: "floating",
      mobile: "overlay",
    });
    expect(resolved.shell).toEqual({ header: "minimal", footer: "standard" });
    expect(resolved.cta.style).toBe("standard");
    // Leaves Immersive does NOT define fall to Foundation defaults:
    expect(resolved.density).toBe(FOUNDATION_UI_DEFAULTS.density);
    expect(resolved.content.width).toBe(FOUNDATION_UI_DEFAULTS.content.width);
    expect(resolved.cta.enabled).toBe(false);
    expect(resolved.cta.action).toBeUndefined();
    expect(resolved.cta.label).toBeUndefined();
    expect(resolved.cta.href).toBeUndefined();
    expect(resolved.theme).toEqual(FOUNDATION_UI_DEFAULTS.theme);
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
      expect(resolved.navigation).toEqual(uiPresetProfiles[preset].navigation);
      expect(resolved.shell).toEqual(uiPresetProfiles[preset].shell);
      expect(resolved.cta.style).toBe(uiPresetProfiles[preset].cta.style);
    }
  });

  it("the Adaptive resolved default (Part B) is untouched by Immersive", () => {
    expect(FOUNDATION_UI_DEFAULTS.defaultPreset).toBe("adaptive");
    expect(resolveUiConfig({}).preset).toBe("adaptive");
  });

  it("the shipped demo (explicit Classic) is unchanged by UI-09", () => {
    const demoResolved = resolveUiConfig(siteConfig.ui ?? {});
    expect(demoResolved.preset).toBe("classic");
    expect(demoResolved.cta.label).toBe("Book Now");
    expect(demoResolved.cta.href).toBeUndefined(); // no destination → still renders nothing
    expect(demoResolved.cta.style).toBe("standard");
  });
});
