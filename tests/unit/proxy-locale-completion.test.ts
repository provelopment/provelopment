import { describe, expect, it } from "vitest";
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

/** The `Location` a request is redirected to, or `null` when it is served as-is. */
function redirectFor(path: string, headers: Record<string, string> = {}): string | null {
  const response = proxy(new NextRequest(`https://foundation-template.provelopment.com${path}`, { headers }));
  const location = response.headers.get("location");
  return location === null ? null : new URL(location).pathname;
}

describe("an explicit locale in the path is authoritative", () => {
  it("keeps German when the visitor's cookie says English", () => {
    expect(redirectFor("/de/about", { cookie: "NEXT_LOCALE=en", "accept-language": "en-US,en" })).toBe(
      `/${REFERENCE}/de/about`,
    );
  });

  it("keeps English when the visitor's cookie says German", () => {
    expect(
      redirectFor("/en/about", { cookie: "NEXT_LOCALE=de", "accept-language": "de-DE,de" }),
    ).toBe(`/${REFERENCE}/en/about`);
  });

  it("completes a bare locale path to that locale's root", () => {
    expect(redirectFor("/de", { cookie: "NEXT_LOCALE=en" })).toBe(`/${REFERENCE}/de`);
    expect(redirectFor("/en", { "accept-language": "de-DE,de" })).toBe(`/${REFERENCE}/en`);
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
