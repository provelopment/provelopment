/**
 * SPOKE IDENTITY (FOUNDATION-MULTISITE-S3C1) — the TYPED SURFACE
 * ==============================================================
 *
 * The identity rules themselves live in `./spoke-id.mjs`, as plain ESM, because three consumers need the
 * same answers and one of them (`src/config/deployment-build.mjs`) runs where TypeScript cannot be
 * executed: this module, the S3C1 configuration authority (`src/config/spoke-roots.ts`) and the build
 * selection seam all consume that ONE implementation, so a build can never select a Spoke the domain
 * refuses. See that file for the contract (the reserved id, the identity rules and what is deliberately
 * not an identity question).
 *
 * This module keeps the TYPED surface the platform imports (`@/core/spoke`), so no consumer changes.
 */
import type { SpokeId } from "./model";

export { IMPLICIT_SPOKE_ID, spokeCollectionIssues } from "./spoke-id.mjs";

/** Re-exported so the id type stays the one this module always published. */
export type { SpokeId };
