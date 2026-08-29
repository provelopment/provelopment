import { describe, expect, it } from "vitest";

import type { Business, BusinessLocation } from "@/core/business";
import {
  resolveBusinessForLocale,
  resolveLocationForLocale,
} from "@/core/business";
import { parseSiteConfig } from "@/config/loader";

const globalLocation: BusinessLocation = {
  id: "main",
  name: "Demo HQ",
  address: {
    street: "1 Demo Street",
    city: "Jakarta",
    region: "DKI Jakarta",
    postalCode: "10110",
    country: "Indonesia",
  },
  phone: "+62 21 0000 0000",
  geo: { lat: -6.2, lng: 106.816 },
  timezone: "Asia/Jakarta",
  hours: {
    intervals: [{ days: ["mon"], open: "09:00", close: "17:00" }],
    exceptional: [],
  },
};

function buildBusiness(locations: readonly BusinessLocation[]): Business {
  return { contact: {}, locations };
}

describe("resolveLocationForLocale", () => {
  it("returns the location unchanged when no locales override exists (global fallback)", () => {
    const noOverrides: BusinessLocation = { ...globalLocation, locales: undefined };

    const resolved = resolveLocationForLocale(noOverrides, "de");

    expect(resolved).toBe(noOverrides); // same reference: existing behavior preserved
    expect(resolved.address).toEqual(globalLocation.address);
  });

  it("returns the location unchanged when the requested locale has no entry", () => {
    const location: BusinessLocation = {
      ...globalLocation,
      locales: { de: { address: { city: "Example City" } } },
    };

    const resolved = resolveLocationForLocale(location, "ja");

    expect(resolved).toBe(location); // fallback: no override for ja
    expect(resolved.address).toEqual(globalLocation.address);
  });

  it("applies a full locale override while another locale keeps the global data", () => {
    const location: BusinessLocation = {
      ...globalLocation,
      locales: {
        de: {
          address: {
            street: "1 Musterstraße",
            city: "Berlin",
            region: "Berlin",
            postalCode: "10115",
            country: "Germany",
          },
          phone: "+49 30 0000 0000",
          geo: { lat: 52.52, lng: 13.405 },
        },
      },
    };

    const de = resolveLocationForLocale(location, "de");
    expect(de.address).toEqual({
      street: "1 Musterstraße",
      city: "Berlin",
      region: "Berlin",
      postalCode: "10115",
      country: "Germany",
    });
    expect(de.phone).toBe("+49 30 0000 0000");
    expect(de.geo).toEqual({ lat: 52.52, lng: 13.405 });

    const ja = resolveLocationForLocale(location, "ja");
    expect(ja.address).toEqual(globalLocation.address);
    expect(ja.phone).toBe(globalLocation.phone);
    expect(ja.geo).toEqual(globalLocation.geo);
  });

  it("merges a partial address override field-by-field without discarding global fields", () => {
    const location: BusinessLocation = {
      ...globalLocation,
      locales: { de: { address: { city: "Example City" } } },
    };

    const resolved = resolveLocationForLocale(location, "de");

    expect(resolved.address).toEqual({
      street: "1 Demo Street", // inherited
      city: "Example City", // overridden
      region: "DKI Jakarta", // inherited
      postalCode: "10110", // inherited
      country: "Indonesia", // inherited
    });
  });

  it("does not throw and falls back for a missing locale override", () => {
    const location: BusinessLocation = {
      ...globalLocation,
      locales: { ja: { address: { city: "Tokyo" }, phone: "+81 3 0000 0000" } },
    };

    expect(() => resolveLocationForLocale(location, "fr")).not.toThrow();
    expect(resolveLocationForLocale(location, "fr").address).toEqual(globalLocation.address);
  });

  it("replaces phone and geo only when configured, inheriting otherwise", () => {
    const location: BusinessLocation = {
      ...globalLocation,
      locales: {
        jp: { address: { city: "Osaka" }, geo: { lat: 34.69, lng: 135.5 } },
      },
    };

    const resolved = resolveLocationForLocale(location, "jp");

    expect(resolved.geo).toEqual({ lat: 34.69, lng: 135.5 }); // overridden
    expect(resolved.phone).toBe(globalLocation.phone); // inherited
  });

  it("preserves id, name, timezone and hours unchanged through locale resolution", () => {
    const location: BusinessLocation = {
      ...globalLocation,
      locales: {
        de: {
          address: { city: "Berlin" },
          phone: "+49 30 0000 0000",
          geo: { lat: 52.52, lng: 13.405 },
        },
      },
    };

    const resolved = resolveLocationForLocale(location, "de");

    expect(resolved.id).toBe("main");
    expect(resolved.name).toBe("Demo HQ");
    expect(resolved.timezone).toBe("Asia/Jakarta");
    expect(resolved.hours).toEqual(globalLocation.hours);
  });
});

