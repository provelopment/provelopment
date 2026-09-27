/**
 * SWITCHING BETWEEN SITES (FOUNDATION-S1E2)
 * ========================================
 *
 * A visitor may move between the deployment's sites, and the destination must be ONE of:
 *
 *  1. the SAME route in the target site, when the target can actually serve it;
 *  2. otherwise the target site's HOME — never a 404 just because two independent page trees
 *     have different inventories.
 *
 * The LOCALE choice is a core rule (`@/core/site` → `siteSwitchLocalePath`: the same path key,
 * else a unique same-language candidate, else the target's default) and the URL is built by the
 * core path builder, so this module adds exactly the one thing core must not know: WHETHER the
 * target actually has the page. That question belongs to the page composition
 * (`@/adapters/content/page-sources`), which this module reaches only through the
 * `PageAvailability` port below — the application layer decides, the adapter answers.
 *
 * No cross-site resolution happens anywhere in here: every question is asked OF THE TARGET SITE,
 * with that site's own code and its own locale policy, so another site's tree is never consulted.
 */
import { pageRoutePathSegments } from "@/core/page-route-path";
import { bindingsForSite, hasPageEntry, regionsForLocale } from "@/core/regional-pages";
import type { PageRegionBinding } from "@/core/region";
import {
  siteHomePath,
  sitePath,
  siteSwitchDestination,
  siteSwitchLocalePath,
  type ResolvedSite,
} from "@/core/site";

/** Whether the page tree of one site can answer a route path in one locale. */
export interface PageAvailability {
  hasPage(siteCode: string, routePath: string, localePath: string): Promise<boolean>;
}

/** Where the visitor is now: the site they are in, its locale and the route they are on. */
export interface SiteSwitchContext {
  readonly site: ResolvedSite;
  readonly localePath: string;
  /** The route path INSIDE the site+locale (a region's namespace included), `""` for the root. */
  readonly routePath: string;
}

export interface SiteSwitchOptions {
  /** Every site the deployment serves, in configuration order. */
  readonly sites: readonly ResolvedSite[];
  /** Every configured page binding, so a REGIONAL route counts as existing for its own site. */
  readonly bindings: readonly PageRegionBinding[];
  readonly availability: PageAvailability;
}

/** One option of the Site selector: the site, its label and where it lands. */
export interface SiteSwitchOption {
  readonly code: string;
  readonly label: string;
  readonly href: string;
}

/**
 * Where a visitor lands when they switch to `target`: the same route when the target serves it,
 * otherwise the target's home in the chosen locale.
 */
export async function resolveSiteSwitchHref(
  target: ResolvedSite,
  context: SiteSwitchContext,
  options: SiteSwitchOptions,
): Promise<string> {
  const routePath = context.routePath;
  const routeExists =
    routePath === "" ? true : await siteRouteAvailable(target, context.localePath, routePath, options);

  return siteSwitchDestination({ target, localePath: context.localePath, routePath, routeExists });
}

/**
 * Every site as a selector option, in configuration order. The CURRENT site's option reuses the
 * path the visitor is already on (it exists by definition), while every other site asks the
 * question above — so a selector can offer Canada and France without either site having to share
 * the other's inventory.
 */
export async function siteSwitchOptions(
  context: SiteSwitchContext,
  options: SiteSwitchOptions,
): Promise<readonly SiteSwitchOption[]> {
  return Promise.all(
    options.sites.map(async (site) => ({
      code: site.code,
      label: site.label,
      href:
        site.code === context.site.code
          ? (sitePath(site, context.localePath, context.routePath) ?? siteHomePath(site))
          : await resolveSiteSwitchHref(site, context, options),
    })),
  );
}

/** Whether the target serves this route path in this locale — page tree OR configured region. */
async function siteRouteAvailable(
  target: ResolvedSite,
  localePath: string,
  routePath: string,
  options: SiteSwitchOptions,
): Promise<boolean> {
  const locale = siteSwitchLocalePath(target, localePath);
  if (await options.availability.hasPage(target.code, routePath, locale)) return true;
  return regionalRouteAvailable(options.bindings, target, locale, routePath);
}

/**
 * A REGIONAL route exists when the TARGET SITE's own bindings say so — the same rule the page
 * route applies, so a landing (`/{locale}/{region}`) or a configured regional page
 * (`/{locale}/{region}/{page}`) is never mistaken for a missing page. A region bound to another
 * site cannot make a route exist here.
 */
export function regionalRouteAvailable(
  bindings: readonly PageRegionBinding[],
  site: ResolvedSite,
  localePath: string,
  routePath: string,
): boolean {
  const segments = pageRoutePathSegments(routePath);
  const [region, slug] = segments;
  if (region === undefined) return false;

  const siteBindings = bindingsForSite(bindings, site.code);
  if (!regionsForLocale(siteBindings, localePath).includes(region)) return false;
  if (segments.length === 1) return true;
  if (segments.length === 2 && slug !== undefined) {
    return hasPageEntry(siteBindings, localePath, region, slug);
  }
  return false;
}
