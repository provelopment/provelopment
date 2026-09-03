import type { OfferingsContent } from "@/core/offerings";
import { parseDisplayPrice } from "@/core/offerings";

interface OfferingStructuredDataProps {
  readonly offering: OfferingsContent;
  /** Absolute canonical URL of this offering detail page. */
  readonly canonicalUrl: string;
  /** Resolved provider identity name (business/region) for `provider`. */
  readonly providerName: string;
  /** Resolved provider schema.org type (e.g. `Organization`, `LocalBusiness`). */
  readonly providerType: string;
}

/**
 * Phase S — `Service` JSON-LD for an offering detail page.
 *
 * Preserves the Phase C invariant: an Offering is descriptive visitor-facing
 * content, not an operational entity. `offers.price` is emitted ONLY when the
 * display `price` string parses as a bare number via `parseDisplayPrice`;
 * `priceCurrency` is NEVER emitted because currency is not modeled. When the
 * price is absent or unparseable, `offers` is omitted entirely — no guessing.
 */
export function OfferingStructuredData({
  offering,
  canonicalUrl,
  providerName,
  providerType,
}: OfferingStructuredDataProps) {
  const price = parseDisplayPrice(offering.price);

  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": canonicalUrl,
    name: offering.title,
    description: offering.blurb,
    url: canonicalUrl,
    provider: {
      "@type": providerType,
      name: providerName,
    },
  };

  if (price !== null) {
    node.offers = { "@type": "Offer", price };
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }}
    />
  );
}