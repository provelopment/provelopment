import type { PageContent } from "@/core/page-content";

/**
 * Port for retrieving human-authored page content.
 *
 * Concrete implementations belong in `src/adapters`. Application and
 * framework code must depend on this interface, not on any concrete
 * implementation.
 */
export interface PageContentRepository {
  findBySlug(slug: string): Promise<PageContent | null>;
}