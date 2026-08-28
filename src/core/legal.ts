/**
 * Legal documents (Phase D, Tier 1) — config ∧ canonical-content exposure.
 *
 * A legal document is shown/exposed only when it is BOTH listed in the
 * `legal` config block AND has canonical content (a default-locale file under
 * `content/legal/`). Content alone never exposes a route; config alone never
 * renders a route (a missing-content slug is dropped from the footer and its
 * route returns 404). No legal-advice semantics are implied.
 */
export interface LegalConfigEntry {
  /** Safe slug, e.g. `privacy`; must match `content/legal/<locale>/<slug>.md`. */
  readonly slug: string;
  /** Footer link text (falls back to the localized dictionary label). */
  readonly label: string;
}

export interface ResolvedLegalDoc {
  readonly slug: string;
  readonly label: string;
}

/**
 * Intersects the configured legal entries (in config order) with the canonical
 * (default-locale) documents that actually exist. Entries whose content is
 * missing are dropped.
 */
export function resolveLegalDocs(
  config: readonly LegalConfigEntry[] | undefined,
  canonicalSlugs: readonly string[],
): ResolvedLegalDoc[] {
  return (config ?? []).flatMap((entry) =>
    canonicalSlugs.includes(entry.slug)
      ? [{ slug: entry.slug, label: entry.label }]
      : [],
  );
}

/** A legal slug is canonical only when it exists in the default locale. */
export function isCanonicalLegalSlug(slug: string, canonicalSlugs: readonly string[]): boolean {
  return canonicalSlugs.includes(slug);
}

/** Localized label wins; falls back to the config label. */
export function legalLabel(
  labels: Readonly<Record<string, string>>,
  doc: ResolvedLegalDoc,
): string {
  return labels[doc.slug] ?? doc.label;
}