import { readFile } from "node:fs/promises";
import path from "node:path";

import type { PageContentRepository } from "@/application/page-content-repository";
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

export function parsePageFile(raw: string, slug: string): PageContent {
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
    title: stripQuotes(titleMatch[1]),
    body,
  };
}

/**
 * Adapter that reads page content from Markdown files under
 * `content/pages/<slug>.md`.
 */
export function createFileSystemPageContentRepository(): PageContentRepository {
  return {
    async findBySlug(slug: string): Promise<PageContent | null> {
      if (!validSlugPattern.test(slug)) {
        return null;
      }

      try {
        const raw = await readFile(
          path.join(contentDirectory, `${slug}.md`),
          "utf8",
        );
        return parsePageFile(raw, slug);
      } catch {
        return null;
      }
    },
  };
}