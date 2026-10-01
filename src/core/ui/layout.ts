import type {
  DesktopNavigationPattern,
  MenuMode,
  MobileNavigationPattern,
  TabletNavigationPattern,
} from "./vocabulary";
import type { ResolvedUiConfig } from "./resolve";
import { resolveShellPattern, type ShellBand, type ShellPatternDecision } from "./shell";

/**
 * SHELL LAYOUT PRESENTATION — the visitor-selectable shell composition (N2).
 *
 * The platform has always resolved ONE shell composition from the `ui` namespace
 * (`navigation.desktop` / `navigation.tablet` / `navigation.mobile`). N2 adds the
 * optional capability to let a VISITOR choose between two compositions of the SAME
 * site: a desktop sidebar and a top menu bar. Nothing else changes — the page, its
 * route, its locale, its content and every other resolved leaf are identical under
 * both.
 *
 * WHAT A LAYOUT IS (and is not)
 * ----------------------------
 * A layout is a named PRESET of exactly two existing vocabulary leaves,
 * `navigation.desktop` and `navigation.tablet`. It is not a second shell system, a
 * theme, or the retired Presentation profiler: typography, rhythm, surface, header
 * band, hero, density, width, theme and CTA are untouched, and the MOBILE
 * composition is unchanged — a visitor switching layouts switches the site's broad
 * desktop/tablet presentation, never asks for a second mobile product.
 *
 * Every decision still flows through the ONE decision core: a layout is applied by
 * substituting its two leaves and calling `resolveShellPattern`, so neither
 * reference choice can invent a composition the shell engine does not already
 * implement.
 *
 * Framework-neutral by design: pure data + types only. No React, Next.js, Tailwind,
 * adapters, or configuration.
 */

/** The layouts a visitor may choose between. This list IS the vocabulary. */
export const SHELL_LAYOUTS = ["sidebar", "menu-bar"] as const;
export type ShellLayout = (typeof SHELL_LAYOUTS)[number];

/**
 * Each layout's navigation composition, expressed in the EXISTING pattern
 * vocabulary — all THREE viewport leaves, so a layout is the whole responsive
 * presentation of its configured mode:
 *
 *  - `sidebar`   the canonical Foundation composition: a desktop sidebar, a collapsed rail on
 *                tablet, and — NAV1D — THAT SAME persistent rail at mobile width
 *                (`navigation.mobile: "persistent-sidebar"`): one identical sidebar at every
 *                viewport, never a drawer or a header disclosure substitute;
 *  - `menu-bar`  a top navigation bar on desktop, its compact tablet form, and
 *                the sticky bottom bar (`navigation.mobile: "bottom-bar"`).
 *
 * FOUNDATION-DEFECT-NAV1A — the mobile leaf IS part of a layout. It used to be
 * excluded so that "both layouts shared one mobile navigation", which made
 * VIEWPORT WIDTH decide the navigation architecture: at <md a sidebar site was
 * presented through the menu-bar's bottom bar and the mode-selection control was
 * withdrawn, so the configured mode stopped being the visitor's navigation. The
 * viewport now only changes HOW the configured mode is presented, never WHICH
 * mode it is. No new mode is introduced — each preset names a value of the shipped
 * `navigation.mobile` vocabulary (NAV1D added `persistent-sidebar` to it, so "the sidebar, at
 * every width" is ALSO a configuration a site can state directly).
 *
 * FOUNDATION-DEFECT-NAV1D — "how the configured mode is presented" must not become a substitute:
 * the sidebar preset used to present its `<md` widths through the sidebar capability's own
 * off-canvas drawer (a `Show navigation` disclosure band), which is not the sidebar. The preset
 * therefore names `persistent-sidebar`, so the SAME rails the ≥md bands present are presented at
 * mobile width too. Responsive breakpoints still choose WHEN a band is presented; they no longer
 * choose WHAT the sidebar mode is.
 */
export const SHELL_LAYOUT_PATTERNS: Readonly<
  Record<
    ShellLayout,
    {
      readonly desktop: DesktopNavigationPattern;
      readonly tablet: TabletNavigationPattern;
      readonly mobile: MobileNavigationPattern;
      /**
       * NAV1B — the ≥md top menu this layout presents, when it presets that leaf at all. A
       * layout that omits it leaves `ui.navigation.top.mode` exactly as configured (the value
       * is inert there, because that layout composes no ≥md header navigation).
       */
      readonly topMenu?: MenuMode;
    }
  >
