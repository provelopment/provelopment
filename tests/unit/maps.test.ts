import { describe, expect, it } from "vitest";

import {
  createDirectionLinkResolver,
  createGoogleMapsDirectionLinkResolver,
  GOOGLE_MAPS_PROVIDER,
} from "@/adapters/maps";
import { googleMapsAddressQueryUrl, googleMapsGeoUrl } from "@/adapters/maps/google-maps";
import { resolveLocationForLocale, type BusinessLocation } from "@/core/business";

function location(overrides: Partial<BusinessLocation> = {}): BusinessLocation {
  return {
    id: "main",
    name: "HQ",
    address: { street: "1 Main Street", city: "Metropolis", country: "Exampleland" },
    ...overrides,
  };
}

describe("google maps adapter", () => {
  it("builds a coordinate deep link when geo is present", () => {
    const resolver = createGoogleMapsDirectionLinkResolver();
    const action = resolver.resolve(location({ geo: { lat: 12.34, lng: 56.78 } }));

    expect(action).toEqual({
      kind: "link",
      provider: GOOGLE_MAPS_PROVIDER,
      href: googleMapsGeoUrl(12.34, 56.78),
    });
    expect(action.kind === "link" && action.href).toContain("google.com/maps?q=12.34,56.78");
  });

  it("falls back to an address search deep link when geo is absent", () => {
    const resolver = createGoogleMapsDirectionLinkResolver();
    const action = resolver.resolve(
      location({ geo: undefined, address: { street: "2 Rue de Test", city: "Paris", country: "France" } }),
    );

    expect(action.kind).toBe("link");
    expect(action.kind === "link" && action.href).toContain("google.com/maps/search/");
    expect(action.kind === "link" && action.href).toContain(encodeURIComponent("2 Rue de Test, Paris, France"));
    expect(action.kind === "link" && action.href).toBe(
      googleMapsAddressQueryUrl("2 Rue de Test, Paris, France"),
    );
  });

  it("returns no action when neither geo nor an address query exists (never a broken link)", () => {
    const resolver = createGoogleMapsDirectionLinkResolver();
    const action = resolver.resolve(location({ geo: undefined, address: { street: "", city: "" } }));

    expect(action).toEqual({ kind: "none" });
  });

  it("prefers the international address for the fallback query when geo is absent", () => {
    const resolver = createGoogleMapsDirectionLinkResolver();
    const action = resolver.resolve(
      location({
        geo: undefined,
        address: { street: "1 Rue de Test", city: "Paris", country: "France" },
        addressInternational: { street: "1 Test Street", city: "Paris", country: "France" },
      }),
    );

    expect(action.kind).toBe("link");
    expect(action.kind === "link" && action.href).toContain(
      encodeURIComponent("1 Test Street, Paris, France"),
    );
  });
});

describe("createDirectionLinkResolver (factory)", () => {
  it("selects the google adapter for provider google", () => {
    const resolver = createDirectionLinkResolver({ provider: "google" });
    const action = resolver.resolve(location({ geo: { lat: 1, lng: 2 } }));
    expect(action.kind).toBe("link");
    expect(action.kind === "link" && action.provider).toBe(GOOGLE_MAPS_PROVIDER);
  });

  it("selects the none adapter for provider none", () => {
    const resolver = createDirectionLinkResolver({ provider: "none" });
    expect(resolver.resolve(location({ geo: { lat: 1, lng: 2 } }))).toEqual({ kind: "none" });
  });

  it("treats an absent features.maps as intentionally disabled (none)", () => {
    const resolver = createDirectionLinkResolver(undefined);
    expect(resolver.resolve(location())).toEqual({ kind: "none" });
  });
});

describe("locale integration (Phase G)", () => {
  it("resolves the localized location BEFORE the adapter, so directions follow the locale", () => {
    const localized = location({
      address: { street: "1 Demo Street", city: "Jakarta", country: "Indonesia" },
      geo: { lat: -6.2, lng: 106.8 },
      locales: {
        de: {
          address: { street: "Pariser Platz", city: "Berlin", country: "Germany" },
          geo: { lat: 52.5163, lng: 13.3777 },
        },
      },
    });

    const resolved = resolveLocationForLocale(localized, "de");
    const resolver = createGoogleMapsDirectionLinkResolver();
    const action = resolver.resolve(resolved);

    // The directions link points at the German location's coordinates, not the
    // global Jakarta ones — proving map links follow locale resolution.
    expect(resolved.geo).toEqual({ lat: 52.5163, lng: 13.3777 });
    expect(action.kind === "link" && action.href).toContain("google.com/maps?q=52.5163,13.3777");
    expect(action.kind === "link" && action.href).not.toContain("106.8");
  });
});