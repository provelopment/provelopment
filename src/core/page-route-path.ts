/**
 * THE PAGE-ROUTE-PATH CONTRACT
 * ============================
 *
 * If authored content has its own website URL, it is a page — and a page's URL is
 * built from FOLDERS as well as files:
 *
 *     content/pages/markdown/en/offerings.md                 →  /en/offerings
 *     content/pages/markdown/en/offerings/website-design.md  →  /en/offerings/website-design
 *
 * A **page route path** is the part between the locale and the extension: the
 * relative path of the page inside its locale directory, using `/` and carrying no
 * leading or trailing slash (`offerings/website-design`). It is simultaneously a
 * filesystem path (relative to the locale directory) and a URL path, which is why
 * its rule is declared ONCE here and imported by everything that must agree on it:
 * the page-source contract, discovery, the composition, the routes and the sitemap.
 *
 * WHY THE RULE IS THIS STRICT
 * --------------------------
 * The value reaches a filesystem path and a URL, so it must be safe for both, and
 * it must be impossible to escape the authoring root:
 *
 *   · every SEGMENT is a content slug (`@/core/page-content`) — lowercase
 *     alphanumerics in hyphen-separated words. That alone refuses `.`, `..`, an
 *     empty segment, a space, a `%` (so no URL-encoded traversal) and a `\` (a
 *     backslash is never a separator here, so a Windows-style path can never be
 *     read as a route);
 *   · a leading or trailing `/` produces an empty segment and is therefore refused:
 *     the canonical value never carries one;
 *   · DEPTH and LENGTH are capped and documented rather than arbitrary: a page may
 *     live at most `PAGE_ROUTE_PATH_MAX_SEGMENTS` folders deep and its route path
 *     may not exceed `PAGE_ROUTE_PATH_MAX_LENGTH` characters. Discovery, routing and
 *     the sitemap therefore cannot disagree about what exists;
 *   · the mapping is DETERMINISTIC: one source path produces exactly one route path,
 *     and one route path addresses exactly one file per mode and locale.
 *
 * This module is pure and framework-free: no filesystem, no URL library, no
 * framework. It performs no I/O — a caller asks it what a value means.
 */
import { isContentSlug } from "./page-content";

/** The separator between route-path segments (also the URL path separator). */
export const PAGE_ROUTE_PATH_SEPARATOR = "/";

/** How many folders deep a page may live. Documented, and enforced here. */
export const PAGE_ROUTE_PATH_MAX_SEGMENTS = 4;

/** The longest canonical route path. Documented, and enforced here. */
export const PAGE_ROUTE_PATH_MAX_LENGTH = 160;

/**
 * The segments of a canonical route path, or an empty list when the value is not a
 * usable one. An empty list is the single "no" answer every caller checks, so an
 * invalid value can never be partially accepted.
 */
export function pageRoutePathSegments(routePath: string): readonly string[] {
  if (typeof routePath !== "string") return [];
  if (routePath.length === 0 || routePath.length > PAGE_ROUTE_PATH_MAX_LENGTH) return [];
  // A backslash is never a separator: refusing it keeps a Windows-style path from
  // being silently read as one route with a strange segment.
  if (routePath.includes("\\")) return [];

  const segments = routePath.split(PAGE_ROUTE_PATH_SEPARATOR);
  if (segments.length === 0 || segments.length > PAGE_ROUTE_PATH_MAX_SEGMENTS) return [];
  for (const segment of segments) {
    // An empty segment (from `//`, a leading `/` or a trailing `/`) and every
    // traversal or escape character are refused by the ONE segment rule.
    if (!isContentSlug(segment)) return [];
  }

  return segments;
}

/** True when the value is a canonical page route path. */
export function isPageRoutePath(routePath: string): boolean {
  return pageRoutePathSegments(routePath).length > 0;
}

/**
 * The canonical route path built from segments, or `null` when any segment — or the
 * resulting depth and length — is not usable. This is the ONE constructor: a caller
 * never joins segments itself, so a path that was not validated can never be built.
 *
 * Each argument is ONE segment: a value that carries a separator of its own is
 * refused rather than silently re-split, so the caller cannot smuggle a second
 * segment (or a traversal) through a single argument.
 */
export function pageRoutePath(...segments: readonly string[]): string | null {
  if (segments.length === 0 || segments.length > PAGE_ROUTE_PATH_MAX_SEGMENTS) return null;
  for (const segment of segments) {
    if (segment.length === 0 || segment.includes(PAGE_ROUTE_PATH_SEPARATOR)) return null;
  }
  const candidate = segments.join(PAGE_ROUTE_PATH_SEPARATOR);
  return isPageRoutePath(candidate) ? candidate : null;
}

/**
 * The last segment of a route path — the page's own name, which is what a derived
 * title is made from (`offerings/website-design` → `website-design`). Returns an
 * empty string for a value that is not a route path.
 */
export function pageRouteLeaf(routePath: string): string {
  const segments = pageRoutePathSegments(routePath);
  return segments.length === 0 ? "" : (segments[segments.length - 1] as string);
}

/**
 * The route path one page FILE contributes inside a directory: the file name with
 * the mode's extension removed, addressed from the directory it sits in.
 *
 * `directory` is the accumulated route path of the containing folders (`""` for the
 * locale directory itself, `offerings` for a folder), and `fileName` is one entry of
 * that directory's listing. Anything that is not a page file — a README, `.gitkeep`,
 * another mode's extension, a malformed name — returns `null`, which is what keeps
 * documentation inert at EVERY level of the tree rather than only at the root.
 */
export function pageRoutePathFromFile(
  directory: string,
  fileName: string,
  extension: string,
): string | null {
  const suffix = `.${extension}`;
  if (!fileName.endsWith(suffix)) return null;
  const leaf = fileName.slice(0, -suffix.length);
  if (!isContentSlug(leaf)) return null;
  // The containing folders are the route path OF THE DIRECTORY (already discovered
  // and validated); with no folders the page sits directly in the locale directory.
  const segments = pageRoutePathSegments(directory);
  if (directory.length > 0 && segments.length === 0) return null;
  return pageRoutePath(...segments, leaf);
}

/**
 * The child FOLDERS of a directory that may contain pages, from its listing.
 *
 * A folder counts only when its name is a well-formed slug (`blog`, `offerings`) and
 * the route path it would produce is still within the depth and length caps.
 * Anything else — a folder named `README.md`, a dot-folder, a folder that would go a
 * level too deep — is ignored, and ignoring it is never an error: an empty or
 * unusable folder publishes nothing.
 */
export function pageRouteChildDirectories(
  routePath: string,
  entries: readonly { readonly name: string; readonly directory: boolean }[],
): readonly string[] {
  const children = entries
    .filter((entry) => entry.directory && isContentSlug(entry.name))
    .map((entry) => (routePath.length === 0 ? entry.name : `${routePath}/${entry.name}`))
    .filter((candidate) => isPageRoutePath(candidate));

  return [...new Set(children)].sort();
}
