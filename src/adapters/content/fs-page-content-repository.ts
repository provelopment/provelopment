import { readFile } from "node:fs/promises";
import path from "node:path";

import type { PageContentRepository } from "@/application/page-content-repository";
import { isWellFormedLocale, type Locale } from "@/core/locale";
import type { PageContent } from "@/core/page-content";

const contentDirectory = path.join(process.cwd(), "content", "pages");

/** Slugs are restricted to safe filename characters. */
const validSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/;

const titlePattern = /^title:\s*(.+?)\s*$/m;

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parsePageFile(
  raw: string,
  slug: string,
  locale: Locale,
): PageContent {
  const match = frontmatterPattern.exec(raw);

  if (!match) {
    throw new Error(`Missing frontmatter in content page "${slug}"`);
  }

  const [, frontmatter, body] = match;
  const titleMatch = titlePattern.exec(frontmatter);

  if (!titleMatch) {
    throw new Error(`Missing title in frontmatter of content page "${slug}"`);
  }

  return {
    slug,
    locale,
    title: stripQuotes(titleMatch[1]),
    body,
  };
}

export interface FileSystemPageContentRepositoryOptions {
  /** Locale used when the requested locale has no translation yet. */
  readonly defaultLocale: Locale;
}

function readPage(
  locale: Locale,
  slug: string,
): Promise<string> {
  return readFile(path.join(contentDirectory, locale, `${slug}.md`), "utf8");
}

/**
 * Adapter that reads page content from Markdown files under
 * `content/pages/<locale>/<slug>.md`, falling back to the default locale
 * when the requested locale has no translation.
 */
export function createFileSystemPageContentRepository(
  options: FileSystemPageContentRepositoryOptions,
): PageContentRepository {
  const { defaultLocale } = options;

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
          return parsePageFile(raw, slug, candidateLocale);
        } catch {
          // Try the next candidate; missing files fall through.
        }
      }

      return null;
    },
  };
}