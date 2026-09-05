import type {
  CtaStyle,
  DesktopNavigationPattern,
  MobileNavigationPattern,
  ShellVariant,
  TabletNavigationPattern,
  UiPreset,
} from "./vocabulary";

/**
 * UI preset profiles (UI-01 — Architecture & Contract).
 *
 * Each preset is a semantic PROFILE: the UX personality it selects, the
 * default per-viewport navigation composition (roadmap §15), the shell intent,
 * the default CTA prominence, and its row of the roadmap §24 capability
 * matrix. Profiles are contract tables only — they describe WHAT a preset
 * means, not HOW it renders. They are not implementations and they define NO
 * default: UI-03 (shared primitives) and UI-04 (shell orchestration) compose
 * presets from shared primitives, and the resolved default preset is fixed by
 * UI-05.
 *
 * Framework-neutral (pure data): see ARCHITECTURE.md — UI System Architecture.
 */

/** A capability's level in the roadmap §24 matrix (✓ / optional / limited / —). */
export type UiCapabilityLevel = "supported" | "optional" | "limited" | "unsupported";

/** The roadmap §24 capability matrix (the rows a preset may claim). */
export interface UiPresetCapabilities {
  readonly topNavigation: UiCapabilityLevel;
  readonly sidebar: UiCapabilityLevel;
  readonly collapsibleSidebar: UiCapabilityLevel;
  readonly bottomMobileNavigation: UiCapabilityLevel;
  readonly mobileDrawer: UiCapabilityLevel;
  readonly primaryCta: UiCapabilityLevel;
  readonly overlayNavigation: UiCapabilityLevel;
  readonly secondaryPanel: UiCapabilityLevel;
  readonly complexNavigation: UiCapabilityLevel;
  readonly visualFirst: UiCapabilityLevel;
  readonly applicationDashboard: UiCapabilityLevel;
}

/** The semantic profile of one Foundation UI preset. */
export interface UiPresetProfile {
  /** The preset identifier this profile describes. */
  readonly preset: UiPreset;
  /** One-line description of the UX personality (roadmap §5–§9). */
  readonly summary: string;
  /** Default per-viewport navigation composition (roadmap §15). */
  readonly navigation: {
    readonly desktop: DesktopNavigationPattern;
    readonly tablet: TabletNavigationPattern;
    readonly mobile: MobileNavigationPattern;
  };
  /** Default shell composition. */
  readonly shell: {
    readonly header: ShellVariant;
    readonly footer: ShellVariant;
    /**
     * P0-1 sidebars: whether the aside rail (where composed) is user-collapsible.
     * `true` means the SAME structural contract in every composition: the rail
     * can collapse to a reduced state and be restored via a discoverable toggle.
     * Classic/Focus never compose an aside → `false`. Immersive's `floating`
     * rail is intentionally static (`false`) until its visual contract is
     * defined (open product decision).
     */
    readonly sidebar: { readonly collapsible: boolean };
  };
  /** Default CTA prominence requested by the preset. */
  readonly cta: { readonly style: CtaStyle };
  /** This preset's row of the roadmap §24 capability matrix. */
  readonly capabilities: UiPresetCapabilities;
}

/** Builds a full capability row from the explicit levels (the rest is "—"). */
function capabilities(levels: Partial<UiPresetCapabilities>): UiPresetCapabilities {
  return {
    topNavigation: "unsupported",
    sidebar: "unsupported",
    collapsibleSidebar: "unsupported",
    bottomMobileNavigation: "unsupported",
    mobileDrawer: "unsupported",
    primaryCta: "unsupported",
    overlayNavigation: "unsupported",
    secondaryPanel: "unsupported",
    complexNavigation: "unsupported",
    visualFirst: "unsupported",
    applicationDashboard: "unsupported",
    ...levels,
  };
}

/**
 * The five preset profiles, keyed by preset id (roadmap §5–§9, §24).
 *
 * NO default is defined here: this map only describes each identifier. There
 * is deliberately no `DEFAULT_PRESET` and no selection function — resolution
 * is a UI-02 concern and the resolved default is fixed by UI-05.
 */
export const uiPresetProfiles: Readonly<Record<UiPreset, UiPresetProfile>> = {
  classic: {
    preset: "classic",
    summary: "A clean, familiar top-navigation website experience (roadmap §5.1)",
    navigation: { desktop: "top", tablet: "top-compact", mobile: "drawer" },
    shell: { header: "standard", footer: "standard", sidebar: { collapsible: false } },
    cta: { style: "standard" },
    capabilities: capabilities({
      topNavigation: "supported",
      bottomMobileNavigation: "optional",
      mobileDrawer: "supported",
      primaryCta: "supported",
      complexNavigation: "limited",
      applicationDashboard: "limited",
    }),
  },
  adaptive: {
    preset: "adaptive",
    summary:
      "The roadmap's recommended personality: an adaptive collapsible sidebar (roadmap §6; resolved default fixed at UI-05)",
    navigation: { desktop: "sidebar", tablet: "collapsed-sidebar", mobile: "bottom-bar" },
    shell: { header: "standard", footer: "standard", sidebar: { collapsible: true } },
    cta: { style: "standard" },
    capabilities: capabilities({
      topNavigation: "optional",
      sidebar: "supported",
      collapsibleSidebar: "supported",
      bottomMobileNavigation: "supported",
      mobileDrawer: "supported",
      primaryCta: "supported",
      complexNavigation: "supported",
      applicationDashboard: "supported",
    }),
  },
  focus: {
    preset: "focus",
    summary:
      "A conversion-first personality: minimal navigation with a prominent primary CTA (roadmap §7)",
    navigation: { desktop: "minimal", tablet: "top-compact", mobile: "drawer" },
    shell: { header: "minimal", footer: "standard", sidebar: { collapsible: false } },
    cta: { style: "prominent" },
    capabilities: capabilities({
      topNavigation: "supported",
      bottomMobileNavigation: "optional",
      mobileDrawer: "supported",
      primaryCta: "supported",
      overlayNavigation: "optional",
      complexNavigation: "limited",
      visualFirst: "supported",
    }),
  },
  workspace: {
    preset: "workspace",
    summary:
      "An information-rich personality: grouped sidebar navigation with an optional secondary panel (roadmap §8)",
    navigation: { desktop: "sidebar", tablet: "collapsed-sidebar", mobile: "drawer" },
    shell: { header: "standard", footer: "standard", sidebar: { collapsible: true } },
    cta: { style: "standard" },
    capabilities: capabilities({
      topNavigation: "optional",
      sidebar: "supported",
      collapsibleSidebar: "supported",
      bottomMobileNavigation: "optional",
      mobileDrawer: "supported",
      primaryCta: "supported",
      secondaryPanel: "supported",
      complexNavigation: "supported",
      applicationDashboard: "supported",
    }),
  },
  immersive: {
    preset: "immersive",
    summary:
      "A premium visual-first personality: minimal/floating navigation with an overlay menu (roadmap §9)",
    navigation: { desktop: "floating", tablet: "floating", mobile: "overlay" },
    shell: { header: "minimal", footer: "standard", sidebar: { collapsible: false } },
    cta: { style: "standard" },
    capabilities: capabilities({
      topNavigation: "optional",
      mobileDrawer: "supported",
      primaryCta: "supported",
      overlayNavigation: "supported",
      complexNavigation: "limited",
      visualFirst: "supported",
    }),
  },
};