import { describe, expect, it } from "vitest";

// GENERIC ISOLATION (ISO-B1C): deployment-owned state (dictionaries, authored pages, deployment
// configuration) comes from the SYNTHETIC test deployment, never from the repository's own
// deployment. See tests/support/synthetic-deployment.ts — the copy is disposable and the committed
// fixture is only ever its source.

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { createPageSources } from "@/adapters/content/page-sources";
import { siteConfig } from "@/config";
import { HOME_CONTENT_SLUG } from "@/core/page-content";
import { regionsForLocale, bindingsForSite } from "@/core/regional-pages";
import { sitePath } from "@/core/site";

describe("Phase S — sitemap & robots contract (deterministic, config/content-derived)", () => {
  it("robots references the configured absolute sitemap URL", () => {
    expect(robots().sitemap).toBe(`${siteConfig.url}/sitemap.xml`);
  });

  it("sitemap leads with the root entry and covers every configured locale", async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls[0]).toBe(siteConfig.url);
    // S1 — a locale root is a URL INSIDE a site: `/ww/en`, never a bare `/en`.
    for (const site of siteConfig.sites) {
      for (const { path } of site.locales) {
        expect(urls, `locale root ${site.code}/${path}`).toContain(
          `${siteConfig.url}${sitePath(site, path)}`,
        );
      }
    }
    expect(entries[0].lastModified).toBeInstanceOf(Date);
  });

  it("every published URL belongs to a configured site AND one of that site's locales", async () => {
    const entries = await sitemap();
    for (const entry of entries.slice(1)) {
      const [siteCode, localePath] = entry.url.slice(siteConfig.url.length + 1).split("/");
      const site = siteConfig.sites.find((candidate) => candidate.code === siteCode);
      // No foreign site prefix…
      expect(site, entry.url).toBeDefined();
      // …and no locale the site does not actually serve.
      expect(site?.locales.map((locale) => locale.path), entry.url).toContain(localePath);
    }
  });

  it("never leaks an unconfigured regional combination", async () => {
    const entries = await sitemap();
    const allRegionIds = new Set(Object.keys(siteConfig.regions));

    for (const entry of entries) {
      // S1 — the URL is `/<site>/<locale>/<region>…`, so a region sits at index 2.
      const segments = entry.url.slice(siteConfig.url.length + 1).split("/").filter(Boolean);
      if (segments.length >= 3 && allRegionIds.has(segments[2])) {
        expect(
          siteConfig.pageBindings.some(
            (binding) =>
              binding.site === segments[0] &&
              binding.locale === segments[1] &&
              binding.region === segments[2],
          ),
          entry.url,
        ).toBe(true);
      }
    }
  });

  it("emits no collection route: every route it publishes is an authored page or a region", async () => {
    // A1E: there is no offerings/blog/portfolio/testimonials collection. A route in the
    // sitemap is therefore always the locale root, an authored page route (which is the
    // ONLY thing that can produce `/offerings/...`, `/blog/...` and so on) or a
    // configured regional landing/page. Nothing is invented by a feature flag.
    const urls = (await sitemap()).map((entry) => entry.url);
    const regionIds = new Set(Object.keys(siteConfig.regions));

    for (const url of urls) {
      const segments = url.slice(siteConfig.url.length + 1).split("/").filter(Boolean);
      const isRegionRoute = segments.length >= 3 && regionIds.has(segments[2]);
      if (isRegionRoute) continue;
      // Non-regional: the root, or a page the site actually authored — after `/<site>/<locale>`.
      const routePath = segments.slice(2).join("/");
      if (routePath.length === 0) continue;
      expect(routePath, url).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/);
    }
  });

  it("emits only genuinely configured regional landings and regional pages", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);

    for (const binding of siteConfig.pageBindings) {
      const path =
        binding.slug === null
          ? `/${binding.site}/${binding.locale}/${binding.region}`
          : `/${binding.site}/${binding.locale}/${binding.region}/${binding.slug}`;
      expect(urls, binding.locale + binding.region + (binding.slug ?? "")).toContain(
        `${siteConfig.url}${path}`,
      );
    }
  });
});
describe("Phase T — trust/publishing sitemap contract (derived inventory)", () => {
  it("publishes exactly the inventory the site actually serves", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    const pages = createPageSources({ sites: siteConfig.sites });

    // The expected set is derived from the SAME composition the routes use, so the
    // assertion is "the sitemap advertises what the site serves" rather than a frozen
    // list: no phantom route for content that does not exist, and no missing entry for
    // content that does.
    const expected = new Set<string>([siteConfig.url]);
    // S1 — the same derivation, PER SITE: the sitemap advertises exactly what each site serves.
    for (const site of siteConfig.sites) {
      const siteBindings = bindingsForSite(siteConfig.pageBindings, site.code);
      for (const { path } of site.locales) {
        expected.add(`${siteConfig.url}${sitePath(site, path)}`);
        for (const routePath of await pages.listRoutes(site.code, path)) {
          // The home page's real URL is the locale root, never `/<site>/<locale>/home`.
          if (routePath === HOME_CONTENT_SLUG) continue;
          expected.add(`${siteConfig.url}${sitePath(site, path, routePath)}`);
        }
        for (const region of regionsForLocale(siteBindings, path)) {
          expected.add(`${siteConfig.url}${sitePath(site, path, region)}`);
        }
      }
    }
    for (const binding of siteConfig.pageBindings) {
      if (binding.slug !== null) {
        expected.add(
          `${siteConfig.url}/${binding.site}/${binding.locale}/${binding.region}/${binding.slug}`,
        );
      }
    }

    expect(new Set(urls)).toEqual(expected);
    expect(new Set(urls).size, "no duplicate URLs").toBe(urls.length);
  });

  it("keeps every pre-existing sitemap invariant (robots + locale coverage)", async () => {
    expect(robots().sitemap).toBe(`${siteConfig.url}/sitemap.xml`);
    const urls = (await sitemap()).map((entry) => entry.url);
    for (const site of siteConfig.sites) {
      for (const { path } of site.locales) {
        expect(urls).toContain(`${siteConfig.url}${sitePath(site, path)}`);
      }
    }
  });
});