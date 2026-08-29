import type { ReactNode } from "react";

import type { AnalyticsConfig } from "@/config";
import { VercelAnalytics } from "./vercel-analytics";

export { VercelAnalytics } from "./vercel-analytics";

/**
 * Resolves the configured analytics provider to an already-composed component
 * (or nothing), so the framework layer renders an integration without knowing
 * which provider supplied it.
 *
 * The factory only SELECTS the adapter; the adapter owns provider behaviour.
 * A missing `features.analytics` block is the intentional disabled state (no
 * analytics, site works normally). Adding a future provider is a config enum
 * extension + a new adapter branch here — never an application/layout rewrite.
 *
 * Privacy/security: this mounts provider-supplied instrumentation exactly as
 * before; it introduces no new data collection.
 */
export function createAnalyticsProvider(config: AnalyticsConfig | undefined): ReactNode {
  if (!config) return null;
  if (config.provider === "vercel") return <VercelAnalytics />;
  return null;
}