/**
 * Portfolio / case-studies content model (Phase T, Tier 1).
 *
 * Framework-free and i18n-free. A portfolio item is a visual project showcase:
 * frontmatter summary + descriptive metadata (`year`, `tags`, `featured`,
 * `order`, optional `image`), Markdown body = the case-study content rendered
 * by the existing `MarkdownContent` (trust boundary preserved). The canonical
 * set is the default-locale slugs (offerings-style canonical enforcement).
 * `featured`/`tags`/`year`/`order` are presentation/descriptive metadata only.
 */

import type { PageContent } from "./page-content";

export interface PortfolioItem extends PageContent {
  /** Short card description shown on the listing. */
  readonly summary: string;
  readonly year?: number;
  /** Display-only tags (no tag-index routes). */
  readonly tags?: readonly string[];
  /** Presentation metadata only (badge on the card). */
  readonly featured?: boolean;
  /** Listing sort key (ascending); omitted entries sort last (then by slug). */
  readonly order?: number;
  /** Site-root-relative asset path under `public/`, e.g. `/images/portfolio/x.jpg`. */
  readonly image?: string;
}

export interface SortablePortfolioItem {
  readonly slug: string;
  readonly order?: number;
}

/** Deterministic listing order: `order` ascending, then slug ascending. */
export function comparePortfolioItems(a: SortablePortfolioItem, b: SortablePortfolioItem): number {
  const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
  const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  return a.slug.localeCompare(b.slug);
}

export function sortPortfolio<T extends SortablePortfolioItem>(items: readonly T[]): T[] {
  return [...items].sort(comparePortfolioItems);
}

export function isCanonicalPortfolioItem(slug: string, canonicalSlugs: readonly string[]): boolean {
  return canonicalSlugs.includes(slug);
}