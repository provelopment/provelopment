import { siteConfig } from "@/config";
import type { BusinessLocation, Weekday } from "@/core/business";
import { resolveBusinessForLocale } from "@/core/business";

/** schema.org weekday name for each supported internal weekday label. */
const SCHEMA_WEEKDAYS: Record<Weekday, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/**
 * Renders a minimal, config-driven Organization/LocalBusiness JSON-LD script.
 *
 * Deliberately minimal (Phase A): emits the singular schema.org type selected
 * via `business.type` (falling back to `Organization`), the business identity,
 * general contact channels, and one Location per configured location. The
 * broader structured-data subsystem is a separate future feature.
 */
function toGeo(lat: number, lng: number) {
  return { "@type": "GeoCoordinates" as const, latitude: lat, longitude: lng };
}

function toPlace(loc: BusinessLocation) {
  const place: Record<string, unknown> = {
    "@type": "Place",
    name: loc.name ?? siteConfig.name,
  };
  // JSON-LD uses the Latin/international representation when supplied (global
  // machine readability), falling back to the native/local address. It consumes
  // resolved business data only — no locale/address logic lives here.
  const address = loc.addressInternational ?? loc.address;
  if (loc.address) {
    place.address = {
      "@type": "PostalAddress",
      streetAddress: address.street,
      addressLocality: address.city,
      addressRegion: address.region,
      postalCode: address.postalCode,
      addressCountry: address.country,
    };
  }
  if (loc.geo) place.geo = toGeo(loc.geo.lat, loc.geo.lng);
  if (loc.phone) place.telephone = loc.phone;
  if (loc.hours && loc.hours.intervals.length > 0) {
    place.openingHoursSpecification = loc.hours.intervals.map((interval) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: interval.days.map((day) => SCHEMA_WEEKDAYS[day]),
      opens: interval.open,
      closes: interval.close,
    }));
  }
  return place;
}

export function StructuredData({ locale }: { readonly locale: string }) {
  const b = resolveBusinessForLocale(siteConfig.business, locale);
  if (!b.locations.length && !b.contact.email && !b.contact.phone) return null;

  const type = b.type ?? "Organization";
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": type,
    name: b.name ?? siteConfig.name,
  };
  if (b.description) node.description = b.description;
  if (b.contact.email) node.email = b.contact.email;
  if (b.contact.phone) node.telephone = b.contact.phone;
  if (b.locations.length) {
    node.location = b.locations.map(toPlace);
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }}
    />
  );
}