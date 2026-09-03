import Image from "next/image";
import Link from "next/link";

import type { OfferingsContent, ResolvedOfferingAction } from "@/core/offerings";

import { MarkdownContent } from "./markdown-content";

export interface OfferingDetailLabels {
  /** "What's included" section heading. */
  readonly deliverablesHeading: string;
  /** FAQ section heading. */
  readonly faqHeading: string;
  /** Featured badge label. */
  readonly featuredBadge: string;
  /** Localized CTA label; `null`/omitted when the action resolves to `none`. */
  readonly actionLabel: string | null;
  /** "Back to offerings" link label. */
  readonly backToListing: string;
  /** Demonstration disclaimer title. */
  readonly disclaimerTitle?: string;
  /** Demonstration disclaimer body. */
  readonly disclaimerBody?: string;
}

interface OfferingDetailProps {
  readonly offering: OfferingsContent;
  /** Already-resolved offering action (provider-neutral). */
  readonly action: ResolvedOfferingAction;
  /** Locale-qualified listing href for the back-link. */
  readonly backHref: string;
  readonly labels: OfferingDetailLabels;
}

/**
 * Phase C — offering detail presentation.
 *
 * Deterministic section order: image → `<h1>` title → featured badge → blurb →
 * price → Markdown body → "What's included" (`<ul>`) → FAQ (native
 * `<details>/<summary>` disclosure — keyboard/focus behavior comes from the
 * browser, no JS) → resolved CTA → back link.
 *
 * The CTA renders ONLY when the resolved action is a link AND a localized
 * label exists — a `none` action (e.g. booking disabled) leaves zero visual or
 * focusable residue. FAQ answers are plain text (deterministic, no nested
 * markdown parsing).
 */
export function OfferingDetail({ offering, action, backHref, labels }: OfferingDetailProps) {
  return (
    <article className="mx-auto max-w-page px-4 py-12">
      {offering.image ? (
        <div className="relative mb-8 h-64 w-full overflow-hidden rounded">
          <Image
            src={offering.image}
            alt={offering.title}
            fill
            sizes="100vw"
            className="object-cover"
          />
        </div>
      ) : null}

      <h1 className="text-3xl font-bold tracking-tight">{offering.title}</h1>
      {offering.featured ? (
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-primary">
          {labels.featuredBadge}
        </p>
      ) : null}
      <p className="mt-2 text-lg text-muted-foreground">{offering.blurb}</p>
      {offering.price ? (
        <p className="mt-3 text-sm font-medium text-foreground">{offering.price}</p>
      ) : null}

      {labels.disclaimerBody ? (
        <aside
          aria-label={labels.disclaimerTitle ?? "Demonstration Disclaimer"}
          className="mt-6 rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground"
        >
          {labels.disclaimerTitle ? (
            <p className="mb-1 font-semibold text-foreground">{labels.disclaimerTitle}</p>
          ) : null}
          <p>{labels.disclaimerBody}</p>
        </aside>
      ) : null}

      <div className="mt-6">
        <MarkdownContent markdown={offering.body} />
      </div>

      {offering.deliverables && offering.deliverables.length > 0 ? (
        <section aria-labelledby="offering-deliverables-heading" className="mt-8">
          <h2 id="offering-deliverables-heading" className="text-xl font-semibold">
            {labels.deliverablesHeading}
          </h2>
          <ul className="mt-3 list-inside list-disc space-y-1">
            {offering.deliverables.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {offering.faq && offering.faq.length > 0 ? (
        <section aria-labelledby="offering-faq-heading" className="mt-8">
          <h2 id="offering-faq-heading" className="text-xl font-semibold">
            {labels.faqHeading}
          </h2>
          <div className="mt-3 space-y-2">
            {offering.faq.map((item) => (
              <details
                key={item.question}
                className="rounded-lg border border-border bg-card p-4"
              >
                <summary className="cursor-pointer font-medium">{item.question}</summary>
                <p className="mt-2 text-muted-foreground">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      {action.kind === "link" && labels.actionLabel ? (
        <p className="mt-10">
          <a
            href={action.href}
            {...(action.external ? { target: "_blank", rel: "noreferrer" } : {})}
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            {labels.actionLabel}
          </a>
        </p>
      ) : null}

      <p className="mt-6">
        <Link href={backHref} className="text-sm text-primary hover:underline">
          {labels.backToListing}
        </Link>
      </p>
    </article>
  );
}