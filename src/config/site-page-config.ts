/**
 * THE EFFECTIVE PAGE-FACING CONFIGURATION OF ONE SITE (FOUNDATION-S1E2)
 * ====================================================================
 *
 * A deployment configures its page-facing concerns ONCE at the top level (`navigation`,
 * `footerNavigation`, `legal`, `connect`) and may OVERRIDE any of them per site, because a site
 * owns an independent page tree and pointing at it is exactly what those concerns do.
 *
 *   shared page-facing configuration  +  site override  =  EFFECTIVE SITE CONFIGURATION
 *
 * THE MERGE RULE LIVES HERE, ONCE. Components ask this module for the effective values instead of
 * each spelling `override ?? shared`, so:
 *
 *  - a site with no override is byte-identical to the shared configuration (the ordinary
 *    single-site deployment, and every adopter who never thinks about sites);
 *  - a leaf present on a site's entry replaces the shared leaf WHOLESALE, so Canada can expose
 *    `Home / Services / Locations / Contact` while France exposes its own list — over one shared
 *    configuration file;
 *  - a leaf absent on a present entry is inherited, so an override states only what differs.
 *
 * A destination is still a destination: this module never decides that a page EXISTS (the page
 * inventory does) and it never resolves a region (the bindings do). It answers one question —
 * "what does THIS site serve?" — and the callers keep their own contracts.
 */
import type { LegalConfigEntry } from "@/core/legal";
import type { ResolvedSite } from "@/core/site";

import type {
  ConnectConfig,
  FooterNavGroup,
  NavigationItem,
  SiteConfig,
  SitePageOverrides,
} from "./site-config";

/** The page-facing concerns themselves, without the site they belong to. */
export interface PageFacingConfig {
  readonly navigation: readonly NavigationItem[];
  readonly footerNavigation?: FooterNavGroup | undefined;
  readonly legal?: readonly LegalConfigEntry[] | undefined;
  readonly connect?: ConnectConfig | undefined;
  /** S1E3 — the shell CTA's page destination (shared `ui.cta.href` unless a site replaces it). */
  readonly ctaHref?: string | undefined;
}

/** One site's EFFECTIVE page-facing configuration, together with that site. */
export interface SitePageConfig extends PageFacingConfig {
  readonly site: ResolvedSite;
}

/**
 * The ONE merge rule: an absent leaf is inherited, a present leaf replaces the shared value.
 * Exported so the rule is testable on its own, without the real deployment configuration.
 */
export function mergeSitePageConfig(
  shared: PageFacingConfig,
  override: SitePageOverrides | undefined,
): PageFacingConfig {
  if (override === undefined) return shared;
  return {
    navigation: override.navigation ?? shared.navigation,
    footerNavigation: override.footerNavigation ?? shared.footerNavigation,
    legal: override.legal ?? shared.legal,
    connect: override.connect ?? shared.connect,
    ctaHref: override.ctaHref ?? shared.ctaHref,
  };
}

/**
 * The page-facing configuration ONE site actually serves.
 *
 * `site` may be the resolved site or its code; a code that the deployment does not declare falls
 * back to the default site — an undeclared site serves nothing, so it must never silently borrow
 * another site's overrides.
 */
export function effectiveSitePageConfig(
  config: SiteConfig,
  site: ResolvedSite | string,
): SitePageConfig {
  const resolved =
    typeof site === "string"
      ? (config.sites.find((entry) => entry.code === site) ?? config.defaultSite)
      : site;

  const shared: PageFacingConfig = {
    navigation: config.navigation,
    footerNavigation: config.footerNavigation,
    legal: config.legal,
    connect: config.connect,
    ctaHref: config.ui?.cta?.href,
  };

  return {
    site: resolved,
    ...mergeSitePageConfig(shared, config.sitePageOverrides[resolved.code]),
  };
}
