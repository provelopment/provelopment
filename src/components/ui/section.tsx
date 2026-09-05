import type { ComponentPropsWithoutRef, ElementType } from "react";

/**
 * P1-4 — the shared Section (semantic page-content frame) primitive.
 *
 * Before P1-4, fifteen detail/content files repeated an identical
 * `mx-auto max-w-page px-4 py-12` class string on `<article>`, and the
 * error/not-found status sections repeated the same frame with a centered
 * rhythm. This primitive is the single shared path for that page-content
 * frame. Contract:
 *
 *  - SEMANTIC HTML preserved: renders `<section>` by default; detail/content
 *    pages pass `as="article"`. Never a div-itis abstraction, and no ARIA is
 *    injected where native semantics suffice.
 *  - TOKEN-driven: `max-w-page` (content-width token) + page padding/vertical
 *    rhythm.
 *  - COMPOSITIONAL: consumers override rhythm/alignment via `className` (e.g.
 *    error/not-found pass `py-24 text-center`); no speculative variants.
 *  - SRP: does NOT own heading/intro composition or in-page subsection layout
 *    — those stay with consumers. It is NOT a general layout engine.
 *
 * Deliberately NOT absorbed: the home landing hero/about rhythm (`pt-16 pb-10`
 * / `pb-16`), the in-page `<section className="mt-8">` subsections, the
 * `region-block` top-border section, and the `*Card` `<article>` chips — each
 * is a distinct presentation, not this frame contract.
 */
export interface SectionProps extends ComponentPropsWithoutRef<"section"> {
  /** Semantic element: `section` (default) or `article` (detail/content pages). */
  readonly as?: "section" | "article";
}

/** The demonstrated page-content-frame treatment (token-driven). */
const PAGE_FRAME_CLASS = "mx-auto max-w-page px-4 py-12";

export function Section({ as = "section", className, children, ...rest }: SectionProps) {
  const Tag = as as ElementType;
  return (
    <Tag className={[PAGE_FRAME_CLASS, className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </Tag>
  );
}