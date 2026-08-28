import type { Locale } from "@/core/locale";
import type { PageContent } from "@/core/page-content";

/**
 * Port for retrieving human-authored page content for a locale.
 *
 * Implementations should fall back to the default locale when a
 * translation is missing; missing translations must not produce broken
 * pages. Concrete implementations belong in `src/adapters`.
 */
export interface PageContentRepository {
  findBySlug(slug: string, locale: Locale): Promise<PageContent | null>;
  /** Lists the page slugs (content files) available for a locale. */
  listSlugs(locale: Locale): Promise<string[]>;
}