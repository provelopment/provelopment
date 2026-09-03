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
 *
 * Phase S enrichment (additive only — the emitted shape below is preserved):
 *   - `@id` + `url` for the organization;
 *   - optional `logo` (from `site.logo`);
 *   - `sameAs` from the configured `socialLinks` (never invented);
 *   - a `ContactPoint` from the resolved business contact channels;
 *   - a stable fragment-based `@id` on every Place location.
 */
function toGeo(lat: number, lng: number) {
  return { "@type": "GeoCoordinates" as const, latitude: lat, longitude: lng };
}

function toPlace(loc: BusinessLocation) {
  const place: Record<string, unknown> = {
    "@type": "Place",
    // Stable fragment identifier — locations have no standalone route, so we
    // never invent a page URL for them.
    ...(loc.id ? { "@id": `${siteConfig.url}/#location-${loc.id}` } : {}),
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
    "@id": siteConfig.url,
    name: b.name ?? siteConfig.name,
    url: siteConfig.url,
  };
  if (b.description) node.description = b.description;
  if (siteConfig.logo) node.logo = { "@type": "ImageObject", url: siteConfig.logo };
  if (siteConfig.socialLinks.length > 0) {
    node.sameAs = siteConfig.socialLinks.map((link) => link.href);
  }
  if (b.contact.email || b.contact.phone) {
    node.contactPoint = {
      "@type": "ContactPoint",
      contactType: "customer service",
      ...(b.contact.email ? { email: b.contact.email } : {}),
      ...(b.contact.phone ? { telephone: b.contact.phone } : {}),
    };
  }
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