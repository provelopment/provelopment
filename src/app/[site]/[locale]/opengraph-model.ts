import type { SpokeRuntimeContext } from "@/config/installation-runtime";
import { dictionaryAccessForRuntimeContext } from "@/config/runtime-dictionaries";
import { siteByCode, siteLocalePath, siteSetOf, siteSupportsLocalePath } from "@/core/site";

/**
 * THE OPENGRAPH IMAGE MODEL OF ONE CONTEXT (FOUNDATION-MULTISITE-M14)
 * =================================================================
 *
 * EVERY Spoke-specific fact the social image shows is decided HERE, from the ONE explicit context handed in —
 * never from a module-global configuration:
 *
 *   siteName   the context's own name (`context.siteConfig.name`);
 *   tagline    the CONTEXT DICTIONARY's `home.tagline` for the (site, locale) that answers;
 *   imageUrl   the context's canonical origin + that site/locale path;
 *   siteCode   the site that answered (or the context's default site for an unrecognized code).
 *
 * It is a PURE model (no ImageResponse, no framework call), so two contexts can be compared directly in a
 * unit test before any pixel is rendered — which is exactly what
 * `tests/unit/opengraph-context.test.ts` does for two disposable Installations.
 *
 * WHY THERE IS NO `alt`: a file-convention image route's `alt` export must be a STATIC string, so a
 * context-dependent alt can only be expressed through `generateImageMetadata`. The installed framework
 * (Next 16.3.5) implements that mechanism by requiring a per-image `id`, which the route loader appends as a
 * URL segment (`…/opengraph-image/<id>`) — that would change the accepted public URL
 * (`/<site>/<locale>/opengraph-image`) and its 200 status. Per the milestone rule, the Spoke-specific STATIC
 * alt is therefore REMOVED rather than preserved for convenience; the site identity and the localized words
 * the image itself carries remain context-bound (below).
 *
 * Behaviour preserved exactly: a recognized site + locale answers as itself; an unrecognized site falls back
 * to the context's default site; a locale its site does not serve falls back to that site's default locale.
 */
export interface OpenGraphImageModel {
  /** The context's own name — drawn in the image and used as the image's identity. */
  readonly siteName: string;
  /** The context dictionary's tagline for the (site, locale) that actually answers. */
  readonly tagline: string;
  /** The canonical origin + site/locale path shown in the image. */
  readonly imageUrl: string;
  /** The site code that answered. */
  readonly siteCode: string;
  /** The locale PATH KEY that answered. */
  readonly localePath: string;
}

export function openGraphImageModelForContext(
  context: SpokeRuntimeContext,
  requestedSiteCode: string,
  requestedLocale: string,
): OpenGraphImageModel {
  const siteConfig = context.siteConfig;
  const siteSet = siteSetOf(siteConfig.sites, siteConfig.defaultSite);
  const site = siteByCode(siteSet, requestedSiteCode) ?? siteConfig.defaultSite;
  const localePath = siteSupportsLocalePath(site, requestedLocale)
    ? requestedLocale
    : site.defaultLocale;
  const dictionary = dictionaryAccessForRuntimeContext(context).get(localePath, site.code);

  return {
    siteName: siteConfig.name,
    tagline: dictionary.home.tagline,
    imageUrl: `${siteConfig.url}${siteLocalePath(site, localePath)}`,
    siteCode: site.code,
    localePath,
  };
}
