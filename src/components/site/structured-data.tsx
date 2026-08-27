import { siteConfig } from "@/config";
import type { BusinessLocation } from "@/core/business";

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
  if (loc.address) {
    place.address = {
      "@type": "PostalAddress",
      streetAddress: loc.address.street,
      addressLocality: loc.address.city,
      addressRegion: loc.address.region,
      postalCode: loc.address.postalCode,
      addressCountry: loc.address.country,
    };
  }
  if (loc.geo) place.geo = toGeo(loc.geo.lat, loc.geo.lng);
  if (loc.phone) place.telephone = loc.phone;
  return place;
}

export function StructuredData() {
  const b = siteConfig.business;
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