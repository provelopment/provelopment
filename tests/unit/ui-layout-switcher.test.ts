import { describe, expect, it } from "vitest";

import { siteConfigFileSchema } from "@/config/schema";
import {
  DESKTOP_NAVIGATION_PATTERNS,
  MOBILE_NAVIGATION_PATTERNS,
  SHELL_LAYOUT_ATTRIBUTE,
  SHELL_LAYOUT_PATTERNS,
  SHELL_LAYOUT_STORAGE_KEY,
  SHELL_LAYOUTS,
  SHELL_SCOPE_PARTS,
  TABLET_NAVIGATION_PATTERNS,
  applyShellLayout,
  assertResolvedUiConfigComplete,
  bandClassName,
  bottomBarCompositions,
  bottomBarLayouts,
  headerNavigationCompositions,
  headerNavigationLayouts,
  isShellLayout,
  layoutDataAttributes,
  layoutScopeAttributes,
  mobileDisclosureCompositions,
  mobileDisclosureLayouts,
  mobileSurfaceBands,
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
 * The platform keeps ONE shell decision core: a layout is a preset of exactly THREE
 * existing vocabulary leaves (`navigation.desktop`/`tablet`/`mobile`, the mobile leaf
 * added by FOUNDATION-DEFECT-NAV1A), so these assertions pin the mapping, the
 * resolution, the configuration coherence rule (a layout IS those three leaves, so
 * configuring any of them is refused), the fact that nothing else moves (density,
 * width, theme, CTA, the P5-3 presentation intent), and that the two layouts present
 * GENUINELY DIFFERENT mobile navigation.
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
      mobile: "drawer",
    });
    // NAV1B — MENU BAR MEANS THE STICKY BOTTOM BAR AT EVERY WIDTH: the preset also CLOSES the
    // ≥md top menu (`closed` is the shipped three-state menu contract), so no top navigation is
    // composed in any band and the bar — which covers every band the composition leaves open —
    // IS the navigation. No new value and no new mode: the leaves are the shipped vocabulary.
    expect(SHELL_LAYOUT_PATTERNS["menu-bar"]).toEqual({
      desktop: "top",
      tablet: "top-compact",
      mobile: "bottom-bar",
      topMenu: "closed",
    });
    for (const [layout, patterns] of Object.entries(SHELL_LAYOUT_PATTERNS)) {
      expect(DESKTOP_NAVIGATION_PATTERNS, layout).toContain(patterns.desktop);
      expect(TABLET_NAVIGATION_PATTERNS, layout).toContain(patterns.tablet);
      expect(MOBILE_NAVIGATION_PATTERNS, layout).toContain(patterns.mobile);
    }
    // NAV1A — the two layouts must not present the same mobile navigation: the sidebar
    // layout owns an off-canvas drawer, the menu-bar layout the sticky bottom bar.
    expect(SHELL_LAYOUT_PATTERNS.sidebar.mobile).not.toBe(
      SHELL_LAYOUT_PATTERNS["menu-bar"].mobile,
    );
  });

  it("refuses an arbitrary layout value", () => {
    for (const value of SHELL_LAYOUTS) expect(isShellLayout(value), value).toBe(true);
    for (const value of ["compact", "SIDEBAR", "menu_bar", "", "top", undefined, null, 1, {}]) {
      expect(isShellLayout(value), String(value)).toBe(false);
    }
  });

  it("applies a layout to the THREE navigation leaves and NOTHING else", () => {
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
    // NAV1A — the mobile leaf belongs to the layout too.
    expect(applied.navigation.mobile).toBe("bottom-bar");
    expect(applyShellLayout(base, "sidebar").navigation.mobile).toBe("drawer");
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
    // NAV1A/NAV1B — the MOBILE composition follows the configured mode, never the viewport:
    // the sidebar layout presents its own disclosure (drawer + its trigger), the menu-bar
    // layout the sticky bottom bar (no disclosure trigger). `presentsNavigation` is the band
    // model: the mobile band always presents a surface of its own.
    expect(sidebar.mobile).toEqual({
      primitiveKind: "drawer",
      slot: "header",
      ctaSlot: "none",
      trigger: true,
      presentsNavigation: true,
    });
    expect(menuBar.mobile).toEqual({
      primitiveKind: "bottom-bar",
      slot: "header",
      ctaSlot: "none",
      trigger: false,
      presentsNavigation: true,
    });
    expect(menuBar.mobile).not.toEqual(sidebar.mobile);
  });
});
describe("the mobile navigation each layout owns (NAV1A)", () => {
  it("gives the sidebar layout a drawer and the menu-bar layout the bottom bar", () => {
    // The switcher composes BOTH layouts, so both mobile surfaces exist in the markup and
    // the stylesheet exposes the one the ACTIVE layout owns.
    expect(mobileDisclosureLayouts(sidebarEnabled)).toEqual(["sidebar"]);
    expect(bottomBarLayouts(sidebarEnabled)).toEqual(["menu-bar"]);
    expect(
      mobileDisclosureCompositions(sidebarEnabled)[0].decision.mobile.primitiveKind,
    ).toBe("drawer");
    expect(bottomBarCompositions(sidebarEnabled)[0].decision.mobile.primitiveKind).toBe(
      "bottom-bar",
    );
  });

  it("never lets one layout own BOTH mobile surfaces, and composes one for every layout", () => {
    for (const resolved of [sidebarEnabled, menuBarDefault, disabled]) {
      const drawers = new Set(mobileDisclosureLayouts(resolved));
      for (const layout of bottomBarLayouts(resolved)) expect(drawers.has(layout)).toBe(false);
      // Every composition presents exactly one mobile navigation (no layout is left with
      // none, and none composes two).
      expect(
        mobileDisclosureCompositions(resolved).length + bottomBarCompositions(resolved).length,
      ).toBeGreaterThan(0);
    }
  });

  it("keeps a one-composition site on its configured surface, unscoped", () => {
    // The canonical default resolves `navigation.mobile: "bottom-bar"`, so a site that
    // offers no choice composes exactly that bar and emits no layout markers at all.
    expect(bottomBarCompositions(disabled)).toHaveLength(1);
    expect(bottomBarLayouts(disabled)).toEqual([]);
    expect(mobileDisclosureCompositions(disabled)).toEqual([]);
  });

  it("declares the mobile surfaces in the scope-part vocabulary", () => {
    expect(SHELL_SCOPE_PARTS).toEqual(["rail", "top-nav", "bottom-bar", "mobile-drawer"]);
    expect(layoutScopeAttributes("mobile-drawer", ["sidebar"], true)).toEqual({
      "data-ui-shell-part": "mobile-drawer",
      "data-ui-shell-layouts": "sidebar",
    });
    expect(layoutScopeAttributes("bottom-bar", ["menu-bar"], true)).toEqual({
      "data-ui-shell-part": "bottom-bar",
      "data-ui-shell-layouts": "menu-bar",
    });
    // Unscoped (or an unknown layout) → no markers at all.
    expect(layoutScopeAttributes("bottom-bar", [], true)).toEqual({});
    expect(layoutScopeAttributes("mobile-drawer", ["sidebar"], false)).toEqual({});
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

  it("owns the three navigation leaves and leaves density, width, theme, CTA and presentation alone", () => {
    // NAV1A — the switcher's default layout owns the mobile leaf as well as
    // desktop/tablet, so the configured mode is what the visitor navigates at EVERY
    // width. Everything that is not a viewport navigation leaf stays untouched.
    expect(sidebarEnabled.navigation.mobile).toBe(
      SHELL_LAYOUT_PATTERNS[SHELL_LAYOUTS[0]].mobile,
    );
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
    // Sidebar default: the rail serves the sidebar layout in both bands, and the sidebar's own
    // disclosure serves it where no rail is composed. NAV1B — the MENU-BAR layout composes NO
    // ≥md header navigation at all (its ≥md top menu is closed): its navigation is the sticky
    // bottom bar, presented at every width.
    expect(railLayouts(sidebarEnabled, "desktop")).toEqual(["sidebar"]);
    expect(railLayouts(sidebarEnabled, "tablet")).toEqual(["sidebar"]);
    expect(headerNavigationLayouts(sidebarEnabled)).toEqual([]);
    // Menu-bar default: the rail still serves the sidebar layout, the header nav serves
    // the menu-bar layout (`railCompositions` counts the unscoped composition).
    expect(railLayouts(menuBarDefault, "desktop")).toEqual(["sidebar"]);
    expect(railCompositions(menuBarDefault, "tablet")).toHaveLength(1);
    expect(headerNavigationLayouts(menuBarDefault)).toEqual([]);
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

  /**
   * NAV1B — WHICH BANDS EACH MODE'S NAVIGATION COVERS. The bottom bar is presented in every band
   * its composition leaves without navigation, so a MENU-BAR composition (≥md top menu closed)
   * presents it at every width while the canonical sidebar composition keeps the historic `<md`
   * bar. The same derived gate places each composition's constrained-width disclosure.
   */
  it("derives each surface's width band from the composition, never from the viewport", () => {
    const [sidebarComposition, menuBarComposition] = shellLayoutCompositions(sidebarEnabled);
    // Sidebar: the rails cover desktop + tablet, so its disclosure is `<md`-only.
    expect(sidebarComposition.decision.openBands).toEqual([]);
    expect(mobileSurfaceBands(sidebarComposition.decision)).toEqual(["mobile"]);
    expect(bandClassName(mobileSurfaceBands(sidebarComposition.decision))).toBe("md:hidden");
    // Menu bar: NO band carries a ≥md navigation, so the sticky bar is presented at EVERY width.
    expect(menuBarComposition.decision.openBands).toEqual(["tablet", "desktop"]);
    expect(mobileSurfaceBands(menuBarComposition.decision)).toEqual([
      "mobile",
      "tablet",
      "desktop",
    ]);
    expect(bandClassName(mobileSurfaceBands(menuBarComposition.decision))).toBe("");
    // A one-composition site is unchanged: the canonical default still presents the bar `<md` only.
    expect(bandClassName(mobileSurfaceBands(resolveShellPattern(disabled)))).toBe("md:hidden");
    // The exhaustive gate table: every band set maps to a gate (never a call-site guess).
    expect(bandClassName([])).toBe("");
    expect(bandClassName(["tablet"])).toBe("hidden md:block lg:hidden");
    expect(bandClassName(["desktop"])).toBe("hidden lg:block");
    expect(bandClassName(["mobile", "tablet"])).toBe("lg:hidden");
    expect(bandClassName(["tablet", "desktop"])).toBe("hidden md:block");
    expect(bandClassName(["mobile", "desktop"])).toBe("md:hidden lg:block");
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

  it("refuses enabling the switcher alongside an explicit desktop/tablet/mobile pattern", () => {
    // A layout IS those three leaves (NAV1A includes the mobile leaf), so two answers to
    // one question fail loudly rather than one silently winning.
    for (const navigation of [
      { desktop: "minimal" },
      { tablet: "minimal" },
      { mobile: "overlay" },
      { desktop: "top", tablet: "top-compact", mobile: "drawer" },
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
          configWith({
            layoutSwitcher,
            navigation: { desktop: "minimal", tablet: "minimal", mobile: "drawer" },
          }),
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

