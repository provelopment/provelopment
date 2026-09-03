import type { TestimonialContent } from "@/core/testimonials";
import { ratingAriaLabel, starRow } from "@/core/testimonials";

interface TestimonialCardProps {
  readonly testimonial: TestimonialContent;
  /** Localized "Featured" badge label; rendered only when the item is featured. */
  readonly featuredLabel?: string;
  /** Localized rating aria template (`"Rated {rating} out of 5"`). */
  readonly ratingAriaTemplate?: string;
}

/**
 * Phase T — a single testimonial card.
 *
 * Provider-free and config-free: receives an already-resolved testimonial plus
 * localized labels. `quote` (frontmatter) is the canonical quote source; the
 * body is never rendered. Rating is optional; when present it renders a visual
 * ★ row (aria-hidden) plus an accurate visually-hidden label.
 */
export function TestimonialCard({
  testimonial,
  featuredLabel,
  ratingAriaTemplate,
}: TestimonialCardProps) {
  const attribution = [testimonial.role, testimonial.company].filter(Boolean).join(", ");

  return (
    <figure className="flex h-full flex-col rounded-lg border border-border bg-card p-6">
      {testimonial.featured && featuredLabel ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          {featuredLabel}
        </p>
      ) : null}
      <blockquote className="mt-2 flex-1 text-muted-foreground">
        &ldquo;{testimonial.quote}&rdquo;
      </blockquote>
      <figcaption className="mt-4">
        {testimonial.rating !== undefined && ratingAriaTemplate ? (
          <p aria-label={ratingAriaLabel(testimonial.rating, ratingAriaTemplate)}>
            <span aria-hidden="true" className="text-primary">
              {starRow(testimonial.rating)}
            </span>
            <span className="sr-only">
              {ratingAriaLabel(testimonial.rating, ratingAriaTemplate)}
            </span>
          </p>
        ) : null}
        <p className="mt-1 font-medium text-foreground">{testimonial.author}</p>
        {attribution ? (
          <p className="text-sm text-muted-foreground">{attribution}</p>
        ) : null}
      </figcaption>
    </figure>
  );
}