import { Grid } from "@/components/ui/grid";
import type { PortfolioItem } from "@/core/portfolio";
import { PortfolioCard } from "./portfolio-card";

interface PortfolioListProps {
  readonly items: readonly PortfolioItem[];
  readonly baseHref: string;
  /** Localized empty-state text. */
  readonly emptyLabel: string;
  readonly featuredLabel: string;
}

/**
 * Phase T — the portfolio listing grid (accessible `<ul>`, zero client JS).
 */
export function PortfolioList({
  items,
  baseHref,
  emptyLabel,
  featuredLabel,
}: PortfolioListProps) {
  if (items.length === 0) {
    return <p className="text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <Grid columns="sm:grid-cols-2">
      {items.map((item) => (
        <li key={item.slug} className="flex">
          <PortfolioCard
            item={item}
            href={`${baseHref}/${item.slug}`}
            featuredLabel={featuredLabel}
          />
        </li>
      ))}
    </Grid>
  );
}