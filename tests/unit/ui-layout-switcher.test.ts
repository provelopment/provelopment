import { describe, expect, it } from "vitest";

import { siteConfigFileSchema } from "@/config/schema";
import {
  DESKTOP_NAVIGATION_PATTERNS,
  SHELL_LAYOUT_ATTRIBUTE,
  SHELL_LAYOUT_PATTERNS,
  SHELL_LAYOUT_STORAGE_KEY,
  SHELL_LAYOUTS,
  TABLET_NAVIGATION_PATTERNS,
  applyShellLayout,
  assertResolvedUiConfigComplete,
  headerNavigationCompositions,
  headerNavigationLayouts,
  isShellLayout,
  layoutDataAttributes,
  layoutScopeAttributes,
  railCompositions,
  railLayouts,
  resolveShellPattern,
  resolveUiConfig,
  shellLayoutCompositions,
  UiConfigResolutionError,
} from "@/core/ui";

/**
 * N2 — THE SHELL LAYOUT PRESENTATION (core contract + configuration).
 *
 * The platform keeps ONE shell decision core: a layout is a preset of exactly two
 * existing vocabulary leaves (`navigation.desktop`/`tablet`), so these assertions pin
 * the mapping, the resolution, the configuration coherence rule (a layout IS those two
 * leaves, so configuring both is refused), and the fact that nothing else moves —
 * mobile, density, width, theme, CTA and the P5-3 presentation intent are untouched.
 */

const sidebarEnabled = resolveUiConfig({ layoutSwitcher: { enabled: true } });
const menuBarDefault = resolveUiConfig({ layoutSwitcher: { enabled: true, default: "menu-bar" } });
const disabled = resolveUiConfig({});

