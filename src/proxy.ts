import { NextResponse, type NextRequest } from "next/server";
import { siteConfig } from "@/config";
import { negotiateLocale } from "@/core/locale";

const LOCALE_COOKIE = "NEXT_LOCALE";

const supportedLocales = siteConfig.locales.map((locale) => locale.code);

/**
 * Redirects requests without a locale prefix to the negotiated locale,
 * based on (in order) the `NEXT_LOCALE` cookie, the `Accept-Language`
 * header, and the configured default locale.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/")[1];

  if (firstSegment && supportedLocales.includes(firstSegment)) {
    return NextResponse.next();
  }

  const locale = negotiateLocale({
    supported: supportedLocales,
    defaultLocale: siteConfig.defaultLocale,
    cookieLocale: request.cookies.get(LOCALE_COOKIE)?.value,
    acceptLanguage: request.headers.get("accept-language") ?? undefined,
  });

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;

  return NextResponse.redirect(url);
}

export const config = {
  /** Skip internal assets and any path that looks like a static file. */
  matcher: ["/((?!_next|.*\\..*).*)"],
};