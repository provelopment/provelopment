import { isWellFormedLocale, type Locale } from "./locale";
import { pageRoutePath, pageRoutePathSegments } from "./page-route-path";
import { isContentSlug } from "./page-content";
import { isRegionBoundToLocale } from "./regional-pages";
import type { PageRegionBinding } from "./region";
/**
 * THE SITE-CONTEXT CONTRACT (FOUNDATION-S1)
 * =========================================
 *
 * Language and site identity are INDEPENDENT. A rendered page is identified by
 *
 *     siteId + locale + routePath
 *
 * and this module declares — as pure data and pure functions — what a site is, how a
 * request's path segments resolve to exactly ONE site, and how site+locale+route becomes
 * a public URL. It performs no filesystem access, parses nothing and renders nothing: it
 * is a `@/core` rule.
 *
 *   SITE      An independent page/configuration context: a country operation, a regional
 *             business, an independently managed office or subsidiary — anything whose
 *             PAGE TREE is authored independently. A site owns its authored pages
 *             (`content/pages/<mode>/<siteId>/<locale>/…`), its supported locale set, its
 *             default locale and its own locale-fallback policy.
 *   LOCALE    The language (or regional-language) version WITHIN one site. The same
 *             language code in two sites is two independent page trees:
 *             `canada/fr-CA/about` and `france/fr-FR/about` never answer each other.
 *   LOCATION  Physical/business-place metadata (a region) INSIDE a site, for the case
 *             where offices SHARE one page tree. A site is never equated with a physical
 *             location: one site may contain many locations.
 *
 * NO CROSS-SITE FALLBACK — THE HARD RULE
 * --------------------------------------
 * Resolution may fall between locales ONLY inside the SAME site, and only when that site
 * permits it. A request carries exactly one site and the page-source resolvers are bound
 * to that site's tree, so `canada/fr/…` can never be answered by `france/fr/…` — not as a
 * fallback, not as a convenience. The request type below makes the boundary structural
 * rather than a matter of care, and `PageSourceRequest.defaultLocale` is the SITE's
 * default locale, never the deployment's.
 *
 * PUBLIC URL ≠ CONTENT IDENTITY
 * ----------------------------
 * Content identity is `siteId + locale + routePath`; the public URL adds the site's
 * configurable `pathPrefix`:
 *
 *     site "canada"  prefix ""        → /en-CA/about       (the DEFAULT site)
 *     site "france"  prefix "france"  → /france/fr-FR/about
 *
 * The DEFAULT SITE is the one whose prefix is empty: it answers the deployment's own
 * URLs, so a single-site adopter never sees its internal id (`main`) in a URL. Keeping
 * the mapping here — never in the authoring paths — is what lets a later hostname mapping
 * choose a site without changing a single content path.
 *
 * Framework-neutral by design: pure data + types only. No React, Next.js, filesystem or
 * configuration import.
 */

/** A site is named by a content slug: the id is BOTH a folder name and a URL segment. */
export type SiteId = string;

/** The site id of a deployment that declares no sites — the ordinary single-site case. */
export const IMPLICIT_SITE_ID = "main";

/** True when `value` may be a site id (the ONE slug rule, shared with page content). */
export function isSiteId(value: string): boolean {
  return typeof value === "string" && isContentSlug(value);
}

/** True when `value` may be a site's public path prefix (`""` = the deployment root). */
export function isSitePathPrefix(value: string): boolean {
  return value === "" || isContentSlug(value);
}

/** One site as an adopter declares it; everything except `id` has a documented default. */
export interface SiteInput {
  readonly id: string;
  /** Human label for a site selector. Absent → the id, verbatim. */
  readonly label?: string;
  /** Public path prefix: `""` (the default site) or one slug segment. */
  readonly pathPrefix?: string;
  /** The site's default locale. Absent → the deployment's default locale. */
  readonly defaultLocale?: Locale;
  /** The locales this site serves, in preference order. Absent → every declared locale. */
  readonly locales?: readonly Locale[];
  /** Whether the site's default locale may answer its other locales. Absent → `true`. */
  readonly fallback?: boolean;
}

