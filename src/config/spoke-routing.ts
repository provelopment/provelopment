/**
 * THE CURRENT BUILD'S HOSTNAME ROUTING, AND WHICH SPOKE ANSWERS A HOST (FOUNDATION-MULTISITE-M16)
 * ==============================================================================================
 *
 * The REQUEST BOUNDARY's authority — and, deliberately, a PURE one: it reads the routing description the
 * build resolved and inlined (`./spoke-host-routing.mjs` ← `./deployment-build.mjs` ← `next.config.ts`),
 * derives each Spoke's exact hostname claims through the ONE pure `origin → hostname` step
 * (`@/core/spoke`'s `hostnameFromOrigin`), and answers the ONE question a request has:
 *
 *     given a raw `Host` header, which Spoke answers — or none?
 *
 * NO FILESYSTEM, NO CONFIGURATION PARSE, NO REQUEST OBJECT. That is what makes this module usable from the
 * proxy: the boundary never parses `site.config.json`, never discovers a Spoke root, never reads a
 * dictionary and never needs a page. It holds no mutable selection state either — the table is a value and a
 * decision is a pure function of it — so two Spokes cannot influence each other's answer.
 *
 * NO DEFAULT SPOKE, ANYWHERE. `spokeSelectionForHost` reuses the accepted exact-match decision
 * (`@/core/spoke`'s `resolveSpokeFromHost`) over the claims derived above: a host no Spoke claims answers
 * `null`. `single` mode means "the Installation declares exactly ONE Spoke" — the same fact the accepted
 * `currentBuildRuntimeContext()` relies on — never "the first Spoke".
 */
import {
  hostnameFromOrigin,
  resolveSpokeFromHost,
  type Hostname,
  type SpokeHub,
  type SpokeSelection,
} from "@/core/spoke";

/**
 * The build-time environment name this module READS, spelled here exactly as the build publishes it
 * (`./deployment-build.mjs`'s `DEPLOYMENT_HOST_ROUTING_ENV`). It is declared locally rather than imported
 * because that module is the FILESYSTEM-using build harness: importing it would drag `node:fs` into this
 * client-safe, request-boundary module.
 */
const DEPLOYMENT_HOST_ROUTING_ENV = "FOUNDATION_DEPLOYMENT_HOST_ROUTING";

/** How many Spokes this build serves: the ONE-Spoke compatibility runtime, or hostname dispatch. */
export type HostRoutingMode = "single" | "multi";

/** ONE Spoke's request-routing identity: who it is, its internal segment, and the hosts it claims. */
export interface SpokeHostRoutingEntry {
  readonly id: string;
  readonly runtimeSegment: string;
  /** The authored absolute origin its claims derive from. */
  readonly canonicalOrigin: string;
  /** The EXACT normalized hostnames it answers for (never a wildcard, never a suffix rule). */
  readonly hostnameClaims: readonly Hostname[];
}

/** The build's immutable hostname routing description. */
export interface InstallationHostRouting {
  readonly mode: HostRoutingMode;
  readonly spokes: readonly SpokeHostRoutingEntry[];
}

/** One entry's claims: `origin → hostname`, through the ONE pure step; an unusable origin claims nothing. */
function claimsFor(origin: string, where: string): readonly Hostname[] {
  if (origin === "") return [];
  const hostname = hostnameFromOrigin(origin);
  if (hostname === null) {
    throw new Error(
      `FOUNDATION-MULTISITE-M16: ${where}: the authored origin "${origin}" yields no usable hostname, so ` +
        "no request could ever be routed to it.",
    );
  }
  return [hostname];
}

let cached: InstallationHostRouting | null = null;

/**
 * The current build's hostname routing.
 *
 * An empty value means a build that inlined NO routing description — a legacy unit-test import, or a
 * repository that has not been built: `single` with no entries, which resolves no host at all. Nothing is
 * guessed from the absence.
 */
export function hostRoutingForBuild(): InstallationHostRouting {
  if (cached !== null) return cached;

  const raw = process.env[DEPLOYMENT_HOST_ROUTING_ENV]?.trim() ?? "";
  if (raw === "") {
    cached = Object.freeze({ mode: "single" as const, spokes: Object.freeze([]) });
    return cached;
  }

  let parsed: { mode?: unknown; spokes?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `FOUNDATION-MULTISITE-M16: the build's hostname routing description is not valid JSON: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const mode: HostRoutingMode = parsed.mode === "multi" ? "multi" : "single";
  const rawSpokes = Array.isArray(parsed.spokes) ? parsed.spokes : [];

  const spokes: SpokeHostRoutingEntry[] = rawSpokes.map((entry) => {
    const spoke = entry as { id?: unknown; segment?: unknown; canonicalOrigin?: unknown };
    if (
      typeof spoke.id !== "string" ||
      typeof spoke.segment !== "string" ||
      typeof spoke.canonicalOrigin !== "string"
    ) {
      throw new Error(
        "FOUNDATION-MULTISITE-M16: the build's hostname routing description is malformed — every entry " +
          "needs an id, a runtime segment and a canonical origin.",
      );
    }
    return Object.freeze({
      id: spoke.id,
      runtimeSegment: spoke.segment,
      canonicalOrigin: spoke.canonicalOrigin,
      hostnameClaims: claimsFor(spoke.canonicalOrigin, `Spoke "${spoke.id}"`),
    });
  });

  cached = Object.freeze({ mode, spokes: Object.freeze(spokes) });

  // MULTI — hostname dispatch: a Spoke that claims NO host can never be selected, so an Installation that
  // declares several Spokes must have an authored canonical origin for every one of them. Refusing HERE (with
  // the Spoke named) keeps "which Spoke answers this host?" answerable for every declared Spoke, instead of
  // silently leaving one unreachable. A ONE-Spoke Installation is unaffected: it never consults a hostname.
  if (mode === "multi") {
    for (const spoke of spokes) {
      if (spoke.hostnameClaims.length === 0) {
        throw new Error(
          `FOUNDATION-MULTISITE-M16: Spoke "${spoke.id}" declares no canonical origin, so no hostname ` +
            "could ever select it in a multi-Spoke Installation. Author its `site.url` (the origin its " +
            "hostname claim derives from); there is no default Spoke to fall back to.",
        );
      }
    }
  }

  return cached;
}

/** The entry with this identity OR this runtime segment, or `null` — the internal route's ONE lookup. */
export function routingEntryFor(
  routing: InstallationHostRouting,
  key: string,
): SpokeHostRoutingEntry | null {
  return routing.spokes.find((spoke) => spoke.id === key || spoke.runtimeSegment === key) ?? null;
}

/**
 * WHICH SPOKE ANSWERS A REQUEST HOST, or `null`.
 *
 * The decision is the accepted domain one — exact normalized equality over the claims the build derived —
 * reached through `resolveSpokeFromHost` over a Hub-shaped projection of THIS description, so the request
 * boundary and the configuration layer cannot disagree about what "this Spoke claims this host" means.
 * There is no wildcard, no suffix rule, no implicit subdomain and no default Spoke.
 */
export function spokeSelectionForHost(
  routing: InstallationHostRouting,
  host: string | null | undefined,
): SpokeSelection | null {
  const hub: SpokeHub = {
    spokes: routing.spokes.map((spoke) => ({
      identity: {
        id: spoke.id,
        canonicalHostname: spoke.hostnameClaims[0],
        hostnameClaims: spoke.hostnameClaims,
      },
      hubs: [],
    })),
  };

  return resolveSpokeFromHost(hub, host);
}

