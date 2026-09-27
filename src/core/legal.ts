/**
 * Legal documents — configured exposure over PAGES
 * ===============================================
 *
 * A policy document (privacy, terms, cookies) is a PAGE like any other: it is
 * authored at `content/pages/markdown/<locale>/legal/<slug>.md` (or its JSON
 * counterpart) and served at `/{locale}/legal/{slug}` by the one page route. There is
 * no legal collection and no legal repository — the document's own file is the page.
 *
 * What configuration still decides is EXPOSURE: `legal[]` lists the documents a site
 * wants surfaced in the footer, in order, with a fallback label. A configured slug
 * whose page does not exist is not linked (the link would be broken), and a page that
 * is not configured is not advertised — the same "configuration ∧ exists" rule this
 * capability has always had, now expressed through the page system rather than a
 * second storage model.
 */
export interface LegalConfigEntry {
  /** Safe slug: the page is authored at `legal/<slug>` and served at `/{locale}/legal/<slug>`. */
  readonly slug: string;
  /** Footer link text (falls back to the localized dictionary label). */
  readonly label: string;
}

export interface ResolvedLegalDoc {
  readonly slug: string;
  readonly label: string;
}

/**
 * The configured legal documents, in configuration order.
 *
 * Existence is NOT decided here: a caller asks the page composition whether the
 * document's page exists, so configuration never invents a page and a page never
 * publishes itself into the footer.
 */
export function configuredLegalDocs(
  config: readonly LegalConfigEntry[] | undefined,
): ResolvedLegalDoc[] {
  return (config ?? []).map((entry) => ({ slug: entry.slug, label: entry.label }));
}

/**
 * The page route path a legal document is authored at, and the URL it is served at
 * (`legal/privacy` → `/{locale}/legal/privacy`).
 */
export function legalPageRoutePath(slug: string): string {
  return `legal/${slug}`;
}

/** Localized label wins; falls back to the config label. */
export function legalLabel(
  labels: Readonly<Record<string, string>>,
  doc: ResolvedLegalDoc,
): string {
  return labels[doc.slug] ?? doc.label;
}
