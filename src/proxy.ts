import { NextResponse, type NextRequest } from "next/server";

import { hostRoutingForBuild, spokeSelectionForHost, type SpokeHostRoutingEntry } from "@/config/spoke-routing";

/**
 * THE REQUEST BOUNDARY: HOSTNAME DISPATCH (FOUNDATION-MULTISITE-M16)
 * =================================================================
 *
 * ONE decision order, and no global Spoke authority anywhere in it:
 *
 *     raw request host
 *         ↓ normalizeHostname + exact claim match   (`@/core/spoke`, via `@/config/spoke-routing`)
 *     ONE Spoke — or NOTHING
 *         ↓
 *     internal rewrite to its runtime segment:  /~spoke/<segment>/<public path unchanged>
 *         ↓
 *     the existing context-bound server composition renders it
 *
 * WHAT THIS FILE NO LONGER DOES: it reads no `siteConfig`, holds no Site or locale inventory, and completes
 * no locale. Site/locale completion is decided INSIDE the selected Spoke — by the route that already holds
 * that Spoke's fully resolved configuration (`src/app/~spoke/[segment]`) — so the boundary never needs a
 * configuration to answer a routing question, and the browser-visible URL is never anything but the public
 * one.
 *
 * THE TWO INSTALLATION SHAPES
 * ---------------------------
 *   multi   2+ declared Spokes: the host decides. An UNCLAIMED hostname answers NOTHING (404) — it is never
 *           redirected to another Spoke, never given "the first" Spoke and never given a default.
 *   single  exactly ONE declared Spoke: that Spoke answers every host, which is the accepted one-Spoke
 *           behaviour (development, preview and test hosts included) — stated as "the sole entry the build
 *           published", never as "the first".
 *
 * FAIL-CLOSED EXTRAS
 * ------------------
 *   · a DIRECT external request to the internal namespace (`/~spoke/**`) is refused: only the framework's
 *     own rewrite (performed right here) may reach it;
 *   · a Spoke's own asset namespace (`/spokes/<segment>/assets/**`) is HOST-BOUND: a host may fetch its own
 *     Spoke's artwork and never another's, even though both are generated in the same `public/` tree. The
 *     matcher below therefore also matches static (dotted) Spoke paths, while `/_next/**` and the shared
 *     `/assets/**` platform namespace stay untouched.
 */
const INTERNAL_PREFIX = "/~spoke";
const SPOKE_ASSET_PREFIX = "/spokes/";

/** The marker the internal rewrite carries; the internal route refuses to render without it. */
export const INTERNAL_SPOKE_HEADER = "x-foundation-internal-spoke";

/** Nothing answers this request: no Spoke, never another Spoke's content. */
function refuse(): NextResponse {
  return new NextResponse("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

/** The Spoke answering the CURRENT host, or `null` (multi: exact claims; single: the sole entry). */
function selectedEntry(
  routing: ReturnType<typeof hostRoutingForBuild>,
  host: string | null,
): SpokeHostRoutingEntry | null {
  if (routing.mode === "multi") {
    const selection = spokeSelectionForHost(routing, host);
    if (selection === null) return null;
    return routing.spokes.find((spoke) => spoke.id === selection.spokeId) ?? null;
  }

  // ONE-Spoke compatibility: the build published exactly one entry, so there is nothing to choose.
  return routing.spokes.length === 1 ? routing.spokes[0] : null;
}

/** Internally rewrite a public path to the selected Spoke's runtime namespace. */
function rewriteInto(request: NextRequest, entry: SpokeHostRoutingEntry): NextResponse {
  const url = request.nextUrl.clone();
  const suffix = url.pathname === "/" ? "" : url.pathname;
  url.pathname = `${INTERNAL_PREFIX}/${entry.runtimeSegment}${suffix}`;
  const rewriteHeaders = new Headers({ [INTERNAL_SPOKE_HEADER]: entry.runtimeSegment });
  return NextResponse.rewrite(url, { request: { headers: rewriteHeaders } });
}

/** A Spoke's own artwork is served ONLY on a host that Spoke answers for. */
function spokeAsset(request: NextRequest): NextResponse {
  const routing = hostRoutingForBuild();
  const segment = decodeURIComponent(request.nextUrl.pathname.split("/").filter(Boolean)[1] ?? "");
  const entry = selectedEntry(routing, request.headers.get("host"));

  if (entry === null || entry.runtimeSegment !== segment) return refuse();
  return NextResponse.next();
}

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const query = searchParams.toString() === "" ? "" : `?${searchParams.toString()}`;

  // 1 — the internal namespace is reachable ONLY through the rewrite below.
  if (pathname === INTERNAL_PREFIX || pathname.startsWith(`${INTERNAL_PREFIX}/`)) return refuse();

  // 2 — a Spoke's own asset namespace is host-bound (static paths included — see the matcher).
  if (pathname.startsWith(SPOKE_ASSET_PREFIX)) return spokeAsset(request);

  // 3 — which Spoke answers this host: exact claims in multi mode, nothing when unclaimed.
  const routing = hostRoutingForBuild();
  const entry = selectedEntry(routing, request.headers.get("host"));
  if (entry === null) return refuse();

  // 4 — hand the PUBLIC path to that Spoke's internal route; the browser URL never changes.
  const rewritten = rewriteInto(request, entry);
  if (query !== "") rewritten.headers.set("x-foundation-query", query);
  return rewritten;
}

export const config = {
  /**
   * `/_next/**` stays entirely outside this boundary, as does every path that looks like a static file —
   * EXCEPT a Spoke's own asset namespace, which must be checked on a dotted path too (M16).
   */
  matcher: ["/((?!_next|.*\\..*).*)", "/spokes/:path*"],
};
