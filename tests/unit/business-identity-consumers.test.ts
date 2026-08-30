import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createDirectionLinkResolver } from "@/adapters/maps";
import { RegionBlock } from "@/components/site/region-block";
import { RegionStructuredData } from "@/components/site/region-structured-data";
import type { SiteConfigFile } from "@/config/loader";
import { parseSiteConfig, siteConfig } from "@/config/loader";
import type { OperationalRegion } from "@/core/region";
import { regionToLocation, resolveRegion } from "@/core/region";

const directionLinkResolver = createDirectionLinkResolver(siteConfig.mapsFeature);

function regionFor(regionId: string): OperationalRegion {
  const region = resolveRegion(siteConfig.regions, regionId);
  if (!region) throw new Error(`no region "${regionId}"`);
  return region;
}

describe("Phase K — regional consumers", () => {
  it("the region block renders the resolved region's complete operational identity", () => {
    const region = regionFor("toronto");
    const html = renderToStaticMarkup(
      RegionBlock({
        region,
        locale: "en",
        direction: directionLinkResolver.resolve(regionToLocation(region)),
      }),
    );

    expect(html).toContain("America/Toronto");
    expect(html).toContain(region.address.city); // Toronto
    expect(html).toContain(region.phone!);
    expect(html).toContain(region.email!);
    // All seven days render individually (no Mon–Fri collapse).
    for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]) {
      expect(html).toContain(day);
    }
    // Holidays are shown separately.
    expect(html).toContain("Christmas Day");
    expect(html).toContain("Christmas Eve");
    // Closed days say so structurally.
    expect(html).toContain("Closed");

    // Phase M refinement: the timezone is INSIDE the Business Hours heading as
    // one unit (localized (English) — IANA), never a standalone element.
    expect(html).toMatch(/Business hours \(Time Zone:/);
    expect(html).toContain("— America/Toronto");
    expect((html.match(/America\/Toronto/g) ?? []).length).toBe(1);
  });

  it("cross-region isolation: a toronto page contains no vancouver/jakarta operational data", () => {
    const toronto = regionFor("toronto");
    const vancouver = regionFor("vancouver");

    for (const region of [toronto, vancouver]) {
      const html = renderToStaticMarkup(
        RegionBlock({
          region,
          locale: "en",
          direction: directionLinkResolver.resolve(regionToLocation(region)),
        }),
      );
      const ownCity = region.address.city;
      const otherCity = ownCity === "Toronto" ? "Vancouver" : "Toronto";
      expect(html).toContain(ownCity);
      expect(html).not.toContain(otherCity);
      expect(html).not.toContain("Jakarta");
      expect(html).not.toContain("London");
    }
  });

  it("the same region renders through multiple locales with the same operational identity", () => {
    const enHtml = renderToStaticMarkup(
      RegionBlock({ region: regionFor("toronto"), locale: "en", direction: { kind: "none" } }),
    );
    const frHtml = renderToStaticMarkup(
      RegionBlock({ region: regionFor("toronto"), locale: "fr", direction: { kind: "none" } }),
    );
    // Same region → same timezone and hours in both languages; content differs.
    expect(enHtml).toContain("America/Toronto");
    expect(frHtml).toContain("America/Toronto");
    expect(enHtml).toContain("Monday");
    expect(frHtml).toContain("lundi");
    // Phase M refinement: each locale gets its own localized timezone display
    // inside the same heading (values come from the platform ICU table; the
    // apostrophe in the French heading is HTML-escaped by SSR as &#x27;).
    expect(frHtml).toMatch(/ouverture &#x27;|&#x27;ouverture/);
    expect(frHtml).toContain("Fuseau horaire:");
    expect(frHtml).toContain("America/Toronto");
    expect(enHtml).toMatch(/Business hours \(Time Zone:/);
  });

  it("JSON-LD describes ONLY the resolved region (never any other region's streets)", () => {
    const allStreets = Object.values(siteConfig.regions).map((region) => region.address.street);
    for (const regionId of new Set(siteConfig.pageBindings.map((binding) => binding.region))) {
      const region = regionFor(regionId);
      const html = renderToStaticMarkup(RegionStructuredData({ region }));
      expect(html).toContain(region.address.street);

      const json = html.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
      const node = JSON.parse(json) as { address?: { addressLocality?: string } };
      expect(node.address?.addressLocality).toBe(region.address.city);
      for (const street of allStreets) {
        if (street !== region.address.street) {
          expect(html, `${region.id} leaks ${street}`).not.toContain(street);
        }
      }
      expect(html).not.toContain("1 Demo Street");
    }
  });

  it("JSON-LD opening hours come from the region's seven-day schedule", () => {
    const region = regionFor("berlin");
    const html = renderToStaticMarkup(RegionStructuredData({ region }));
    expect(html).toContain("Monday");
    expect(html).toContain("09:00");
    expect(html).toContain("17:00");
  });

  it("directions resolve for the resolved region through the provider seam (geo wins)", () => {
    for (const regionId of new Set(siteConfig.pageBindings.map((binding) => binding.region))) {
      const region = regionFor(regionId);
      const action = directionLinkResolver.resolve(regionToLocation(region));
      expect(action.kind, regionId).toBe("link");
      if (region.geo && action.kind === "link") {
        expect(action.href).toContain(String(region.geo.lat));
      }
    }
  });
});

describe("Phase K — legacy configuration remains functional (no regions)", () => {
  const legacyConfig: SiteConfigFile = {
    site: {
      url: "https://example.com",
      name: "Example",
      tagline: "An example site",
      description: "A site used for testing.",
    },
    i18n: { defaultLocale: "en", locales: [{ code: "en", label: "English" }] },
    contact: { email: "hello@example.com" },
    socialLinks: [],
    navigation: [{ label: "Home", href: "/" }],
  };

  it("a legacy config yields no regions and no page bindings", () => {
    const config = parseSiteConfig(legacyConfig);
    expect(config.regions).toEqual({});
    expect(config.pageBindings).toEqual([]);
    // Legacy global business identity still normalizes exactly as before.
    expect(config.business.locations).toEqual([]);
    expect(config.business.contact.email).toBe("hello@example.com");
  });

  it("a legacy config with locations keeps the global business identity", () => {
    const config = parseSiteConfig({
      ...legacyConfig,
      business: {
        timezone: "Asia/Jakarta",
        type: "LocalBusiness",
        locations: [
          {
            id: "main",
            name: "HQ",
            address: { street: "1 Main St", city: "Jakarta", country: "Indonesia" },
            hours: { intervals: [{ days: ["mon"], open: "09:00", close: "17:00" }], exceptional: [] },
          },
        ],
      },
    });
    expect(config.regions).toEqual({});
    expect(config.business.timezone).toBe("Asia/Jakarta");
    expect(config.business.locations[0].name).toBe("HQ");
  });
});