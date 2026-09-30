import { describe, expect, it } from "vitest";

import {
  FOUNDATION_INITIAL_RELEASE_IDENTITY,
  FOUNDATION_RELEASE_IDENTITY_CONTRACT,
  FOUNDATION_RELEASE_IDENTITY_PREFIX,
  foundationReleaseIdentityForPublication,
  isPublishableFoundationReleaseIdentity,
  isRecognizedFoundationReleaseIdentity,
  readFoundationReleasePublicationMoment,
} from "../../scripts/release/release-identity.mjs";

/**
 * THE RELEASE IDENTITY CONVENTION (FOUNDATION-R1C-N1)
 * ==================================================
 *
 * One authority answers two different questions, and these tests keep them apart:
 *
 *   `isRecognizedFoundationReleaseIdentity`  — an immutable Foundation release EXISTS under this name.
 *                                             It accepts the grandfathered first release
 *                                             (`v2026.09.30-foundation-release-initial`) and canonical
 *                                             identities, so a later naming decision can never
 *                                             invalidate the release a deployment already adopted.
 *   `isPublishableFoundationReleaseIdentity` — a NEW release may be published under this name.
 *                                             Canonical identities ONLY; the grandfather is an exact
 *                                             literal, never a reusable shape.
 *
 * The canonical identity is `provelopment-foundation-vYYYYMMDD.HHMM`, where the timestamp is the UTC
 * release-publication minute: UTC is part of the contract, seconds are omitted, and nothing is appended
 * (no `Z`, no offset, no counter). Validation is semantic, so the timestamp must be a real UTC instant.
 */

