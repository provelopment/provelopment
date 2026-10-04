import { describe, expect, it } from "vitest";

// DEPLOYMENT SCOPE — this test asserts THIS deployment's own configuration, content and assets, so
// it lives in the deployment capsule (`deployment/tests/**`, FOUNDATION-DEPLOYMENT-ISO-B2A) and runs in
// the `deployment` Vitest project, whose setup selects the REAL installed deployment
// (`tests/setup/real-deployment.ts`, ISO-H2). Its subject is the real capsule, never a fixture.
import { NextRequest } from "next/server";

import { completePublicPath } from "@/app/[[...segments]]/spoke-navigation";
import { SPOKE_SELECTION_HEADER } from "@/config/spoke-selection";
import { siteConfig } from "@/config";
import { proxy } from "@/proxy";

/** The path a request is COMPLETED to inside its Spoke, or `null` when it is already complete. */
function completionFor(path: string, headers: Record<string, string> = {}): string | null {
  const segments = path.split("/").filter(Boolean);
  const completion = completePublicPath(siteConfig, segments, {
    cookieLocale: headers["cookie"]?.split("=")[1],
    acceptLanguage: headers["accept-language"],
  });
  return "redirectPath" in completion ? completion.redirectPath : null;
}

/**
 * The Spoke the boundary selected for a public path, as the App Router tree reads it.
 *
 * M17 — the boundary no longer encodes the Spoke into the pathname: it passes the request through with the
 * selection on a private upstream header, so a client-side transition can commit against the public route.
 */
function selectionFor(path: string, host = "foundation-template.provelopment.com"): string | null {
  const response = proxy(new NextRequest(`https://${host}${path}`, { headers: { host } }));
  return response.headers.get(`x-middleware-request-${SPOKE_SELECTION_HEADER}`);
}

/** The pathname the boundary rewrote the request to — which must now ALWAYS be `null` (M17). */
function rewriteFor(path: string, host = "foundation-template.provelopment.com"): string | null {
  const response = proxy(new NextRequest(`https://${host}${path}`, { headers: { host } }));
  const rewritten = response.headers.get("x-middleware-rewrite");
  return rewritten === null ? null : new URL(rewritten).pathname;
}

/** The status the boundary answers when it refuses. */
function statusFor(path: string, host = "foundation-template.provelopment.com"): number {
  return proxy(new NextRequest(`https://${host}${path}`, { headers: { host } })).status;
}

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

/**
 * The `Location` a request is COMPLETED to inside its Spoke, or `null` when the path is already complete.
 *
 * M16 — completion moved from the request boundary into the Spoke the host selected, because it is a decision
 * about ONE Spoke's Sites and locales. The RULES are unchanged, and so is the resulting public path.
 */
function redirectFor(path: string, headers: Record<string, string> = {}): string | null {
  return completionFor(path, headers);
}

describe("an explicit locale in the path is authoritative", () => {
  it("keeps English when the visitor's cookie says German", () => {
    // `en` is a locale, not a site code, so `/en/about` is the site-less locale form of the
    // DEFAULT site — and the URL's language wins over the stored preference.
    expect(
      completionFor("/en/about", { cookie: "NEXT_LOCALE=de", "accept-language": "de-DE,de" }),
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

describe("the boundary selects the host's Spoke without touching the pathname (M17)", () => {
  const segment = "foundation";

  it("declares the claimed Spoke upstream and passes the PUBLIC path through unchanged", () => {
    for (const path of ["/ww/en", "/ww/en/about", "/", "/about"]) {
      expect(selectionFor(path), path).toBe(segment);
      expect(rewriteFor(path), path).toBeNull();
    }
  });

  it("never answers a DIRECT internal request: the namespace is retired, not a route", () => {
    expect(statusFor(`/~spoke/${segment}/ww/en`)).toBe(404);
    expect(statusFor("/~spoke")).toBe(404);
  });

  it("binds a Spoke's own asset namespace to the host that owns it", () => {
    expect(statusFor(`/spokes/${segment}/assets/sidebar-open.svg`)).toBe(200);
    expect(statusFor("/spokes/other/assets/sidebar-open.svg")).toBe(404);
  });
});
