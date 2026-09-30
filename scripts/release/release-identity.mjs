#!/usr/bin/env node
/**
 * THE RELEASE IDENTITY AUTHORITY (FOUNDATION-R1C-N1)
 * ==================================================
 *
 * A Foundation release is identified by an immutable tag, and there are exactly THREE classes of
 * tag-shaped name in this repository — never two, never "whatever Git happens to have":
 *
 *   historical checkpoint tags      v<YYYY.MM.DD>-foundation-<slug>
 *                                   immutable historical EVIDENCE; not release identities
 *
 *   the FIRST immutable release     v2026.09.30-foundation-release-initial
 *                                   GRANDFATHERED: published before this convention existed, and it stays
 *                                   the identity the Foundation Template's baseline adopts
 *
 *   every FUTURE release            provelopment-foundation-vYYYYMMDD.HHMM
 *                                   the canonical identity established by the owner (2026-09-30)
 *
 *   `YYYYMMDD.HHMM` = the UTC release-publication minute. UTC is part of the contract: not the
 *   repository machine's local time, not the operator's timezone, not a deployment's timezone.
 *   Seconds are intentionally omitted and NOTHING is appended — no `Z`, no offset, no counter.
 *
 * TWO QUESTIONS, TWO ANSWERS
 * ==========================
 *
 *   "is this a recognized immutable Foundation release?"
 *        `isRecognizedFoundationReleaseIdentity` — the grandfathered first release, plus canonical
 *        identities. This is what a BASELINE RECORD, a manifest and verification ask: a published
 *        release keeps its identity forever, so a later naming decision must never invalidate the
 *        first release.
 *
 *   "may a NEW release be published under this name?"
 *        `isPublishableFoundationReleaseIdentity` — canonical identities ONLY. The grandfather is an
 *        exact literal, so its SHAPE is not reusable and no old-style
 *        (`v<date>-foundation-release-<slug>`) name is accepted indefinitely.
 *
 * Validation is SEMANTIC, not a regex alone: the timestamp is parsed and checked as a real UTC
 * calendar instant — month 01–12, a day that exists in that month and year, hour 00–23, minute 00–59.
 * `...v20261301.1200`, `...v20260931.1200`, `...v20260930.2460` and `...v20260930.1261` are refused.
 *
 * Collision is not a naming problem to solve here, and never by adjusting the name: the minute is the
 * ACTUAL UTC publication minute, so seconds, counters, `.01`, `Z`, offsets, deletion, recreation and
 * repointing are all forbidden. Resolution has two layers (FOUNDATION-R1C-N1-A1): ORCHESTRATED
 * publication serialises queued releases and waits for the next genuinely available UTC minute before it
 * derives an identity, while a DIRECT publication attempt whose exact canonical identity already exists
 * FAILS CLOSED. The authoritative race boundary is the remote tag itself, and nothing in this layer
 * sleeps, blocks or retries — queueing is orchestration, above deterministic construction and
 * verification. See `README.md` for the contract the future publisher must implement.
 *
 * This module decides what a tag may BE. It never creates one: publication belongs to the release
 * process (R1C), which names the identity at the FINAL publication boundary — after construction, the
 * clean room, the canary and every gate — immediately before the irreversible tag step.
 */

/**
 * The prefix every future Foundation release identity carries.
 *
 * The identity is deliberately self-describing (`provelopment-foundation-`): it names the platform
 * authority and the exact UTC publication minute, so a consumer never has to ask which repository or
 * which day a release came from.
 */
export const FOUNDATION_RELEASE_IDENTITY_PREFIX = "provelopment-foundation-v";

/**
 * The canonical identity SHAPE — `provelopment-foundation-vYYYYMMDD.HHMM`.
 *
 * Shape alone is not acceptance: the captured timestamp is validated as a real UTC instant by
 * `readFoundationReleasePublicationMoment`, which is the ONE predicate both public questions use.
 */
export const FOUNDATION_RELEASE_IDENTITY_PATTERN = /^provelopment-foundation-v(\d{4})(\d{2})(\d{2})\.(\d{2})(\d{2})$/;

/** A short statement of the canonical contract, for messages and documentation. */
export const FOUNDATION_RELEASE_IDENTITY_CONTRACT = "provelopment-foundation-vYYYYMMDD.HHMM in UTC";