> = {
  sidebar: { desktop: "sidebar", tablet: "collapsed-sidebar", mobile: "persistent-sidebar" },
  // NAV1B — MENU BAR MEANS THE STICKY BOTTOM BAR AT EVERY WIDTH. Its ≥md top menu is CLOSED,
  // so no top navigation is composed in any band, and the sticky bottom bar — which covers
  // every band this composition leaves open — IS the navigation. Nothing new is invented:
  // `closed` is the shipped three-state menu contract the header already honors (a closed
  // menu composes no navigation landmark at all, so no hidden duplicate can be tabbed to).
  "menu-bar": {
    desktop: "top",
    tablet: "top-compact",
    mobile: "bottom-bar",
    topMenu: "closed",
  },
};

/** Whether a value is a layout this platform implements (never a free-form name). */
export function isShellLayout(value: unknown): value is ShellLayout {
  return typeof value === "string" && (SHELL_LAYOUTS as readonly string[]).includes(value);
}

/**
 * The same resolved configuration, composed as `layout` instead of another layout.
 *
 * All three viewport leaves are substituted (desktop, tablet AND mobile): a layout
 * describes the whole responsive presentation of one configured mode, so choosing
 * it at any width presents THAT mode (NAV1A).
 */
export function applyShellLayout(resolved: ResolvedUiConfig, layout: ShellLayout): ResolvedUiConfig {
  const patterns = SHELL_LAYOUT_PATTERNS[layout];
  return {
    ...resolved,
    navigation: {
      ...resolved.navigation,
      desktop: patterns.desktop,
      tablet: patterns.tablet,
      mobile: patterns.mobile,
      // NAV1B — a layout may also preset the ≥md top menu (the menu-bar layout closes it,
      // because its navigation is the sticky bottom bar at every width). A layout that
      // declares no top menu leaves the configured value untouched.
      ...(patterns.topMenu === undefined
        ? {}
        : { top: { ...resolved.navigation.top, mode: patterns.topMenu } }),
    },
  };
}

/**
 * One composed structure set: which layout it presents (or `null` for the single
 * composition of a site that offers no choice, whose patterns are configured
 * directly), the decision it resolves to, and whether its structures carry layout
 * scope markers. The markers exist ONLY while the switcher is enabled, so a site that
 * offers no choice produces byte-identical markup to the single-composition shell.
 */
export interface ShellLayoutComposition {
  readonly layout: ShellLayout | null;
  readonly decision: ShellPatternDecision;
  readonly scoped: boolean;
}

/**
 * Every composition the shell must be able to present: the configured default, plus
 * every other layout when the visitor may choose (always in the declared vocabulary
 * order, so markup is deterministic). With the switcher disabled this is exactly the
 * composition the shell has always produced — unscoped, and unnamed because no layout
 * governs it.
 */
export function shellLayoutCompositions(
  resolved: ResolvedUiConfig,
): readonly ShellLayoutComposition[] {
  if (!resolved.layoutSwitcher.enabled) {
    return [{ layout: null, decision: resolveShellPattern(resolved), scoped: false }];
  }
  return SHELL_LAYOUTS.map((layout) => ({
    layout,
    decision: resolveShellPattern(applyShellLayout(resolved, layout)),
    scoped: true,
  }));
}

/** The compositions that place a navigation rail in the given band. */
export function railCompositions(
  resolved: ResolvedUiConfig,
  band: ShellBand,
): readonly ShellLayoutComposition[] {
  return shellLayoutCompositions(resolved).filter(
    (composition) => composition.decision[band].slot === "aside",
  );
}

/** The layouts whose composition places a navigation rail in the given band. */
export function railLayouts(
  resolved: ResolvedUiConfig,
  band: ShellBand,
): readonly ShellLayout[] {
  return railCompositions(resolved, band)
    .map((composition) => composition.layout)
    .filter((layout): layout is ShellLayout => layout !== null);
}

/**
 * The compositions that present the primary navigation in the header (≥md) — a header SLOT
 * whose band actually carries a navigation (NAV1B: a closed ≥md top menu composes none, which
 * is how a Menu-bar composition hands its navigation to the sticky bottom bar at every width).
 */
export function headerNavigationCompositions(
  resolved: ResolvedUiConfig,
): readonly ShellLayoutComposition[] {
  return shellLayoutCompositions(resolved).filter(
    (composition) =>
      (composition.decision.desktop.slot === "header" &&
        composition.decision.desktop.presentsNavigation) ||
      (composition.decision.tablet.slot === "header" &&
        composition.decision.tablet.presentsNavigation),
  );
}

