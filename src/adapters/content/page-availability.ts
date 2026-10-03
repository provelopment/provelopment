/**
 * THE PAGE-AVAILABILITY PORT, ANSWERED BY THE PAGE COMPOSITION (FOUNDATION-S1E2)
 * =============================================================================
 *
 * `@/application/site-switch` must know whether a TARGET SITE has a page before it offers that
 * route as a switch destination — without knowing anything about content folders, authoring modes
 * or precedence. This adapter is that seam: it binds the port to the ONE page composition
 * (`./page-sources`), so availability is decided by the SAME resolution rules every page request
 * uses (JSON over Markdown, exact over fallback, INSIDE the site's own tree).
 *
 * The port is therefore satisfied by the composition and not by a second inventory: what the
 * switcher offers is what the page route would actually serve.
 */
import type { PageAvailability } from "@/application/site-switch";
import type { ResolvedSite } from "@/core/site";

import type { PageAuthoringRoots } from "./authoring-source-discovery";
import { createPageSources } from "./page-sources";

export interface PageAvailabilityOptions {
  /** The deployment's resolved sites — only a declared site can answer at all. */
  readonly sites: readonly ResolvedSite[];
  /**
   * M13 — THE AUTHORED PAGE ROOTS THIS AVAILABILITY READS (absent → the ACTIVE deployment's, exactly as
   * before). A context-bound caller supplies that context's own `SpokeResourcePaths`, so a Site-switch
   * decision for one context can never be answered out of another context's page tree: the port stays the
   * SAME composition (`./page-sources`), only the tree it reads is named.
   */
  readonly roots?: PageAuthoringRoots;
}

export function createPageAvailability(options: PageAvailabilityOptions): PageAvailability {
  const sources = createPageSources({ sites: options.sites, roots: options.roots });

  return {
    async hasPage(siteCode, routePath, localePath) {
      // A source that EXISTS but cannot be interpreted still throws (loudly, naming the file):
      // availability asks whether a page resolves, never whether it can be read quietly.
      return (await sources.resolve(siteCode, routePath, localePath)) !== null;
    },
  };
}
