import type { Locale } from "@/core/locale";
import type { PageContent } from "@/core/page-content";

/**
 * Port for retrieving human-authored page content for a locale.
 *
 * Implementations should fall back to the default locale when a
 * translation is missing; missing translations must not produce broken
 * pages. Concrete implementations belong in `src/adapters`.
 *
 * `T` is the content shape for a collection; it defaults to the base
 * `PageContent` (pages, legal) so offerings can keep their extra fields
 * without runtime casts.
 */
export interface PageContentRepository<T extends PageContent = PageContent> {
  findBySlug(slug: string, locale: Locale): Promise<T | null>;
  /** Lists the page slugs (content files) available for a locale. */
  listSlugs(locale: Locale): Promise<string[]>;
}