/** The layouts whose composition places the primary navigation in the header (≥md). */
export function headerNavigationLayouts(resolved: ResolvedUiConfig): readonly ShellLayout[] {
  return headerNavigationCompositions(resolved)
    .map((composition) => composition.layout)
    .filter((layout): layout is ShellLayout => layout !== null);
}

/**
 * The compositions whose MOBILE viewport (<md) is served by the sticky bottom bar
 * (`navigation.mobile: "bottom-bar"`).
 *
 * NAV1A — the mobile surface is a property of the COMPOSITION, exactly like the rail
 * bands above: the shell renders every composed mobile surface and the stylesheet
 * exposes the one the active layout owns, so a sidebar site is never presented through
 * the menu-bar's bottom bar. With the switcher disabled this is the single
 * (unscoped) composition, so a one-composition site is unchanged.
 */
export function bottomBarCompositions(resolved: ResolvedUiConfig): readonly ShellLayoutComposition[] {
  return shellLayoutCompositions(resolved).filter(
    (composition) => composition.decision.mobile.primitiveKind === "bottom-bar",
  );
}

/** The layouts whose mobile viewport is the bottom bar (empty → no layout-scoped bar). */
export function bottomBarLayouts(resolved: ResolvedUiConfig): readonly ShellLayout[] {
  return bottomBarCompositions(resolved)
    .map((composition) => composition.layout)
    .filter((layout): layout is ShellLayout => layout !== null);
}

/**
 * The compositions whose MOBILE viewport (<md) is a DISCLOSURE — the off-canvas
 * drawer/overlay the shell's mobile navigation layer already implements
 * (`navigation.mobile: "drawer" | "overlay"`). This is the configured-disclosure
 * capability, and it is NOT how the `sidebar` layout presents its mobile width (NAV1D):
 * that layout names `persistent-sidebar`, so its rail IS its mobile navigation and the
 * shell composes no disclosure for it at all. A site that explicitly configures
 * `navigation.mobile: "drawer"` still gets exactly this composition.
 */
export function mobileDisclosureCompositions(
  resolved: ResolvedUiConfig,
): readonly ShellLayoutComposition[] {
  return shellLayoutCompositions(resolved).filter(
    (composition) =>
      composition.decision.mobile.primitiveKind === "drawer" ||
      composition.decision.mobile.primitiveKind === "overlay",
  );
}

/** The layouts whose mobile viewport is a disclosure (empty when none composes one). */
export function mobileDisclosureLayouts(resolved: ResolvedUiConfig): readonly ShellLayout[] {
  return mobileDisclosureCompositions(resolved)
    .map((composition) => composition.layout)
    .filter((layout): layout is ShellLayout => layout !== null);
}

/**
 * The attribute the renderer sets on `<html>` to name the ACTIVE layout, and the
 * browser-local key that remembers a visitor's choice.
 *
 * The attribute is inert (a CSS hook, exactly like the P5-3 `data-ui-*` attributes);
 * the storage key holds the visitor's layout preference and nothing else — no
 * identity, no session, no server state — so no route becomes dynamic.
 */
export const SHELL_LAYOUT_ATTRIBUTE = "data-ui-shell-layout";

/** Browser-local layout preference. Unavailable/unreadable storage falls back cleanly. */
export const SHELL_LAYOUT_STORAGE_KEY = "foundation.layout";

/** The `<html>` attributes for the resolved switcher state (nothing when disabled). */
export function layoutDataAttributes(
  resolved: ResolvedUiConfig,
): Readonly<Record<string, string>> {
  return resolved.layoutSwitcher.enabled
    ? { [SHELL_LAYOUT_ATTRIBUTE]: resolved.layoutSwitcher.default }
    : {};
}

/**
 * The structures a layout scope marker may name — every navigation surface that exactly
 * ONE layout exposes (`data-ui-shell-part`). The ≥md rail and header navigation were the
 * first two; NAV1A added the two MOBILE surfaces, so a sidebar site and a menu-bar site
 * can never present the same mobile navigation.
 */
export const SHELL_SCOPE_PARTS = ["rail", "top-nav", "bottom-bar", "mobile-drawer"] as const;
export type ShellScopePart = (typeof SHELL_SCOPE_PARTS)[number];

/** The scope markers one structure carries: the layouts it IS the active navigation for. */
export function layoutScopeAttributes(
  part: ShellScopePart,
  layouts: readonly ShellLayout[],
  scoped: boolean,
): Readonly<Record<string, string>> {
  if (!scoped || layouts.length === 0) return {};
  return { "data-ui-shell-part": part, "data-ui-shell-layouts": layouts.join(" ") };
}
