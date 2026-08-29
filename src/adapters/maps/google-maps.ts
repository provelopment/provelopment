import type { BusinessLocation } from "@/core/business";
import type { DirectionLinkResolver, DirectionsAction } from "@/application/direction-link";

export const GOOGLE_MAPS_PROVIDER = "google";

/**
 * Google Maps direction deep link from a lat/lng. Deliberately keyless: a
 * public coordinate is safe to place in a URL and needs no Google credential.
 */
export function googleMapsGeoUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** Google Maps search deep link from a free-text address query. */
export function googleMapsAddressQueryUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** The provider's own address-query derivation (its responsibility, not core's). */
function googleAddressQuery(location: BusinessLocation): string {
  // When geo is absent, prefer the Latin/international representation for a
  // search query (better cross-format resolution), falling back to the
  // native/local address. The adapter consumes the already-resolved location.
  const address = location.addressInternational ?? location.address;
  return [
    address.street,
    address.city,
    address.region,
    address.postalCode,
    address.country,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Google Maps directions adapter.
 *
 * Google is ONE interchangeable provider of the `DirectionLinkResolver` port —
 * not the Foundation's maps architecture. behaviour:
 *   - geo present  -> coordinate deep link
 *   - no geo       -> address search deep link
 *   - neither      -> no action (never a broken link)
 */
export function createGoogleMapsDirectionLinkResolver(): DirectionLinkResolver {
  return {
    resolve(location: BusinessLocation): DirectionsAction {
      if (location.geo) {
        return {
          kind: "link",
          provider: GOOGLE_MAPS_PROVIDER,
          href: googleMapsGeoUrl(location.geo.lat, location.geo.lng),
        };
      }

      const query = googleAddressQuery(location);
      if (!query) return { kind: "none" };

      return {
        kind: "link",
        provider: GOOGLE_MAPS_PROVIDER,
        href: googleMapsAddressQueryUrl(query),
      };
    },
  };
}
