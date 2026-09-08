import type {
  ContentWidth,
  CtaAction,
  CtaState,
  CtaStyle,
  DesktopNavigationPattern,
  IconPosition,
  MenuMode,
  MobileNavigationPattern,
  ShellVariant,
  TabletNavigationPattern,
  ThemeMode,
  ThemeRadius,
  UiDensity,
  UiPreset,
} from "./vocabulary";
import { PRESENTATION_DEFAULTS, type UiPresentation } from "./presentation";

/**
 * Foundation-level UI defaults (UI-02 — Configuration Infrastructure).
 *
 * The FIRST precedence layer of the resolution model (master-ui-phase §5):
 *
 * ```text
 * Developer overrides (UiConfig)
 *         ↓
 * Preset profile defaults (uiPresetProfiles, ONLY when a preset is explicitly selected)
 *         ↓
 * Foundation defaults (this module)
 *         ↓
 * Completeness invariant (assertResolvedUiConfigComplete)
 * ```
 *
 * These are NEUTRAL platform defaults: they express the Foundation's baseline
 * intent, nothing business-specific. Deliberately, there is NO preset entry here
 * (a Foundation default never selects a preset — see `resolve.ts`;the resolved
 * default preset is fixed by UI-05, not by this layer.

 * Framework-neutral (pure data + types): see ARCHITECTURE.md — UI System
 * Architecture & Configuration Contract.
 */

/** Foundation-level default values for the semantic UI intent leaves. */
export interface UiFoundationDefaults {
  /**
   * The resolved DEFAULT PRESET personality (fixed at UI-05, owner-approved).
   * `resolve.ts` references this property as its SINGLE default-selection point
   * (`raw.preset ?? FOUNDATION_UI_DEFAULTS.defaultPreset`). This is a
   * personality default: explicit per-leaf overrides (and any explicitly
   * selected preset) still win over the default preset's profile below.
   */
  readonly defaultPreset: UiPreset;
  readonly shell: { readonly header: ShellVariant; readonly footer: ShellVariant; readonly sidebar: { readonly collapsible: boolean } };
  readonly navigation: {
    readonly desktop: DesktopNavigationPattern;
    readonly tablet: TabletNavigationPattern;
    readonly mobile: MobileNavigationPattern;
    /** P5-5 — sidebar presentation intent (mode + open/close control content). */
    readonly sidebar: {
      readonly mode: MenuMode;
      readonly open: { readonly icon?: string; readonly text?: string };
      readonly close: { readonly icon?: string; readonly text?: string };
    };
    /** P5-5 — ≥md top-navigation menu presentation mode. */
    readonly top: { readonly mode: MenuMode };
    /** P5-5 — mobile bottom-navigation menu presentation mode. */
    readonly bottom: { readonly mode: MenuMode };
  };
  readonly density: UiDensity;
  readonly content: { readonly width: ContentWidth };
  /** P5-3 — the neutral resolved presentation intent (balanced/Adaptive). */
  readonly presentation: UiPresentation;
  readonly cta: {
    /** DELIBERATE neutral default (D1, owner-approved): the shipped classic
     *  composition renders no CTA;an action is a business decision, never invented
     *  by the Foundation. Later phases (e.g., UI-05) may deliberately compose
     *  and enable a CTA per their UX contract. */
   readonly enabled: boolean;
    readonly action?: CtaAction;
    readonly label?: string;
    /**
     * ADOPTER-OWNED DESTINATION (UI-07 D1): the CTA `href` is a business
     * decision — the Foundation NEVER infers a destination from `action` or
     * invents a route. Optional; resolves `undefined` when omitted. An enabled
     * CTA without label+href renders nothing (the engine's existing invariant).
     */
    readonly href?: string;
    /** CTA visual prominence;presets may override via `cta.style`。 */
   readonly style: CtaStyle;
    /** P5-5 — optional leading/trailing icon asset (plain public/assets filename). */
    readonly icon?: string;
    /** P5-5 — icon placement within the CTA ("start" or "end"). */
    readonly iconPosition: IconPosition;
    /** P5-5 — semantic CTA state ("default" | "disabled"). */
    readonly state: CtaState;
  };
  readonly theme: { readonly mode: ThemeMode; readonly radius: ThemeRadius; readonly background?: string };
}

/**
 * The Foundation defaults table (approved;see plan/todo-milestone-ui-02.md §2.4).
 *
 * Do NOT add entries here without a documented architectural reason —— every
 * addition silently changes the resolved config for every adopter。
 */
export const FOUNDATION_UI_DEFAULTS: Readonly<UiFoundationDefaults> = {
  // Resolved default personality (UI-05, owner-approved). `resolve.ts` is the
  // single selection point: `raw.preset ?? FOUNDATION_UI_DEFAULTS.defaultPreset`.
  defaultPreset: "adaptive",
  shell: {
    header: "standard",
    footer: "standard",
    // P0-1: the NEUTRAL default is non-collapsible. Presets that own a
    // user-collapsible rail (Adaptive, Workspace) declare `true` in their
    // profile; a custom config opts in with `shell.sidebar.collapsible`.
    sidebar: { collapsible: false },
  },
  navigation: {
    desktop: "top",
    tablet: "top-compact",
    mobile: "drawer",
    // P5-5 — neutral defaults: sidebar fully open (labels + shipped icons),
    // top/bottom menus open. `open`/`close` text falls back to the localized
    // dictionary labels and icon to the shipped assets at composition time.
    sidebar: { mode: "open", open: { icon: undefined, text: undefined }, close: { icon: undefined, text: undefined } },
    top: { mode: "open" },
    bottom: { mode: "open" },
  },
  density: "comfortable",
  content: { width: "standard" },
  presentation: PRESENTATION_DEFAULTS,
  cta: {
    enabled: false,
    action: undefined,
    label: undefined,
    // UI-07 D1: the CTA destination is adopter-owned; the Foundation never
    // invents or infers a href (no action→URL registry, no route inference).
    href: undefined,
    style: "standard",
    // P5-5 — no icon, leading placement, enabled by default when composed.
    icon: undefined,
    iconPosition: "start",
    state: "default",
  },
  theme: { mode: "system", radius: "medium" },
};