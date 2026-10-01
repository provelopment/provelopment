import type { ResolvedUiConfig } from "./resolve";
import type { UiDensity, ContentWidth } from "./vocabulary";

/**
 * Shell pattern decision core (UI-04 — Shell Engine).
 *
 * The pure, framework-free translation of RESOLVED SEMANTIC INTENT into a
 * deterministic shell composition decision. It decides:
 *
 *  - which navigation primitive kind serves each viewport,
 *  - which slot that primitive occupies in the shell,
 *  - where (if anywhere) the primary CTA is placed,
 *  - which density/content-width utility classes apply.
 *
 * CRITICAL BOUNDARY (master-ui-phase §7): this core understands INTENT, not
 * business content — and NEVER presentation identity. Every branch is a pure
 * function of the RESOLVED VOCABULARY VALUES (`navigation.desktop/tablet/
 * mobile`, `shell.*`, `cta.enabled`), so any Presentation or explicit configuration
 * (UI-05+) yields a correct shell with no code change here.
 *
 * The RESULT is a decision; the framework layer (`src/components/shell/
 * shell-engine.tsx`) interprets it into markup via the shared primitives.
 */

/** Navigation primitive kinds the UI-03 primitives provide. */
export type ShellPrimitiveKind =
  | "top-bar"
  | "sidebar"
  | "collapsed-sidebar"
  | "minimal"
  | "floating"
  | "drawer"
  | "bottom-bar"
  | "top"
  | "overlay";

export interface PerViewportDecision {
  /** Which primitive kind serves this viewport. */
  readonly primitiveKind: ShellPrimitiveKind;
  /** Where the desktop/tablet nav primitive sits in the shell. */
  readonly slot: "header" | "aside";
  /**
   * P6-3C — the CTA's authoritative slot. `"top"` = the shell's TOP region
   * (rendered once, below the header and above `<main>`, structurally OUTSIDE
   * the aside rail and outside every mobile navigation layer). `"none"` = no
   * CTA is composed at all. The navigation composition never moves the CTA.
   */
  readonly ctaSlot: "top" | "none";
  /** Whether a client trigger opens the layer (drawer/overlay only; false otherwise). */
  readonly trigger?: boolean;
  /**
   * NAV1B — whether this band PRESENTS a navigation structure of its own: a rail in the
   * aside slot (while the sidebar capability is composed), or a ≥md header navigation while
   * the top menu is not closed. A band that presents nothing is OPEN, and the composition's
   * mobile surface (its sticky bottom bar, or the sidebar's own disclosure) covers it — which
   * is what lets the configured MODE, not the viewport width, own the navigation.
   */
  readonly presentsNavigation: boolean;
}

/** The deterministic shell composition decision for one resolved config. */
export interface ShellPatternDecision {
  readonly desktop: PerViewportDecision;
  readonly tablet: PerViewportDecision;
  readonly mobile: PerViewportDecision;
  /** Utility classes the engine applies for density/content-width. */
  readonly classes: { readonly densityClass: string; readonly contentWidthClass: string };
  /** Whether a primary CTA is composed at all (resolved.cta.enabled). */
  readonly cta: { readonly present: boolean };
  /**
   * NAV1B — the bands in which this composition presents NO navigation of its own. A MOBILE
   * navigation surface is presented in every band listed here PLUS its own `mobile` band, so
   * which surface carries the navigation follows the configured MODE at every width.
   */
  readonly openBands: readonly ShellBand[];
}

/**
 * NAV1B — THE VIEWPORT BANDS A COMPOSITION IS PRESENTED IN.
 *
 * `mobile` = <md, `tablet` = md…lg, `desktop` = ≥lg — the SAME 48rem/64rem bounds the
 * stylesheet's `md:`/`lg:` utilities resolve from, so a band and the class that renders it can
 * never disagree about where it begins.
 */
export const SHELL_BANDS = ["mobile", "tablet", "desktop"] as const;
export type ShellBand = (typeof SHELL_BANDS)[number];

