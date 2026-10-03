import type { MetadataRoute } from "next";

import { currentBuildRuntimeContext } from "@/config/installation-runtime";

import { robotsForContext } from "./robots-context";

/**
 * `robots.txt` — a thin Next BOUNDARY (M14)
 * ========================================
 *
 * The accepted crawl rules are unchanged (`*` may crawl everything). The ONE Spoke-specific fact — the
 * sitemap origin — now comes from the current build's explicit context through `robotsForContext`, so no
 * module-global configuration answers it.
 */
export default function robots(): MetadataRoute.Robots {
  return robotsForContext(currentBuildRuntimeContext());
}
