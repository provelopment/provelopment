/**
 * FILESYSTEM DISCOVERY FOR THE AUTHORING ROOTS
 * ===========================================
 *
 * Reads the real directory tree of the two first-class authoring roots and
 * reports what page SOURCES exist — and nothing more. It decides no precedence,
 * parses no Markdown and renders nothing: the resolution order belongs to
 * `@/core/page-source` + `@/application/page-source-resolution`, interpretation
 * to each kind's own reader.
 *
 * WHAT IS A PAGE SOURCE
 * ---------------------
 * Only `content/pages/<mode>/<locale>/<slug>.<ext>` is a source. So:
 *   · a file directly under a root — `content/pages/markdown/README.md` — is NOT a
 *     source (no locale segment), which is what keeps an authoring root's
 *     documentation intrinsically non-routable;
 *   · a directory whose name is not a well-formed language tag is ignored, never
 *     an error;
 *   · a file whose name is not a well-formed slug (`.gitkeep`, `Not A Slug.md`)
 *     is ignored;
 *   · an EMPTY locale directory is a legitimate state and yields NO candidates
 *     and NO error — a site may prepare a language before it has anything to put
 *     in it, and **a directory's existence is not publication** (the site's own
 *     locale configuration decides what is served).
 *
 * The layout primitives are the core ones (`authoringLocaleDirectories`,
 * `pageSlugsInLocaleDirectory`, `pageSourceFile`) rather than a second
 * implementation here, and the absolute spelling of a root is built from
 * `process.cwd()` plus LITERAL segments — never from a joined configuration
 * string — so the build's file tracer can follow it statically.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  authoringLocaleDirectories,
  pageSlugsInLocaleDirectory,
  type PageAuthoringMode,
} from "@/core/page-source";
import { isWellFormedLocale } from "@/core/locale";
import { isContentSlug } from "@/core/page-content";

/**
 * The absolute root of one authoring mode.
 *
 * WHY EVERY PATH BELOW IS SPELLED IN ONE JOIN WITH LITERAL SEGMENTS: a path the
 * build's file tracer cannot resolve statically makes the whole project traced
 * into the server bundle ("Dynamic filesystem access causes tracing of the whole
 * project"). `process.cwd()` plus literal segments plus opaque runtime values is
 * resolvable; a path assembled from another path-returning function is not — so
 * each target is spelled once, here, and nothing nests a computed path inside
 * another.
 */
function authoringRootDirectory(mode: PageAuthoringMode): string {
  return mode === "markdown"
    ? path.join(process.cwd(), "content", "pages", "markdown")
    : path.join(process.cwd(), "content", "pages", "json");
}

/** The absolute directory of one mode's locale directory. */
function authoringLocaleDirectory(mode: PageAuthoringMode, locale: string): string {
  return mode === "markdown"
    ? path.join(process.cwd(), "content", "pages", "markdown", locale)
    : path.join(process.cwd(), "content", "pages", "json", locale);
}

/** The absolute file of one page source. */
function authoringPageFile(mode: PageAuthoringMode, locale: string, slug: string): string {
  return mode === "markdown"
    ? path.join(process.cwd(), "content", "pages", "markdown", locale, `${slug}.md`)
    : path.join(process.cwd(), "content", "pages", "json", locale, `${slug}.json`);
}

/** A directory listing, or nothing when the directory does not exist. */
async function entriesOf(directory: string): Promise<readonly string[]> {
  try {
    return await readdir(directory);
  } catch {
    // A root or locale directory that does not exist yet is not a fault: it simply
    // holds nothing.
    return [];
  }
}

/** The entries of an authoring root, in the shape the core listing primitives consume. */
async function rootEntriesOf(
  mode: PageAuthoringMode,
): Promise<readonly { name: string; directory: boolean }[]> {
  try {
    const entries = await readdir(authoringRootDirectory(mode), { withFileTypes: true });
    return entries.map((entry) => ({ name: entry.name, directory: entry.isDirectory() }));
  } catch {
    return [];
  }
}

/**
 * One mode's page slugs for ONE locale.
 *
 * A malformed locale resolves to nothing (it can never name a directory), and a
 * locale with no directory — or an empty one — resolves to no slugs. This is the
 * primitive route discovery and the sitemap use, so a newly authored file becomes
 * a route and a sitemap entry in the SAME step.
 *
 * It reports what the AUTHORING TREE holds. Whether a locale is served is decided
 * by the site's configuration, in the composition layer that consumes this.
 */
export async function authoringSlugsFor(
  mode: PageAuthoringMode,
  locale: string,
): Promise<readonly string[]> {
  if (!isWellFormedLocale(locale)) return [];
  return pageSlugsInLocaleDirectory(mode, await entriesOf(authoringLocaleDirectory(mode, locale)));
}

/**
 * One mode's locale directories that exist, sorted.
 *
 * Discovery only: a prepared-but-empty locale directory appears here and still
 * publishes nothing.
 */
export async function authoringLocaleDirectoriesOf(
  mode: PageAuthoringMode,
): Promise<readonly string[]> {
  return authoringLocaleDirectories(await rootEntriesOf(mode));
}

/**
 * One authored file's RAW text, or `null` when it does not exist.
 *
 * Reading is separated from parsing on purpose: the caller owns interpretation
 * (the Markdown mode parses through the authoring reader, which fails loudly
 * naming the file). A malformed locale or slug is refused BEFORE any path is
 * built, so an arbitrary string can never address a file.
 */
export async function readAuthoringPageFile(
  mode: PageAuthoringMode,
  locale: string,
  slug: string,
): Promise<string | null> {
  if (!isWellFormedLocale(locale) || !isContentSlug(slug)) return null;
  try {
    return await readFile(authoringPageFile(mode, locale, slug), "utf8");
  } catch {
    return null;
  }
}

/** True when a page source exists for this mode, locale and slug. */
export async function hasAuthoringSource(
  mode: PageAuthoringMode,
  locale: string,
  slug: string,
): Promise<boolean> {
  return (await readAuthoringPageFile(mode, locale, slug)) !== null;
}
