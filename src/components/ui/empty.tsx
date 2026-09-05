/**
 * P1-8 — shared Empty (collection empty-state message) primitive.
 *
 * Before P1-8 the three collection listings (portfolio-list, testimonial-list,
 * post-list) repeated the SAME byte-identical presentation for an empty
 * collection:
 *
 *     <p className="text-muted-foreground">{emptyLabel}</p>
 *
 * each threading a localized `emptyLabel: string` prop. This primitive is the
 * single shared path for that demonstrated contract. Contract:
 *
 *  - semantic: renders a plain `<p>` with the muted-foreground token — the exact
 *    demonstrated presentation (no red box, no icon, no action button: nothing
 *    beyond current evidence);
 *  - token-driven: `text-muted-foreground` only; no raw colors;
 *  - no ARIA: a static empty-collection message needs no live region (it is not
 *    an async status). If a future async/loading presentation is introduced
 *    (P1-2, currently C/D-deferred), THAT is a separate contract.
 *
 * Deliberately NOT used for: the offerings listing empty messages (which use a
 * distinct `mt-4` / bordered presentation inside their pages), not-found, or the
 * error boundaries — each is a semantically different state with its own
 * composition (SRP).
 */
export interface EmptyProps {
  /** Localized empty-collection message. */
  readonly label: string;
  /** Optional extra classes (e.g. a top margin / alternative rhythm). */
  readonly className?: string;
}

export function Empty({ label, className }: EmptyProps) {
  return <p className={["text-muted-foreground", className].filter(Boolean).join(" ")}>{label}</p>;
}