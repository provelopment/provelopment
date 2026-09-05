import { Grid } from "@/components/ui/grid";
import type { TestimonialContent } from "@/core/testimonials";
import { TestimonialCard } from "./testimonial-card";

interface TestimonialListProps {
  readonly testimonials: readonly TestimonialContent[];
  /** Localized empty-state text; rendered only when there are no testimonials. */
  readonly emptyLabel: string;
  readonly featuredLabel: string;
  readonly ratingAriaTemplate: string;
}

/**
 * Phase T — the testimonials listing grid (accessible `<ul>`, zero client JS).
 */
export function TestimonialList({
  testimonials,
  emptyLabel,
  featuredLabel,
  ratingAriaTemplate,
}: TestimonialListProps) {
  if (testimonials.length === 0) {
    return <p className="text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <Grid columns="sm:grid-cols-2 lg:grid-cols-3">
      {testimonials.map((testimonial) => (
        <li key={testimonial.slug} className="flex">
          <TestimonialCard
            testimonial={testimonial}
            featuredLabel={featuredLabel}
            ratingAriaTemplate={ratingAriaTemplate}
          />
        </li>
      ))}
    </Grid>
  );
}