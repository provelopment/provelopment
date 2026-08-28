import type { PageContent } from "./page-content";

/**
 * Offerings content model (Phase C, Tier 1).
 *
 * A deliberately type-agnostic "offering": services, products, packages,
 * programs, consultations, etc. are all represented the same way — no `kind`
 * field, no commerce semantics. `price` is a display-only string; `image` is an
 * optional site-root-relative asset path under `public/`.
 *
 * `content/offerings/` is the canon for which offerings exist (the canonical
 * set is the default-locale slugs); `features.offerings` and `navigation[]` are
 * separate concerns (capability/exposure and discoverability respectively).
 */
export interface OfferingsContent extends PageContent {
  /** Required short description used in the listing card and meta description. */
  readonly blurb: string;
  /** Display-only string (e.g. "From $40"). No currency/financial semantics. */
  readonly price?: string;
  /** Listing sort key (ascending). Omitted entries sort last (then by slug). */
  readonly order?: number;
  /** When true the card is shown first in the listing (before any order sort). */
  readonly featured?: boolean;
  /** Site-root-relative path under `public/`, e.g. `/images/offerings/x.jpg`. */
  readonly image?: string;
}

export interface OfferingsListItem {
  readonly slug: string;
  readonly title: string;
  readonly blurb: string;
  readonly price?: string;
  /** Listing sort key (ascending). Omitted entries sort last (then by slug). */
  readonly order?: number;
  readonly featured?: boolean;
  readonly image?: string;
}

/**
 * Minimal shape `sortOfferings` operates on (any object carrying the sort
 * keys). Optionality is preserved so `OfferingsContent` satisfies it directly.
 */
export interface SortableOffering {
  readonly slug: string;
  readonly order?: number;
  readonly featured?: boolean;
}

/**
 * Listing sort: featured first, then `order` ascending (missing last), then
 * slug ascending as a stable tiebreak. Pure and deterministic.
 */
export function sortOfferings<T extends SortableOffering>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const featuredA = a.featured ? 1 : 0;
    const featuredB = b.featured ? 1 : 0;
    if (featuredA !== featuredB) return featuredB - featuredA;

    const orderA = a.order ?? Number.POSITIVE_INFINITY;
    const orderB = b.order ?? Number.POSITIVE_INFINITY;
    if (orderA !== orderB) return orderA - orderB;

    return a.slug.localeCompare(b.slug);
  });
}

/**
 * An offering slug is canonical only when it exists in the default locale.
 * This prevents the ambiguous case of an offering that exists solely in a
 * non-default locale silently falling back to English under a different slug.
 */
export function isCanonicalOffering(slug: string, canonicalSlugs: readonly string[]): boolean {
  return canonicalSlugs.includes(slug);
}