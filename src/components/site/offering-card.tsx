import Image from "next/image";
import Link from "next/link";

import type { OfferingsListItem } from "@/core/offerings";

interface OfferingCardProps {
  readonly offering: OfferingsListItem;
  /** Destination of the whole-card link (e.g. `/{locale}/offerings/{slug}`). */
  readonly href: string;
  /** Localized "Featured" badge label; rendered only when the offering is featured. */
  readonly featuredLabel?: string;
}

/**
 * Phase C — a single offering card in the listing.
 *
 * A WHOLE-CARD link: title, blurb, price and image all live inside one `<a>`
 * (no nested interactive content — the call-to-action belongs on the detail
 * page). The accessible name comes from the link's own text. Presentation uses
 * design tokens only (`border-border`, `bg-accent`, `text-primary`, …); the
 * visual system is refined in Phase D.
 */
export function OfferingCard({ offering, href, featuredLabel }: OfferingCardProps) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary"
    >
      {offering.image ? (
        <div className="relative mb-4 h-40 w-full overflow-hidden rounded">
          <Image
            src={offering.image}
            alt={offering.title}
            fill
            sizes="(max-width: 640px) 100vw, 320px"
            className="object-cover"
          />
        </div>
      ) : null}
      <h2 className="text-xl font-semibold">{offering.title}</h2>
      {offering.featured && featuredLabel ? (
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-primary">
          {featuredLabel}
        </p>
      ) : null}
      <p className="mt-2 text-muted-foreground">{offering.blurb}</p>
      {offering.price ? (
        <p className="mt-3 text-sm font-medium text-foreground">{offering.price}</p>
      ) : null}
    </Link>
  );
}