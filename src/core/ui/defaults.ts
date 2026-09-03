import type {
  ContentWidth,
  CtaAction,
  CtaStyle,
  DesktopNavigationPattern,
  MobileNavigationPattern,
  ShellVariant,
  TabletNavigationPattern,
  ThemeMode,
  ThemeRadius,
  UiDensity,
} from "./vocabulary";

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
  readonly shell: { readonly header: ShellVariant; readonly footer: ShellVariant };
  readonly navigation: {
    readonly desktop: DesktopNavigationPattern;
    readonly tablet: TabletNavigationPattern;
    readonly mobile: MobileNavigationPattern;
  };
  readonly density: UiDensity;
  readonly content: { readonly width: ContentWidth };
  readonly cta: {
    /** DELIBERATE neutral default (D1, owner-approved): the shipped classic
     *  composition renders no CTA;an action is a business decision, never invented
     *  by the Foundation. Later phases (e.g., UI-05) may deliberately compose
     *  and enable a CTA per their UX contract. */
   readonly enabled: boolean;
    readonly action?: CtaAction;
    readonly label?: string;
    /** CTA visual prominence;presets may override via `cta.style`。 */
   readonly style: CtaStyle;
  };
  readonly theme: { readonly mode: ThemeMode; readonly radius: ThemeRadius };
}

/**
 * The Foundation defaults table (approved;see plan/todo-milestone-ui-02.md §2.4).
 *
 * Do NOT add entries here without a documented architectural reason —— every
 * addition silently changes the resolved config for every adopter。
 */
export const FOUNDATION_UI_DEFAULTS: Readonly<UiFoundationDefaults> = {
  shell: { header: "standard", footer: "standard" },
  navigation: {
    desktop: "top",
    tablet: "top-compact",
    mobile: "drawer",
  },
  density: "comfortable",
  content: { width: "standard" },
  cta: {
    enabled: false,
    action: undefined,
    label: undefined,
    style: "standard",
  },
  theme: { mode: "system", radius: "medium" },
};