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
 * The absolute authoring roots of the ACTIVE deployment, taken from the ONE deployment-root
 * authority.
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
/**
 * THE ACTIVE DEPLOYMENT'S AUTHORING ROOTS, RESOLVED ON FIRST USE (M16).
 *
 * A MULTI-SPOKE Installation has NO installation-wide resource root: every Spoke owns its own. Reading the
 * authority at MODULE LOAD therefore made importing this module impossible in a multi-Spoke build — and it did
 * so for a module the multi-Spoke runtime does not even use (its page composition is bound to the CONTEXT's own
 * roots). Reading it on FIRST USE keeps the failure where it belongs: a caller that asks for "the" deployment's
 * roots in a multi-Spoke Installation still fails LOUDLY, with the authority's own message, while an import
 * that never asks resolves nothing.
 *
 * The values themselves are unchanged, and they are still the authority's pre-declared literals (the shape the
 * build traces statically): only WHEN they are read moved.
 */
let legacyRoots: PageAuthoringRoots | null = null;

/** The legacy/current deployment's authored page roots — the ONE compatibility binding. */
function legacyAuthoringRoots(): PageAuthoringRoots {
  if (legacyRoots === null) {
    legacyRoots = {
      markdownPagesRoot: deploymentPaths().markdownPagesRoot,
      jsonPagesRoot: deploymentPaths().jsonPagesRoot,
    };
  }
  return legacyRoots;
}

/**
 * THE AUTHORED PAGE ROOTS ONE CONSUMER READS (FOUNDATION-MULTISITE-S3E1B)
 * --------------------------------------------------------------------
 * The narrow input of the input-driven capability: just the two roots, nothing else. A caller that
 * has a `SpokeResourcePaths` (S3E1A) satisfies this STRUCTURALLY, so the content layer never has to
 * know about a Spoke, an Installation, a hostname, a request or a `spokes.json`.
 *
 * These are ABSOLUTE roots. They are not `@/core/page-source`'s `PAGE_AUTHORING_ROOTS`, which is the
 * RELATIVE pair of mode directories (`content/pages/json`) this platform spells exactly once.
 */
export interface PageAuthoringRoots {
  readonly markdownPagesRoot: string;
  readonly jsonPagesRoot: string;
}

/** The ACTIVE deployment's roots — the legacy/current binding, and the ONLY wired one. */
const LEGACY_AUTHORING_ROOTS = {
  get markdownPagesRoot(): string {
    return legacyAuthoringRoots().markdownPagesRoot;
  },
  get jsonPagesRoot(): string {
    return legacyAuthoringRoots().jsonPagesRoot;
  },
} satisfies PageAuthoringRoots;

/** The one of a pair of authored roots a mode reads from. */
function authoringRootOf(roots: PageAuthoringRoots, mode: PageAuthoringMode): string {
  return mode === "markdown" ? roots.markdownPagesRoot : roots.jsonPagesRoot;
}

/**
 * A directory listing in the shape the core route-path primitives consume.
 *
 * `root` is ALREADY the mode-resolved root: `path.join(<root>, <opaque site>, <opaque locale>,
 * <opaque route path>)` is still the only shape built, whichever root arrives.
 */
