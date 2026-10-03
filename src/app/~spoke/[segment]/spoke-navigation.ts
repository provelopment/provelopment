/**
 * SITE/LOCALE COMPLETION INSIDE ONE SPOKE (FOUNDATION-MULTISITE-M16)
 * =================================================================
 *
 * The accepted public URL is `/<site>/<locale>/<route>`, and a request may name less than that: a bare site
 * (`/ca`), a site whose second segment is not one of ITS locale path keys, or no site at all (`/`, `/about`,
 * `/de/about`). Completing such a path is a decision about ONE Spoke's own Sites and locales — so it happens
 * HERE, inside the Spoke the hostname selected, using that Spoke's fully resolved configuration, and never
 * at the request boundary, which holds no configuration at all.
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
 * path is a PUBLIC path (the internal prefix is never part of it), and no other Spoke is consulted.
 *
 * Pure: Sites, locales and the request's preference hints in; either a destination or a public redirect path
 * out. No request object, no configuration read, no rendering.
 */
import { negotiateLocale } from "@/core/locale";
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
 * `segments` are the PUBLIC path segments the framework handed to the internal route (the internal prefix and
 * the runtime segment are NOT among them), so every value this function produces is a public one.
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
    return {
      redirectPath: `${sitePrefixPath(site)}/${negotiatedLocaleFor(site, hints)}${
        tail.length === 0 ? "" : `/${tail.join("/")}`
      }`,
    };
  }

  // No Site: the Spoke's DEFAULT Site answers, and an explicit locale in the leading position is
  // AUTHORITATIVE rather than renegotiated (R1B) — a link that carries a language is not answered in
  // another one.
  const defaultSite = siteConfig.defaultSite;
  const explicitLocale =
    first !== undefined && siteSupportsLocalePath(defaultSite, first) ? first : undefined;
  const tail = explicitLocale === undefined ? segments : segments.slice(1);

  return {
    redirectPath: `${sitePrefixPath(defaultSite)}/${
      explicitLocale ?? negotiatedLocaleFor(defaultSite, hints)
    }${tail.length === 0 ? "" : `/${tail.join("/")}`}`,
  };
}
