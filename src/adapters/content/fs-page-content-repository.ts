import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { PageContentRepository } from "@/application/page-content-repository";
import { isWellFormedLocale, type Locale } from "@/core/locale";
import { isContentSlug, type PageContent } from "@/core/page-content";
import { parseOfferingsFile, parsePageFile, parsePortfolioFile, parsePostFile, parseTestimonialsFile } from "./frontmatter";

/**
 * Parser used for the repository's collection.
 */
export type ContentParser<T extends PageContent = PageContent> = (
  raw: string,
  slug: string,
  locale: Locale,
) => T;

/**
 * The content COLLECTIONS the filesystem repository serves.
 *
 * There is deliberately no `pages` member. A page is authored in one of the two
 * first-class modes (`@/core/page-source` → `config/pages-markdown`,
 * `config/pages-json`) and resolved by the page-source composition; `content/pages`
 * is not a collection, is never read, and a file left there can never name, answer
 * or shadow a page. That is enforced here at the type level, not by convention.
 */
export type ContentCollection =
  | "offerings"
  | "legal"
  | "testimonials"
  | "portfolio"
  | "posts";

export interface FileSystemPageContentRepositoryOptions<
  T extends PageContent = PageContent,
> {
  /** Locale used when the requested locale has no translation yet. */
  readonly defaultLocale: Locale;
  /**
   * Collection directory under `content/`. A single port/adapter serves every
   * content collection, and the collection is ALWAYS named explicitly so no
   * default can quietly point at a path that is not a collection.
   */
  readonly collection: ContentCollection;
  /** Override parser (used for the `offerings` collection). */
  readonly parse?: ContentParser<T>;
}

function resolveParser(collection: ContentCollection): ContentParser {
  // Each structured collection uses its dedicated parser; a legal document shares
  // the basic title + body contract with the page parser (Phase T additions).
  switch (collection) {
    case "offerings":
      return parseOfferingsFile as ContentParser;
    case "testimonials":
      return parseTestimonialsFile as ContentParser;
    case "portfolio":
      return parsePortfolioFile as ContentParser;
    case "posts":
      return parsePostFile as ContentParser;
    case "legal":
      return parsePageFile;
  }
}

/**
 * Adapter that reads NON-PAGE content from Markdown files under
 * `content/<collection>/<locale>/<slug>.md`, falling back to the default locale
 * when the requested locale has no translation.
 *
 * Pages are NOT served here: they are authored under `config/pages-*` and resolved
 * by the page-source composition, and `pages` is deliberately absent from
 * `ContentCollection`.
 */
export function createFileSystemPageContentRepository<
  T extends PageContent = PageContent,
>(
  options: FileSystemPageContentRepositoryOptions<T>,
): PageContentRepository<T> {
  const defaultLocale = options.defaultLocale;
  const collection: ContentCollection = options.collection;
  // The default parser produces exactly the requested subtype for its
  // collection (offerings → `OfferingsContent`); callers opting into `T`
  // assert the match explicitly via the `parse` override.
  const parse: ContentParser<T> =
    (options.parse as ContentParser<T> | undefined) ??
    (resolveParser(collection) as ContentParser<T>);
  const contentDirectory = path.join(process.cwd(), "content", collection);

  function readPage(locale: Locale, slug: string): Promise<string> {
    return readFile(path.join(contentDirectory, locale, `${slug}.md`), "utf8");
  }

  return {
    async findBySlug(slug, locale): Promise<T | null> {
      if (!isContentSlug(slug) || !isWellFormedLocale(locale)) {
        return null;
      }

      const candidateLocales =
        locale === defaultLocale ? [locale] : [locale, defaultLocale];

      for (const candidateLocale of candidateLocales) {
        try {
          const raw = await readPage(candidateLocale, slug);
          return parse(raw, slug, candidateLocale);
        } catch {
          // Try the next candidate; missing files fall through.
        }
      }

      return null;
    },

    async listSlugs(locale: Locale): Promise<string[]> {
      if (!isWellFormedLocale(locale)) return [];

      let entries: string[];
      try {
        entries = await readdir(path.join(contentDirectory, locale));
      } catch {
        // No content directory for this locale yet.
        return [];
      }

      return entries
        .filter((file) => file.endsWith(".md"))
        .map((file) => file.slice(0, -3))
        // The slug rule is the ONE core authority (`@/core/page-content`), so a
        // collection can never disagree with the page modes about what a
        // collection item may be called.
        .filter((slug) => isContentSlug(slug))
        .sort();
    },
  };
}