async function entriesOf(
  root: string,
  siteId: string,
  locale: string,
  routePath: string,
): Promise<readonly { name: string; directory: boolean }[]> {
  try {
    const entries = await readdir(path.join(root, siteId, locale, routePath), { withFileTypes: true });
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
  root: string,
  mode: PageAuthoringMode,
  siteId: string,
  locale: string,
  routePath: string,
): Promise<readonly string[]> {
  if (routePath.length > 0 && pageRoutePathSegments(routePath).length === 0) return [];

  const entries = await entriesOf(root, siteId, locale, routePath);
  const extension = PAGE_AUTHORING_EXTENSIONS[mode];
  const routes: string[] = [];

  for (const entry of entries) {
    if (entry.directory) continue;
    const route = pageRoutePathFromFile(routePath, entry.name, extension);
    if (route !== null) routes.push(route);
  }

  for (const child of pageRouteChildDirectories(routePath, entries)) {
    routes.push(...(await collectRoutes(root, mode, siteId, locale, child)));
  }

  return routes;
}

/**
 * One mode's page route paths for ONE site+locale UNDER ONE SUPPLIED ROOT, sorted — the primitive
 * route discovery and the sitemap use, so a newly authored file (at any depth) becomes a route and
 * a sitemap entry in the SAME step.
 *
 * A malformed site or locale resolves to nothing (it can never name a directory), and a
 * locale with no directory — or an empty one — resolves to no routes.
 *
 * It reports what ONE AUTHORING TREE holds. Whether a site or locale is served is decided
 * by the site configuration, in the composition layer that consumes this.
 */
async function routesUnder(
  root: string,
  mode: PageAuthoringMode,
  siteId: string,
  locale: string,
): Promise<readonly string[]> {
  if (!isCanonicalSiteCode(siteId) || !isLocalePathKey(locale)) return [];
  const routes = await collectRoutes(root, mode, siteId, locale, "");
  return [...new Set(routes)].sort();
}

/**
 * The ACTIVE deployment's page route paths for one mode + site + locale — the legacy/current
 * binding, and the entry point today's runtime resolves.
 *
 * S3E1B adds no second walk: the SAME rule-driven implementation above answers any supplied root
 * through `authoringSourceDiscoveryFor`, and this entry point hands it the module-level roots the
 * deployment-root authority already selected.
 */
export async function authoringPageRoutesFor(
  mode: PageAuthoringMode,
  siteId: string,
  locale: string,
): Promise<readonly string[]> {
  return routesUnder(authoringRootOf(LEGACY_AUTHORING_ROOTS, mode), mode, siteId, locale);
}

/**
 * The SITE directories that exist in one mode's root of the ACTIVE deployment, sorted — the
 * legacy/current binding.
 *
 * Discovery only: a prepared-but-empty site directory appears here and still publishes
 * nothing.
 */
export async function authoringSiteDirectoriesOf(
  mode: PageAuthoringMode,
): Promise<readonly string[]> {
  return siteDirectoriesUnder(authoringRootOf(LEGACY_AUTHORING_ROOTS, mode));
}

/** The SITE directories that exist directly in ONE supplied root, sorted. */
async function siteDirectoriesUnder(root: string): Promise<readonly string[]> {
  return authoringSiteDirectories(await entriesOfRoot(root));
}

/** One mode root's own listing. */
async function entriesOfRoot(
  root: string,
): Promise<readonly { name: string; directory: boolean }[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.map((entry) => ({ name: entry.name, directory: entry.isDirectory() }));
  } catch {
    return [];
  }
}

/**
 * One mode's locale directories inside ONE SITE of the ACTIVE deployment, sorted — the
 * legacy/current binding.
 *
 * Discovery only: a prepared-but-empty locale directory appears here and still publishes
 * nothing.
 */
export async function authoringLocaleDirectoriesOf(
  mode: PageAuthoringMode,
  siteId: string,
): Promise<readonly string[]> {
  if (!isCanonicalSiteCode(siteId)) return [];
  return localeDirectoriesUnder(authoringRootOf(LEGACY_AUTHORING_ROOTS, mode), siteId);
}

/** One mode's locale directories inside ONE SITE, under ONE supplied root. */
async function localeDirectoriesUnder(
  root: string,
  siteId: string,
): Promise<readonly string[]> {
  return authoringLocaleDirectories(await entriesOf(root, siteId, "", ""));
}

/** True when this (site, locale, route) triple can name an authored file at all. */
function isReadablePageRoute(siteId: string, locale: string, routePath: string): boolean {
  return (
    isCanonicalSiteCode(siteId) &&
    isLocalePathKey(locale) &&
    pageRoutePathSegments(routePath).length > 0
  );
}

/**
 * One authored file's RAW text READ FROM ONE SUPPLIED ROOT, or `null` when it does not exist.
 *
 * The input-driven twin of `readAuthoringPageFile` (S3E1B): the same refusals, the same
 * missing-file semantics, a caller-supplied root — so one Spoke is read from ITS OWN tree and the
 * module-level root of the ACTIVE deployment plays no part.
 */
async function readPageFileUnder(
  root: string,
  mode: PageAuthoringMode,
  siteId: string,
  locale: string,
  routePath: string,
): Promise<string | null> {
  if (!isReadablePageRoute(siteId, locale, routePath)) return null;
  try {
    return mode === "markdown"
      ? await readFile(path.join(root, siteId, locale, `${routePath}.md`), "utf8")
      : await readFile(path.join(root, siteId, locale, `${routePath}.json`), "utf8");
  } catch {
    return null;
  }
}

