import { Analytics } from "@vercel/analytics/react";

/**
 * Vercel Web Analytics adapter.
 *
 * Mounted by framework code when `features.analytics.provider` is
 * `"vercel"` in `site.config.json`. Downstream clones wanting a different
 * provider implement their own adapter here and adjust the composition.
 */
export function VercelAnalytics() {
  return <Analytics />;
}