/**
 * NAV1B — the width gate that presents a surface in EXACTLY `bands`.
 *
 * A composition property, never a call-site guess: the gate is derived from `bands` with this
 * exhaustive table (one row per subset, unit-tested), because viewport width may decide how a
 * MODE is presented but never which navigation the mode owns. An empty set means the surface
 * is not composed at all, so no gate is emitted.
 */
export function bandClassName(bands: readonly ShellBand[]): string {
  const key = SHELL_BANDS.filter((band) => bands.includes(band)).join(" ");
  switch (key) {
    case "mobile":
      return "md:hidden";
    case "tablet":
      return "hidden md:block lg:hidden";
    case "desktop":
      return "hidden lg:block";
    case "mobile tablet":
      return "lg:hidden";
    case "mobile desktop":
      return "md:hidden lg:block";
    case "tablet desktop":
      return "hidden md:block";
    default:
      // Every width (the full set) — and the not-composed case, which emits nothing.
      return "";
  }
}

/**
 * NAV1B — the bands a MOBILE navigation surface is presented in: its own `mobile` band plus every
 * band this composition leaves without navigation. `mobile-bar + desktop + tablet` therefore means
 * a Menu-bar composition whose sticky bar is the navigation at EVERY width, while the canonical
 * sidebar composition (rails ≥md) yields `mobile` alone — the historic `<md`-only bar, unchanged.
 */
export function mobileSurfaceBands(decision: ShellPatternDecision): readonly ShellBand[] {
  return SHELL_BANDS.filter((band) => band === "mobile" || decision.openBands.includes(band));
}

/**
 * P6-3C — the primary CTA is placed ONCE, in the shell's top region, for every
 * viewport: the owner-approved model is "Book now sits at the top of the page,
 * independently of the sidebar". The navigation decisions below therefore never
 * carry the CTA into the aside rail, the bottom bar, or the drawer/overlay —
 * only whether it exists at all.
 */
function ctaSlotFor(ctaPresent: boolean): "top" | "none" {
  return ctaPresent ? "top" : "none";
}

function desktopDecision(
  kind: ShellPrimitiveKind,
  presentsNavigation: boolean,
  ctaPresent: boolean,
): PerViewportDecision {
  const slot = kind === "sidebar" || kind === "floating" ? "aside" : "header";
  return { primitiveKind: kind, slot, ctaSlot: ctaSlotFor(ctaPresent), presentsNavigation };
}

function tabletDecision(
  kind: ShellPrimitiveKind,
  presentsNavigation: boolean,
  ctaPresent: boolean,
): PerViewportDecision {
  const slot = kind === "collapsed-sidebar" || kind === "floating" ? "aside" : "header";
  return { primitiveKind: kind, slot, ctaSlot: ctaSlotFor(ctaPresent), presentsNavigation };
}

function mobileDecision(kind: ShellPrimitiveKind, trigger: boolean, ctaPresent: boolean): PerViewportDecision {
  // The mobile band always presents a surface of its own (the sticky bar, or the sidebar
  // composition's disclosure) — never an open band.
  return {
    primitiveKind: kind,
    slot: "header",
    ctaSlot: ctaSlotFor(ctaPresent),
    trigger,
    presentsNavigation: true,
  };
}

/**
 * Deterministic BottomNavigation content rule (UI-05, requirement B).
 *
 * The bottom bar shows the FIRST `BOTTOM_NAV_PRIMARY_LIMIT` (4) navigation items
 * in CONFIGURATION order; any remainder is exposed through the "More" drawer when
 * it is non-empty. This uses ONLY the existing ordered site content model
 * (`site.config.json` `navigation`) — no new mobile-navigation configuration
 * namespace and no invented business semantics. The limit is a Foundation-owned
 * design constant (a small bar with ≥44px touch targets).
 */
export const BOTTOM_NAV_PRIMARY_LIMIT = 4;

export interface BottomNavSplit<T> {
  /** The items shown directly in the bottom bar (first N in configured order). */
  readonly primary: readonly T[];
  /** Remaining items exposed via the "More" drawer (empty → no drawer). */
  readonly remainder: readonly T[];
}

