import type { DesktopNavigationPattern, TabletNavigationPattern } from "./vocabulary";
import type { ResolvedUiConfig } from "./resolve";
import { resolveShellPattern, type ShellPatternDecision } from "./shell";

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
 * vocabulary:
 *
 *  - `sidebar`   the canonical Foundation composition: a desktop sidebar and a
 *                collapsed rail on tablet;
 *  - `menu-bar`  a top navigation bar on desktop and its compact tablet form.
 *
 * The mobile leaf is deliberately NOT part of a layout (both share it).
 */
export const SHELL_LAYOUT_PATTERNS: Readonly<
  Record<
    ShellLayout,
    { readonly desktop: DesktopNavigationPattern; readonly tablet: TabletNavigationPattern }
  >
> = {
  sidebar: { desktop: "sidebar", tablet: "collapsed-sidebar" },
  "menu-bar": { desktop: "top", tablet: "top-compact" },
};

/** Whether a value is a layout this platform implements (never a free-form name). */
export function isShellLayout(value: unknown): value is ShellLayout {
  return typeof value === "string" && (SHELL_LAYOUTS as readonly string[]).includes(value);
}

/** The same resolved configuration, composed as `layout` instead of another layout. */
export function applyShellLayout(resolved: ResolvedUiConfig, layout: ShellLayout): ResolvedUiConfig {
  const patterns = SHELL_LAYOUT_PATTERNS[layout];
  return {
    ...resolved,
    navigation: { ...resolved.navigation, desktop: patterns.desktop, tablet: patterns.tablet },
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
  band: "desktop" | "tablet",
): readonly ShellLayoutComposition[] {
  return shellLayoutCompositions(resolved).filter(
    (composition) =>
      (band === "desktop"
        ? composition.decision.desktop.slot
        : composition.decision.tablet.slot) === "aside",
  );
}

/** The layouts whose composition places a navigation rail in the given band. */
export function railLayouts(
  resolved: ResolvedUiConfig,
  band: "desktop" | "tablet",
): readonly ShellLayout[] {
  return railCompositions(resolved, band)
    .map((composition) => composition.layout)
    .filter((layout): layout is ShellLayout => layout !== null);
}

/** The compositions that place the primary navigation in the header (≥md). */
export function headerNavigationCompositions(
  resolved: ResolvedUiConfig,
): readonly ShellLayoutComposition[] {
  return shellLayoutCompositions(resolved).filter(
    (composition) =>
      composition.decision.desktop.slot === "header" || composition.decision.tablet.slot === "header",
  );
}

/** The layouts whose composition places the primary navigation in the header (≥md). */
export function headerNavigationLayouts(resolved: ResolvedUiConfig): readonly ShellLayout[] {
  return headerNavigationCompositions(resolved)
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

/** The scope markers one structure carries: the layouts it IS the active navigation for. */
export function layoutScopeAttributes(
  part: "rail" | "top-nav",
  layouts: readonly ShellLayout[],
  scoped: boolean,
): Readonly<Record<string, string>> {
  if (!scoped || layouts.length === 0) return {};
  return { "data-ui-shell-part": part, "data-ui-shell-layouts": layouts.join(" ") };
}
