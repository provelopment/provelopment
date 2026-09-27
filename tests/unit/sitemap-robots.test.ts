import { describe, expect, it } from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { createPageSources } from "@/adapters/content/page-sources";
import { siteConfig } from "@/config";
import { HOME_CONTENT_SLUG } from "@/core/page-content";
import { regionsForLocale } from "@/core/regional-pages";

describe("Phase S — sitemap & robots contract (deterministic, config/content-derived)", () => {
  it("robots references the configured absolute sitemap URL", () => {
    expect(robots().sitemap).toBe(`${siteConfig.url}/sitemap.xml`);
  });

  it("sitemap leads with the root entry and covers every configured locale", async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls[0]).toBe(siteConfig.url);
    for (const { code } of siteConfig.locales) {
      expect(urls, `locale root ${code}`).toContain(`${siteConfig.url}/${code}`);
    }
    expect(entries[0].lastModified).toBeInstanceOf(Date);
  });

  it("every localized URL belongs to a configured locale (no foreign prefixes)", async () => {
    const entries = await sitemap();
    for (const entry of entries.slice(1)) {
      const locale = entry.url.slice(siteConfig.url.length + 1).split("/")[0];
      expect(siteConfig.locales.map((l) => l.code), entry.url).toContain(locale);
    }
  });

  it("never leaks an unconfigured regional combination", async () => {
    const entries = await sitemap();
    const allRegionIds = new Set(Object.keys(siteConfig.regions));

    for (const entry of entries) {
      const segments = entry.url.slice(siteConfig.url.length + 1).split("/").filter(Boolean);
      if (segments.length >= 2 && allRegionIds.has(segments[1])) {
        expect(
          siteConfig.pageBindings.some(
            (binding) => binding.locale === segments[0] && binding.region === segments[1],
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
      const isRegionRoute = segments.length >= 2 && regionIds.has(segments[1]);
      if (isRegionRoute) continue;
      // Non-regional: the root, or a page the site actually authored.
      const routePath = segments.slice(1).join("/");
      if (routePath.length === 0) continue;
      expect(routePath, url).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/);
    }
  });

  it("emits only genuinely configured regional landings and regional pages", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);

    for (const binding of siteConfig.pageBindings) {
      const path =
        binding.slug === null
          ? `/${binding.locale}/${binding.region}`
          : `/${binding.locale}/${binding.region}/${binding.slug}`;
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
    for (const { code } of siteConfig.locales) {
      expected.add(`${siteConfig.url}/${code}`);
      for (const routePath of await pages.listRoutes(siteConfig.defaultSite.id, code)) {
        // The home page's real URL is the locale root, never `/{locale}/home`.
        if (routePath === HOME_CONTENT_SLUG) continue;
        expected.add(`${siteConfig.url}/${code}/${routePath}`);
      }
      for (const region of regionsForLocale(siteConfig.pageBindings, code)) {
        expected.add(`${siteConfig.url}/${code}/${region}`);
      }
    }
    for (const binding of siteConfig.pageBindings) {
      if (binding.slug !== null) {
        expected.add(`${siteConfig.url}/${binding.locale}/${binding.region}/${binding.slug}`);
      }
    }

    expect(new Set(urls)).toEqual(expected);
    expect(new Set(urls).size, "no duplicate URLs").toBe(urls.length);
  });

  it("keeps every pre-existing sitemap invariant (robots + locale coverage)", async () => {
    expect(robots().sitemap).toBe(`${siteConfig.url}/sitemap.xml`);
    const urls = (await sitemap()).map((entry) => entry.url);
    for (const { code } of siteConfig.locales) {
      expect(urls).toContain(`${siteConfig.url}/${code}`);
    }
  });
});