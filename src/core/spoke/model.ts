/**
 * THE SPOKE / HUB DOMAIN MODEL (FOUNDATION-MULTISITE-S1)
 * =====================================================
 *
 * FOUR containers, and they are NOT each other:
 *
 *   Spoke Hub   coordinates the installation's Spokes        (1..* Spokes)
 *   Spoke       ONE independently addressable domain          (1..* Hubs)
 *   Hub         an internal grouping of Sites in one Spoke    (1..* Sites — modelled later)
 *   Site        the EXISTING Foundation `sites[]` context     (unchanged; owned by `@/core/site`)
 *
 * WHY THE FOUR LEVELS ARE NOT COLLAPSED
 * -------------------------------------
 * A Site is Foundation's own long-standing context (`ww`, `de`, `ca`, …). A Hub groups Sites and is
 * NOT publicly addressable. A Spoke is the DOMAIN boundary — the context a request hostname resolves
 * to — and owns its Hubs. The Spoke Hub coordinates the Spokes. Collapsing any two of these would
 * make a hostname, a website grouping and a country context the same word, which is precisely the
 * ambiguity this vocabulary exists to remove.
 *
 * A SPOKE IS THE DOMAIN, SO IT CARRIES THE HOSTNAMES
 * --------------------------------------------------
 * A Spoke owns its canonical hostname and every EXACT hostname it answers for (`hostnameClaims`).
 * That is what makes `hostname → Spoke` a total, pure decision (`./resolve`) and what keeps a Hub
 * free of any public address.
 *
 * THIS SLICE MODELS CONTAINERS, NOT CONTENT
 * -----------------------------------------
 * A `Hub` carries an identity and nothing else: its Sites, assets, configuration, locales, pages and
 * routing are LATER slices and are deliberately absent, so this module cannot influence the released
 * Foundation at all. A `Spoke` carries an identity plus its Hubs; a `SpokeHub` carries its Spokes. The
 * `1..*` cardinality of the RESOLVED domain model is expressed by the pure coherence rules
 * (`./coherence`) — never by filesystem state, because authored material may legitimately be
 * incomplete.
 *
 * Framework-neutral: pure types only. No filesystem, no configuration, no request.
 */
import type { Hostname } from "./hostname";

/** A Spoke's stable identifier. */
export type SpokeId = string;

/** A Hub's stable identifier, unique within its Spoke. */
export type HubId = string;

/** WHICH Hub this is — its identity, never a path and never a hostname. */
export interface HubIdentity {
  readonly id: HubId;
}

/**
 * A HUB: the internal container of Sites inside ONE Spoke.
 *
 * It has NO public address. A Hub is reached through a Site — a `/<site>` URL segment names a Site,
 * and the Site's membership identifies its Hub — never through a hostname and never through a Hub
 * path segment. This slice gives it an identity and nothing more.
 */
export interface Hub {
  readonly identity: HubIdentity;
}

/**
 * WHICH Spoke this is: its identity, its canonical hostname, and every exact hostname it answers for.
 *
 * `canonicalHostname` is the domain's canonical origin host — the host every canonical URL, sitemap
 * entry and social card is built from — and it MUST appear in `hostnameClaims`; a Spoke whose
 * canonical host it does not claim is reported by `./coherence`.
 *
 * `hostnameClaims` lists every hostname the domain answers for, canonical first by convention: the
 * canonical host plus any exact aliases (`www.example.com` and `example.com` are two claims of ONE
 * domain). Ownership is EXPLICIT and EXACT — claiming `example.com` never claims
 * `foundation.example.com` or any other name beneath it, so those names stay available to other
 * domains.
 */
export interface SpokeIdentity {
  readonly id: SpokeId;
  readonly canonicalHostname: Hostname;
  readonly hostnameClaims: readonly Hostname[];
}

/** A SPOKE: ONE independently addressable domain, owning `1..*` Hubs. */
export interface Spoke {
  readonly identity: SpokeIdentity;
  readonly hubs: readonly Hub[];
}

/**
 * THE SPOKE HUB: the outer coordinator of an installation's Spokes.
 *
 * It owns the `hostname → Spoke` decision (`./resolve`), which is why the collection lives here and
 * is not a free-floating registry: the thing that answers "which domain is this request for?" is the
 * thing that holds the domains.
 */
export interface SpokeHub {
  readonly spokes: readonly Spoke[];
}