/** A site, fully resolved: every leaf determined, nothing left to infer. */
export interface ResolvedSite {
  readonly id: SiteId;
  readonly label: string;
  /** `""` (this site answers the deployment's own URLs) or one slug segment. */
  readonly pathPrefix: string;
  /** The locale this site answers with when a request names none of its locales. */
  readonly defaultLocale: Locale;
  /** Every locale this site serves. */
  readonly locales: readonly Locale[];
  /** Whether this site's default locale may stand in for its other locales. */
  readonly fallback: boolean;
  /** True for the ONE site whose prefix is empty (the deployment's own URLs). */
  readonly isDefault: boolean;
}

/** Every site of a deployment, plus the one that answers the deployment's own URLs. */
export interface SiteSet {
  readonly sites: readonly ResolvedSite[];
  readonly defaultSite: ResolvedSite;
}

/** A configuration that cannot describe a coherent set of sites. */
export class SiteConfigurationError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(`Invalid site configuration:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "SiteConfigurationError";
    this.issues = issues;
  }
}


export interface ResolveSitesOptions {
  /** The declared sites. Absent/empty → ONE implicit site (`main`) — the shipped case. */
  readonly input?: readonly SiteInput[] | undefined;
  /** The deployment's default locale (used by a site that declares none). */
  readonly defaultLocale: Locale;
  /** Every locale the deployment knows (the i18n registry). */
  readonly locales: readonly Locale[];
}

/**
 * Resolves the declared sites into a complete, deterministic `SiteSet`.
 *
 * Rules (all loud — a configuration that cannot be honoured is refused, never guessed):
 *
 *  - no `sites` block → exactly ONE implicit site `main`: prefix `""`, the deployment's
 *    default locale, every declared locale, fallback permitted. A single-site adopter
 *    therefore configures nothing and still gets a clean, prefix-less URL space;
 *  - a site's `locales` default to every declared locale and its `defaultLocale` to the
 *    deployment's; an explicitly named default MUST be one of that site's locales;
 *  - a site id must be a content slug (it is a folder AND a URL segment); ids and
 *    prefixes must be unique;
 *  - a path prefix must be `""` or one slug segment, must NOT be a declared locale code
 *    (the first URL segment would otherwise be ambiguous) and must not repeat;
 *  - with more than one site, EXACTLY ONE must have an empty prefix: the default site.
 *    Without one, the deployment's own URLs (`/`, `/en/about`) would name no site.
 */
export function resolveSites(options: ResolveSitesOptions): SiteSet {
  const { defaultLocale, locales } = options;
  const issues: string[] = [];

  if (!isWellFormedLocale(defaultLocale) || !locales.includes(defaultLocale)) {
    issues.push(
      `the deployment default locale "${defaultLocale}" must be one of the declared locales`,
    );
  }
  for (const locale of locales) {
    if (!isWellFormedLocale(locale)) issues.push(`declared locale "${locale}" is not a language tag`);
  }

  const declared: readonly SiteInput[] =
    options.input === undefined || options.input.length === 0
      ? [{ id: IMPLICIT_SITE_ID }]
      : options.input;

  const seenIds = new Set<string>();
  const sites: ResolvedSite[] = declared.map((raw) => {
    const id = raw.id;
    if (!isSiteId(id)) {
      issues.push(`site id "${id}" must be a lowercase slug (letters, digits, single hyphens)`);
    }
    if (seenIds.has(id)) issues.push(`duplicate site id "${id}"`);
    seenIds.add(id);

    const pathPrefix = raw.pathPrefix ?? "";
    if (!isSitePathPrefix(pathPrefix)) {
      issues.push(
        `site "${id}": pathPrefix "${pathPrefix}" must be "" or one lowercase slug segment`,
      );
    }

    const siteLocales = raw.locales ?? locales;
    if (siteLocales.length === 0) issues.push(`site "${id}" must list at least one locale`);
    for (const locale of siteLocales) {
      if (!isWellFormedLocale(locale)) {
        issues.push(`site "${id}": locale "${locale}" is not a language tag`);
      } else if (!locales.includes(locale)) {
        issues.push(
          `site "${id}": locale "${locale}" is not declared in i18n.locales ` +
            "(add it there and give it a dictionary)",
        );
      }
    }

    const siteDefaultLocale = raw.defaultLocale ?? defaultLocale;
    if (!siteLocales.includes(siteDefaultLocale)) {
      issues.push(`site "${id}": defaultLocale "${siteDefaultLocale}" must be one of its locales`);
    }

    return {
      id,
      label: raw.label ?? id,
      pathPrefix,
      defaultLocale: siteDefaultLocale,
      locales: [...new Set(siteLocales)],
      fallback: raw.fallback ?? true,
      isDefault: false,
    };
  });

  const seenPrefixes = new Set<string>();
  for (const site of sites) {
    if (site.pathPrefix !== "") {
      if (locales.includes(site.pathPrefix)) {
        issues.push(
          `site "${site.id}": pathPrefix "${site.pathPrefix}" is also a declared locale code — ` +
            "the first URL segment would be ambiguous",
        );
      }
      if (seenPrefixes.has(site.pathPrefix)) {
        issues.push(`duplicate site pathPrefix "${site.pathPrefix}"`);
      }
    }
    seenPrefixes.add(site.pathPrefix);
  }

  const rootSites = sites.filter((site) => site.pathPrefix === "");
  if (sites.length > 1 && rootSites.length !== 1) {
    issues.push(
      `with ${sites.length} sites, exactly ONE must have pathPrefix "" (the default site that ` +
        `answers the deployment's own URLs); found ${rootSites.length}`,
    );
  }

  if (issues.length > 0) throw new SiteConfigurationError(issues);

  const defaultSiteId = (rootSites[0] ?? sites[0]).id;
  const resolved = sites.map((site) => ({ ...site, isDefault: site.id === defaultSiteId }));
  const resolvedDefault = resolved.find((site) => site.isDefault) as ResolvedSite;

  return { sites: resolved, defaultSite: resolvedDefault };
}