describe("the shell layout vocabulary", () => {
  it("declares exactly two layouts, each a preset of EXISTING navigation patterns", () => {
    expect(SHELL_LAYOUTS).toEqual(["sidebar", "menu-bar"]);
    expect(SHELL_LAYOUT_PATTERNS.sidebar).toEqual({
      desktop: "sidebar",
      tablet: "collapsed-sidebar",
    });
    expect(SHELL_LAYOUT_PATTERNS["menu-bar"]).toEqual({
      desktop: "top",
      tablet: "top-compact",
    });
    for (const [layout, patterns] of Object.entries(SHELL_LAYOUT_PATTERNS)) {
      expect(DESKTOP_NAVIGATION_PATTERNS, layout).toContain(patterns.desktop);
      expect(TABLET_NAVIGATION_PATTERNS, layout).toContain(patterns.tablet);
    }
  });

  it("refuses an arbitrary layout value", () => {
    for (const value of SHELL_LAYOUTS) expect(isShellLayout(value), value).toBe(true);
    for (const value of ["compact", "SIDEBAR", "menu_bar", "", "top", undefined, null, 1, {}]) {
      expect(isShellLayout(value), String(value)).toBe(false);
    }
  });

  it("applies a layout to the two navigation leaves and NOTHING else", () => {
    const base = resolveUiConfig({
      density: "spacious",
      content: { width: "wide" },
      theme: { radius: "large", mode: "dark" },
      cta: { enabled: true, label: "Book", href: "/booking" },
      presentation: { typography: "editorial", hero: "split" },
    });
    const applied = applyShellLayout(base, "menu-bar");
    expect(applied.navigation.desktop).toBe("top");
    expect(applied.navigation.tablet).toBe("top-compact");
    expect({ ...applied, navigation: base.navigation }).toEqual(base);
  });

  it("puts the two reference choices through the ONE shell decision core", () => {
    // The active shell follows the existing vocabulary: aside/aside for the sidebar
    // layout, header/header for the menu-bar layout.
    const sidebar = resolveShellPattern(applyShellLayout(sidebarEnabled, "sidebar"));
    expect(sidebar.desktop.slot).toBe("aside");
    expect(sidebar.tablet.slot).toBe("aside");
    const menuBar = resolveShellPattern(applyShellLayout(sidebarEnabled, "menu-bar"));
    expect(menuBar.desktop.slot).toBe("header");
    expect(menuBar.tablet.slot).toBe("header");
    // The mobile composition is IDENTICAL under both layouts.
    expect(menuBar.mobile).toEqual(sidebar.mobile);
  });
});
describe("the shell layout switcher configuration", () => {
  it("is DISABLED by default, and then composes exactly one unscoped layout", () => {
    expect(disabled.layoutSwitcher).toEqual({
      enabled: false,
      default: "sidebar",
      available: ["sidebar"],
    });
    expect(shellLayoutCompositions(disabled)).toEqual([
      { layout: null, decision: resolveShellPattern(disabled), scoped: false },
    ]);
    // No layout markup at all when nobody may choose.
    expect(layoutDataAttributes(disabled)).toEqual({});
    expect(layoutScopeAttributes("rail", ["sidebar"], false)).toEqual({});
  });

  it("resolves the configured default, and offers the declared vocabulary when enabled", () => {
    expect(sidebarEnabled.layoutSwitcher).toEqual({
      enabled: true,
      default: "sidebar",
      available: ["sidebar", "menu-bar"],
    });
    expect(menuBarDefault.layoutSwitcher.default).toBe("menu-bar");
    // The default layout's patterns ARE the resolved leaves.
    expect(menuBarDefault.navigation.desktop).toBe("top");
    expect(menuBarDefault.navigation.tablet).toBe("top-compact");
    expect(sidebarEnabled.navigation.desktop).toBe("sidebar");
  });

  it("leaves the mobile leaf, density, width, theme, CTA and presentation intent alone", () => {
    expect(sidebarEnabled.navigation.mobile).toBe(disabled.navigation.mobile);
    expect(sidebarEnabled.density).toBe(disabled.density);
    expect(sidebarEnabled.content).toEqual(disabled.content);
    expect(sidebarEnabled.theme).toEqual(disabled.theme);
    expect(sidebarEnabled.cta).toEqual(disabled.cta);
    expect(sidebarEnabled.presentation).toEqual(disabled.presentation);
    expect(sidebarEnabled.shell).toEqual(disabled.shell);
  });

  it("composes both layouts (scoped) when a visitor may choose, in vocabulary order", () => {
    expect(shellLayoutCompositions(sidebarEnabled).map((entry) => entry.layout)).toEqual([
      "sidebar",
      "menu-bar",
    ]);
    expect(shellLayoutCompositions(sidebarEnabled).every((entry) => entry.scoped)).toBe(true);
  });

  it("tells the shell which structure serves which layout", () => {
    // Sidebar default: the rail serves the sidebar layout in both bands; the header
    // navigation is composed for the menu-bar layout only.
    expect(railLayouts(sidebarEnabled, "desktop")).toEqual(["sidebar"]);
    expect(railLayouts(sidebarEnabled, "tablet")).toEqual(["sidebar"]);
    expect(headerNavigationLayouts(sidebarEnabled)).toEqual(["menu-bar"]);
    // Menu-bar default: the rail still serves the sidebar layout, the header nav serves
    // the menu-bar layout (`railCompositions` counts the unscoped composition).
    expect(railLayouts(menuBarDefault, "desktop")).toEqual(["sidebar"]);
    expect(railCompositions(menuBarDefault, "tablet")).toHaveLength(1);
    expect(headerNavigationLayouts(menuBarDefault)).toEqual(["menu-bar"]);
    // Disabled: exactly the single resolved composition, which is UNNAMED — no layout
    // governs it, so no layout label can appear in its markup.
    expect(railCompositions(disabled, "desktop")).toHaveLength(1);
    expect(railCompositions(disabled, "desktop")[0].layout).toBeNull();
    expect(railLayouts(disabled, "desktop")).toEqual([]);
    expect(railLayouts(disabled, "tablet")).toEqual([]);
    expect(headerNavigationLayouts(disabled)).toEqual([]);
    expect(headerNavigationCompositions(disabled)).toHaveLength(0);
    // A configuration that places navigation in the header WITHOUT a switcher still has
    // exactly one composition — and it is unscoped (no layout markers anywhere).
    const topBarOnly = resolveUiConfig({ navigation: { desktop: "top", tablet: "top-compact" } });
    expect(headerNavigationCompositions(topBarOnly)).toHaveLength(1);
    expect(headerNavigationLayouts(topBarOnly)).toEqual([]);
    expect(shellLayoutCompositions(topBarOnly)).toEqual([
      { layout: null, decision: resolveShellPattern(topBarOnly), scoped: false },
    ]);
  });

  it("exposes the active layout as an inert attribute, and a preference-only storage key", () => {
    expect(layoutDataAttributes(sidebarEnabled)).toEqual({ [SHELL_LAYOUT_ATTRIBUTE]: "sidebar" });
    expect(layoutDataAttributes(menuBarDefault)).toEqual({ [SHELL_LAYOUT_ATTRIBUTE]: "menu-bar" });
    expect(SHELL_LAYOUT_ATTRIBUTE).toBe("data-ui-shell-layout");
    expect(SHELL_LAYOUT_STORAGE_KEY).toBe("foundation.layout");
    // Scope markers name the structure and the layouts it serves.
    expect(layoutScopeAttributes("top-nav", ["menu-bar"], true)).toEqual({
      "data-ui-shell-part": "top-nav",
      "data-ui-shell-layouts": "menu-bar",
    });
    expect(layoutScopeAttributes("rail", ["sidebar", "menu-bar"], true)).toEqual({
      "data-ui-shell-part": "rail",
      "data-ui-shell-layouts": "sidebar menu-bar",
    });
    expect(layoutScopeAttributes("rail", [], true)).toEqual({});
  });

  it("fails LOUDLY when a resolved configuration is incomplete", () => {
    // Omit the new leaf the way a stale caller would, and require the completeness guard
    // to name it rather than letting it resolve to `undefined` silently.
    const withoutSwitcher = Object.fromEntries(
      Object.entries(disabled).filter(([key]) => key !== "layoutSwitcher"),
    ) as unknown as Partial<typeof disabled>;
    expect(() => assertResolvedUiConfigComplete(withoutSwitcher)).toThrow(UiConfigResolutionError);
    expect(() => assertResolvedUiConfigComplete(withoutSwitcher)).toThrow(/layoutSwitcher\.enabled/);
  });
});

