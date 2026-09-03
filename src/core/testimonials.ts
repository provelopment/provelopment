/**
 * Testimonials content model (Phase T, Tier 1).
 *
 * Framework-free and i18n-free. A testimonial is a structured customer quote:
 * `quote` in frontmatter is the canonical quote source (the Markdown body is
 * unused); `rating` is OPTIONAL and, when present, must be an integer 1–5.
 * Sorting is deterministic: `order` ascending, then slug ascending. `featured`
 * is presentation metadata only. Demo content is honest template wording, never
 * fabricated real-customer evidence.
 */

import type { PageContent } from "./page-content";

export const TESTIMONIAL_RATING_MIN = 1;
export const TESTIMONIAL_RATING_MAX = 5;

export interface TestimonialContent extends PageContent {
  /** Attribution name (also carried as `title` for PageContent compatibility). */
  readonly author: string;
  readonly role?: string;
  readonly company?: string;
  /** Optional rating, integer 1–5; absent when the testimonial has no rating. */
  readonly rating?: number;
  /** Canonical quote source; the Markdown body is unused. */
  readonly quote: string;
  /** Presentation metadata only (badge on the card). */
  readonly featured?: boolean;
  /** Listing sort key (ascending); omitted entries sort last (then by slug). */
  readonly order?: number;
}

export function isValidRating(rating: number): boolean {
  return (
    Number.isInteger(rating) &&
    rating >= TESTIMONIAL_RATING_MIN &&
    rating <= TESTIMONIAL_RATING_MAX
  );
}

export interface SortableTestimonial {
  readonly slug: string;
  readonly order?: number;
}

/** Deterministic listing order: `order` ascending, then slug ascending. */
export function compareTestimonials(a: SortableTestimonial, b: SortableTestimonial): number {
  const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
  const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  return a.slug.localeCompare(b.slug);
}

export function sortTestimonials<T extends SortableTestimonial>(items: readonly T[]): T[] {
  return [...items].sort(compareTestimonials);
}

export function isCanonicalTestimonial(slug: string, canonicalSlugs: readonly string[]): boolean {
  return canonicalSlugs.includes(slug);
}

/** Visual star row (pure string; presentation colors it via design tokens). */
export function starRow(rating: number): string {
  return "★".repeat(rating);
}

/**
 * Localized rating aria label from the dictionary template
 * (`"Rated {rating} out of 5"`); substitutes `{rating}` deterministically.
 */
export function ratingAriaLabel(rating: number, template: string): string {
  return template.replace("{rating}", String(rating));
}