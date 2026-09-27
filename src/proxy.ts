import { NextResponse, type NextRequest } from "next/server";
import { siteConfig } from "@/config";
import { negotiateLocale } from "@/core/locale";
import type { ResolvedSite } from "@/core/site";

const LOCALE_COOKIE = "NEXT_LOCALE";

/**
 * S1 — LOCALE NEGOTIATION IS SITE-SCOPED.
 *
 * The deployment's URL space is `/{locale}/…` for the default site and
 * `/{sitePrefix}/{locale}/…` for every other site, so this middleware only completes a URL
 * that omits the locale, and it always negotiates WITHIN the site that URL already names (or
 * within the default site when it names none). A prefix is never a locale candidate and a
 * locale is never a site candidate, so a redirect can never move a visitor between sites.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0];

  if (first !== undefined) {
    // A site prefix: `/{prefix}/{locale}/…` is the site's own URL space. A bare prefix, or a
    // prefix followed by something that is not one of THAT site's locales, is completed by
    // negotiating among the site's OWN locales — the deployment's other sites are never
    // candidates, so a redirect can never carry a visitor across a site boundary.
    const site = siteConfig.sites.find(
      (entry) => entry.pathPrefix !== "" && entry.pathPrefix === first,
    );
    if (site) {
      if (!segments[1] || !site.locales.includes(segments[1])) {
        const locale = negotiateWithin(site, request);
        const url = request.nextUrl.clone();
        url.pathname = `/${site.pathPrefix}/${locale}${
          segments.length > 1 ? `/${segments.slice(1).join("/")}` : ""
        }`;
        return NextResponse.redirect(url);
      }
      return NextResponse.next();
    }

    // Otherwise the first segment must be a locale of the DEFAULT site (a prefix can never
    // also be a declared locale code, so the two readings cannot compete).
    if (siteConfig.defaultSite.locales.includes(first)) {
      return NextResponse.next();
    }
  }

  const locale = negotiateWithin(siteConfig.defaultSite, request);

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;

  return NextResponse.redirect(url);
}

/**
 * S1 — locale negotiation happens INSIDE one site: the candidates are that site's locales and
 * `NEXT_LOCALE` only counts when this site serves it. The cookie is a deployment-wide preference
 * (it is written by the language switcher, which only ever offers the current site's locales), so
 * a stale value from another site simply does not match and the site's own default is used.
 */
function negotiateWithin(site: ResolvedSite, request: NextRequest) {
  return negotiateLocale({
    supported: [...site.locales],
    defaultLocale: site.defaultLocale,
    cookieLocale: request.cookies.get(LOCALE_COOKIE)?.value,
    acceptLanguage: request.headers.get("accept-language") ?? undefined,
  });
}

export const config = {
  /** Skip internal assets and any path that looks like a static file. */
  matcher: ["/((?!_next|.*\\..*).*)"],
};