import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { PageContentRepository } from "@/application/page-content-repository";
import { isWellFormedLocale, type Locale } from "@/core/locale";
import type { PageContent } from "@/core/page-content";
import { parseOfferingsFile, parsePageFile } from "./frontmatter";

/** Slugs are restricted to safe filename characters. */
const validSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Parser used for the repository's collection. */
export type ContentParser = (raw: string, slug: string, locale: Locale) => PageContent;

export interface FileSystemPageContentRepositoryOptions {
  /** Locale used when the requested locale has no translation yet. */
  readonly defaultLocale: Locale;
  /**
   * Collection directory under `content/`, e.g. `pages` (the template's page
   * content) or `offerings` (the offerings catalog). A single port/adapter
   * serves every content collection.
   */
  readonly collection?: "pages" | "offerings";
  /** Override parser (used for the `offerings` collection). */
  readonly parse?: ContentParser;
}

function resolveParser(collection: "pages" | "offerings"): ContentParser {
  return collection === "offerings" ? parseOfferingsFile : parsePageFile;
}

/**
 * Adapter that reads content from Markdown files under
 * `content/<collection>/<locale>/<slug>.md`, falling back to the default
 * locale when the requested locale has no translation.
 */
export function createFileSystemPageContentRepository(
  options: FileSystemPageContentRepositoryOptions,
): PageContentRepository {
  const defaultLocale = options.defaultLocale;
  const collection = options.collection ?? "pages";
  const parse = options.parse ?? resolveParser(collection);
  const contentDirectory = path.join(process.cwd(), "content", collection);

  function readPage(locale: Locale, slug: string): Promise<string> {
    return readFile(path.join(contentDirectory, locale, `${slug}.md`), "utf8");
  }

  return {
    async findBySlug(slug, locale): Promise<PageContent | null> {
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