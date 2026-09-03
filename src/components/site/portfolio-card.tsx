import Image from "next/image";
import Link from "next/link";

import type { PortfolioItem } from "@/core/portfolio";

interface PortfolioCardProps {
  readonly item: PortfolioItem;
  /** Destination of the whole-card link (e.g. `/{locale}/portfolio/{slug}`). */
  readonly href: string;
  /** Localized "Featured" badge label; rendered only when the item is featured. */
  readonly featuredLabel?: string;
}

/**
 * Phase T — a single portfolio card in the listing. Whole-card link (offerings
 * precedent); presentation uses design tokens only.
 */
export function PortfolioCard({ item, href, featuredLabel }: PortfolioCardProps) {
  return (
    <Link
      href={href}
      className="block h-full rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary"
    >
      {item.image ? (
        <div className="relative mb-4 h-40 w-full overflow-hidden rounded">
          <Image
            src={item.image}
            alt={item.title}
            fill
            sizes="(max-width: 640px) 100vw, 320px"
            className="object-cover"
          />
        </div>
      ) : null}
      <h2 className="text-xl font-semibold">
        {item.title}
        {item.year ? <span className="text-muted-foreground"> · {item.year}</span> : null}
      </h2>
      {item.featured && featuredLabel ? (
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-primary">
          {featuredLabel}
        </p>
      ) : null}
      <p className="mt-2 text-muted-foreground">{item.summary}</p>
    </Link>
  );
}