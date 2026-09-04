import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config";
import { FOUNDATION_UI_DEFAULTS } from "@/core/ui/defaults";
import { resolveUiConfig, uiPresetProfiles, UI_PRESETS } from "@/core/ui";

/**
 * UI-07 — Focus preset (conversion-first personality).
 *
 * Founder-approved contract (plan/todo-milestone-ui-07.md §2, §4, §5):
 *  - `{"ui":{"preset":"focus"}}` resolves the full Focus profile
 *    (`minimal / top-compact / drawer`, `minimal / standard` shell, prominent
 *    CTA) through the existing pipeline;
 *  - overrides win per-leaf without canceling the personality;
 *  - the CTA stays business-neutral (enabled false, no action/label/href
 *    invented) and `cta.href` (D1) is an ADOPTER-OWNED optional destination
 *    that defaults to `undefined` — never inferred from `action`;
 *  - the Adaptive default (Part B) is untouched; the shipped demo (explicit
 *    Classic) is untouched.
 */
describe("UI-07 — explicit Focus selection (declarative profile)", () => {
  it("preset-only focus resolves the full Focus profile", () => {
    const resolved = resolveUiConfig({ preset: "focus" });
    expect(resolved.preset).toBe("focus");
    expect(resolved.navigation).toEqual(uiPresetProfiles.focus.navigation);
    expect(resolved.navigation).toEqual({
      desktop: "minimal",
      tablet: "top-compact",
      mobile: "drawer",
    });
    expect(resolved.shell).toEqual({ header: "minimal", footer: "standard" });
    expect(resolved.cta.style).toBe("prominent");
    // Leaves Focus does NOT define fall to Foundation defaults:
    expect(resolved.density).toBe(FOUNDATION_UI_DEFAULTS.density);
    expect(resolved.content.width).toBe(FOUNDATION_UI_DEFAULTS.content.width);
    expect(resolved.cta.enabled).toBe(false);
    expect(resolved.cta.href).toBeUndefined();
    expect(resolved.theme).toEqual(FOUNDATION_UI_DEFAULTS.theme);
  });

  it("leaf overrides win without canceling the focus personality", () => {
    const resolved = resolveUiConfig({
      preset: "focus",
      navigation: { desktop: "top" },
      shell: { header: "standard" },
      cta: { style: "standard" },
    });
    expect(resolved.preset).toBe("focus"); // personality preserved
    expect(resolved.navigation.desktop).toBe("top"); // override wins
    expect(resolved.navigation.tablet).toBe("top-compact"); // profile
    expect(resolved.navigation.mobile).toBe("drawer"); // profile
    expect(resolved.shell.header).toBe("standard"); // override wins
    expect(resolved.shell.footer).toBe("standard"); // profile + Foundation agree
    expect(resolved.cta.style).toBe("standard"); // override wins
  });

  it("Focus never invents an action, label, or href (neutral CTA default)", () => {
    const resolved = resolveUiConfig({ preset: "focus" });
    expect(resolved.cta.enabled).toBe(false);
    expect(resolved.cta.action).toBeUndefined();
    expect(resolved.cta.label).toBeUndefined();
    expect(resolved.cta.href).toBeUndefined();
    expect(resolved.cta.style).toBe("prominent");
  });

  it("an explicit cta.href resolves; defaults to undefined otherwise (D1)", () => {
    const withHref = resolveUiConfig({
      preset: "focus",
      cta: { enabled: true, action: "book", label: "Book Now", href: "/booking" },
    });
    expect(withHref.cta.enabled).toBe(true);
    expect(withHref.cta.action).toBe("book");
    expect(withHref.cta.label).toBe("Book Now");
    expect(withHref.cta.href).toBe("/booking");
    expect(withHref.cta.style).toBe("prominent");

    const withoutHref = resolveUiConfig({
      preset: "focus",
      cta: { enabled: true, action: "book", label: "Book Now" },
    });
    expect(withoutHref.cta.href).toBeUndefined(); // never inferred from action
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

  it("the Adaptive resolved default (Part B) is untouched by Focus", () => {
    expect(FOUNDATION_UI_DEFAULTS.defaultPreset).toBe("adaptive");
    expect(resolveUiConfig({}).preset).toBe("adaptive");
  });

  it("the shipped demo (explicit Classic) is unchanged by UI-07", () => {
    const demoResolved = resolveUiConfig(siteConfig.ui ?? {});
    expect(demoResolved.preset).toBe("classic");
    expect(demoResolved.cta.enabled).toBe(true); // the demo's explicit block
    expect(demoResolved.cta.label).toBe("Book Now");
    expect(demoResolved.cta.href).toBeUndefined(); // no destination → still renders nothing
    expect(demoResolved.cta.style).toBe("standard");
  });
});