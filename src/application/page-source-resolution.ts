import {
  pageResolutionCandidates,
  type PageAuthoringMode,
  type PageSourceRequest,
} from "@/core/page-source";

/**
 * THE PAGE-SOURCE RESOLVER — ONE DETERMINISTIC AUTHORITY
 * =====================================================
 *
 * Answers exactly one question: **which source is authoritative for this
 * requested page?** and nothing else. It knows a source by its IDENTITY — the
 * kind (JSON or Markdown), the locale that answered, whether that locale is a
 * fallback, and the source itself — and it applies the ONE declared order
 * (`@/core/page-source` → `PAGE_RESOLUTION_ORDER`).
 *
 * It does not know how Markdown is parsed or sanitised, how a page title is
 * derived, how a JSON composition is interpreted, what a component needs, or
 * where any file lives: each of those belongs to the kind's own READER, which the
 * caller supplies as a provider below.
 *
 * WHY THE PROVIDERS ARE CALLED "AVAILABILITY", NOT "LOAD"
 * ------------------------------------------------------
 * A provider returns the source for one candidate locale, or `null` when that
 * locale contributes nothing — a missing file, or data that is not that locale's
 * to serve. Returning a value is what makes a candidate the winner. So the
 * precedence lives in ONE place (the loop below) while interpretation lives
 * behind the providers, which is the separation the architecture requires:
 *
 * resolution     → which source wins                (this module + the order)
 * interpretation → how a winning source is read     (the per-mode readers)
 *
 * No route, reader or sitemap may reimplement the order; a caller asks this
 * authority and then interprets what it was handed.
 *
 * This module is framework-free and adapter-free by design: it imports nothing
 * but the core contract, so it stays in `@/application` where it belongs.
 */

/**
 * One source that answered a request.
 *
 * `locale` is the locale that actually answered (which may be the default locale
 * standing in), and `fallback` says whether it did so ON BEHALF OF another
 * requested locale — the fact a page needs in order to declare its own language
 * honestly.
 */
export interface ResolvedPageSource<TSource> {
  readonly kind: PageAuthoringMode;
  readonly slug: string;
  /** The locale the winning source came from. */
  readonly locale: string;
  /** True when the winning source is the default locale answering for another locale. */
  readonly fallback: boolean;
  readonly source: TSource;
}

/** What one kind can contribute for ONE locale: a source, or nothing. */
export type PageSourceProvider<TSource> = (
  locale: string,
) => Promise<TSource | null> | TSource | null;

/** The two authoring modes a request can be answered from, each with its own reader. */
export interface PageSourceProviders<TSource> {
  /** The advanced (JSON) authoring mode. */
  readonly json: PageSourceProvider<TSource>;
  /** The accessibility-first Markdown authoring mode. */
  readonly markdown: PageSourceProvider<TSource>;
}

/**
 * Apply the declared order and return the first source any provider can supply,
 * or `null` when the page exists nowhere — never an invented fallback and never a
 * guess.
 *
 * Providers are consulted in order, and a provider that throws is NOT caught
 * here: a source that exists but is malformed must fail loudly, naming the file,
 * rather than silently falling through to a different source (which would hide
 * the author's mistake behind a served page).
 */
export async function resolvePageSource<TSource>(
  request: PageSourceRequest,
  providers: PageSourceProviders<TSource>,
): Promise<ResolvedPageSource<TSource> | null> {
  for (const candidate of pageResolutionCandidates(request)) {
    const provider = providers[candidate.kind];
    const source = await provider(candidate.locale);
    if (source !== null && source !== undefined) {
      return {
        kind: candidate.kind,
        slug: request.slug,
        locale: candidate.locale,
        fallback: candidate.fallback,
        source,
      };
    }
  }

  return null;
}
