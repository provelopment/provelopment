import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ClientRoutingProvider } from "@/components/site/client-routing-context";
import { buildClientRoutingContext } from "@/components/site/client-routing";
import { siteConfig } from "@/config";
import { siteSetOf } from "@/core/site";

/**
 * THE COMPATIBILITY ROUTING PROJECTION, FOR TESTS (FOUNDATION-MULTISITE-M14)
 * ==========================================================================
 *
 * M14 removed the module-global Spoke configuration from the four routing controls: they now read the
 * SERVER's `ClientRoutingContext` through the ONE client transport (`./client-routing-context`). A test that
 * renders such a control directly — not through `SiteHeader`/`SiteFooter`/the document composition, which
 * provide it themselves — supplies the SAME compatibility bindings this deployment's single-Spoke build
 * projects, so every existing expectation stays meaningful while the boundary stays explicit.
 *
 * A test that IS about context isolation builds the projection from an explicit `SpokeRuntimeContext` instead
 * (see `tests/unit/context-metadata-isolation.test.ts`).
 */
export const compatibilityClientRouting = buildClientRoutingContext(
  siteConfig,
  siteSetOf(siteConfig.sites, siteConfig.defaultSite),
);

/** Wrap a node in the ONE client transport, using the compatibility projection. */
export function withClientRouting(node: ReactNode): ReactNode {
  return (
    <ClientRoutingProvider routing={compatibilityClientRouting}>{node}</ClientRoutingProvider>
  );
}

/** `renderToStaticMarkup`, for a control that resolves its own destinations. */
export function renderWithRouting(node: ReactNode): string {
  return renderToStaticMarkup(withClientRouting(node));
}