describe("the release identity authority", () => {
  it("recognizes the canonical UTC identity AND the grandfathered first release", () => {
    const recognized = [
      FOUNDATION_INITIAL_RELEASE_IDENTITY,
      "provelopment-foundation-v20260930.0000",
      "provelopment-foundation-v20260930.2359",
      "provelopment-foundation-v20261231.1427",
      "provelopment-foundation-v20280229.1200",
      "provelopment-foundation-v20990101.0000",
    ];
    for (const identity of recognized) {
      expect(isRecognizedFoundationReleaseIdentity(identity), identity).toBe(true);
    }
  });

  it("recognizes ONLY canonical identities as publishable — the grandfather is never a new-release name", () => {
    expect(isPublishableFoundationReleaseIdentity(FOUNDATION_INITIAL_RELEASE_IDENTITY)).toBe(false);
    expect(isPublishableFoundationReleaseIdentity("provelopment-foundation-v20261003.1427")).toBe(true);

    // The grandfather is an exact identity, not a pattern: no old-style
    // (`v<date>-foundation-release-<slug>`) name is accepted, so the old contract cannot creep back.
    for (const oldStyle of [
      "v2099.01.01-foundation-release-r1b-test",
      "v2026.10.01-foundation-release-whatever",
      "v2026.09.30-foundation-release-initial",
    ]) {
      expect(isPublishableFoundationReleaseIdentity(oldStyle), oldStyle).toBe(false);
      expect(isRecognizedFoundationReleaseIdentity(oldStyle), oldStyle).toBe(
        oldStyle === FOUNDATION_INITIAL_RELEASE_IDENTITY,
      );
    }
  });

  it("refuses every name that is not an immutable Foundation release", () => {
    const notReleases = [
      "",
      "main",
      "HEAD",
      "origin/main",
      "refs/tags/provelopment-foundation-v20260930.1200",
      "v1.2.3",
      "release/provelopment-foundation-v20260930.1200",
      "e4978ab59d3c27f775aa3a342d3b951032baf018",
      // Historical checkpoint tags are immutable EVIDENCE — never release identities.
      "v2026.09.27-foundation-two-mode-pages",
      "v2026.09.27-foundation-markdown-single-h1",
    ];
    for (const candidate of notReleases) {
      expect(isRecognizedFoundationReleaseIdentity(candidate), candidate).toBe(false);
      expect(isPublishableFoundationReleaseIdentity(candidate), candidate).toBe(false);
    }
  });

  it("refuses canonical-looking names that break the shape — prefix, minute, suffix, format", () => {
    const malformed = [
      "v20260930.1200", // missing the platform prefix
      "foundation-v20260930.1200", // wrong prefix
      "provelopment-v20260930.1200", // wrong prefix
      "provelopment-foundation-v2026-09-30.1200", // a dashed date is not the canonical timestamp
      "provelopment-foundation-v20260930", // missing `.HHMM`
      "provelopment-foundation-v202609301200", // missing the separator
      "provelopment-foundation-v20260930.1200Z", // a `Z` is never appended
      "provelopment-foundation-v20260930.1200+0700", // an offset is never appended
      "provelopment-foundation-v20260930.120000", // seconds are omitted
      "provelopment-foundation-v20260930.1200-1", // no counter
      "provelopment-foundation-v20260930.1200.1", // no counter
      "provelopment-foundation-v20260930.12", // HHMM is four digits
      "provelopment-foundation-v2026123a.1200", // the timestamp is digits
      "provelopment-foundation-v20260930.12OO", // …including the time
    ];
    for (const candidate of malformed) {
      expect(isPublishableFoundationReleaseIdentity(candidate), candidate).toBe(false);
      expect(isRecognizedFoundationReleaseIdentity(candidate), candidate).toBe(false);
    }
  });

  it("refuses impossible calendar dates and clock times — the timestamp is a real UTC instant", () => {
    const impossible = [
      "provelopment-foundation-v20261301.1200", // month 13
      "provelopment-foundation-v20260931.1200", // 31 September
      "provelopment-foundation-v20260230.1200", // 30 February
      "provelopment-foundation-v20260229.1200", // 2026 is not a leap year
      "provelopment-foundation-v20260000.1200", // month 0
      "provelopment-foundation-v20260900.1200", // day 0
      "provelopment-foundation-v20260930.2400", // hour 24
      "provelopment-foundation-v20260930.2460", // hour 24, minute 60
      "provelopment-foundation-v20260930.0060", // minute 60
      "provelopment-foundation-v20260930.1261", // minute 61
    ];
    for (const candidate of impossible) {
      expect(isPublishableFoundationReleaseIdentity(candidate), candidate).toBe(false);
      expect(readFoundationReleasePublicationMoment(candidate), candidate).toBeNull();
    }

    // …and a real leap day is accepted, so the check is a calendar, not a table of month lengths.
    expect(isPublishableFoundationReleaseIdentity("provelopment-foundation-v20280229.1200")).toBe(true);
  });

  it("names a moment from its UTC minute, dropping the seconds and ignoring the input's offset", () => {
    expect(readFoundationReleasePublicationMoment("provelopment-foundation-v20261231.1427")).toEqual({
      year: 2026,
      month: 12,
      day: 31,
      hour: 14,
      minute: 27,
    });

    // The offset in the instant is resolved to UTC — the identity is never the operator's local minute.
    expect(foundationReleaseIdentityForPublication(new Date("2026-09-30T21:27:11+07:00"))).toBe(
      "provelopment-foundation-v20260930.1427",
    );
    // Both ends of a UTC day are ordinary, and seconds never reach the identity.
    expect(foundationReleaseIdentityForPublication(new Date(Date.UTC(2026, 8, 30, 23, 59, 59)))).toBe(
      "provelopment-foundation-v20260930.2359",
    );
    expect(foundationReleaseIdentityForPublication(new Date(Date.UTC(2026, 9, 1, 0, 0, 30)))).toBe(
      "provelopment-foundation-v20261001.0000",
    );

    // The authority accepts what the formatter produces — contract and formatter cannot drift apart.
    for (const moment of [new Date(Date.UTC(2026, 0, 1, 0, 0)), new Date(Date.UTC(2099, 11, 31, 23, 59))]) {
      const identity = foundationReleaseIdentityForPublication(moment);
      expect(identity.startsWith(FOUNDATION_RELEASE_IDENTITY_PREFIX)).toBe(true);
      expect(isPublishableFoundationReleaseIdentity(identity), identity).toBe(true);
    }

    expect(FOUNDATION_RELEASE_IDENTITY_CONTRACT).toContain("provelopment-foundation-vYYYYMMDD.HHMM");
  });
});
