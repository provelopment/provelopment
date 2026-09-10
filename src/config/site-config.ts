import type { Business } from "@/core/business";
import type { ContactFeatureConfig } from "@/core/contact-inquiry";
import type { LegalConfigEntry } from "@/core/legal";
import type { OperationalRegion, PageRegionBinding } from "@/core/region";
import type {
  ContentWidth,
  CtaAction,
  CtaState,
  CtaStyle,
  DesktopNavigationPattern,
  IconPosition,
  MenuMode,
  MobileNavigationPattern,
  NavRegion,
  ShellVariant,
  TabletNavigationPattern,
  ThemeMode,
  ThemeRadius,
  UiDensity,
  UiPreset,
} from "@/core/ui";

export interface LocaleConfig {
  /** BCP 47-style code such as `en` or `nl`. */
  readonly code: string;
  /** Human-readable name of the locale (native form), for language switchers. */
  readonly label: string;
  /**
   * Phase M refinement — canonical English name of the language. The Language
   * selector shows `label` followed by `englishLabel` in brackets when they
   * differ (`Français (French)`); never `English (English)`.
   */
  readonly englishLabel?: string;
}

export interface SocialLink {
  readonly platform: string;
  readonly label: string;
  readonly href: string;
}

export interface NavigationItem {
  readonly label: string;
  readonly href: string;
  /** P5-5 — optional navigation-item icon (plain `public/assets/` filename). */
  readonly icon?: string;
  /** P5-5 — sidebar region group (`top` | `middle` | `bottom`; default `middle`). */
  readonly position?: NavRegion;
  /** P5-5 — semantically disabled state (`aria-disabled`, not navigable). */
  readonly disabled?: boolean;
}

/** Phase M — a single connection mode exposed on the Connect page. */
export interface ConnectMethod {
  /** Stable slug id (unique within `connect.methods`). */
  readonly id: string;
  /** Adopter-provided human label, e.g. "WhatsApp". */
  readonly label: string;
  /** Internal route (`/contact`) or absolute deep link (`mailto:`, `tel:`, `https:`…). */
  readonly href: string;
  /** Marks template demonstration entries with a visible badge. */
  readonly demoOnly?: boolean;
}

/** Phase M — the Connect page's configurable connection inventory. */
export interface ConnectConfig {
  readonly methods: readonly ConnectMethod[];
}

export interface ContactConfig {
  readonly email?: string;
  readonly phone?: string;
}

export interface AnalyticsConfig {
  readonly provider: "vercel" | "none";
}

/** `features.maps` — a keyless directions-deep-link provider. */
export interface MapsConfig {
  readonly provider: "google" | "none";
}

/** `features.booking` — a static external booking action. */
export interface BookingConfig {
  readonly provider: "external-url" | "none";
  readonly url?: string;
}

/**
 * UI system configuration (UI-01 — Architecture & Contract).
 *
 * Intent-level configuration namespace (roadmap §11): values describe the
 * desired UX personality, never pixels. The block is OPTIONAL — an absent
 * `ui` key (or an empty object) is valid and changes nothing at the CONTRACT
 * surface. The RESOLVED default personality is fixed at UI-05
 * (`FOUNDATION_UI_DEFAULTS.defaultPreset = "adaptive"`, applied in
 * `resolveUiConfig`'s single selection point); the schema/loader still inject
 * no preset.
 */
export interface UiConfig {
  /** Explicit preset selection; `undefined` when omitted (never injected). */
  readonly preset?: UiPreset;
  /** Page-frame intent (roadmap §11 `shell`). */
  readonly shell?: UiShellConfig;
  /** Per-viewport navigation composition overrides (preset defines the rest). */
  readonly navigation?: UiNavigationConfig;
  /** Semantic UI density (roadmap §16). */
  readonly density?: UiDensity;
  /** Content area width intent (roadmap §17). */
  readonly content?: UiContentConfig;
  /** Primary CTA intent (roadmap §19). */
  readonly cta?: UiCtaConfig;
  /** Visual theme intent — kept separate from the layout preset (roadmap §18). */
  readonly theme?: UiThemeConfig;
}

export interface UiShellConfig {
  readonly header?: ShellVariant;
  readonly footer?: ShellVariant;
  /** P0-1 — whether the composed aside rail is user-collapsible. */
  readonly sidebar?: { readonly collapsible?: boolean };
}

export interface UiNavigationConfig {
  readonly desktop?: DesktopNavigationPattern;
  readonly tablet?: TabletNavigationPattern;
  readonly mobile?: MobileNavigationPattern;
  /** P5-5 — sidebar presentation intent (mode + open/close disclosure content). */
  readonly sidebar?: UiSidebarConfig;
  /** P5-5 — ≥md top-navigation menu presentation mode. */
  readonly top?: { readonly mode?: MenuMode };
  /** P5-5 — mobile bottom-navigation menu presentation mode. */
  readonly bottom?: { readonly mode?: MenuMode };
}

/** P5-5 — one icon+text disclosure control (sidebar open/close). */
export interface UiSidebarControlConfig {
  /** Plain public/assets icon filename, or `""` for no icon. */
  readonly icon?: string;
  /** Visible text; `""` = icon-only. Missing = localized fallback label. */
  readonly text?: string;
}

/** P5-5 — sidebar presentation intent. */
export interface UiSidebarConfig {
  readonly mode?: MenuMode;
  readonly open?: UiSidebarControlConfig;
  readonly close?: UiSidebarControlConfig;
}

export interface UiContentConfig {
  readonly width?: ContentWidth;
}

