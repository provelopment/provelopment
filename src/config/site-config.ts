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
  /** Optional functionality flags; each is consumed by its own adapter. */
  readonly analytics?: AnalyticsConfig;
}