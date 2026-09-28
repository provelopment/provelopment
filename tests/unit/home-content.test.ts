import { describe, expect, it, vi } from "vitest";

// GENERIC ISOLATION (ISO-B1C): deployment-owned state (dictionaries, authored pages, deployment
// configuration) comes from the SYNTHETIC test deployment, never from the repository's own
// deployment. See tests/support/synthetic-deployment.ts — the copy is disposable and the committed
// fixture is only ever its source.
vi.mock("@/config/deployment-root", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/deployment-root")>();
  const { syntheticDeploymentPaths } = await import("../support/synthetic-deployment");
  return {
    ...actual,
    deploymentLayout: () => "override" as const,
    deploymentPaths: () => syntheticDeploymentPaths(),
  };
});
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import PageRoute from "@/app/[...segments]/page";
import { StarterHome } from "@/app/[...segments]/dedicated-pages";
import { createPageSources } from "@/adapters/content/page-sources";
import { buildSitemapRoutes } from "@/application/route-discovery";
import { siteConfig } from "@/config";
import { HOME_CONTENT_SLUG } from "@/core/page-content";

/**
 * The OPTIONAL content-authored home page.
 *
 * A site may author `content/pages/markdown/<site>/<locale>/home.md` (or its JSON
 * counterpart) and have the locale-root route render it through the NORMAL
 * page-source composition. A site that authors no home page keeps the generic
 * configuration-driven starter homepage — so this capability is purely additive.
 *
 * S1 — the home page is site-scoped like every other page: one catch-all route
 * serves `/<site>/<locale>` and `/<site>/<locale>/<route>` alike, so the "home
 * route" and the "page route" are the SAME file and are read once below.
 *
 * The capability's three coupled consequences must agree, which is why the slug is
 * declared ONCE (`@/core/page-content`) and imported rather than re-typed: the
 * home route looks it up, `/<site>/<locale>/home` is never generated, and it never
 * enters the sitemap.
 */

const root = process.cwd();
const read = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8");

const homeRouteSource = read("src", "app", "[...segments]", "page.tsx");
const pageRouteSource = homeRouteSource;
const sitemapSource = read("src", "app", "sitemap.ts");

/** The segments of a home request: the SITE code first, then the locale path key. */
const homeSegments = (locale: string) => [siteConfig.defaultSite.code, locale];

describe("the reserved home slug has ONE authority", () => {
  it("is declared once, in the content model", () => {
    expect(HOME_CONTENT_SLUG).toBe("home");
    const core = read("src", "core", "page-content.ts");
    // Exactly one declaration in the whole content model — no shadow copy.
    expect((core.match(/HOME_CONTENT_SLUG/g) ?? []).length).toBe(1);
  });

  it("is imported everywhere it is needed, never re-typed as a literal", () => {
    for (const [name, source] of [
      ["the home route", homeRouteSource],
      ["the page route", pageRouteSource],
      ["route discovery", read("src", "application", "route-discovery.ts")],
    ] as const) {
      expect(source, name).toContain("HOME_CONTENT_SLUG");
      // No file may re-introduce the slug as a bare URL literal.
      expect(source, name).not.toContain('"/home"');
      expect(source, name).not.toContain("'/home'");
    }
  });
});

