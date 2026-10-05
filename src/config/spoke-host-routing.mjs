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
 *   inspection        the EXPLICIT inspection policy (M20 §29): the Spoke that represents this
 *                     Installation on an accepted hosting-platform inspection hostname, plus the
 *                     hostnames the PLATFORM ITSELF reports for this deployment
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
import { hostnameFromOrigin } from "../core/spoke/hostname.mjs";

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
 *
 * Its `inspection` block is the ONLY place the three classes of hostname stay distinguishable, because
 * they are decided by three different rules and only one of them is authored material:
 *
 *   authored Spoke hostnames   a Spoke's own `site.url` (in `spokes`, above) — tested FIRST, so nothing
 *                              here can ever take a real Spoke's own hostname away from it;
 *   `platformHostnames`       what the HOSTING PLATFORM reported for THIS build (Vercel's deployment,
 *                              branch and production values) — different in every deployment and short
 *                              lived;
 *   `authoredHostnames`       the deployment-owned aliases the Installation declares — permanent,
 *                              first-party hosts that no Spoke owns publicly.
 *
 * `hostnames` is their UNION, deduplicated in that order: the one list the request boundary matches a
 * request host against, exactly.
 *
 * @typedef {object} InstallationHostRouting
 * @property {HostRoutingMode} mode
 * @property {SpokeHostRoutingEntry[]} spokes
 * @property {InstallationHostRoutingInspection | null} inspection
 */

/**
 * The Installation's explicit inspection policy as the build resolved it, or `null`.
 *
 * @typedef {object} InstallationHostRoutingInspection
 * @property {string} spokeId the Spoke the collection nominates for inspection hostnames
 * @property {string[]} hostnames platform-reported ∪ authored aliases, deduplicated — what is matched
 * @property {string[]} platformHostnames the hostnames the platform reported for THIS build
 * @property {string[]} authoredHostnames the deployment-owned aliases the Installation declared
 */

/**
 * @typedef {object} InstallationHostRoutingInspection
 * @property {string} spokeId the declared inspection Spoke (`inspectionSpoke` in the collection)
 * @property {string[]} hostnames the hostnames the HOSTING PLATFORM reports for this deployment
 */

