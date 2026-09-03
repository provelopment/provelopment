import Link from "next/link";

import type { PortfolioItem } from "@/core/portfolio";
import { MarkdownContent } from "./markdown-content";

interface PortfolioDetailProps {
  readonly item: PortfolioItem;
  /** Destination of the "back to portfolio" link. */
  readonly backHref: string;
  readonly backLabel: string;
  readonly tagsLabel: string;
}

/**
 * Phase T — a portfolio/case-study detail page. The Markdown body is rendered
 * by the shared `MarkdownContent` (trust boundary: adopter-authored content
 * only, never visitor input).
 */
export function PortfolioDetail({
  item,
  backHref,
  backLabel,
  tagsLabel,
}: PortfolioDetailProps) {
  return (
    <article className="mx-auto max-w-page px-4 py-12">
      <p className="mb-6">
        <Link href={backHref} className="text-sm font-medium text-primary hover:underline">
          ← {backLabel}
        </Link>
      </p>
      <h1 className="text-3xl font-bold tracking-tight">
        {item.title}
        {item.year ? <span className="text-muted-foreground"> · {item.year}</span> : null}
      </h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{item.summary}</p>
      {item.tags && item.tags.length > 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {tagsLabel}: {item.tags.join(", ")}
        </p>
      ) : null}
      <div className="mt-8">
        <MarkdownContent markdown={item.body} />
      </div>
    </article>
  );
}