describe("the layout switcher in `site.config.json`", () => {
  /** The smallest valid configuration file, with a UI block appended. */
  function configWith(ui: unknown) {
    return {
      site: {
        url: "https://www.example.com",
        name: "Example",
        tagline: "Tagline",
        description: "Description",
      },
      i18n: { defaultLocale: "en", locales: [{ code: "en", label: "English" }] },
      contact: { email: "hello@example.com" },
      socialLinks: [],
      navigation: [{ label: "Home", href: "/" }],
      ui,
    };
  }

  it("accepts a configured default layout, and refuses a value outside the vocabulary", () => {
    expect(
      siteConfigFileSchema.safeParse(
        configWith({ layoutSwitcher: { enabled: true, default: "menu-bar" } }),
      ).success,
    ).toBe(true);
    expect(
      siteConfigFileSchema.safeParse(
        configWith({ layoutSwitcher: { enabled: false, default: "sidebar" } }),
      ).success,
    ).toBe(true);
    // `enabled` alone is valid: the default layout is then `sidebar`.
    expect(
      siteConfigFileSchema.safeParse(configWith({ layoutSwitcher: { enabled: true } })).success,
    ).toBe(true);

    const bad = siteConfigFileSchema.safeParse(
      configWith({ layoutSwitcher: { enabled: true, default: "compact" } }),
    );
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const message = JSON.stringify(bad.error.issues);
      expect(message).toContain("layoutSwitcher");
      expect(message).toContain('"default"');
      expect(message).toContain("sidebar, menu-bar");
    }
    // Strict: an unknown leaf is refused, never ignored. A non-boolean is refused too.
    expect(
      siteConfigFileSchema.safeParse(
        configWith({ layoutSwitcher: { enabled: true, layout: "sidebar" } }),
      ).success,
    ).toBe(false);
    expect(
      siteConfigFileSchema.safeParse(configWith({ layoutSwitcher: { enabled: "yes" } })).success,
    ).toBe(false);
  });

  it("refuses enabling the switcher alongside an explicit desktop/tablet pattern", () => {
    // A layout IS those two leaves, so two answers to one question fail loudly rather
    // than one silently winning.
    for (const navigation of [
      { desktop: "minimal" },
      { tablet: "minimal" },
      { desktop: "top", tablet: "top-compact" },
    ]) {
      const result = siteConfigFileSchema.safeParse(
        configWith({ layoutSwitcher: { enabled: true }, navigation }),
      );
      expect(result.success, JSON.stringify(navigation)).toBe(false);
      if (!result.success) {
        expect(JSON.stringify(result.error.issues)).toContain("layoutSwitcher");
        expect(JSON.stringify(result.error.issues)).toContain("ambiguous");
      }
    }
    // The same leaves are perfectly valid with the switcher absent or disabled.
    for (const layoutSwitcher of [undefined, { enabled: false }]) {
      expect(
        siteConfigFileSchema.safeParse(
          configWith({ layoutSwitcher, navigation: { desktop: "minimal", tablet: "minimal" } }),
        ).success,
        JSON.stringify(layoutSwitcher),
      ).toBe(true);
    }
  });

  it("keeps the switcher OPTIONAL: a UI block without it stays valid", () => {
    expect(siteConfigFileSchema.safeParse(configWith({ density: "comfortable" })).success).toBe(true);
    expect(siteConfigFileSchema.safeParse(configWith(undefined)).success).toBe(true);
  });
});

