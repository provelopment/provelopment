import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config";
import { FOUNDATION_UI_DEFAULTS } from "@/core/ui/defaults";
import { resolveUiConfig, uiPresetProfiles, UI_PRESETS } from "@/core/ui";

/**
 * UI-08 — Workspace preset (information-rich personality) — RESOLUTION proof.
 *
 * Owner-approved contract (plan/todo-milestone-ui-08.md §2, §4):
 *  - `{"ui":{"preset":"workspace"}}` resolves the full Workspace profile
 *    (`sidebar / collapsed-sidebar / drawer`, `standard / standard` shell,
 *    standard CTA) through the existing pipeline;
 *  - per-leaf overrides win without canceling the personality;
 *  - the CTA stays business-neutral (enabled false, no action/label/href
 *    invented);
 *  - inherited Foundation defaults (density/content/theme) remain intact;
 *  - all shipped presets still resolve; the Adaptive default is untouched; the
 *    shipped demo (explicit Classic) is untouched.
 *
 * This is a pure DECLARATIVE profile proof — resolution runs on the existing
 * machinery with no production-code change.
 */
describe("UI-08 — explicit Workspace selection (declarative profile)", () => {
  it("preset-only workspace resolves the full Workspace profile", () => {
    const resolved = resolveUiConfig({ preset: "workspace" });
    expect(resolved.preset).toBe("workspace");
    expect(resolved.navigation).toEqual(uiPresetProfiles.workspace.navigation);
    expect(resolved.navigation).toEqual({
      desktop: "sidebar",
      tablet: "collapsed-sidebar",
      mobile: "drawer",
    });
    expect(resolved.shell).toEqual({ header: "standard", footer: "standard", sidebar: { collapsible: true } });
    expect(resolved.cta.style).toBe("standard");
    // Leaves Workspace does NOT define fall to Foundation defaults:
    expect(resolved.density).toBe(FOUNDATION_UI_DEFAULTS.density);
    expect(resolved.content.width).toBe(FOUNDATION_UI_DEFAULTS.content.width);
    expect(resolved.cta.enabled).toBe(false);
    expect(resolved.cta.action).toBeUndefined();
    expect(resolved.cta.label).toBeUndefined();
    expect(resolved.cta.href).toBeUndefined();
    expect(resolved.theme).toEqual(FOUNDATION_UI_DEFAULTS.theme);
  });

  it("leaf overrides win without canceling the workspace personality", () => {
    const resolved = resolveUiConfig({
      preset: "workspace",
      navigation: { desktop: "top" },
      shell: { header: "minimal" },
      density: "compact",
    });
    expect(resolved.preset).toBe("workspace"); // personality preserved
    expect(resolved.navigation.desktop).toBe("top"); // override wins
    expect(resolved.navigation.tablet).toBe("collapsed-sidebar"); // profile
    expect(resolved.navigation.mobile).toBe("drawer"); // profile
    expect(resolved.shell.header).toBe("minimal"); // override wins
    expect(resolved.shell.footer).toBe("standard"); // profile + Foundation agree
    expect(resolved.density).toBe("compact"); // override wins
  });

  it("Workspace never invents an action, label, or href (neutral CTA default)", () => {
    const resolved = resolveUiConfig({ preset: "workspace" });
    expect(resolved.cta.enabled).toBe(false);
    expect(resolved.cta.action).toBeUndefined();
    expect(resolved.cta.label).toBeUndefined();
    expect(resolved.cta.href).toBeUndefined();
    expect(resolved.cta.style).toBe("standard");
  });

  it("an explicit adopter CTA (with href) still resolves — the kept UI-07 contract", () => {
    const resolved = resolveUiConfig({
      preset: "workspace",
      cta: { enabled: true, action: "book", label: "Book", href: "/booking" },
    });
    expect(resolved.cta.enabled).toBe(true);
    expect(resolved.cta.href).toBe("/booking");
    expect(resolved.cta.style).toBe("standard"); // workspace profile stays standard
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

  it("the Adaptive resolved default (Part B) is untouched by Workspace", () => {
    expect(FOUNDATION_UI_DEFAULTS.defaultPreset).toBe("adaptive");
    expect(resolveUiConfig({}).preset).toBe("adaptive");
  });

  it("the shipped demo (explicit Classic) is unchanged by UI-08", () => {
    const demoResolved = resolveUiConfig(siteConfig.ui ?? {});
    expect(demoResolved.preset).toBe("classic");
    expect(demoResolved.cta.label).toBe("Book Now");
    expect(demoResolved.cta.href).toBeUndefined(); // no destination → still renders nothing
    expect(demoResolved.cta.style).toBe("standard");
  });
});