/** Whether a site serves a locale. A locale outside this set is not a page request. */
export function siteSupportsLocale(site: ResolvedSite, locale: Locale): boolean {
  return site.locales.includes(locale);
}

/** The site's public prefix as a URL fragment: `""` or `/france`. */
export function sitePrefixPath(site: ResolvedSite): string {
  return site.pathPrefix === "" ? "" : `/${site.pathPrefix}`;
}

/** The URL every page of a site+locale hangs from: `/en` or `/france/fr-FR`. */
export function siteLocalePath(site: ResolvedSite, locale: Locale): string {
  return `${sitePrefixPath(site)}/${locale}`;
}

/**
 * The public URL of one page: the ONE path builder for site-scoped URLs.
 *
 * `routePath` is the page's canonical route path (`""` = the locale root, i.e. the home
 * page). A malformed route path yields `null`, so a caller can never publish a URL it has
 * not validated.
 */
export function sitePath(site: ResolvedSite, locale: Locale, routePath = ""): string | null {
  if (routePath === "") return siteLocalePath(site, locale);
  if (pageRoutePathSegments(routePath).length === 0) return null;
  return `${siteLocalePath(site, locale)}/${routePath}`;
}

/** A site's home URL (its default locale's root) — the deterministic fallback target. */
export function siteHomePath(site: ResolvedSite): string {
  return siteLocalePath(site, site.defaultLocale);
}

/**
 * Where a visitor lands after switching to another site.
 *
 * Preserves what the target can honour and falls back deterministically otherwise — the
 * ORDER is fixed: keep the current route path when the target serves it, in the current
 * locale when the target supports it, else in the target's own default locale; if the
 * target serves no such page, land on the target's HOME. Never a meaningless 404 merely
 * because the target's page tree differs — and never a second site's page standing in for
 * a missing one.
 */
export function siteSwitchDestination(options: {
  readonly target: ResolvedSite;
  readonly locale: Locale;
  readonly routePath: string;
  /** Whether the target serves this route path in some locale (checked by the caller). */
  readonly routeExists: boolean;
}): string {
  const { target, locale, routePath, routeExists } = options;
  if (!routeExists) return siteHomePath(target);
  const targetLocale = siteSupportsLocale(target, locale) ? locale : target.defaultLocale;
  return sitePath(target, targetLocale, routePath) ?? siteHomePath(target);
}


/** One request's site context: exactly ONE site, one locale, one route path. */
export interface SiteRequest {
  readonly site: ResolvedSite;
  readonly locale: Locale;
  /** The page's route path inside its site+locale directory (`""` = the locale root). */
  readonly routePath: string;
  /** The URL's first segment: the site prefix, or the default site's locale. */
  readonly scope: string;
}

