import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { currentBuildRuntimeContext } from "@/config/installation-runtime";
import { hostRoutingForBuild } from "@/config/spoke-routing";

import {
  pageForContext,
  pageMetadataForContext,
  spokeServerComposition,
  staticParamsForContext,
} from "./server-composition";

/**
 * THE ONE PAGE ROUTE — the COMPATIBILITY CALLER of the shared server composition (FOUNDATION-MULTISITE-M13)
 * =========================================================================================================
 *
 * A page's identity is `site + locale + routePath`, and its PUBLIC URL is the content path itself — the site
 * CODE first, then the locale path key:
 *
 *   content/pages/markdown/ca/en/about.md  → /ca/en/about
 *   content/pages/markdown/fr/fr/about.md  → /fr/fr/about
 *
 * ONE route serves every page of every site: the URL is resolved to exactly ONE site context and the page
 * composition is then asked for that site alone. There is no route per site, no route per language and no
 * second inventory — an offering, an article, a policy document, an "About" page and a regional (location)
 * page are all PAGES, resolved by the SAME composition in the SAME declared order with the SAME
 * JSON-over-Markdown precedence.
 *
 * WHY `dynamicParams = false`: only the routes the build DISCOVERED are served, so an unknown path, site or
 * locale is a proper 404 rather than a page rendered on demand. Route discovery (the authoring trees + the
 * site configuration) is the one inventory, and the sitemap the routes share.
 *
 * WHERE THE RULES LIVE NOW (M13). This file chooses the context ONCE, at the application/build boundary —
 * `currentBuildRuntimeContext()`, the accepted one-Spoke compatibility seam — and hands it to
 * `./server-composition`, which composes the page, its metadata and its static parameters from that context's
 * OWN configuration, dictionary access, asset resolver and authored trees. The rendering rules did not move
 * into this file, and this file holds no module-global Spoke authority: the public route is the compatibility
 * caller, the composition is shared, and a second context can be composed in the same process without
 * editing either.
 */

interface PageRouteProps {
  readonly params: Promise<{ readonly segments?: string[] }>;
}

/**
 * Every (site, locale, route) the build discovered, as ONE static-parameter list — the same inventory the
 * sitemap uses, for the CURRENT BUILD's context (the accepted one-Spoke seam). Multi-Spoke multiplication by
 * runtime segment is later milestone work.
 */
export async function generateStaticParams(): Promise<{ segments: string[] }[]> {
  // M16 — a MULTI-Spoke Installation has no single public context: its pages are rendered per host inside the
  // selected Spoke's own namespace (`/~spoke/<segment>/…`), so this compatibility route generates NOTHING and
  // refuses below rather than choosing a Spoke.
  if (hostRoutingForBuild().mode === "multi") return [];
  return staticParamsForContext(spokeServerComposition(currentBuildRuntimeContext()));
}

export async function generateMetadata({ params }: PageRouteProps): Promise<Metadata> {
  if (hostRoutingForBuild().mode === "multi") notFound();
  return pageMetadataForContext(
    spokeServerComposition(currentBuildRuntimeContext()),
    (await params).segments,
  );
}

export default async function PageRoute({ params }: PageRouteProps) {
  if (hostRoutingForBuild().mode === "multi") notFound();
  return pageForContext(
    spokeServerComposition(currentBuildRuntimeContext()),
    (await params).segments,
  );
}
