/**
 * SITE/LOCALE COMPLETION FOR ONE REQUEST-SELECTED SPOKE (FOUNDATION-MULTISITE-M16/M17)
 * ===================================================================================
 *
 * The accepted public URL is `/<site>/<locale>/<route>`, and a request may name less than that: a bare site
 * (`/ca`), a site whose second segment is not one of ITS locale path keys, or no site at all (`/`, `/about`,
 * `/de/about`). Completing such a path is a decision about ONE Spoke's own Sites and locales — so it happens
 * at the route boundary, inside the Spoke this request selected, using that Spoke's fully resolved
 * configuration, and never at the request boundary, which holds no configuration at all.
 *
 * WHERE IT MOVED FROM. It used to live inside the retired internal page route (`src/app/~spoke/[segment]`),
 * which the request boundary reached through a pathname rewrite. M17 made the PUBLIC pathname the page
 * identity, so the same rules now run at the public boundary — the functions themselves are unchanged.
 *
 * The rules are exactly the accepted ones (they moved; they did not change):
 *
 *   explicit Site + supported locale   → continue (no redirect at all)
 *   bare Site, or an unknown second    → that Site's own negotiated locale (cookie, then Accept-Language,
 *                                        then that Site's default) and the REMAINING segments preserved
 *   explicit locale on the default          → that locale is authoritative (a link's language survives)
 *     Site shorthand
 *   no Site and no locale              → the Spoke's DEFAULT Site + its negotiated locale
 *   a stale cookie from another Site   → it simply does not match, so that Site's default is used
 *
 * A redirect produced here can NEVER change Spokes: every candidate Site belongs to this Spoke, the target
 * path is a PUBLIC path, and no other Spoke is consulted.
 *
 * Pure: Sites, locales and the request's preference hints in; either a destination or a public redirect path
 * out. No request object, no configuration read, no rendering.
 */
import { negotiateLocale } from "@/core/locale";
// LOC1 — the ONE required-Location rule: which Location a required Site's non-regional request must be
// completed into. The route boundary COMPOSES it (`@/core/location-selection` owns it), so the visitor's
// public URL is the only place the Location lives — no cookie, no session, no client state.
import { requiredLocationDestination } from "@/core/location-selection";
import {
  siteByCode,
  sitePrefixPath,
  siteSetOf,
  siteSupportsLocalePath,
  type ResolvedSite,
} from "@/core/site";

import type { SiteConfig } from "@/config/site-config";

/** The visitor's expressed language preferences, exactly as the accepted negotiation consumes them. */
export interface LocaleHints {
  readonly cookieLocale?: string | undefined;
  readonly acceptLanguage?: string | undefined;
}

/** The (site, locale, route) a public path names, with the COMPLETE public segments that describe it. */
export interface PublicDestination {
  readonly site: ResolvedSite;
  readonly localePath: string;
  readonly routePath: string;
  readonly segments: readonly string[];
}

/** Either the path is already complete, or it must be completed by a PUBLIC redirect. */
export type PublicCompletion =
  | { readonly destination: PublicDestination }
  | { readonly redirectPath: string };

/** One Site's own negotiated locale — candidates are ITS locale path keys, never another Site's. */
export function negotiatedLocaleFor(site: ResolvedSite, hints: LocaleHints): string {
  return negotiateLocale({
    supported: site.locales.map((locale) => locale.path),
    defaultLocale: site.defaultLocale,
    cookieLocale: hints.cookieLocale,
    acceptLanguage: hints.acceptLanguage,
  });
}

/**
 * Complete the public segments of ONE Spoke's request.
 *
 * `segments` are the PUBLIC path segments the framework handed to the public catch-all route, so every value
 * this function produces is a public one.
 */
export function completePublicPath(
  siteConfig: SiteConfig,
  segments: readonly string[],
  hints: LocaleHints,
): PublicCompletion {
  const siteSet = siteSetOf(siteConfig.sites, siteConfig.defaultSite);
  const [first, second, ...rest] = segments;

  const site = first === undefined ? undefined : siteByCode(siteSet, first);
  if (site !== undefined) {
    if (second !== undefined && siteSupportsLocalePath(site, second)) {
      // LOC1 — A SITE THAT REQUIRES A LOCATION HAS NO UNSPECIFIED PUBLIC URL. This path named the Site
      // and a locale but no Location, so a required Site is completed into its configured default
      // Location (deterministically, by the accepted Location destination rule) with a PUBLIC redirect;
      // an optional Site is answered exactly as before.
      const requiredLocation = requiredLocationRedirectFor(siteConfig, site, second, rest.join("/"));
      if (requiredLocation !== null) return { redirectPath: requiredLocation };

      return {
        destination: {
          site,
          localePath: second,
          routePath: rest.join("/"),
          segments,
        },
      };
    }

    // A bare Site path, or a Site followed by something that is not one of ITS locales: complete it with
    // that Site's own negotiated locale and keep whatever followed the Site.
    const tail = segments.slice(1);
    const localePath = negotiatedLocaleFor(site, hints);
    return {
      redirectPath:
        requiredLocationRedirectFor(siteConfig, site, localePath, tail.join("/")) ??
        `${sitePrefixPath(site)}/${localePath}${tail.length === 0 ? "" : `/${tail.join("/")}`}`,
    };
  }

  // No Site: the Spoke's DEFAULT Site answers, and an explicit locale in the leading position is
  // AUTHORITATIVE rather than renegotiated (R1B) — a link that carries a language is not answered in
  // another one.
  const defaultSite = siteConfig.defaultSite;
  const explicitLocale =
    first !== undefined && siteSupportsLocalePath(defaultSite, first) ? first : undefined;
  const tail = explicitLocale === undefined ? segments : segments.slice(1);
  const localePath = explicitLocale ?? negotiatedLocaleFor(defaultSite, hints);

  return {
    redirectPath:
      requiredLocationRedirectFor(siteConfig, defaultSite, localePath, tail.join("/")) ??
      `${sitePrefixPath(defaultSite)}/${localePath}${
        tail.length === 0 ? "" : `/${tail.join("/")}`
      }`,
  };
}

/**
 * THE REQUIRED-LOCATION STEP OF A COMPLETION (LOC1), or `null` when this Site needs none.
 *
 * `null` covers both "this Site declares no policy" (the established optional behaviour, untouched) and
 * "the path already names one of this Site's Locations" — and the decision itself is the core rule's
 * (`@/core/location-selection`), asked with the accepted default-locale rule, so the boundary adds an
 * ORDER of completion and no routing rule of its own.
 */
function requiredLocationRedirectFor(
  siteConfig: SiteConfig,
  site: ResolvedSite,
  localePath: string,
  routePath: string,
): string | null {
  return requiredLocationDestination({
    policy: site.locationSelection,
    siteCode: site.code,
    sitePrefix: sitePrefixPath(site),
    localePath,
    routePath,
    regions: siteConfig.regions,
    bindings: siteConfig.pageBindings,
  });
}
