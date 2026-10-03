import type { MetadataRoute } from "next";

import type { SpokeRuntimeContext } from "@/config/installation-runtime";

/**
 * THE ROBOTS OF ONE SPOKE CONTEXT (FOUNDATION-MULTISITE-M14)
 * ========================================================
 *
 * The one Spoke-specific fact in `robots.txt` is the SITEMAP ORIGIN, and it belongs to the context being
 * served: the accepted rules stay identical (`*` may crawl everything, exactly as before), while the sitemap
 * URL is built from `context.siteConfig.url` — never from a module-global configuration. Two contexts
 * therefore advertise their OWN sitemap, proved for two disposable Installations in
 * `tests/unit/robots-context.test.ts`.
 */
export function robotsForContext(context: SpokeRuntimeContext): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${context.siteConfig.url}/sitemap.xml`,
  };
}
