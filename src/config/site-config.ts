import type { Business } from "@/core/business";
import type { ContactFeatureConfig } from "@/core/contact-inquiry";
import type { LegalConfigEntry } from "@/core/legal";

export interface LocaleConfig {
  /** BCP 47-style code such as `en` or `nl`. */
  readonly code: string;
  /** Human-readable name of the locale, for language switchers. */
  readonly label: string;
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

export interface ContactConfig {
  readonly email?: string;
  readonly phone?: string;
}

export interface AnalyticsConfig {
  readonly provider: "vercel";
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
  readonly contact: ContactConfig;
  readonly socialLinks: readonly SocialLink[];
  readonly navigation: readonly NavigationItem[];
  /** Normalized business profile (from `business` block or legacy contact). */
  readonly business: Business;
  /** Optional functionality flags; each is consumed by its own adapter. */
  readonly analytics?: AnalyticsConfig;
  /** Maps directions provider configuration (`features.maps`). */
  readonly mapsFeature?: MapsConfig;
  /** Booking action provider configuration (`features.booking`). */
  readonly bookingFeature?: BookingConfig;
  /** Contact inquiry provider configuration (`features.contact`). */
  readonly contactFeature?: ContactFeatureConfig;
  /** Offerings catalog enabled (`features.offerings === true`). */
  readonly offeringsFeature?: boolean;
  /** Optional legal documents (config ∧ canonical-content exposure). */
  readonly legal?: readonly LegalConfigEntry[];
}