/** The grandfathered first immutable Foundation release. An exact identity, never a pattern. */
export const FOUNDATION_INITIAL_RELEASE_IDENTITY = "v2026.09.30-foundation-release-initial";

/**
 * Read a canonical identity's UTC publication minute.
 *
 * @param {unknown} identity the candidate identity
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number } | null}
 *          the UTC publication minute, or `null` when the identity is not a real canonical identity
 */
export function readFoundationReleasePublicationMoment(identity) {
  const match = FOUNDATION_RELEASE_IDENTITY_PATTERN.exec(String(identity ?? "").trim());
  if (match === null) return null;

  const [year, month, day, hour, minute] = [match[1], match[2], match[3], match[4], match[5]].map(Number);
  // A UTC instant built from the parts, compared back: `Date.UTC` normalises out-of-range values
  // (month 13, day 31 in September, hour 24) instead of refusing them, so the comparison IS the
  // calendar check — including leap years, which no table in this module could keep honest.
  const instant = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const exists =
    instant.getUTCFullYear() === year &&
    instant.getUTCMonth() === month - 1 &&
    instant.getUTCDate() === day &&
    instant.getUTCHours() === hour &&
    instant.getUTCMinutes() === minute;
  return exists ? { year, month, day, hour, minute } : null;
}

/**
 * May a NEW release be published under this identity? Canonical identities only.
 *
 * @param {unknown} identity the candidate identity
 * @returns {boolean} true when the identity is publishable
 */
export function isPublishableFoundationReleaseIdentity(identity) {
  return readFoundationReleasePublicationMoment(identity) !== null;
}

/**
 * Is this a recognized immutable Foundation release? The grandfathered first release, or canonical.
 *
 * @param {unknown} identity the candidate identity
 * @returns {boolean} true when the identity names an immutable Foundation release
 */
export function isRecognizedFoundationReleaseIdentity(identity) {
  const candidate = String(identity ?? "").trim();
  return candidate === FOUNDATION_INITIAL_RELEASE_IDENTITY || isPublishableFoundationReleaseIdentity(candidate);
}

/**
 * Assert an identity is a recognized immutable Foundation release.
 *
 * The message keeps the phrase "is not a contract release identity" — it is what the construction and
 * CLI contracts already assert — while naming the canonical alternative a caller should have used.
 *
 * @param {unknown} identity the candidate identity
 * @returns {string} the identity, when recognized
 */
export function assertReleaseIdentity(identity) {
  const candidate = String(identity ?? "").trim();
  if (!isRecognizedFoundationReleaseIdentity(candidate)) {
    throw new Error(
      `FOUNDATION-R1C-N1: "${candidate}" is not a contract release identity. A Foundation release is ` +
        `identified by the canonical ${FOUNDATION_RELEASE_IDENTITY_CONTRACT} — or, for the first release ` +
        `only, by the grandfathered ${FOUNDATION_INITIAL_RELEASE_IDENTITY}. The historical ` +
        "v<YYYY.MM.DD>-foundation-<slug> checkpoints are evidence, not releases.",
    );
  }
  return candidate;
}

/**
 * The canonical identity for a publication moment: the UTC calendar date and minute, seconds dropped.
 *
 * @param {Date} [moment] the publication moment; defaults to now
 * @returns {string} the canonical identity, e.g. `provelopment-foundation-v20261003.1427`
 */
export function foundationReleaseIdentityForPublication(moment = new Date()) {
  const pad = (/** @type {number} */ value, /** @type {number} */ width) => String(value).padStart(width, "0");
  const identity =
    `${FOUNDATION_RELEASE_IDENTITY_PREFIX}${pad(moment.getUTCFullYear(), 4)}` +
    `${pad(moment.getUTCMonth() + 1, 2)}${pad(moment.getUTCDate(), 2)}.` +
    `${pad(moment.getUTCHours(), 2)}${pad(moment.getUTCMinutes(), 2)}`;
  // The authority must accept what it produces: if this ever fails, the contract and the formatter have
  // drifted apart, and no release should be named by a formatter the authority would refuse.
  return assertReleaseIdentity(identity);
}
