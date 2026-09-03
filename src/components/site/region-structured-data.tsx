import type { DayOfWeek, OperationalRegion } from "@/core/region";
import { DAYS_OF_WEEK } from "@/core/region";
import { siteConfig } from "@/config";

/** schema.org weekday name for each region weekday key. */
const SCHEMA_WEEKDAYS: Record<DayOfWeek, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

interface RegionStructuredDataProps {
  readonly region: OperationalRegion;
  /**
   * Absolute canonical URL of the regional page rendering this region (the
   * page is the region's identity on the web).
   */
  readonly canonicalUrl: string;
}

/**
 * Renders the JSON-LD operational identity for ONE resolved region (Phase K).
 *
 * A regional page describes exactly its region — never all regions, and never
 * the legacy global business. Non-regional pages render no structured
 * operational data at all (they must not invent an identity).
 *
 * Phase S enrichment (additive only): `@id` + `url` set to the regional page's
 * canonical URL, and `sameAs` from the configured social links (never
 * invented).
 */
export function RegionStructuredData({
  region,
  canonicalUrl,
}: RegionStructuredDataProps) {
  const place: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": canonicalUrl,
    name: region.name ?? region.id,
    url: canonicalUrl,
  };

  if (siteConfig.socialLinks.length > 0) {
    place.sameAs = siteConfig.socialLinks.map((link) => link.href);
  }

  // JSON-LD prefers the Latin/international representation when supplied, else
  // the native/local address (same convention as the legacy location block).
  const address = region.addressInternational ?? region.address;
  place.address = {
    "@type": "PostalAddress",
    streetAddress: address.street,
    addressLocality: address.city,
    addressRegion: address.region,
    postalCode: address.postalCode,
    addressCountry: address.country,
  };

  if (region.geo) {
    place.geo = {
      "@type": "GeoCoordinates",
      latitude: region.geo.lat,
      longitude: region.geo.lng,
    };
  }
  if (region.phone) place.telephone = region.phone;
  if (region.email) place.email = region.email;

  // Weekly schedule only (schema.org has no first-class holiday field): one
  // OpeningHoursSpecification per (day, interval). Empty days are simply absent.
  const specifications: Record<string, unknown>[] = [];
  for (const day of DAYS_OF_WEEK) {
    for (const interval of region.hours[day]) {
      specifications.push({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: SCHEMA_WEEKDAYS[day],
        opens: interval.open,
        closes: interval.close,
      });
    }
  }
  if (specifications.length > 0) {
    place.openingHoursSpecification = specifications;
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(place) }}
    />
  );
}