describe("resolveBusinessForLocale", () => {
  it("resolves every location consistently for the locale", () => {
    const other: BusinessLocation = {
      ...globalLocation,
      id: "branch",
      address: { street: "2 Demo Street", city: "Yogyakarta", country: "Indonesia" },
      locales: { de: { address: { city: "Hamburg" } } },
    };

    const business = buildBusiness([globalLocation, other]);
    const resolved = resolveBusinessForLocale(business, "de");

    expect(resolved.locations).toHaveLength(2);
    // location without an override stays global
    expect(resolved.locations[0]).toEqual(globalLocation);
    // location with an override for "de" is resolved
    expect(resolved.locations[1].address.city).toBe("Hamburg");
    expect(resolved.locations[1].address.street).toBe("2 Demo Street"); // inherited
    // business identity unchanged
    expect(resolved.contact).toEqual(business.contact);
  });

  it("returns a business with unchanged locations when nothing is overridden", () => {
    const business = buildBusiness([globalLocation]);
    const resolved = resolveBusinessForLocale(business, "ja");

    expect(resolved.locations[0]).toBe(globalLocation);
    expect(resolved.contact).toEqual(business.contact);
  });
});

describe("end-to-end: config → loader → resolver (adding a locale needs no src change)", () => {
  it("resolves two novel, fictional locale codes through the real schema+loader without source edits", () => {
    // Two hypothetical/adopter locale codes ("xx", "zz") — intentionally NOT
    // among the shipped 8 — exercised through the actual config schema, loader,
    // and resolver. This proves the capability is purely config/data-driven:
    // an adopter (or a 9th locale) needs no `src/` platform change.
    const config = parseSiteConfig({
      site: {
        url: "https://example.com",
        name: "Example",
        tagline: "t",
        description: "d",
      },
      i18n: {
        defaultLocale: "en",
        locales: [{ code: "en", label: "English" }],
      },
      contact: {},
      socialLinks: [],
      navigation: [{ label: "Home", href: "/" }],
      business: {
        locations: [
          {
            id: "main",
            address: { street: "1 Demo Street", city: "Jakarta", country: "Indonesia" },
            phone: "+62 21 0000 0000",
            locales: {
              xx: { address: { city: "Fictional City X" }, phone: "+00 1 000" },
              zz: { address: { city: "Fictional City Z" } },
            },
          },
        ],
      },
    });

    const resolvedX = resolveBusinessForLocale(config.business, "xx");
    expect(resolvedX.locations[0].address.city).toBe("Fictional City X");
    expect(resolvedX.locations[0].address.street).toBe("1 Demo Street"); // inherited
    expect(resolvedX.locations[0].phone).toBe("+00 1 000");

    const resolvedZ = resolveBusinessForLocale(config.business, "zz");
    expect(resolvedZ.locations[0].address.city).toBe("Fictional City Z");
    expect(resolvedZ.locations[0].phone).toBe("+62 21 0000 0000"); // inherited

    // No override for "en" etc. → global fallback unchanged.
    const resolvedEn = resolveBusinessForLocale(config.business, "en");
    expect(resolvedEn.locations[0].address.city).toBe("Jakarta");
  });
});
