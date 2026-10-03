/**
 * THE SPOKE-SELECTION SEAM, AND THE RETIRED INTERNAL NAMESPACE (FOUNDATION-MULTISITE-M16/M17)
 * ===========================================================================================
 *
 * ONE spelling of the PRIVATE upstream header the request boundary uses to tell the App Router page tree
 * WHICH Spoke answers a request — plus the retired `/~spoke` namespace, which is not a route tree at all.
 *
 * WHY A HEADER AND NOT A PATH. The public path IS the page identity: a client-side transition only commits
 * when the path the visitor requested is a route the App Router itself knows. Encoding the Spoke into the
 * pathname therefore cannot satisfy the navigation contract, and M16/M17 proved both failure modes of it —
 * a stuck soft navigation while the public page tree still existed, and a full document reload once it did
 * not. So the boundary keeps the public pathname EXACTLY as requested and selects the Spoke out of band:
 *
 *     Host → Proxy → exact claim → x-foundation-spoke-segment: <runtime segment> → public catch-all route
 *
 * The header is UPSTREAM ONLY: it is written into the request the App Router renders and is never sent to a
 * client. The boundary OVERWRITES any value that arrived on the wire, so a spoofed header can never select a
 * Spoke (there is one authority for that decision, and it is the exact-claim match in the boundary).
 *
 * Pure data: no request, no filesystem, no framework.
 */

/**
 * The PRIVATE upstream request header naming the runtime segment the request boundary selected.
 *
 * Its value is a RUNTIME SEGMENT (the internal identity used for context lookup, asset-namespace ownership
 * and the build/runtime routing tables) — never a public path segment, and never visible to a client.
 */
export const SPOKE_SELECTION_HEADER = "x-foundation-spoke-segment";

/**
 * The RETIRED internal page prefix.
 *
 * `/~spoke/<runtime-segment>/...` was the page-route identity of the superseded M16 design. It is kept here
 * for one purpose only: NOTHING may render under it, and a direct request to it is refused by the boundary,
 * so a visitor can neither reach a page there nor receive a 404 surface that implies it exists.
 */
export const INTERNAL_SPOKE_PREFIX = "/~spoke";

/** Whether a request PATH is inside the retired internal namespace (a direct request to it is refused). */
export function isInternalSpokePath(pathname: string): boolean {
  return pathname === INTERNAL_SPOKE_PREFIX || pathname.startsWith(`${INTERNAL_SPOKE_PREFIX}/`);
}