/**
 * Resolves URL path segments to exactly ONE site context, or `null`.
 *
 * The first segment is a site prefix when it names a prefixed site; otherwise it must be
 * a locale of the DEFAULT site (a prefix can never also be a declared locale code, so the
 * two readings can never compete). A prefixed site's second segment must be one of THAT
 * site's locales. A bare prefix (`/france`) resolves to nothing — locale negotiation
 * belongs to the redirect, never to a rendered page.
 *
 * The result names one site and carries no reference to any other, which is what makes a
 * cross-site lookup unrepresentable rather than merely forbidden.
 */
export function resolveSiteRequest(
  set: SiteSet,
  segments: readonly string[],
): SiteRequest | null {
  if (segments.length === 0) return null;

  const first = segments[0] as string;
  const prefixed = set.sites.find((site) => site.pathPrefix !== "" && site.pathPrefix === first);
  const site = prefixed ?? set.defaultSite;
  const rest = segments.slice(1);

  const locale = rest[0];
  if (locale === undefined) return null;
  if (!siteSupportsLocale(site, locale)) return null;

  const routeSegments = rest.slice(1);
  const routePath = routeSegments.length === 0 ? "" : pageRoutePath(...routeSegments);
  if (routePath === null) return null;

  return { site, locale, routePath, scope: first };
}

/** The scope values a site's URLs start with (its prefix, or its locales). */
export function scopeSegmentsForSite(site: ResolvedSite): readonly string[] {
  return site.pathPrefix === "" ? site.locales : [site.pathPrefix];
}

/**
 * Every (site, locale) scope the deployment serves, in configuration order — the
 * inventory the route's static parameters and the locale negotiation both use.
 */
export function siteScopeSegments(set: SiteSet): readonly string[] {
  const scopes: string[] = [];
  for (const site of set.sites) {
    for (const scope of scopeSegmentsForSite(site)) {
      if (!scopes.includes(scope)) scopes.push(scope);
    }
  }
  return scopes;
}

/** Every (site, locale) pair the deployment serves, in configuration order. */
export function siteLocalePairs(
  set: SiteSet,
): readonly { readonly site: ResolvedSite; readonly locale: Locale }[] {
  return set.sites.flatMap((site) => site.locales.map((locale) => ({ site, locale })));
}

/** One pathname's meaning, as the client components must read it (URL-authoritative). */
export interface PathContext {
  readonly site: ResolvedSite;
  readonly locale: Locale;
  /** A region id bound to (locale) when the path is inside a region namespace, else null. */
  readonly region: string | null;
  /** The page route path inside the region (`region` set) or inside the site (`""` = root). */
  readonly routePath: string;
}

/**
 * Parses a client-side pathname into its site context — and, inside a region namespace,
 * its region. The middle segment is only a region when it is actually bound to THAT
 * locale; otherwise the route is a flat content page and region is `null`.
 */
export function resolvePathContext(
  set: SiteSet,
  entries: readonly PageRegionBinding[],
  pathname: string,
): PathContext | null {
  const segments = pathname.split("/").filter(Boolean);
  const request = resolveSiteRequest(set, segments);
  if (request === null) return null;

  const region = firstRouteSegment(request.routePath);
  if (region === undefined || !isRegionBoundToLocale(entries, request.locale, region)) {
    return {
      site: request.site,
      locale: request.locale,
      region: null,
      routePath: request.routePath,
    };
  }

  const slug = request.routePath.slice(region.length + 1);
  return { site: request.site, locale: request.locale, region, routePath: slug };
}

function firstRouteSegment(routePath: string): string | undefined {
  const [first] = routePath.split("/");
  return first === "" ? undefined : first;
}

/** The `SiteSet` view of a resolved site list and its default site. */
export function siteSetOf(sites: readonly ResolvedSite[], defaultSite: ResolvedSite): SiteSet {
  return { sites, defaultSite };
}

/**
 * The pathname's site context, or the DEFAULT site at `fallbackLocale` when the pathname
 * does not name a site (an unconfigured/unknown path). Client components use this so their
 * links, selectors and region detection always work from the URL they are actually on — and
 * so they never invent a site of their own.
 */
export function pathContextOr(
  set: SiteSet,
  entries: readonly PageRegionBinding[],
  pathname: string,
  fallbackLocale: Locale,
): PathContext {
  return (
    resolvePathContext(set, entries, pathname) ?? {
      site: set.defaultSite,
      locale: fallbackLocale,
      region: null,
      routePath: "",
    }
  );
}
