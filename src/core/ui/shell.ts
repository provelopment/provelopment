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
 * business content — and NEVER preset identity. Every branch is a pure
 * function of the RESOLVED VOCABULARY VALUES (`navigation.desktop/tablet/
 * mobile`, `shell.*`, `cta.enabled`), so any preset or explicit configuration
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
  /** CTA slot for this viewport (engine owns the actual placement). */
  readonly ctaSlot: "header" | "drawer" | "bottom" | "aside" | "none";
  /** Whether a client trigger opens the layer (drawer/overlay only; false otherwise). */
  readonly trigger?: boolean;
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
}

function desktopDecision(kind: ShellPrimitiveKind, ctaPresent: boolean): PerViewportDecision {
  const slot = kind === "sidebar" || kind === "floating" ? "aside" : "header";
  const ctaSlot = !ctaPresent ? "none" : slot === "aside" ? "aside" : "header";
  return { primitiveKind: kind, slot, ctaSlot };
}

function tabletDecision(kind: ShellPrimitiveKind, ctaPresent: boolean): PerViewportDecision {
  const slot = kind === "collapsed-sidebar" || kind === "floating" ? "aside" : "header";
  const ctaSlot = !ctaPresent ? "none" : slot === "aside" ? "aside" : "header";
  return { primitiveKind: kind, slot, ctaSlot };
}

function mobileDecision(kind: ShellPrimitiveKind, trigger: boolean, ctaPresent: boolean): PerViewportDecision {
  const ctaSlot = !ctaPresent ? "none" : kind === "bottom-bar" ? "bottom" : kind === "top" ? "header" : "drawer";
  return { primitiveKind: kind, slot: "header", ctaSlot, trigger };
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
 * Pure function of the resolved vocabulary values; no preset identity, no
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

  return {
    desktop: desktopDecision(desktopKind, ctaPresent),
    tablet: tabletDecision(tabletKind, ctaPresent),
    mobile: mobileDecision(mobileKind, mobileKind === "drawer" || mobileKind === "overlay", ctaPresent),
    classes: {
      densityClass: densityClass(resolved.density),
      contentWidthClass: contentWidthClass(resolved.content.width),
    },
    cta: { present: ctaPresent },
  };
}