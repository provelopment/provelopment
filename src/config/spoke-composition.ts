/**
 * COMPOSING THE INSTALLATION'S SPOKES (FOUNDATION-MULTISITE-S3D1A)
 * ==============================================================
 *
 * Turns the Installation's DECLARED Spoke roots (S3C1) into its configured DOMAIN Spokes, and those into the
 * Installation's ONE Spoke Hub:
 *
 *     InstallationSpokeRoots
 *             ↓  read <descriptor.root>/site.config.json   (./spoke-config — the second sanctioned reader)
 *     SiteConfig                      (the EXISTING semantic authority: ./loader's parseSiteConfig)
 *             ↓  canonical hostname from THIS Spoke's site.url      (ONE authored canonical origin)
 *     Spoke { id, canonicalHostname, hostnameClaims: [canonical], hubs: config.hubs }
 *             ↓  descriptor (= authored manifest) order
 *     SpokeHub  →  spokeHubIssues(...)  ← the PURE coherence contract decides every cross-Spoke rule
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ----------------------------------
 * It resolves no Site (that already happened ONCE per Spoke inside `parseSiteConfig`), creates no default
 * Hub and no default Site, merges no Hubs and no Sites across Spokes, invents no Spoke id (identity comes
 * from the manifest, never from a file, a hostname or a directory name), authors no alias, and restates no
 * coherence rule: `spokeHubIssues` alone decides "one hostname belongs to one Spoke", "exactly one default
 * Site per Spoke", per-Spoke Hub/Site uniqueness and "the same Site code in two Spokes is valid".
 *
 * UNWIRED (S3D1A). Nothing in `src/app/**`, `src/components/**`, `src/proxy.ts` or the current build imports
 * this module: the running application still requires ONE globally inlined configuration, so there is no
 * valid "first" or "default" Spoke to select. Making an Installation whose Spokes this composes the SERVED
 * one is later work (per-Spoke runtime isolation), and hostname-aware edge selection is later still.
 */
import {
  hostnameFromOrigin,
  spokeHubIssues,
  type Hostname,
  type Spoke,
  type SpokeHub,
} from "@/core/spoke";

import type { SiteConfig } from "./site-config";
import { readSpokeSiteConfig, spokeConfigFilePath } from "./spoke-config";
import type { InstallationSpokeRoots, SpokeRootDescriptor } from "./spoke-roots";

/**
 * The ONE canonical hostname of a Spoke, derived from that Spoke's own authored origin.
 *
 * There is no second place a canonical hostname may be authored: `site.url` is the deployment's canonical
 * origin (`./schema` guarantees an absolute URL without a trailing slash), the pure domain's
 * `hostnameFromOrigin` is the ONE `origin → normalized hostname` step (`@/core/spoke`), and this function
 * only turns a domain-level `null` into the loud failure an authored configuration defect deserves.
 */
export function canonicalHostnameForSpoke(config: SiteConfig, where: string): Hostname {
  const canonicalHostname = hostnameFromOrigin(config.url);

  if (canonicalHostname === null) {
    throw new Error(
      `${where}: the configuration's url "${config.url}" yields no usable hostname — an internal/` +
        "configuration defect, since the schema guarantees an absolute origin.",
    );
  }

  return canonicalHostname;
}

/**
 * ONE configured domain Spoke: the manifest's identity, the configuration's canonical origin, and that
 * Spoke's OWN Hubs.
 *
 * Pure and free of filesystem concerns — it reads no file and resolves no Site. `config.hubs` is carried
 * through BY IDENTITY (S3B's ownership view of the very `ResolvedSite` values `resolveSites` produced), so
 * nothing is cloned, reconstructed or re-partitioned here.
 */
export function configureSpoke(descriptor: SpokeRootDescriptor, config: SiteConfig): Spoke {
  const canonicalHostname = canonicalHostnameForSpoke(
    config,
    `Spoke "${descriptor.id}" (${descriptor.root})`,
  );

  return {
    identity: {
      id: descriptor.id,
      canonicalHostname,
      // Exactly ONE claim: the canonical hostname this Spoke answers for. Alias authoring is later work, and
      // nothing here may imply it (no alias field, no wildcard, no suffix or regex claim).
      hostnameClaims: [canonicalHostname],
    },
    hubs: config.hubs,
  };
}

/**
 * The Installation's ONE Spoke Hub: every declared Spoke, configured and proved coherent.
 *
 * Descriptor order (the authored manifest order, or the single legacy descriptor) is preserved exactly, so
 * the result is deterministic and independent of the filesystem.
 */
export function composeInstallationSpokeHub(roots: InstallationSpokeRoots): SpokeHub {
  const spokes = roots.mode === "legacy" ? [composeLegacySpoke(roots)] : composeExplicitSpokes(roots);
  const spokeHub: SpokeHub = { spokes };

  // EVERY cross-Spoke rule is the pure domain's: one hostname belongs to one Spoke, each Spoke claims its
  // canonical host, each Spoke owns at least one Hub with unique ids, a Site code is unique WITHIN a Spoke
  // (and may repeat across Spokes), and exactly one Site per Spoke is its default. Never restated here.
  const issues = spokeHubIssues(spokeHub);
  if (issues.length > 0) {
    throw new Error(
      `Invalid Installation Spoke Hub (${roots.installationRoot}):\n` +
        issues.map((issue) => `  - ${issue}`).join("\n"),
    );
  }

  return spokeHub;
}

/**
 * The LEGACY implicit Spoke: the Installation root IS the Spoke root, and its configuration is the one the
 * build already selected.
 *
 * A failure here is reported EXACTLY as it is today — the underlying `parseSiteConfig` message is not wrapped
 * in Spoke terminology — so an existing deployment's diagnostics do not change.
 */
function composeLegacySpoke(roots: InstallationSpokeRoots): Spoke {
  const [descriptor] = roots.descriptors;
  if (descriptor === undefined || roots.descriptors.length !== 1) {
    throw new Error(
      `FOUNDATION-MULTISITE-S3D1A: legacy mode yields exactly ONE implicit Spoke descriptor, but ` +
        `${roots.descriptors.length} were given — ./spoke-roots is what decides that.`,
    );
  }

  return configureSpoke(descriptor, readSpokeSiteConfig(descriptor));
}

/**
 * Every declared Spoke, configured in descriptor (= authored manifest) order.
 *
 * ONE failure never hides another: they are all collected and reported together, each naming the Spoke, its
 * authored root, its configuration file and the underlying issue — and then the whole composition fails
 * closed. There is no partial Spoke Hub, and nothing is repaired, defaulted or skipped.
 */
function composeExplicitSpokes(roots: InstallationSpokeRoots): Spoke[] {
  const spokes: Spoke[] = [];
  const failures: string[] = [];

  for (const descriptor of roots.descriptors) {
    try {
      spokes.push(configureSpoke(descriptor, readSpokeSiteConfig(descriptor)));
    } catch (error) {
      failures.push(spokeFailure(descriptor, error));
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Invalid Installation Spoke configuration (${roots.manifestFile ?? roots.installationRoot}):\n` +
        failures.map((failure) => `  - ${failure}`).join("\n"),
    );
  }

  return spokes;
}

/** ONE Spoke's failure, in the terms its author needs to fix it (Spoke, root, file, underlying issue). */
function spokeFailure(descriptor: SpokeRootDescriptor, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const details = message
    .split(/\r?\n/)
    .map((line) => `      ${line}`)
    .join("\n");

  return (
    `Spoke "${descriptor.id}" authored at "${descriptor.root}" ` +
    `(${spokeConfigFilePath(descriptor)}):\n${details}`
  );
}
