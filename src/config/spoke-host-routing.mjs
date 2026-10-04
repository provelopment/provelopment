/**
 * THE INSTALLATION'S HOSTNAME ROUTING TABLE (FOUNDATION-MULTISITE-M16)
 * ==================================================================
 *
 * ONE question, answered from ONE input, for the ONE consumer that may not read a configuration:
 *
 *     hostRoutingForInstallation(root)  ->  { mode, spokes: [ { id, segment, canonicalOrigin } ] }
 *
 * WHY IT EXISTS
 * -------------
 * Hostname dispatch happens at the REQUEST boundary, and that boundary must not parse `site.config.json`,
 * discover a Spoke root or re-implement an identity rule. It therefore consumes an IMMUTABLE routing
 * description the BUILD resolved from the accepted authorities and inlined — exactly the way the build
 * already inlines the selected configuration (`./deployment-build.mjs`) — and this module is the ONE place
 * that description is produced.
 *
 * WHAT IT MAY CONTAIN, AND WHAT IT DELIBERATELY DOES NOT
 * ------------------------------------------------------
 *   id                the Spoke's identity, exactly as the manifest declares it
 *   segment           `runtimeSegmentForSpokeId(id)` — the internal route namespace token
 *   canonicalOrigin   that Spoke's own authored `site.url` — the ONE origin its claims derive from
 *
 * It carries NO page content, NO dictionaries, NO filesystem path, NO Site or locale negotiation data and
 * NO duplicated `SiteConfig`: the request boundary needs to know WHICH Spoke answers a host and nothing
 * else, because Site/locale completion happens INSIDE the selected Spoke, where its fully resolved
 * configuration is already available. Reading a single JSON field (`site.url`) to name an origin is not a
 * second configuration authority: the runtime index still parses and validates every configuration, and a
 * configuration whose origin is missing or unusable is refused HERE, loudly, rather than guessed at.
 *
 * PLAIN ESM ON PURPOSE: the build seam (`./deployment-build.mjs` ← `next.config.ts`) runs under plain Node
 * and must not depend on a TypeScript compiler; the declaration and identity rules are not restated here
 * (they come from `./spoke-declarations.mjs` / the pure domain), so this module only composes them.
 *
 * SERVER/BUILD ONLY: it reads the filesystem.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { IMPLICIT_SPOKE_ID } from "../core/spoke/spoke-id.mjs";

import { resolveSpokeDeclarations, SPOKE_CONFIG_FILE_NAME } from "./spoke-declarations.mjs";
import { runtimeSegmentForSpokeId } from "./spoke-runtime-segment.mjs";

/**
 * How many Spokes a build serves: the ONE-Spoke compatibility runtime, or hostname dispatch (`multi`).
 * @typedef {"single" | "multi"} HostRoutingMode
 */

/**
 * ONE Spoke's request-routing identity.
 * @typedef {object} SpokeHostRoutingEntry
 * @property {string} id the Spoke's authored identity
 * @property {string} segment its runtime segment (`runtimeSegmentForSpokeId`)
 * @property {string} canonicalOrigin the authored absolute origin its hostname claims derive from
 */

/**
 * The Installation's immutable routing description.
 * @typedef {object} InstallationHostRouting
 * @property {HostRoutingMode} mode
 * @property {SpokeHostRoutingEntry[]} spokes
 */

/**
 * ONE Spoke root's authored canonical origin, or `""` when it authors none.
 *
 * A Spoke that declares no `site.url` has NO canonical hostname, and that is a meaningful state rather than a
 * broken file: a ONE-Spoke Installation never consults a hostname (its Spoke answers every host), so such an
 * Installation still runs. A MULTI-Spoke Installation, by contrast, cannot route a Spoke that claims no host,
 * and the runtime authority (`./spoke-routing`) is where that is refused — loudly and with the Spoke named.
 *
 * A configuration that is UNREADABLE (or not JSON) is always a loud failure: it is a defect, not a choice.
 *
 * @param {string} spokeRoot the resolved absolute Spoke root
 * @param {string} where the identity to name in a failure
 * @returns {string} the authored `site.url`, or `""`
 */
function canonicalOriginFor(spokeRoot, where) {
  const file = path.join(spokeRoot, SPOKE_CONFIG_FILE_NAME);

  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(
      `FOUNDATION-MULTISITE-M16: ${where}: "${file}" is not readable JSON, so no hostname routing ` +
        `description can be produced: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const origin =
    raw !== null && typeof raw === "object"
      ? /** @type {{ site?: { url?: unknown } }} */ (raw).site?.url
      : undefined;

  return typeof origin === "string" && origin.trim() !== "" ? origin : "";
}

/**
 * The routing description of ONE Installation root, in authored manifest order.
 *
 * `single` is the accepted ONE-Spoke runtime (legacy implicit, or an explicit manifest declaring exactly
 * one Spoke): the sole entry is the Spoke that answers. `multi` is hostname dispatch — and there is no
 * "first" entry to fall back to, because a request that claims no hostname answers NOTHING.
 *
 * @param {string} installationRoot the Installation root the build selected
 * @returns {InstallationHostRouting}
 */
export function hostRoutingForInstallation(installationRoot) {
  const resolved = resolveSpokeDeclarations(installationRoot);

  /** @type {{ id: string, root: string }[]} */
  const roots =
    resolved.mode === "legacy"
      ? [{ id: IMPLICIT_SPOKE_ID, root: resolved.installationRoot ?? installationRoot }]
      : resolved.declarations.map((declaration) => ({ id: declaration.id, root: declaration.root }));

  const spokes = roots.map((spoke) => ({
    id: spoke.id,
    segment: runtimeSegmentForSpokeId(spoke.id),
    canonicalOrigin: canonicalOriginFor(spoke.root, `Spoke "${spoke.id}"`),
  }));

  return { mode: spokes.length > 1 ? "multi" : "single", spokes };
}
