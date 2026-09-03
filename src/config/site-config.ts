import type { Business } from "@/core/business";
import type { ContactFeatureConfig } from "@/core/contact-inquiry";
import type { LegalConfigEntry } from "@/core/legal";
import type { OperationalRegion, PageRegionBinding } from "@/core/region";

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
  readonly contact: ContactConfig;
  readonly socialLinks: readonly SocialLink[];
  readonly navigation: readonly NavigationItem[];
  /** Phase M — configuration-driven connection modes for the Connect page. */
  readonly connect?: ConnectConfig;
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