describe("/home is never a route and never a sitemap entry", () => {
  it("excludes the reserved slug from the derived route set", () => {
    const routes = buildSitemapRoutes({
            pages: ["about", HOME_CONTENT_SLUG, "resources"],
    });

    expect(routes).toEqual(["", "/about", "/resources"]);
    expect(routes).not.toContain("/home");
    expect(routes.filter((route) => route === "")).toHaveLength(1);
  });

  it("keeps every other content slug, including one that merely starts with 'home'", () => {
    const routes = buildSitemapRoutes({
            pages: [HOME_CONTENT_SLUG, "home-maintenance", "about"],
    });

    expect(routes).toEqual(["", "/home-maintenance", "/about"]);
  });

  it("applies per locale, so no locale can publish /home", () => {
    // Route discovery is locale-agnostic by design (the caller supplies that
    // locale's page inventory), so the exclusion must hold for ANY inventory.
    for (const locale of siteConfig.locales) {
      const routes = buildSitemapRoutes({
                pages: [HOME_CONTENT_SLUG],
      });
      for (const route of routes) {
        expect(`${locale.code}${route}`).not.toBe(`${locale.code}/home`);
      }
      expect(routes).toEqual([""]);
    }
  });

  it("reserves the slug on the page route so it can never double-route", () => {
    expect(pageRouteSource).toMatch(/segments\.length === 1[\s\S]*HOME_CONTENT_SLUG/);
  });

  it("is not filtered ad hoc in the sitemap route itself", () => {
    // The rule belongs to route discovery alone: a second, independent filter in
    // the sitemap route would be a rule with two homes.
    expect(sitemapSource).not.toContain("HOME_CONTENT_SLUG");
  });
});

describe("an authored home page wins; a site without one keeps the starter homepage", () => {
  it("resolves the reference deployment's authored home page (the shipped JSON page)", async () => {
    const pages = createPageSources({ sites: siteConfig.sites });
    // R1A — the repository now authors its own reference Home page in the JSON mode,
    // so the very lookup the home route performs resolves to a real page. The
    // fallback below remains the contract for a site that authors none.
    const home = await pages.resolve(siteConfig.defaultSite.code, HOME_CONTENT_SLUG, siteConfig.defaultLocale);
    expect(home?.kind).toBe("json");
  });

  it("still resolves to nothing when a site authors no such page", async () => {
    const pages = createPageSources({ sites: siteConfig.sites });
    expect(
      await pages.resolve(siteConfig.defaultSite.code, "zz-not-authored", siteConfig.defaultLocale),
    ).toBeNull();
  });

  it("renders the authored home page at the locale root, not the generic starter", async () => {
    const html = renderToStaticMarkup(
      await PageRoute({
        params: Promise.resolve({
          segments: homeSegments(siteConfig.defaultSite.defaultLocale),
        }),
      }),
    );

    expect(html.match(/<h1\b/g) ?? []).toHaveLength(1);
    expect(html).not.toContain("home-hero");
  });

  it("keeps the starter homepage as the fallback presentation (asserted on the component)", () => {
    // The route's content-first ordering is asserted below; this pins the
    // presentation the fallback renders, which the shipped deployment's authored
    // page would otherwise hide from an end-to-end assertion.
    const html = renderToStaticMarkup(
      createElement(StarterHome, { locale: siteConfig.defaultLocale, siteId: siteConfig.defaultSite.code }),
    );
    expect(html).toContain("home-hero");
    expect(html).toContain("home-hero-copy");
    expect(html).toContain("home-card");
    expect(html).toContain(siteConfig.name);
  });

  it("renders a homepage for every configured locale", async () => {
    for (const locale of siteConfig.locales) {
      const html = renderToStaticMarkup(
        await PageRoute({ params: Promise.resolve({ segments: homeSegments(locale.code) }) }),
      );
      expect(html.length, locale.code).toBeGreaterThan(0);
      expect(html.match(/<h1\b/g) ?? [], locale.code).toHaveLength(1);
    }
  });

  it("is CONTENT-FIRST: the authored lookup precedes the generic starter render", () => {
    // If the generic return came first, an authored home page would be silently
    // ignored — the exact failure this ordering guards.
    const lookupAt = homeRouteSource.indexOf("routes.resolve(site.code, HOME_CONTENT_SLUG");
    const starterAt = homeRouteSource.indexOf("<StarterHome");
    expect(lookupAt).toBeGreaterThan(-1);
    expect(starterAt).toBeGreaterThan(lookupAt);
    // …and it renders through the SAFE page renderer, the same one every other page
    // uses — never the trusted collection renderer.
    expect(homeRouteSource).toContain("SafeMarkdownContent");
    expect(homeRouteSource).not.toContain('from "@/components/site/markdown-content"');
  });
});