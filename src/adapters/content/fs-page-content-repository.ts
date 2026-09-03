import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { PageContentRepository } from "@/application/page-content-repository";
import { isWellFormedLocale, type Locale } from "@/core/locale";
import type { PageContent } from "@/core/page-content";
import { parseOfferingsFile, parsePageFile, parsePortfolioFile, parsePostFile, parseTestimonialsFile } from "./frontmatter";

/** Slugs are restricted to safe filename characters. */
const validSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Parser used for the repository's collection. */
export type ContentParser<T extends PageContent = PageContent> = (
  raw: string,
  slug: string,
  locale: Locale,
) => T;

export interface FileSystemPageContentRepositoryOptions<
  T extends PageContent = PageContent,
> {
  /** Locale used when the requested locale has no translation yet. */
  readonly defaultLocale: Locale;
  /**
   * Collection directory under `content/`, e.g. `pages` (the template's page
   * content) or `offerings` (the offerings catalog). A single port/adapter
   * serves every content collection.
   */
  readonly collection?:
    | "pages"
    | "offerings"
    | "legal"
    | "testimonials"
    | "portfolio"
    | "posts";
  /** Override parser (used for the `offerings` collection). */
  readonly parse?: ContentParser<T>;
}

function resolveParser(
  collection: "pages" | "offerings" | "legal" | "testimonials" | "portfolio" | "posts",
): ContentParser {
  // Each structured collection uses its dedicated parser; `pages` and `legal`
  // share the basic title + body page contract (Phase T additions).
  switch (collection) {
    case "offerings":
      return parseOfferingsFile as ContentParser;
    case "testimonials":
      return parseTestimonialsFile as ContentParser;
    case "portfolio":
      return parsePortfolioFile as ContentParser;
    case "posts":
      return parsePostFile as ContentParser;
    default:
      return parsePageFile;
  }
}

/**
 * Adapter that reads content from Markdown files under
 * `content/<collection>/<locale>/<slug>.md`, falling back to the default
 * locale when the requested locale has no translation.
 */
export function createFileSystemPageContentRepository<
  T extends PageContent = PageContent,
>(
  options: FileSystemPageContentRepositoryOptions<T>,
): PageContentRepository<T> {
  const defaultLocale = options.defaultLocale;
  const collection = options.collection ?? "pages";
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
      if (!validSlugPattern.test(slug) || !isWellFormedLocale(locale)) {
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
        .filter((slug) => validSlugPattern.test(slug))
        .sort();
    },
  };
}