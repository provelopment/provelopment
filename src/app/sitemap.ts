import type { MetadataRoute } from "next";

import { currentBuildRuntimeContext } from "@/config/installation-runtime";

import { sitemapForContext } from "./sitemap-context";

/**
 * The deployment's XML sitemap — a thin Next BOUNDARY (M14)
 * =======================================================
 *
 * The inventory and the canonical origin belong to ONE explicit Spoke context; this file only selects the
 * current build's context (the accepted one-Spoke compatibility seam) and returns `sitemapForContext`. There
 * is no second inventory: `./sitemap-context` composes the entries from that context's own sites, bindings,
 * origin and authored page roots through the SAME page composition every page route resolves with.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return sitemapForContext(currentBuildRuntimeContext());
}
