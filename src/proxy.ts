import { NextResponse, type NextRequest } from "next/server";
import { siteConfig } from "@/config";
import { negotiateLocale } from "@/core/locale";
import {
  siteByCode,
  sitePrefixPath,
  siteSetOf,
  siteSupportsLocalePath,
  type ResolvedSite,
} from "@/core/site";

const LOCALE_COOKIE = "NEXT_LOCALE";

/** The deployment's sites, in configuration order (the URL's first segments). */
const siteSet = siteSetOf(siteConfig.sites, siteConfig.defaultSite);

/**
 * S1 — LOCALE NEGOTIATION IS SITE-SCOPED.
 *
 * Every public URL is `/<site>/<locale>/<route>`: the site CODE is the first segment and is
 * never hidden, so this middleware only COMPLETES a path that omits the locale — or, for a
 * path that names no site at all, completes it with the deployment's default site first. It
 * always negotiates WITHIN the site the URL already names (or within the default site), and
 * a site code is never a locale candidate and a locale is never a site candidate, so a
 * redirect can never move a visitor between sites.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0];
  const site = first === undefined ? undefined : siteByCode(siteSet, first);

  if (site !== undefined) {
    // `/<code>/<locale>/…` is the site's own URL space. A bare site path (`/ca`), or a site
    // followed by something that is not one of THAT site's locale path keys, is completed by
    // negotiating among the site's OWN locales — the deployment's other sites are never
    // candidates, so a redirect can never carry a visitor across a site boundary.
    const localePath = segments[1];
    if (localePath !== undefined && siteSupportsLocalePath(site, localePath)) {
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    url.pathname = `${sitePrefixPath(site)}/${negotiateWithin(site, request)}${
      segments.length > 1 ? `/${segments.slice(1).join("/")}` : ""
    }`;
    return NextResponse.redirect(url);
  }

  // The path names no site: it is completed with the DEFAULT site and that site's negotiated
  // locale. A leading segment that is already one of the default site's locales (the old,
  // site-less form) is replaced rather than repeated, so `/en/about` and `/about` both land
  // on `/<default site>/<locale>/about`.
  const defaultSite = siteConfig.defaultSite;
  // R1B — an EXPLICIT locale in the path is authoritative, exactly as it is in the site-scoped
  // form (`/ww/de/...` never negotiates at all): `/de/about` means German whatever the visitor's
  // cookie says. A link that carries a language must not be answered in another one — which is
  // what would happen if this negotiation preferred `NEXT_LOCALE` over the URL once a deployment
  // serves more than one language. Only a path that names NO locale negotiates.
  const explicitLocale =
    first !== undefined && siteSupportsLocalePath(defaultSite, first) ? first : undefined;
  const rest = explicitLocale === undefined ? segments : segments.slice(1);

  const url = request.nextUrl.clone();
  url.pathname = `${sitePrefixPath(defaultSite)}/${
    explicitLocale ?? negotiateWithin(defaultSite, request)
  }${rest.length === 0 ? "" : `/${rest.join("/")}`}`;

  return NextResponse.redirect(url);
}

/**
 * S1 — locale negotiation happens INSIDE one site: the candidates are that site's locale path
 * keys and `NEXT_LOCALE` only counts when this site serves it. The cookie is a deployment-wide
 * preference (it is written by the language switcher, which only ever offers the current
 * site's locales), so a stale value from another site simply does not match and the site's own
 * default is used.
 */
function negotiateWithin(site: ResolvedSite, request: NextRequest) {
  return negotiateLocale({
    supported: site.locales.map((locale) => locale.path),
    defaultLocale: site.defaultLocale,
    cookieLocale: request.cookies.get(LOCALE_COOKIE)?.value,
    acceptLanguage: request.headers.get("accept-language") ?? undefined,
  });
}

export const config = {
  /** Skip internal assets and any path that looks like a static file. */
  matcher: ["/((?!_next|.*\\..*).*)"],
};