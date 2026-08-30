import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config";
import type { Address, BusinessLocation } from "@/core/business";
import type { OperationalRegion, PageRegionBinding, RegionSchedule, TimeInterval } from "@/core/region";
import {
  assertRegionsValid,
  isCalendarDate,
  regionToLocation,
  resolveRegion,
} from "@/core/region";
import { hasPageEntry, regionsForLocale } from "@/core/regional-pages";

const regions = siteConfig.regions;
const pageBindings = siteConfig.pageBindings;

function regionById(id: string): OperationalRegion {
  const region = resolveRegion(regions, id);
  if (!region) throw new Error(`missing region ${id}`);
  return region;
}

describe("Phase L - page to region resolution (live demo config)", () => {
  it("EN Toronto - toronto region (America/Toronto)", () => {
    expect(hasPageEntry(pageBindings, "en", "toronto", null)).toBe(true);
    expect(regionById("toronto").timezone).toBe("America/Toronto");
  });

  it("EN Vancouver - vancouver region (America/Vancouver)", () => {
    expect(hasPageEntry(pageBindings, "en", "vancouver", null)).toBe(true);
    expect(regionById("vancouver").timezone).toBe("America/Vancouver");
  });

  it("FR Toronto - same toronto region as EN Toronto", () => {
    expect(hasPageEntry(pageBindings, "fr", "toronto", null)).toBe(true);
    expect(regionById("toronto").timezone).toBe("America/Toronto");
  });

  it("FR Montreal - montreal region, sharing a timezone with toronto", () => {
    expect(hasPageEntry(pageBindings, "fr", "montreal", null)).toBe(true);
    expect(regionById("montreal").timezone).toBe("America/Toronto");
    expect(regionById("montreal").timezone).toBe(regionById("toronto").timezone);
    expect(regionById("montreal").id).not.toBe(regionById("toronto").id);
  });

  it("DE Berlin - berlin region (Europe/Berlin)", () => {
    expect(hasPageEntry(pageBindings, "de", "berlin", null)).toBe(true);
    expect(regionById("berlin").timezone).toBe("Europe/Berlin");
  });

  it("one locale resolves multiple regions with different timezones", () => {
    const enRegions = regionsForLocale(pageBindings, "en");
    expect(enRegions).toEqual(["toronto", "vancouver"]);
    expect(regionById("toronto").timezone).not.toBe(regionById("vancouver").timezone);
  });

  it("one region is presented through multiple locales", () => {
    const torontoLocales = [
      ...new Set(
        pageBindings
          .filter((binding) => binding.region === "toronto")
          .map((binding) => binding.locale),
      ),
    ].sort();
    expect(torontoLocales).toEqual(["en", "fr"]);
  });

  it("regions have selector labels", () => {
    expect(regionById("toronto").label).toBe("Toronto");
    expect(regionById("vancouver").label).toBe("Vancouver");
    expect(regionById("montreal").label).toBe("Montréal");
    expect(regionById("berlin").label).toBe("Berlin");
  });

  it("a locale with no regional pages has no available regions", () => {
    expect(regionsForLocale(pageBindings, "ja")).toEqual([]);
    expect(regionsForLocale(pageBindings, "ko")).toEqual([]);
  });

  it("different regions can have different page inventories", () => {
    expect(hasPageEntry(pageBindings, "en", "toronto", null)).toBe(true);
    expect(hasPageEntry(pageBindings, "en", "toronto", "about")).toBe(true);
    expect(hasPageEntry(pageBindings, "en", "toronto", "contact")).toBe(true);
    expect(hasPageEntry(pageBindings, "en", "vancouver", null)).toBe(true);
    expect(hasPageEntry(pageBindings, "en", "vancouver", "about")).toBe(true);
    expect(hasPageEntry(pageBindings, "en", "vancouver", "contact")).toBe(false);
    expect(hasPageEntry(pageBindings, "fr", "toronto", null)).toBe(true);
    expect(hasPageEntry(pageBindings, "fr", "toronto", "about")).toBe(true);
    expect(hasPageEntry(pageBindings, "fr", "toronto", "contact")).toBe(false);
    expect(hasPageEntry(pageBindings, "de", "berlin", null)).toBe(true);
    expect(hasPageEntry(pageBindings, "de", "berlin", "about")).toBe(true);
    expect(hasPageEntry(pageBindings, "en", "montreal", null)).toBe(false);
    expect(hasPageEntry(pageBindings, "ja", "toronto", null)).toBe(false);
    expect(hasPageEntry(pageBindings, "fr", "vancouver", null)).toBe(false);
    expect(hasPageEntry(pageBindings, "de", "toronto", null)).toBe(false);
  });
});
describe("Phase L - resolution is pure and region-isolated (custom fixture)", () => {
  function makeRegion(overrides: Partial<OperationalRegion> & { id: string }): OperationalRegion {
    return {
      timezone: "America/Toronto",
      address: { street: "1 Demo St", city: "Toronto", country: "Canada" },
      hours: {
        monday: [], tuesday: [], wednesday: [], thursday: [], friday: [],
        saturday: [], sunday: [], holidays: [],
      },
      ...overrides,
    };
  }

  it("resolves each region's own operational fields exactly", () => {
    const fixture = {
      toronto: makeRegion({
        id: "toronto",
        address: { street: "410 Queen St W", city: "Toronto", country: "Canada" },
        phone: "+1 416 555 0142",
        email: "toronto@example.com",
      }),
      vancouver: makeRegion({
        id: "vancouver",
        timezone: "America/Vancouver",
        address: { street: "22 Waterfront Way", city: "Vancouver", country: "Canada" },
        phone: "+1 604 555 0188",
        email: "vancouver@example.com",
      }),
    };

    const toronto = resolveRegion(fixture, "toronto")!;
    const vancouver = resolveRegion(fixture, "vancouver")!;

    expect(toronto.address.city).toBe("Toronto");
    expect(toronto.email).toBe("toronto@example.com");
    expect(toronto.timezone).toBe("America/Toronto");
    const torontoJson = JSON.stringify(toronto);
    expect(torontoJson).not.toContain("Vancouver");
    expect(torontoJson).not.toContain("Jakarta");
    const vancouverJson = JSON.stringify(vancouver);
    expect(vancouverJson).toContain("Vancouver");
    expect(vancouverJson).not.toContain("Toronto");
    expect(vancouverJson).not.toContain("Jakarta");
  });

  it("regionToLocation exposes only the maps-port fields (no timezone/hours leak)", () => {
    const region = makeRegion({
      id: "toronto",
      geo: { lat: 43.6473, lng: -79.3963 },
      phone: "+1 416 555 0142",
    });
    const location: BusinessLocation = regionToLocation(region);
    expect(location.geo).toEqual({ lat: 43.6473, lng: -79.3963 });
    expect(location.address.city).toBe("Toronto");
    expect(location.phone).toBe("+1 416 555 0142");
    expect((location as { timezone?: string }).timezone).toBeUndefined();
    expect((location as { hours?: unknown }).hours).toBeUndefined();
    expect((location as { email?: string }).email).toBeUndefined();
  });
});
describe("Phase L - configuration validation", () => {
  function makeRegion(overrides: Partial<OperationalRegion> & { id: string }): OperationalRegion {
    return {
      timezone: "America/Toronto",
      address: { street: "1 Demo St", city: "Toronto", country: "Canada" },
      hours: {
        monday: [], tuesday: [], wednesday: [], thursday: [], friday: [],
        saturday: [], sunday: [], holidays: [],
      },
      ...overrides,
    };
  }

  const regions = {
    toronto: makeRegion({ id: "toronto" }),
  };

  it("accepts a valid single-region configuration", () => {
    expect(() =>
      assertRegionsValid(
        regions,
        [
          { locale: "en", region: "toronto", slug: null },
          { locale: "en", region: "toronto", slug: "about" },
        ],
        ["en", "fr"],
      ),
    ).not.toThrow();
  });

  it("rejects a page binding that references an unknown region", () => {
    expect(() =>
      assertRegionsValid(regions, [{ locale: "en", region: "nope", slug: null }], ["en"]),
    ).toThrow(/unknown region/);
  });

  it("rejects a duplicate (locale, region, slug) page binding", () => {
    const pages: PageRegionBinding[] = [
      { locale: "en", region: "toronto", slug: null },
      { locale: "en", region: "toronto", slug: null },
    ];
    expect(() => assertRegionsValid(regions, pages, ["en"])).toThrow(/Duplicate page/);
  });

  it("rejects a page binding whose locale is not configured", () => {
    expect(() =>
      assertRegionsValid(regions, [{ locale: "zz", region: "toronto", slug: null }], ["en"]),
    ).toThrow(/not configured/);
  });

  it("rejects region pages without a landing entry for the (locale, region)", () => {
    expect(() =>
      assertRegionsValid(regions, [{ locale: "en", region: "toronto", slug: "about" }], ["en"]),
    ).toThrow(/landing/);
  });

  it("rejects a region id reserved for a static route", () => {
    expect(() =>
      assertRegionsValid(
        { about: makeRegion({ id: "about" }) },
        [{ locale: "en", region: "about", slug: null }],
        ["en"],
      ),
    ).toThrow(/reserved/);
  });

  it("rejects local-international regions without an international address", () => {
    const bad = {
      ...regions,
      toronto: makeRegion({ id: "toronto", addressMode: "local-international" }),
    };
    expect(() => assertRegionsValid(bad, [], ["en"])).toThrow(/addressInternational/);
  });

  it("rejects holidays with an invalid calendar date", () => {
    const bad = makeRegion({
      id: "toronto",
      hours: {
        monday: [], tuesday: [], wednesday: [], thursday: [], friday: [],
        saturday: [], sunday: [],
        holidays: [{ date: "2026-02-30", name: "Not real" }],
      },
    });
    expect(() => assertRegionsValid({ toronto: bad }, [], ["en"])).toThrow(/invalid date/);
  });

  it("rejects holidays with an empty name", () => {
    const bad = makeRegion({
      id: "toronto",
      hours: {
        monday: [], tuesday: [], wednesday: [], thursday: [], friday: [],
        saturday: [], sunday: [],
        holidays: [{ date: "2026-12-25", name: " " }],
      },
    });
    expect(() => assertRegionsValid({ toronto: bad }, [], ["en"])).toThrow(/empty name/);
  });

  it("isCalendarDate validates real dates including leap years", () => {
    expect(isCalendarDate("2026-12-25")).toBe(true);
    expect(isCalendarDate("2024-02-29")).toBe(true);
    expect(isCalendarDate("2026-02-29")).toBe(false);
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(isCalendarDate("2026-12-32")).toBe(false);
    expect(isCalendarDate("today")).toBe(false);
    expect(isCalendarDate("26-12-25")).toBe(false);
  });
});

describe("Phase L - schedule fixture sanity (type-level)", () => {
  it("TimeInterval and Address shapes are exported for adopters", () => {
    const interval: TimeInterval = { open: "09:00", close: "17:00" };
    const address: Address = { street: "x", city: "y" };
    const hours: RegionSchedule = {
      monday: [interval], tuesday: [], wednesday: [], thursday: [], friday: [],
      saturday: [], sunday: [],
      holidays: [{ date: "2026-12-25", name: "Christmas", closed: true }],
    };
    expect(hours.monday[0].open).toBe("09:00");
    expect(address.street).toBeTruthy();
  });
});