/**
 * Maps integration domain model (Phase H, Tier 1).
 *
 * Framework-free and provider-agnostic. A maps integration is an OPTIONAL
 * capability: the Foundation provides the seam, and a provider produces a
 * directions link from an already locale-resolved `BusinessLocation`.
 * Providers are replaceable without touching core/application/UI code.
 *
 * The important distinction: a deep-link "Get directions" provider must NOT
 * require an API key. A public address/coordinate appearing in a URL is safe.
 * If a future provider requires credentials, it introduces its own
 * environment-backed configuration without contaminating this common contract.
 */
export type MapsProvider = "google" | "none";

/** `features.maps` in `site.config.json` (validated by the config schema). */
export interface MapsFeatureConfig {
  readonly provider: MapsProvider;
}