export function splitBottomNavItems<T>(items: readonly T[]): BottomNavSplit<T> {
  return {
    primary: items.slice(0, BOTTOM_NAV_PRIMARY_LIMIT),
    remainder: items.slice(BOTTOM_NAV_PRIMARY_LIMIT),
  };
}

/** Density → inert marker class. The DEFAULT (`comfortable`) emits nothing —
 *  the shipped shell is byte-identical. Opt-in values expose a hook for design
 *  tokens in later phases (UI-05+). */
export function densityClass(density: UiDensity): string {
  switch (density) {
    case "compact": return "ui-density-compact";
    case "spacious": return "ui-density-spacious";
    case "comfortable":
    default: return "";
  }
}

/** Content width → Tailwind container utility. The DEFAULT (`standard`) emits
 *  nothing — the shipped shell's per-region containers stay as-is
 *  (byte-identical). The wider/narrow values are opt-in semantics. */
export function contentWidthClass(width: ContentWidth): string {
  switch (width) {
    case "narrow": return "max-w-screen-md";
    case "wide": return "max-w-screen-2xl";
    case "full": return "max-w-none";
    case "standard":
    default: return "";
  }
}

/**
 * Resolve the shell composition decision from a fully-resolved UI config.
 *
 * Pure function of the resolved vocabulary values; no presentation identity, no
 * business content, no framework imports.
 */
export function resolveShellPattern(resolved: ResolvedUiConfig): ShellPatternDecision {
  const desktopKind: ShellPrimitiveKind = resolved.navigation.desktop === "sidebar"
    ? "sidebar"
    : resolved.navigation.desktop === "minimal"
      ? "minimal"
      : resolved.navigation.desktop === "floating"
        ? "floating"
        : "top-bar";

  const tabletKind: ShellPrimitiveKind = resolved.navigation.tablet === "collapsed-sidebar"
    ? "collapsed-sidebar"
    : resolved.navigation.tablet === "minimal"
      ? "minimal"
      : resolved.navigation.tablet === "floating"
        ? "floating"
        : "top-bar";

  const mobileKind: ShellPrimitiveKind = resolved.navigation.mobile === "bottom-bar"
    ? "bottom-bar"
    : resolved.navigation.mobile === "overlay"
      ? "overlay"
      : resolved.navigation.mobile === "top"
        ? "top"
        : "drawer";

  const ctaPresent = resolved.cta.enabled === true;
  // NAV1B — WHICH BANDS CARRY A NAVIGATION OF THEIR OWN.
  //
  // An aside slot carries a rail only while the sidebar capability is composed
  // (`ui.navigation.sidebar.mode !== "closed"`); a header slot carries the ≥md top menu only
  // while that menu is not closed. Everything else is an OPEN band, which the composition's
  // mobile surface covers — so a Menu-bar composition (whose ≥md top menu is closed, its
  // navigation being the sticky bottom bar) is honestly described rather than special-cased.
  const topMenuPresented = resolved.navigation.top.mode !== "closed";
  const sidebarComposed = resolved.navigation.sidebar.mode !== "closed";
  const desktopPresents =
    desktopKind === "sidebar" || desktopKind === "floating" ? sidebarComposed : topMenuPresented;
  const tabletPresents =
    tabletKind === "collapsed-sidebar" || tabletKind === "floating"
      ? sidebarComposed
      : topMenuPresented;

  return {
    desktop: desktopDecision(desktopKind, desktopPresents, ctaPresent),
    tablet: tabletDecision(tabletKind, tabletPresents, ctaPresent),
    mobile: mobileDecision(mobileKind, mobileKind === "drawer" || mobileKind === "overlay", ctaPresent),
    classes: {
      densityClass: densityClass(resolved.density),
      contentWidthClass: contentWidthClass(resolved.content.width),
    },
    cta: { present: ctaPresent },
    openBands: SHELL_BANDS.filter((band) =>
      band === "desktop" ? !desktopPresents : band === "tablet" ? !tabletPresents : false,
    ),
  };
}