/**
 * THE HOSTING PLATFORM'S OWN INSPECTION HOSTNAMES (M20 §20–§23), READ — NEVER INVENTED.
 *
 * The platform supplies these for the deployment it is BUILDING, so this build can recognise the
 * addresses the platform itself publishes for it:
 *
 *   VERCEL_URL                     this deployment's own unique URL
 *   VERCEL_BRANCH_URL              the branch URL that always points at the branch's latest deployment
 *   VERCEL_PROJECT_PRODUCTION_URL  the project's production URL
 *
 * WHY THIS IS SAFE, AND WHY THERE IS NO WILDCARD
 * ----------------------------------------------
 *   · every value is IMMUTABLE provider data for the build in progress — no Vercel API is called, at
 *     build time or at request time, and no provider setting is read or written;
 *   · recognition is EXACT equality against those values, so `*.vercel.app` is NOT accepted: an
 *     unrelated project's Vercel URL is a hostname this build was never told about;
 *   · the values are published VERBATIM and normalized at the request boundary by the ONE pure
 *     `origin → hostname` step, so no second hostname rule is declared here.
 *
 * A build with none of them set (a local build, a unit test) recognises no inspection hostname at all,
 * which is why the policy is inert locally and precise on the platform.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function inspectionHostnamesFromPlatform(env) {
  /** @type {string[]} */
  const hostnames = [];
  for (const name of ["VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"]) {
    const value = env[name];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed === "" || hostnames.includes(trimmed)) continue;
    hostnames.push(trimmed);
  }
  return hostnames;
}

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
 * one Spoke): the sole entry is the Spoke that answers, so no inspection policy is consulted or needed.
 * `multi` is hostname dispatch — and there is no "first" entry to fall back to, because a request that
 * claims no hostname answers NOTHING.
 *
 * THE INSPECTION POLICY (M20 §20–§41, M22 correction). An Installation may be reached through hosts that
 * no Spoke owns publicly, and they come from TWO sources — the hosting platform's own deployment/branch
 * URL, which the platform reports to the build (`inspectionHostnamesFromPlatform`), and the
 * deployment-owned ALIASES the Installation declares in its manifest (`inspectionHosts`, the permanent
 * project alias a provider keeps for this project, for instance). Every such hostname selects the Spoke
 * the manifest EXPLICITLY nominates (`inspectionSpoke`) — never the first declared one, never a wildcard,
 * never a provider-wide rule. Three consequences are enforced HERE, at build time, because all three are
 * configuration defects rather than request-time surprises:
 *
 *   · platform-reported inspection hostnames WITHOUT a declared policy → LOUD failure: nothing would say
 *     which Spoke an operator is inspecting, and choosing one would be exactly the implicit default this
 *     platform refuses;
 *   · a policy naming a Spoke that is not declared → refused by `resolveSpokeDeclarations`, which knows
 *     the declared set — and so is an authored alias list with no nominated Spoke, which could only ever
 *     be a silent no-op;
 *   · an authored alias that restates a Spoke's OWN hostname → refused here, because an authored claim
 *     always wins and the alias would quietly mean nothing while reading as if it meant something.
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

  const mode = spokes.length > 1 ? "multi" : "single";
  const platformHostnames = inspectionHostnamesFromPlatform(process.env);
  const authoredHostnames = resolved.inspectionHosts;

  if (mode === "multi" && platformHostnames.length > 0 && resolved.inspectionSpoke === null) {
    throw new Error(
      "FOUNDATION-MULTISITE-M20: this multi-Spoke Installation is being built on a hosting platform " +
        `that reports its own inspection hostnames (${platformHostnames.join(", ")}), but the ` +
        "collection declares no \"inspectionSpoke\". State which Spoke represents this Installation on " +
        "such a hostname — there is no default, and no Spoke is ever chosen by manifest order.",
    );
  }

  // AN AUTHORED ALIAS MAY NEVER RESTATE A SPOKE'S OWN HOSTNAME (M22 correction). The request boundary
  // already tests authored claims FIRST, so an alias can never actually take a Spoke's hostname away from
  // it — which is exactly why declaring one is a configuration defect rather than a harmless duplicate:
  // the alias would silently do nothing while reading as if it did something. The comparison uses the ONE
  // `origin → hostname` rule (`../core/spoke/hostname.mjs`), the same rule the request boundary applies,
  // so the build cannot accept an alias the runtime would resolve differently.
  for (const alias of authoredHostnames) {
    const owner = spokes.find((spoke) => hostnameFromOrigin(spoke.canonicalOrigin) === alias);
    if (owner !== undefined) {
      throw new Error(
        `FOUNDATION-MULTISITE-M22: the inspection alias "${alias}" is already the authored hostname of ` +
          `Spoke "${owner.id}". A Spoke's own hostname always selects that Spoke, so an inspection alias ` +
          "may never restate or shadow one — remove the alias, or declare a hostname that Spoke does not " +
          "already answer for.",
      );
    }
  }

  // THE ONE LIST THE BOUNDARY MATCHES: platform-reported first, then the authored aliases, deduplicated —
  // a provider value that happens to equal an authored alias (the project's production URL, say) is ONE
  // hostname, and order is deterministic either way.
  /** @type {string[]} */
  const hostnames = [];
  for (const value of [...platformHostnames, ...authoredHostnames]) {
    if (!hostnames.includes(value)) hostnames.push(value);
  }

  return {
    mode,
    spokes,
    inspection:
      resolved.inspectionSpoke === null
        ? null
        : {
            spokeId: resolved.inspectionSpoke,
            hostnames,
            platformHostnames,
            authoredHostnames,
          },
  };
}
