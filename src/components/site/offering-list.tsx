import type { OfferingsListItem } from "@/core/offerings";

import { OfferingCard } from "./offering-card";

interface OfferingListProps {
  readonly offerings: readonly OfferingsListItem[];
  /**
   * Locale-qualified listing base path (e.g. `/en/offerings`). The route shape
   * (`/offerings/[slug]`) is a routing contract supplied by the caller — this
   * component never builds locale/region paths itself.
   */
  readonly baseHref: string;
  /** Localized "Featured" badge label passed through to each card. */
  readonly featuredLabel?: string;
}

/**
 * Phase C — semantic offering listing: a `<ul>` of whole-card links in the
 * already-sorted order provided by the caller (`sortOfferings` at the page).
 * Presentation uses design tokens only.
 */
export function OfferingList({ offerings, baseHref, featuredLabel }: OfferingListProps) {
  return (
    <ul className="mt-8 grid gap-6 sm:grid-cols-2">
      {offerings.map((offering) => (
        <li key={offering.slug}>
          <OfferingCard
            offering={offering}
            href={`${baseHref}/${offering.slug}`}
            featuredLabel={featuredLabel}
          />
        </li>
      ))}
    </ul>
  );
}