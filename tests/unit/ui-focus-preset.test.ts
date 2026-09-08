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
    // P5-5 — the preset drives the three pattern leaves; the control leaves
    // (sidebar/top/bottom mode) are NEUTRAL and preset-agnostic.
    expect(resolved.navigation.desktop).toBe("minimal");
    expect(resolved.navigation.tablet).toBe("top-compact");
    expect(resolved.navigation.mobile).toBe("drawer");
    expect(resolved.navigation.sidebar.mode).toBe("open");
    expect(resolved.navigation.top.mode).toBe("open");
    expect(resolved.navigation.bottom.mode).toBe("open");
    expect(resolved.shell).toEqual({ header: "minimal", footer: "standard", sidebar: { collapsible: false } });
    expect(resolved.cta.style).toBe("prominent");
    // P5-3 — Focus now DEFINES its minimal/content-first presentation: a
    // narrow content column, comfortable density, medium radius, minimal
    // surfaces, a bare header and a centered hero.
    expect(resolved.density).toBe("comfortable");
    expect(resolved.content.width).toBe("narrow");
    expect(resolved.presentation).toEqual({
      typography: "minimal",
      rhythm: "airy",
      surface: "minimal",
      header: "bare",
      hero: "center",
    });
    expect(resolved.theme.mode).toBe(FOUNDATION_UI_DEFAULTS.theme.mode);
    expect(resolved.theme.radius).toBe("medium");
    expect(resolved.cta.enabled).toBe(false);
    expect(resolved.cta.href).toBeUndefined();
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

  it("the Adaptive resolved default (Part B) is untouched by Focus", () => {
    expect(FOUNDATION_UI_DEFAULTS.defaultPreset).toBe("adaptive");
    expect(resolveUiConfig({}).preset).toBe("adaptive");
  });

  it("the shipped Foundation reference site (Adaptive) is unchanged by UI-07", () => {
    const demoResolved = resolveUiConfig(siteConfig.ui ?? {});
    expect(demoResolved.preset).toBe("adaptive");
    expect(demoResolved.cta.enabled).toBe(true); // the site's explicit block
    expect(demoResolved.cta.label).toBe("Book Now");
    expect(demoResolved.cta.href).toBe("https://example.com/book"); // display/example destination (FS-2 reference CTA)
    expect(demoResolved.cta.style).toBe("standard");
  });
});
