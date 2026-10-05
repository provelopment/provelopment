/**
 * HOSTNAMES AND HOSTNAME CLAIMS (FOUNDATION-MULTISITE-S1) — THE TYPED SURFACE
 * ==========================================================================
 *
 * The normalized-hostname value and its pure rules live in `./hostname.mjs`, as plain ESM, because the
 * BUILD seam needs the same answers and runs where TypeScript cannot be executed: the request boundary
 * (`@/config/spoke-routing`), the configuration layer (`@/config/spoke-composition`) and the build's
 * routing-description seam (`@/config/spoke-host-routing.mjs`) all consume that ONE implementation, so a
 * build can never accept or refuse a hostname the runtime would decide differently. See that file for
 * the contract (normalization, exact ownership and what is deliberately not a hostname rule).
 *
 * This module keeps the TYPED surface the platform imports (`@/core/spoke`), so no consumer changes.
 */
import type { Hostname as NormalizedHostname } from "./hostname.mjs";

export { normalizeHostname, hostnameFromOrigin } from "./hostname.mjs";

/** Re-exported so the hostname type stays the one `@/core/spoke` always published. */
export type Hostname = NormalizedHostname;
