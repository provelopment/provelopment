import { describe, expect, it } from "vitest";

import type { Business, BusinessContact, BusinessLocation } from "@/core/business";
import {
  assertValidAddressPresentation,
  formatAddress,
  resolveBusinessContactForLocale,
  resolveLocationForLocale,
} from "@/core/business";

const contact: BusinessContact = {
  email: "global@example.com",
  phone: "+1 555 000 0000",
  locales: {
    de: { phone: "+49 30 0000 0000" },
    fr: { email: "bonjour@example.fr", phone: "+33 1 0000 0000" },
  },
};

function location(overrides: Partial<BusinessLocation> = {}): BusinessLocation {
  return {
    id: "main",
    name: "HQ",
    address: { street: "1 Global St", city: "Metropolis", country: "Exampleland" },
    ...overrides,
  };
}

function businessWith(overrides: Partial<Business> = {}): Business {
  return { contact, locations: [location()], ...overrides };
}

describe("resolveBusinessContactForLocale (Phase I)", () => {
  it("returns the global contact unchanged when there are no per-locale overrides", () => {
    expect(resolveBusinessContactForLocale({ email: "a@example.com" }, "de")).toEqual({
      email: "a@example.com",
    });
  });

  it("uses the global values when the locale has no override entry", () => {
    const resolved = resolveBusinessContactForLocale(contact, "es");
    expect(resolved.email).toBe("global@example.com");
    expect(resolved.phone).toBe("+1 555 000 0000");
  });

  it("applies a locale-specific phone over the global phone (per-field fallback)", () => {
    const resolved = resolveBusinessContactForLocale(contact, "de");
    expect(resolved.phone).toBe("+49 30 0000 0000");
    expect(resolved.email).toBe("global@example.com"); // not overridden → global
  });

  it("applies locale-specific email and phone independently", () => {
    const resolved = resolveBusinessContactForLocale(contact, "fr");
    expect(resolved.email).toBe("bonjour@example.fr");
    expect(resolved.phone).toBe("+33 1 0000 0000");
  });

  it("supports a locale providing only email, keeping the global phone", () => {
    const resolved = resolveBusinessContactForLocale(
      { ...contact, locales: { de: { email: "de@example.de" } } },
      "de",
    );
    expect(resolved.email).toBe("de@example.de");
    expect(resolved.phone).toBe("+1 555 000 0000"); // inherited from global
  });
});

describe("resolveLocationForLocale address model (Phase I)", () => {
  const dual = location({
    address: { street: "1 Native St", city: "Tokyo", country: "Japan" },
    addressInternational: { street: "1 Latin St", city: "Tokyo", country: "Japan" },
  });

  it("defaults the presentation mode to local when no mode is overridden", () => {
    // When a locale override exists but sets no mode, resolution defaults to "local".
    const withOverride = location({ locales: { de: { phone: "+49 30 0000 0000" } } });
    expect(resolveLocationForLocale(withOverride, "de").addressMode).toBe("local");
  });

  it("keeps base native + optional international when no override exists", () => {
    const resolved = resolveLocationForLocale(dual, "de");
    expect(resolved).toBe(dual); // unchanged reference (no override)
    expect(resolved.address).toEqual(dual.address);
    expect(resolved.addressInternational).toEqual(dual.addressInternational);
    // No override → mode is undefined, which consumers treat as "local".
    expect(resolved.addressMode).toBeUndefined();
  });

  it("locale address override wins per-field over the base address", () => {
    const resolved = resolveLocationForLocale(
      location({ locales: { de: { address: { city: "Berlin" } } } }),
      "de",
    );
    expect(resolved.address.street).toBe("1 Global St"); // inherited
    expect(resolved.address.city).toBe("Berlin"); // overridden
  });

  it("locale international override wins over the base international address", () => {
    const base = location({
      addressInternational: { street: "Base Latin St", city: "Metropolis" },
      locales: { de: { addressInternational: { street: "Deutsch Latin St" } } },
    });
    const resolved = resolveLocationForLocale(base, "de");
    expect(resolved.addressInternational?.street).toBe("Deutsch Latin St");
    expect(resolved.addressInternational?.city).toBe("Metropolis"); // inherited
  });

  it("locale mode overrides the base mode", () => {
    const base = location({
      addressMode: "local",
      addressInternational: { street: "Latin St", city: "Metropolis" },
      locales: { de: { addressMode: "local-international" } },
    });
    const resolved = resolveLocationForLocale(base, "de");
    expect(resolved.addressMode).toBe("local-international");
    expect(resolved.addressInternational).toEqual({ street: "Latin St", city: "Metropolis" });
  });

  it("locale can supply its own international address when the base has none", () => {
    const base = location({
      locales: { ja: { addressInternational: { street: "4-2-8 Shibakoen", city: "Minato" } } },
    });
    const resolved = resolveLocationForLocale(base, "ja");
    expect(resolved.addressInternational).toEqual({ street: "4-2-8 Shibakoen", city: "Minato" });
  });
});

describe("formatAddress", () => {
  it("joins present fields into a single line", () => {
    expect(
      formatAddress({ street: "1 Main St", city: "Berlin", postalCode: "10115", country: "Germany" }),
    ).toBe("1 Main St, Berlin, 10115, Germany");
  });

  it("omits empty or undefined fields", () => {
    expect(formatAddress({ street: "1 Main St", city: "Berlin" })).toBe("1 Main St, Berlin");
  });
});

describe("assertValidAddressPresentation (Phase I)", () => {
  it("accepts local-only locations without an international address", () => {
    const business = businessWith({ locations: [location({ addressMode: "local" })] });
    expect(() => assertValidAddressPresentation(business, ["de", "fr"])).not.toThrow();
  });

  it("accepts local-international when an international address is present", () => {
    const business = businessWith({
      locations: [
        location({
          addressMode: "local-international",
          addressInternational: { street: "Latin St", city: "Metropolis" },
        }),
      ],
    });
    expect(() => assertValidAddressPresentation(business, ["de"])).not.toThrow();
  });

  it("throws when a location requests local-international without an international address", () => {
    const business = businessWith({ locations: [location({ addressMode: "local-international" })] });
    expect(() => assertValidAddressPresentation(business, ["de"])).toThrow(/local-international/);
    expect(() => assertValidAddressPresentation(business, ["de"])).toThrow(/addressInternational/);
  });

  it("throws when a locale override requests local-international with no international address anywhere", () => {
    const business = businessWith({
      locations: [location({ locales: { ja: { addressMode: "local-international" } } })],
    });
    expect(() => assertValidAddressPresentation(business, ["ja"])).toThrow(/locale "ja"/);
  });

  it("does not require an international address for Latin-script locales in local mode", () => {
    const business = businessWith({
      locations: [
        location({
          address: { street: "1 Rue de Test", city: "Paris", country: "France" },
          locales: { fr: { address: { city: "Paris" } } },
        }),
      ],
    });
    expect(() => assertValidAddressPresentation(business, ["fr"])).not.toThrow();
  });

  it("passes a valid local-international locale override that inherits a base international address", () => {
    const business = businessWith({
      locations: [
        location({
          addressInternational: { street: "Latin St", city: "Metropolis" },
          locales: { ja: { addressMode: "local-international" } },
        }),
      ],
    });
    expect(() => assertValidAddressPresentation(business, ["ja"])).not.toThrow();
  });
});
