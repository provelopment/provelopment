export { parseSiteConfig } from "./loader";
// M16 — the ONE-SPOKE compatibility binding: eagerly read, and refusing LOUDLY when the Installation declares
// several Spokes (see `./active-site-config`). `parseSiteConfig` itself is importable with no side effect.
export { siteConfig } from "./active-site-config";
export { effectiveSitePageConfig, mergeSitePageConfig } from "./site-page-config";
export { siteDescriptionForLocale } from "./site-metadata";
export type { PageFacingConfig, SitePageConfig } from "./site-page-config";
export type { SiteConfigFile } from "./loader";
export type {
  AnalyticsConfig,
  BookingConfig,
  ConnectConfig,
  ConnectMethod,
  ContactConfig,
  LocaleConfig,
  MapsConfig,
  NavigationItem,
  SiteConfig,
  SiteConfigEntry,
  SitePageOverrides,
  SocialLink,
  UiConfig,
  UiContentConfig,
  UiCtaConfig,
  UiNavigationConfig,
  UiShellConfig,
  UiThemeConfig,
} from "./site-config";

export type { Dictionary } from "./i18n/dictionary";