export interface UiCtaConfig {
  /** Whether a primary CTA should be composed. */
  readonly enabled?: boolean;
  /** Semantic business action (roadmap §19). */
  readonly action?: CtaAction;
  /**
   * Adopter-provided visible label. P5-5: `""` (or a missing label with an
   * icon) = icon-only CTA; the accessible name then comes from `action`.
   */
  readonly label?: string;
  /**
   * Adopter-owned CTA destination (UI-07 D1). Optional; the Foundation never
   * infers one from `action`. An enabled CTA without label+href renders nothing.
   */
  readonly href?: string;
  /** Visual prominence requested from the preset (roadmap §11). */
  readonly style?: CtaStyle;
  /** P5-5 — optional CTA icon (plain public/assets filename; `""` = none). */
  readonly icon?: string;
  /** P5-5 — icon placement within the CTA (`start` leading, `end` trailing). */
  readonly iconPosition?: IconPosition;
  /** P5-5 — semantic CTA state (`default` | `disabled`). */
  readonly state?: CtaState;
}

export interface UiThemeConfig {
  /** Light/dark/system; `system` follows the OS color-scheme preference. */
  readonly mode?: ThemeMode;
  /** Semantic corner-radius intent (aligns with the `--radius-*` tokens). */
  readonly radius?: ThemeRadius;
  /** FS-5 — adopter-owned page/background hex color (overrides `--background`). */
  readonly background?: string;
}

/**
 * FS-3 — preset-comparison deployment metadata. Maps each presentable preset to
 * the deployment URL that demonstrates the Foundation through that preset.
 * Absent keys are simply not part of the comparison set for this deployment.
 */
export interface UiPresetComparisonConfig {
  readonly adaptive?: string;
  readonly classic?: string;
  readonly focus?: string;
  readonly workspace?: string;
  readonly immersive?: string;
}

/**
 * P6-2C — every leaf maps onto one of the six generic branding asset roles
 * established in P6-2A. `logo`/`favicon` have real consumers today (JSON-LD,
 * browser tab icon); `logoFooter`/`logoTitle` are resolved + build-validated
 * but not yet composed into any component (a later visual-implementation
 * task). `sidebar-open`/`sidebar-close` are NOT part of this block (separate
 * plain-filename icon-asset contract, `src/config/assets.ts`).
 */
export interface SiteAssetsConfig {
  /** Structured-data brand logo (absolute URL); absent → JSON-LD omits it. The `logo-header` role. */
  readonly logo?: string;
  /** Open Graph / social image (absolute URL); absent → per-locale generated route. */
  readonly ogImage?: string;
  /** Browser favicon / icon (absolute URL); absent → app-routed `icon.svg`. The `favicon` role. */
  readonly favicon?: string;
  /** The `logo-footer` role (absolute URL); not yet composed into the footer component. */
  readonly logoFooter?: string;
  /** The `logo-title` role (absolute URL); not yet composed into any title-area component. */
  readonly logoTitle?: string;
}

export interface SiteConfig {
  /** Absolute origin of the deployed site, used for SEO (sitemap, canonical URLs). */
  readonly url: string;
  /** Default locale code; must appear in `locales`. */
  readonly defaultLocale: string;
  /** Supported locales, in preferred order. */
  readonly locales: readonly LocaleConfig[];
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  /** Optional brand logo (absolute URL) for structured data (Phase S). */
  readonly logo?: string;
  /** FS-4 — canonical visual asset configuration (favicon/logo/OG image). */
  readonly assets?: SiteAssetsConfig;
  readonly contact: ContactConfig;
  readonly socialLinks: readonly SocialLink[];
  readonly navigation: readonly NavigationItem[];
  /** Phase M — configuration-driven connection modes for the Connect page. */
  readonly connect?: ConnectConfig;
  /**
   * UI system configuration (UI-01). Intent-level contract namespace
   * (roadmap §11); validated by `uiConfigSchema`. Not consumed by rendering
   * until UI-02+; see ARCHITECTURE.md — UI System Architecture.
   */
  readonly ui?: UiConfig;
  /**
   * FS-3 — preset-comparison deployment destinations, lifted from `ui` for direct
   * consumption by the header preset switcher (never read from `ui` at runtime).
   */
  readonly presetComparison?: UiPresetComparisonConfig;
  /** Normalized business profile (from `business` block or legacy contact). */
  readonly business: Business;
  /**
   * Phase K operating regions, keyed by region id. Empty when the legacy
   * (global `business`/`locations`) model is in use. When non-empty, regional
   * pages resolve their operational identity from a region — never merged with
   * global business defaults.
   */
  readonly regions: Readonly<Record<string, OperationalRegion>>;
  /** Page inventory entries `(locale, region, slug?)`; empty when none. */
  readonly pageBindings: readonly PageRegionBinding[];
  /** Optional functionality flags; each is consumed by its own adapter. */
  readonly analytics?: AnalyticsConfig;
  /** Maps directions provider configuration (`features.maps`). */
  readonly mapsFeature?: MapsConfig;
  /** Booking action provider configuration (`features.booking`). */
  readonly bookingFeature?: BookingConfig;
  /** Contact inquiry provider configuration (`features.contact`). */
  readonly contactFeature?: ContactFeatureConfig;
  /** Offering content catalog enabled (`features.offerings === true`). */
  readonly offeringsFeature?: boolean;
  /** Testimonials collection enabled (`features.testimonials === true`). */
  readonly testimonialsFeature?: boolean;
  /** Portfolio / case studies enabled (`features.portfolio === true`). */
  readonly portfolioFeature?: boolean;
  /** Filesystem blog + RSS enabled (`features.blog === true`). */
  readonly blogFeature?: boolean;
  /** Optional legal documents (config ∧ canonical-content exposure). */
  readonly legal?: readonly LegalConfigEntry[];
}