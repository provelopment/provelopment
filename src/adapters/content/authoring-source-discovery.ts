/**
 * FILESYSTEM DISCOVERY FOR THE AUTHORING ROOTS
 * ===========================================
 *
 * Reads the real directory tree of the two first-class authoring roots and reports
 * what page SOURCES exist — and nothing more. It decides no precedence, parses no
 * Markdown and renders nothing: the resolution order belongs to `@/core/page-source`
 * + `@/application/page-source-resolution`, interpretation to each kind's own reader.
 *
 * A PAGE'S ROUTE IS ITS PATH, SO DISCOVERY RECURSES
 * -------------------------------------------------
 * A page may live in FOLDERS, because its URL is built from them
 * (`content/pages/markdown/en/offerings/website-design.md` → `/en/offerings/website-design`).
 * So discovery walks the locale directory and every usable folder beneath it, and
 * reports each page it finds as a ROUTE PATH (`offerings/website-design`). The
 * segment, depth and length rules are the core ones (`@/core/page-route-path`), so
 * discovery, routing and the sitemap cannot disagree about what exists.
 *
 * WHAT IS A PAGE SOURCE
 * ---------------------
 * Only a file inside a locale directory that carries its mode's extension AND has a
 * well-formed name is a source. So, at EVERY level of the tree:
 *   · a file directly under a mode root — `content/pages/markdown/README.md` — is NOT
 *     a source (no locale segment), which is what keeps a mode root's documentation —
 *     and the `content/` README itself — intrinsically non-routable;
 *   · a nested README beside nested pages (`content/pages/markdown/en/blog/README.md`)
 *     is NOT a source either, for the same reason (`README` is not a slug);
 *   · a directory whose name is not a well-formed slug is ignored, never an error;
 *   · a file whose name is not a well-formed slug (`.gitkeep`, `Not A Slug.md`) is
 *     ignored;
 *   · a folder that would take a page past the documented depth or length cap is
 *     ignored;
 *   · an EMPTY directory — the locale directory, or any folder inside it — is a
 *     legitimate state and yields NO routes and NO error: a site may prepare a
 *     language or a section before it has anything to put in it, and **a directory's
 *     existence is not publication** (the site's own locale configuration decides
 *     what is served).
 *
 * The layout primitives are the core ones (`authoringLocaleDirectories`,
 * `pageRouteChildDirectories`, `pageRoutePathFromFile`) rather than a second
 * implementation here, and every absolute path is built from `process.cwd()` plus
 * LITERAL segments — never from a joined configuration string — so the build's file
 * tracer can follow it statically.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  pageRouteChildDirectories,
  pageRoutePathFromFile,
  pageRoutePathSegments,
} from "@/core/page-route-path";
import {
  authoringLocaleDirectories,
  PAGE_AUTHORING_EXTENSIONS,
  type PageAuthoringMode,
} from "@/core/page-source";
import { isWellFormedLocale } from "@/core/locale";

/**
 * The absolute directory of one mode's locale directory, with a page's route path
 * appended when it is nested.
 *
 * WHY EVERY PATH BELOW IS SPELLED IN ONE JOIN WITH LITERAL SEGMENTS: a path the
 * build's file tracer cannot resolve statically makes the whole project traced into
 * the server bundle ("Dynamic filesystem access causes tracing of the whole
 * project" — the Turbopack build warns about exactly this). `process.cwd()` plus
 * literal segments plus ONE opaque runtime value is resolvable; a path assembled by
 * spreading a computed segment list, or by nesting one path-returning function inside
 * another, is not. So each target is spelled once, here, from literals plus the
 * already-validated route path.
 */
function authoringDirectory(mode: PageAuthoringMode, locale: string, routePath: string): string {
  const base =
    mode === "markdown"
      ? path.join(process.cwd(), "content", "pages", "markdown", locale)
      : path.join(process.cwd(), "content", "pages", "json", locale);
  return routePath.length === 0 ? base : path.join(base, routePath);
}

/** The absolute file of one page source, or `null` when the route path is not usable. */
function authoringPageFile(
  mode: PageAuthoringMode,
  locale: string,
  routePath: string,
): string | null {
  if (pageRoutePathSegments(routePath).length === 0) return null;
  return `${authoringDirectory(mode, locale, routePath)}.${PAGE_AUTHORING_EXTENSIONS[mode]}`;
}

/** A directory listing in the shape the core route-path primitives consume. */
async function entriesOf(
  directory: string,
): Promise<readonly { name: string; directory: boolean }[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.map((entry) => ({ name: entry.name, directory: entry.isDirectory() }));
  } catch {
    // A directory that does not exist yet is not a fault: it simply holds nothing.
    return [];
  }
}

/**
 * Every page route path beneath one directory, recursively.
 *
 * Pages come from files; folders are descended into only when their name is a
 * usable slug and the route they would produce is still within the documented
 * depth and length caps — so the walk always terminates and can never leave the
 * authoring root.
 */
async function collectRoutes(
  mode: PageAuthoringMode,
  locale: string,
  routePath: string,
): Promise<readonly string[]> {
  if (routePath.length > 0 && pageRoutePathSegments(routePath).length === 0) return [];

  const entries = await entriesOf(authoringDirectory(mode, locale, routePath));
  const extension = PAGE_AUTHORING_EXTENSIONS[mode];
  const routes: string[] = [];

  for (const entry of entries) {
    if (entry.directory) continue;
    const route = pageRoutePathFromFile(routePath, entry.name, extension);
    if (route !== null) routes.push(route);
  }

  for (const child of pageRouteChildDirectories(routePath, entries)) {
    routes.push(...(await collectRoutes(mode, locale, child)));
  }

  return routes;
}

/**
 * One mode's page route paths for ONE locale, sorted — the primitive route discovery
 * and the sitemap use, so a newly authored file (at any depth) becomes a route and a
 * sitemap entry in the SAME step.
 *
 * A malformed locale resolves to nothing (it can never name a directory), and a
 * locale with no directory — or an empty one — resolves to no routes.
 *
 * It reports what the AUTHORING TREE holds. Whether a locale is served is decided
 * by the site's configuration, in the composition layer that consumes this.
 */
export async function authoringPageRoutesFor(
  mode: PageAuthoringMode,
  locale: string,
): Promise<readonly string[]> {
  if (!isWellFormedLocale(locale)) return [];
  const routes = await collectRoutes(mode, locale, "");
  return [...new Set(routes)].sort();
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
  return authoringLocaleDirectories(await entriesOf(authoringDirectory(mode, "", "")));
}

/**
 * One authored file's RAW text, or `null` when it does not exist.
 *
 * Reading is separated from parsing on purpose: the caller owns interpretation
 * (the Markdown mode parses through the authoring reader, which fails loudly
 * naming the file). A malformed locale or route path — including a traversal
 * attempt — is refused BEFORE any path is built, so an arbitrary string can never
 * address a file.
 */
export async function readAuthoringPageFile(
  mode: PageAuthoringMode,
  locale: string,
  routePath: string,
): Promise<string | null> {
  if (!isWellFormedLocale(locale)) return null;
  const file = authoringPageFile(mode, locale, routePath);
  if (file === null) return null;
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

/** True when a page source exists for this mode, locale and route path. */
export async function hasAuthoringSource(
  mode: PageAuthoringMode,
  locale: string,
  routePath: string,
): Promise<boolean> {
  return (await readAuthoringPageFile(mode, locale, routePath)) !== null;
}