/**
 * One authored file's RAW text, or `null` when it does not exist — the ACTIVE deployment's
 * binding, and the entry point today's runtime resolves.
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
  if (!isReadablePageRoute(siteId, locale, routePath)) return null;
  // The path and the read stay in ONE expression, so the tracer can resolve the root and
  // see exactly which subtree is being read (see `legacyAuthoringRoots()` above).
  //
  // This is why the legacy reader keeps the module-level roots INLINE instead of delegating to
  // `readPageFileUnder`: a root arriving as a function argument is exactly what the tracer cannot
  // follow. The rules are shared (the refusals above, the walk, the semantics); only the root
  // differs, and only this wired path is allowed to be the statically resolvable one.
  try {
    return mode === "markdown"
      ? await readFile(path.join(legacyAuthoringRoots().markdownPagesRoot, siteId, locale, `${routePath}.md`), "utf8")
      : await readFile(path.join(legacyAuthoringRoots().jsonPagesRoot, siteId, locale, `${routePath}.json`), "utf8");
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

/**
 * THE ROOT-PARAMETERIZED CONTENT CAPABILITY (FOUNDATION-MULTISITE-S3E1B)
 * --------------------------------------------------------------------
 * Every question ONE authored tree can answer, asked of one supplied pair of roots —
 * `content/pages/markdown` + `content/pages/json`. A caller that holds a Spoke's
 * `SpokeResourcePaths` (S3E1A) passes them straight in: the shapes match.
 *
 * The RULES are the ones above — the walk, the slug/extension/depth caps, the refusals, the
 * missing-file semantics — and they are asked of ONE tree at a time. Nothing here knows a Spoke, a
 * hostname, a request or an Installation, and nothing is remembered between calls: two pairs of
 * roots are two INDEPENDENT populations, which is exactly what makes the same site code, the same
 * locale and the same route valid in both at once.
 *
 * Unwired (S3E1B): no runtime or build module imports this yet. S3F decides which Spoke a request
 * reads; this capability only answers for a Spoke that has already been chosen.
 */
export interface AuthoringSourceDiscovery {
  /** Every page route path ONE tree holds for this mode + site + locale (both depths), sorted. */
  pageRoutesFor(
    mode: PageAuthoringMode,
    siteId: string,
    locale: string,
  ): Promise<readonly string[]>;
  /** The site directories that exist in one mode's root, sorted. */
  siteDirectoriesOf(mode: PageAuthoringMode): Promise<readonly string[]>;
  /** The locale directories inside one site of one mode's root, sorted. */
  localeDirectoriesOf(mode: PageAuthoringMode, siteId: string): Promise<readonly string[]>;
  /** One authored file's raw text, or `null` when this tree does not hold it. */
  readPageFile(
    mode: PageAuthoringMode,
    siteId: string,
    locale: string,
    routePath: string,
  ): Promise<string | null>;
  /** True when this tree holds a source for this mode + site + locale + route path. */
  hasSource(
    mode: PageAuthoringMode,
    siteId: string,
    locale: string,
    routePath: string,
  ): Promise<boolean>;
}

/** The content capability bound to ONE pair of authored roots. No cache, no global state. */
export function authoringSourceDiscoveryFor(roots: PageAuthoringRoots): AuthoringSourceDiscovery {
  const rootOf = (mode: PageAuthoringMode): string => authoringRootOf(roots, mode);
  return {
    pageRoutesFor: (mode, siteId, locale) => routesUnder(rootOf(mode), mode, siteId, locale),
    siteDirectoriesOf: (mode) => siteDirectoriesUnder(rootOf(mode)),
    localeDirectoriesOf: async (mode, siteId) =>
      isCanonicalSiteCode(siteId) ? localeDirectoriesUnder(rootOf(mode), siteId) : [],
    readPageFile: (mode, siteId, locale, routePath) =>
      readPageFileUnder(rootOf(mode), mode, siteId, locale, routePath),
    hasSource: async (mode, siteId, locale, routePath) =>
      (await readPageFileUnder(rootOf(mode), mode, siteId, locale, routePath)) !== null,
  };
}
