#!/usr/bin/env node
/**
 * THE RELEASE IDENTITY FACADE FOR THE TOOLING (FOUNDATION-R1C-N1 / B4A-A2)
 * ======================================================================
 *
 * The release identity CONTRACT is not owned here: it is pure release knowledge and it lives in the domain
 *
 *     src/core/foundation-release/identity.mjs
 *
 * so that the lifecycle domain (`src/core/foundation-installation`) and this tooling consume ONE authority
 * and `src/core/**` never depends on `scripts/**` (FOUNDATION-B4A-A2). This module is the tooling's own
 * door to it:
 *
 *   · it RE-EXPORTS the contract unchanged, so every existing caller, test and documented procedure keeps
 *     importing the same names from the same path;
 *   · it owns the ONE thing the contract deliberately refuses to own — "NOW". `foundationReleaseIdentityForPublication`
 *     is the publisher boundary's convenience: the contract formats a GIVEN moment deterministically, and
 *     this facade is where a caller says "name this release as of this instant".
 *
 * WHAT IS *NOT* HERE: publication. This module decides what a tag may BE; it never creates one. The tag is
 * made at the FINAL publication boundary (R1C) — after construction, the clean room, the canary and every
 * gate — immediately before the irreversible step, and the collision policy for that moment is documented
 * in `README.md` (orchestrated publication serialises and waits for the next available UTC minute; a direct
 * attempt whose identity already exists fails closed; nothing here sleeps, blocks or retries).
 */
import { foundationReleaseIdentityForPublicationMoment } from "../../src/core/foundation-release/identity.mjs";

export {
  FOUNDATION_INITIAL_RELEASE_IDENTITY,
  FOUNDATION_RELEASE_IDENTITY_CONTRACT,
  FOUNDATION_RELEASE_IDENTITY_PATTERN,
  FOUNDATION_RELEASE_IDENTITY_PREFIX,
  assertReleaseIdentity,
  foundationReleaseIdentityForPublicationMoment,
  isPublishableFoundationReleaseIdentity,
  isRecognizedFoundationReleaseIdentity,
  readFoundationReleasePublicationMoment,
} from "../../src/core/foundation-release/identity.mjs";

/**
 * The canonical identity for the publication moment, defaulting to the actual current instant.
 *
 * The clock read is HERE, at the tooling's boundary, and nowhere inside the contract: the identity of a
 * release records a real UTC publication minute, so somebody has to say what time it is — and that
 * somebody is the publisher, not the pure contract.
 *
 * @param {Date} [moment] the publication moment; defaults to now
 * @returns {string} the canonical identity, e.g. `provelopment-foundation-v20261003.1427`
 */
export function foundationReleaseIdentityForPublication(moment = new Date()) {
  return foundationReleaseIdentityForPublicationMoment(moment);
}
