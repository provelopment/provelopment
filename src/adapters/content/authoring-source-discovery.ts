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
 * (`content/pages/markdown/ca/en/offerings/website-design.md` → `/ca/en/offerings/website-design`).
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
 *   · a SITE directory whose name is not a recognized lowercase site code, and an
 *     LOCALE directory whose name is not a lowercase locale path key, is ignored (so `CA`
 *     and `fr-CA` are not spelled the way content paths are).
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

import { deploymentPaths } from "@/config/deployment-root";
import {
  pageRouteChildDirectories,
  pageRoutePathFromFile,
  pageRoutePathSegments,
} from "@/core/page-route-path";
import {
  authoringLocaleDirectories,
  authoringSiteDirectories,
  PAGE_AUTHORING_EXTENSIONS,
  type PageAuthoringMode,
} from "@/core/page-source";
import { isLocalePathKey } from "@/core/site-locale";
import { isCanonicalSiteCode } from "@/core/site-code";

/**
 * The absolute authoring roots, taken from the ONE deployment-root authority.
 *
 * The build traces filesystem access statically, and a path it cannot resolve makes it
 * trace the WHOLE project into the server bundle ("Dynamic filesystem access causes
 * tracing of the whole project"). The authority therefore selects between PRE-DECLARED
 * literal `path.join(<cwd>, <literal…>)` roots and hands back the selected constant, so the
 * shape below is unchanged: `path.join(<static root>, <opaque locale>, <opaque route path>)`
 * is still what every call site builds. Nothing here returns a path from a function, and no
 * path is built by concatenating a computed path with an extension: both defeat the analysis
 * and silently inflate every deployment.
 */
const MARKDOWN_ROOT = deploymentPaths().markdownPagesRoot;
const JSON_ROOT = deploymentPaths().jsonPagesRoot;

/** The one of those two roots a mode reads from. */
function authoringRoot(mode: PageAuthoringMode): string {
  return mode === "markdown" ? MARKDOWN_ROOT : JSON_ROOT;
}

/** A directory listing in the shape the core route-path primitives consume. */
async function entriesOf(
  mode: PageAuthoringMode,
  siteId: string,
  locale: string,
  routePath: string,
): Promise<readonly { name: string; directory: boolean }[]> {
  try {
    const entries = await readdir(path.join(authoringRoot(mode), siteId, locale, routePath), {
      withFileTypes: true,
    });
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
  siteId: string,
  locale: string,
  routePath: string,
): Promise<readonly string[]> {
  if (routePath.length > 0 && pageRoutePathSegments(routePath).length === 0) return [];

  const entries = await entriesOf(mode, siteId, locale, routePath);
  const extension = PAGE_AUTHORING_EXTENSIONS[mode];
  const routes: string[] = [];

  for (const entry of entries) {
    if (entry.directory) continue;
    const route = pageRoutePathFromFile(routePath, entry.name, extension);
    if (route !== null) routes.push(route);
  }

  for (const child of pageRouteChildDirectories(routePath, entries)) {
    routes.push(...(await collectRoutes(mode, siteId, locale, child)));
  }

  return routes;
}

/**
 * One mode's page route paths for ONE site+locale, sorted — the primitive route discovery
 * and the sitemap use, so a newly authored file (at any depth) becomes a route and a
 * sitemap entry in the SAME step.
 *
 * A malformed site or locale resolves to nothing (it can never name a directory), and a
 * locale with no directory — or an empty one — resolves to no routes.
 *
 * It reports what the AUTHORING TREE holds. Whether a site or locale is served is decided
 * by the site configuration, in the composition layer that consumes this.
 */
export async function authoringPageRoutesFor(
  mode: PageAuthoringMode,
  siteId: string,
  locale: string,
): Promise<readonly string[]> {
  if (!isCanonicalSiteCode(siteId) || !isLocalePathKey(locale)) return [];
  const routes = await collectRoutes(mode, siteId, locale, "");
  return [...new Set(routes)].sort();
}

/**
 * The SITE directories that exist in one mode's root, sorted.
 *
 * Discovery only: a prepared-but-empty site directory appears here and still publishes
 * nothing.
 */
export async function authoringSiteDirectoriesOf(
  mode: PageAuthoringMode,
): Promise<readonly string[]> {
  return authoringSiteDirectories(await entriesOfRoot(mode));
}

/** The mode root's own listing. */
async function entriesOfRoot(
  mode: PageAuthoringMode,
): Promise<readonly { name: string; directory: boolean }[]> {
  try {
    const entries = await readdir(authoringRoot(mode), { withFileTypes: true });
    return entries.map((entry) => ({ name: entry.name, directory: entry.isDirectory() }));
  } catch {
    return [];
  }
}

/**
 * One mode's locale directories inside ONE SITE, sorted.
 *
 * Discovery only: a prepared-but-empty locale directory appears here and still publishes
 * nothing.
 */
export async function authoringLocaleDirectoriesOf(
  mode: PageAuthoringMode,
  siteId: string,
): Promise<readonly string[]> {
  if (!isCanonicalSiteCode(siteId)) return [];
  return authoringLocaleDirectories(await entriesOf(mode, siteId, "", ""));
}

/**
 * One authored file's RAW text, or `null` when it does not exist.
 *
 * Reading is separated from parsing on purpose: the caller owns interpretation (the
 * Markdown mode parses through the authoring reader, which fails loudly naming the file).
 * A malformed site, locale or route path — including a traversal attempt — is refused
 * BEFORE any path is built, so an arbitrary string can never address a file, and a site id
 * can never escape its own subtree.
 */
export async function readAuthoringPageFile(
  mode: PageAuthoringMode,
  siteId: string,
  locale: string,
  routePath: string,
): Promise<string | null> {
  if (!isCanonicalSiteCode(siteId)) return null;
  if (!isLocalePathKey(locale)) return null;
  if (pageRoutePathSegments(routePath).length === 0) return null;
  // The path and the read stay in ONE expression, so the tracer can resolve the root and
  // see exactly which subtree is being read (see `MARKDOWN_ROOT` above).
  try {
    return mode === "markdown"
      ? await readFile(path.join(MARKDOWN_ROOT, siteId, locale, `${routePath}.md`), "utf8")
      : await readFile(path.join(JSON_ROOT, siteId, locale, `${routePath}.json`), "utf8");
  } catch {
    return null;
  }
}

/** True when a page source exists for this mode, site, locale and route path. */
export async function hasAuthoringSource(
  mode: PageAuthoringMode,
  siteId: string,
  locale: string,
  routePath: string,
): Promise<boolean> {
  return (await readAuthoringPageFile(mode, siteId, locale, routePath)) !== null;
}
