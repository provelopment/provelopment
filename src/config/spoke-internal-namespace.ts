/**
 * THE INTERNAL SPOKE NAMESPACE (FOUNDATION-MULTISITE-M16)
 * ======================================================
 *
 * ONE spelling of the framework-internal route prefix and the marker the rewrite carries — consumed by the
 * request boundary (which produces them) and by the internal route (which refuses to render without them).
 *
 * The prefix is INTERNAL: it is never a public URL, never a navigation target, never a canonical, hreflang,
 * OpenGraph, sitemap or robots value, and a direct external request to it is refused by the boundary. A
 * visitor sees the public path only, because the rewrite maps
 *
 *     /<site>/<locale>/<route>      →      /~spoke/<runtime-segment>/<site>/<locale>/<route>
 *
 * and the rendered document composes every URL from the PUBLIC path it was handed.
 *
 * Pure data: no request, no filesystem, no framework.
 */

/** The internal route prefix. */
export const INTERNAL_SPOKE_PREFIX = "/~spoke";

/** The request header the internal rewrite carries, naming the runtime segment it selected. */
export const INTERNAL_SPOKE_HEADER = "x-foundation-internal-spoke";

/** Whether a request PATH is inside the internal namespace (a direct external request to it is refused). */
export function isInternalSpokePath(pathname: string): boolean {
  return pathname === INTERNAL_SPOKE_PREFIX || pathname.startsWith(`${INTERNAL_SPOKE_PREFIX}/`);
}

/**
 * The internal path of ONE public path inside a Spoke's namespace.
 *
 * A trailing empty suffix means the Spoke's ROOT (`/~spoke/<segment>`), which is how a public `/` is
 * carried inside the namespace.
 */
export function internalSpokePath(segment: string, publicPathname: string): string {
  const suffix = publicPathname === "/" ? "" : publicPathname;
  return `${INTERNAL_SPOKE_PREFIX}/${segment}${suffix}`;
}
