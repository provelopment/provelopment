/**
 * THE AUTHORING PAGE READER — PLAIN MARKDOWN IS ENOUGH
 * ===================================================
 *
 * Reads one `content/pages/markdown/<locale>/<slug>.md` file into a page. It is
 * deliberately the OPPOSITE of the collection parser in one respect: **frontmatter
 * is OPTIONAL**. An author writes a paragraph, or a `# Heading` and a paragraph, and
 * that is a page. Nothing has to be remembered, and nothing has to be looked up.
 *
 * WHERE THE TITLE COMES FROM (in order)
 * -------------------------------------
 *   1. `title:` — if the author supplied it, it wins;
 *   2. the page's first level-one heading (`# Heading`) — the ordinary Markdown
 *      way to name a page;
 *   3. a readable title derived from the filename, so a page is never nameless.
 *
 * The source that answered is reported (`titleSource`), so a caller can tell an
 * authored title from a derived one — and a test can prove the order holds.
 *
 * WHAT IS OPTIONAL, AND WHAT IS NOT INVENTED
 * ------------------------------------------
 *   `description:`  an author-supplied search/social summary. When it is absent
 *                   the page keeps the site's own metadata fallback; this reader
 *                   does NOT invent SEO prose out of the page's text.
 *
 * There are no secret Markdown commands: no shortcodes, no directives, no
 * embedded JSON, no magic comments, no pseudo-components. An ordinary link in the
 * body IS the way to link.
 *
 * FAIL LOUDLY, NEVER SILENTLY
 * ---------------------------
 * An unsupported metadata key or a wrong type FAILS, naming the file: a typo must
 * be reported, never ignored.
 */
import type { Locale } from "@/core/locale";
import { isContentSlug, type PageContent } from "@/core/page-content";
import { hasFrontmatter, parseFrontmatter } from "./frontmatter";

/** The metadata keys the Markdown authoring mode supports. None of them is required. */
export const AUTHORING_METADATA_KEYS = ["title", "description"] as const;

/** Where a page's title came from. */
export type AuthoringTitleSource = "metadata" | "heading" | "slug";

/** One authored page, ready to be resolved and rendered. */
export interface AuthoringPage extends PageContent {
  /** Which rule produced the title. */
  readonly titleSource: AuthoringTitleSource;
}

/** `make-your-own-business` → `Make your own business`. Sentence case, matching the site's voice. */
export function authoringTitleFromSlug(slug: string): string {
  if (!isContentSlug(slug)) {
    throw new Error(`"${slug}" is not a usable page slug (lowercase words joined by hyphens).`);
  }
  const words = slug.split("-");
  return words.join(" ").replace(/^./, (character) => character.toUpperCase());
}

/** The first `# Heading` in the body, or null. Fenced code is ignored. */
function firstHeadingTitle(body: string): string | null {
  let insideFence = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) continue;
    const match = /^#\s+(.+?)\s*$/.exec(line);
    if (match) {
      const heading = match[1].replace(/#+\s*$/, "").trim();
      if (heading.length > 0) return heading;
    }
  }
  return null;
}

/** The optional `title:` value. */
function metadataTitleOf(values: Readonly<Record<string, unknown>>, slug: string): string | null {
  const raw = values.title;
  if (raw === undefined) return null;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error(`Invalid "title" in authored page "${slug}": expected non-empty text.`);
  }
  return raw.trim();
}

/** The optional `description:` value. Absent is valid — the site's fallback then applies. */
function metadataDescriptionOf(
  values: Readonly<Record<string, unknown>>,
  slug: string,
): string | undefined {
  const raw = values.description;
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") {
    throw new Error(`Invalid "description" in authored page "${slug}": expected text.`);
  }
  const description = raw.trim();
  return description.length > 0 ? description : undefined;
}

/** Metadata this mode does not support is an error — a typo must be reported, never ignored. */
function assertSupportedMetadata(values: Readonly<Record<string, unknown>>, slug: string): void {
  const unsupported = Object.keys(values).filter(
    (key) => !(AUTHORING_METADATA_KEYS as readonly string[]).includes(key),
  );
  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported metadata "${unsupported[0]}" in authored page "${slug}": ` +
        `the supported keys are ${AUTHORING_METADATA_KEYS.join(", ")} — and none of them is required.`,
    );
  }
}

/**
 * One authored Markdown file → one page. Frontmatter is optional; a file that is
 * nothing but prose is a complete page, and its title comes from its own heading
 * or its own filename.
 */
export function parseAuthoringPageFile(raw: string, slug: string, locale: Locale): AuthoringPage {
  if (!isContentSlug(slug)) {
    throw new Error(`"${slug}" is not a usable page slug (lowercase words joined by hyphens).`);
  }
  const parsed = hasFrontmatter(raw) ? parseFrontmatter(raw, slug) : { values: {}, body: raw };
  assertSupportedMetadata(parsed.values, slug);

  const metadataTitle = metadataTitleOf(parsed.values, slug);
  const headingTitle = metadataTitle === null ? firstHeadingTitle(parsed.body) : null;
  const title = metadataTitle ?? headingTitle ?? authoringTitleFromSlug(slug);
  const titleSource: AuthoringTitleSource = metadataTitle !== null
    ? "metadata"
    : headingTitle !== null
      ? "heading"
      : "slug";

  const description = metadataDescriptionOf(parsed.values, slug);

  return {
    slug,
    locale,
    title,
    titleSource,
    body: parsed.body,
    ...(description === undefined ? {} : { description }),
  };
}
