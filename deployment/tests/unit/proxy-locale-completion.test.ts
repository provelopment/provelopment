import { describe, expect, it } from "vitest";

// DEPLOYMENT SCOPE — this test asserts THIS deployment's own configuration, content and assets, so
// it lives in the deployment capsule (`deployment/tests/**`, FOUNDATION-DEPLOYMENT-ISO-B2A) and runs in
// the `deployment` Vitest project, whose setup selects the REAL installed deployment
// (`tests/setup/real-deployment.ts`, ISO-H2). Its subject is the real capsule, never a fixture.
import { NextRequest } from "next/server";

import { siteConfig } from "@/config";
import { proxy } from "@/proxy";

/**
 * FOUNDATION-R1B — A LINK'S LANGUAGE SURVIVES THE REDIRECT THAT COMPLETES IT
 * =========================================================================
 *
 * Every public URL is `/<site>/<locale>/<route>`; the site-less locale form (`/de/about`) is the
 * one spelling a page can still emit (a JSON action's `route` destination is resolved as
 * `/<locale>/<route>`), and `src/proxy.ts` completes it into the site-scoped URL.
 *
 * Once a deployment serves MORE THAN ONE language, that completion must not be decided by
 * `NEXT_LOCALE`: `/de/about` is German, whatever the visitor's cookie says, exactly as the
 * site-scoped form `/ww/de/about` never negotiates at all. This file pins that rule — and pins
 * that a path which names NO locale still negotiates (cookie, then `Accept-Language`, then the
 * deployment default).
 */
const REFERENCE = siteConfig.defaultSite.code;
/** R1C — the reference deployment's second site (Germany), whose code is also a locale name. */
const GERMANY = siteConfig.sites.find((candidate) => candidate.code !== REFERENCE)?.code as string;

/** The `Location` a request is redirected to, or `null` when it is served as-is. */
function redirectFor(path: string, headers: Record<string, string> = {}): string | null {
  const response = proxy(new NextRequest(`https://foundation-template.provelopment.com${path}`, { headers }));
  const location = response.headers.get("location");
  return location === null ? null : new URL(location).pathname;
}

describe("an explicit locale in the path is authoritative", () => {
  it("keeps English when the visitor's cookie says German", () => {
    // `en` is a locale, not a site code, so `/en/about` is the site-less locale form of the
    // DEFAULT site — and the URL's language wins over the stored preference.
    expect(
      redirectFor("/en/about", { cookie: "NEXT_LOCALE=de", "accept-language": "de-DE,de" }),
    ).toBe(`/${REFERENCE}/en/about`);
  });

  it("completes a bare locale path to that locale's root", () => {
    expect(redirectFor("/en", { "accept-language": "de-DE,de" })).toBe(`/${REFERENCE}/en`);
  });

  it("treats a SITE code as a site, not as a locale (R1C: `de` is the Germany site)", () => {
    // The first segment wins as a site code, so `/de/about` is the Germany site's About page
    // missing its locale. Which locale completes it is GERMANY's own policy — its default when the
    // visitor expresses no preference, or the visitor's cookie WHEN THAT SITE SERVES IT. What must
    // never happen is the visitor landing in another site.
    expect(redirectFor("/de/about")).toBe(`/${GERMANY}/de/about`);
    expect(redirectFor("/de/about", { cookie: "NEXT_LOCALE=en" })).toBe(`/${GERMANY}/en/about`);
    expect(redirectFor("/de/about", { cookie: "NEXT_LOCALE=fr" })).toBe(`/${GERMANY}/de/about`);
    expect(redirectFor("/de")).toBe(`/${GERMANY}/de`);
  });
});

describe("a path that names no locale still negotiates", () => {
  it("uses the default locale when the visitor expresses no preference", () => {
    expect(redirectFor("/about")).toBe(`/${REFERENCE}/${siteConfig.defaultLocale}/about`);
  });

  it("honours the cookie, then Accept-Language, then the default", () => {
    expect(redirectFor("/about", { cookie: "NEXT_LOCALE=de" })).toBe(`/${REFERENCE}/de/about`);
    expect(redirectFor("/about", { "accept-language": "de-DE,de;q=0.9" })).toBe(
      `/${REFERENCE}/de/about`,
    );
    expect(redirectFor("/", { "accept-language": "fr-FR,fr;q=0.9" })).toBe(
      `/${REFERENCE}/${siteConfig.defaultLocale}`,
    );
  });
});

describe("the site-scoped form is never redirected", () => {
  it("serves both languages at their own URLs", () => {
    expect(redirectFor("/ww/en")).toBeNull();
    expect(redirectFor("/ww/de")).toBeNull();
    expect(redirectFor("/ww/de/about", { cookie: "NEXT_LOCALE=en" })).toBeNull();
  });
});
