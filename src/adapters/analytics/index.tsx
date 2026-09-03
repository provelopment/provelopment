import type { ReactNode } from "react";

import type { AnalyticsConfig } from "@/config";
import { AnalyticsMisconfigurationError } from "@/core/analytics";
import { VercelAnalytics } from "./vercel-analytics";

export { VercelAnalytics } from "./vercel-analytics";
export { AnalyticsMisconfigurationError } from "@/core/analytics";

/**
 * Resolves the configured analytics provider to an already-composed component
 * (or nothing), so the framework layer renders an integration without knowing
 * which provider supplied it.
 *
 * The factory only SELECTS the adapter; the adapter owns provider behaviour.
 * A missing `features.analytics` block, or an explicit `provider: "none"`, is
 * the intentional disabled state (no analytics, site works normally). Adding a
 * future provider is a config enum extension + a new adapter branch here —
 * never an application/layout rewrite.
 *
 * A CONFIGURED-but-broken provider must fail loudly, never silently mount
 * nothing: a provider value that reaches this factory with no registered
 * adapter throws `AnalyticsMisconfigurationError`. (The config schema rejects
 * unknown providers at build time; this factory throw is the defensive runtime
 * contract and the unit-tested path.)
 *
 * Privacy/security: this mounts provider-supplied instrumentation exactly as
 * before; it introduces no new data collection.
 */
export function createAnalyticsProvider(config: AnalyticsConfig | undefined): ReactNode {
  const provider = config?.provider;
  if (provider === undefined || provider === "none") return null;
  if (provider === "vercel") return <VercelAnalytics />;

  throw new AnalyticsMisconfigurationError(
    `features.analytics.provider is "${provider}" but no analytics adapter is registered. ` +
      "Supported providers: vercel, none. Add an adapter + factory branch for the provider, " +
      'or set the provider to "none". Analytics will never silently disappear.',
  );
}