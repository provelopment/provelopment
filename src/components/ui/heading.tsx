import type { ReactNode } from "react";

/**
 * Heading — P2-12. Shared semantic heading primitive.
 *
 * Before P2-12 the page-title h1 contract was repeated across 15 files with
 * the SAME classes (`<h1 className="text-3xl font-bold tracking-tight">`),
 * and the section-heading h2 contract (`text-xl font-semibold`) across
 * detail sections. These are two demonstrated, stable typography contracts
 * ("title" = page title; "section" = in-section heading), so they now share
 * one path.
 *
 * Contract:
 *  - semantic: renders the caller-selected heading LEVEL (`h1`/`h2`); never
 *    silently changes level (visual size is intentionally bound to the
 *    demonstrated tone, NOT to the semantic level — a caller may render an
 *    `h2` with either tone);
 *  - `tone`: "title" → `text-3xl font-bold tracking-tight` (page-title
 *    contract); "section" → `text-xl font-semibold` (section-heading
 *    contract);
 *  - preserved: the error/404 h1 (`text-4xl font-bold tracking-tight`), the
 *    responsive home hero (`sm:text-5xl`), card-title h2s (offering/portfolio/
 *    post card), the eyebrow/overline helper, and `.prose` markdown body stay
 *    LOCAL — they are distinct contracts, not this primitive's concern.
 */
export interface HeadingProps {
  /** Semantic heading level. */
  readonly level: 1 | 2;
  /** Demonstrated typography tone: page-title or section-heading. */
  readonly tone: "title" | "section";
  readonly children: ReactNode;
  readonly id?: string;
}

export function Heading({ level, tone, children, id }: HeadingProps) {
  const className = tone === "title" ? "text-3xl font-bold tracking-tight" : "text-xl font-semibold";
  return level === 1 ? (
    <h1 id={id} className={className}>
      {children}
    </h1>
  ) : (
    <h2 id={id} className={className}>
      {children}
    </h2>
  );
}