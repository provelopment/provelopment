import { describe, expect, it } from "vitest";

import {
  INSTALLATION_ATTEMPT_KINDS,
  INSTALLATION_FAILURE_CATEGORIES,
  beginInstallationPromotion,
  completeInstallationPromotion,
  failInstallationAttempt,
  installationOperationalStateIssues,
  initialInstallationOperationalState,
  recordInstallationCandidate,
  recordInstallationCandidateStaged,
  recordInstallationCandidateValidated,
  recordInstallationStagingInspected,
  startInstallationAttempt,
  type FoundationInstallationOperationalState,
  type InstallationAttemptKind,
  type InstallationCandidateIdentity,
} from "@/core/foundation-installation";
import type { FoundationReleaseReference } from "@/core/foundation-release/reference";

import {
  candidateIdentity,
  digest,
  installationIdentity,
  liveState,
  operationalState,
  releaseReference,
} from "../support/foundation-installation-fixture";

/**
 * M20 — UPDATE AND UPGRADE ARE DIFFERENT OPERATIONS (FOUNDATION-MULTISITE-M20)
 * =========================================================================
 *
 * The release decides which operation a lifecycle attempt is:
 *
 *   UPDATE    the live Foundation release is UNCHANGED; the Spokes' authored pages and assets change.
 *   UPGRADE   a DIFFERENT immutable Foundation release is adopted; authored state is carried forward.
 *
 * Both are installation-scoped: one installation has exactly ONE live Foundation release, so either
 * operation promotes every Spoke together. A request that contradicts the release is REFUSED rather than
 * recorded under the wrong name, because the lifecycle history is read as provenance.
 *
 * The load-bearing promises proved here are the failure ones: a failed update leaves the live revision
 * EXACTLY as it was, and a rollback after an update returns to the previous revision with the SAME release.
 */
const T = {
  attempt: "2026-10-03T09:00:00Z",
  prepared: "2026-10-03T09:05:00Z",
  validated: "2026-10-03T09:20:00Z",
  staged: "2026-10-03T09:30:00Z",
  inspected: "2026-10-03T09:40:00Z",
  promoting: "2026-10-03T09:45:00Z",
  live: "2026-10-03T09:50:00Z",
  failed: "2026-10-03T09:55:00Z",
} as const;

/** Every state this suite produces must be one the contract accepts — asserted on the way through. */
function valid(state: FoundationInstallationOperationalState): FoundationInstallationOperationalState {
  expect(installationOperationalStateIssues(state)).toEqual([]);
  return state;
}

/** A moment `shiftHours` after one of the phase instants: a LATER attempt really happens later. */
function moment(at: string, shiftHours: number): string {
  const shifted = new Date(new Date(at).getTime() + shiftHours * 3_600_000);
  return shifted.toISOString().replace(".000Z", "Z");
}

/** Start ONE attempt of `kind` towards `target`, or throw the refusal why it may not start. */
function start(
  state: FoundationInstallationOperationalState,
  kind: InstallationAttemptKind,
  target: FoundationReleaseReference,
  shift = 0,
): FoundationInstallationOperationalState {
  return startInstallationAttempt(state, { kind, target, at: moment(T.attempt, shift) });
}

/** An attempt of `kind` driven all the way to promotion with THIS candidate, so the revision changes. */
function promoted(
  state: FoundationInstallationOperationalState,
  kind: InstallationAttemptKind,
  target: FoundationReleaseReference,
  candidate: InstallationCandidateIdentity,
  shift = 0,
): FoundationInstallationOperationalState {
  const started = valid(start(state, kind, target, shift));
  const prepared = valid(recordInstallationCandidate(started, { candidate, at: moment(T.prepared, shift) }));
  const validated = valid(recordInstallationCandidateValidated(prepared, { at: moment(T.validated, shift) }));
  const staged = valid(recordInstallationCandidateStaged(validated, { at: moment(T.staged, shift) }));
  const inspected = valid(recordInstallationStagingInspected(staged, { at: moment(T.inspected, shift) }));
  const promoting = valid(beginInstallationPromotion(inspected, { at: moment(T.promoting, shift) }));
  return valid(completeInstallationPromotion(promoting, { candidate, at: moment(T.live, shift) }));
}

/** The revision a candidate would produce: the SAME release, different authored and materialized content. */
function changedAuthored(
  release: string,
  authoredSeed: string,
  materializedSeed: string,
): InstallationCandidateIdentity {
  // Both digests are the `sha256:<lowercase hex>` shape the contract requires — only the CONTENT differs.
  return candidateIdentity({ release, authored: digest(authoredSeed), materialized: digest(materializedSeed) });
}


describe("M20 — an Update changes authored state, an Upgrade changes the release", () => {
  it("refuses an update while nothing is live: a first activation is an install", () => {
    const fresh = initialInstallationOperationalState(installationIdentity());
    expect(() => start(fresh, "update", releaseReference())).toThrow(/nothing live to update/);
  });

  it("accepts an update whose target release IS the release already live", () => {
    const live = operationalState();
    const started = valid(start(live, "update", releaseReference({ tag: live.current.live?.release.tag })));
    expect(started.current.lastAttempt?.kind).toBe("update");
    expect(started.current.lastAttempt?.target.tag).toBe(live.current.live?.release.tag);
  });

  it("refuses an update that names a DIFFERENT release: that is an upgrade", () => {
    const live = operationalState();
    expect(() =>
      start(live, "update", releaseReference({ tag: "provelopment-foundation-v20990101.0000" })),
    ).toThrow(/is an upgrade/);
  });

  it("refuses an upgrade that names the release already live: that is an update", () => {
    const live = operationalState();
    expect(() => start(live, "upgrade", releaseReference({ tag: live.current.live?.release.tag }))).toThrow(
      /which is an update, not an upgrade/,
    );
  });

  it("accepts an upgrade to a DIFFERENT release", () => {
    const live = operationalState();
    const started = valid(
      start(live, "upgrade", releaseReference({ tag: "provelopment-foundation-v20990101.0000" })),
    );
    expect(started.current.lastAttempt?.kind).toBe("upgrade");
  });

  it("refuses an upgrade while nothing is live: a first activation is an install", () => {
    const fresh = initialInstallationOperationalState(installationIdentity());
    expect(() => start(fresh, "upgrade", releaseReference())).toThrow(/nothing live to upgrade/);
  });

  it("keeps the Foundation release unchanged across a successful update, and changes the revision", () => {
    const before = operationalState();
    const release = before.current.live?.release.tag ?? "";
    const after = promoted(before, "update", releaseReference({ tag: release }), changedAuthored(release, "c", "d"));

    // The RELEASE is what an update does not move…
    expect(after.current.live?.release).toEqual(before.current.live?.release);
    // …while the live REVISION is a different one, and the previous revision is kept for rollback.
    expect(after.current.live?.revision).not.toBe(before.current.live?.revision);
    expect(after.current.live?.previous?.revision).toBe(before.current.live?.revision);
    expect(after.current.live?.previous?.release).toEqual(before.current.live?.release);
  });

  it("leaves the live revision EXACTLY untouched when an update fails", () => {
    const before = operationalState();
    const release = before.current.live?.release.tag ?? "";
    const started = valid(start(before, "update", releaseReference({ tag: release })));
    const prepared = valid(
      recordInstallationCandidate(started, { candidate: changedAuthored(release, "e", "f"), at: T.prepared }),
    );
    const failed = valid(
      failInstallationAttempt(prepared, {
        category: INSTALLATION_FAILURE_CATEGORIES[2],
        message: "the installation's own validation refused the candidate",
        at: T.failed,
      }),
    );

    expect(failed.current.live).toEqual(before.current.live);
    expect(failed.current.lastAttempt?.outcome).toBe("failed");
  });

  it("returns to the previous revision on rollback after an update, with the SAME release", () => {
    const before = operationalState();
    const release = before.current.live?.release.tag ?? "";
    const updated = promoted(before, "update", releaseReference({ tag: release }), changedAuthored(release, "a", "e"));
    const previousRelease = updated.current.live?.previous?.release.tag ?? "";

    const rolledBack = promoted(
      updated,
      "rollback",
      releaseReference({ tag: previousRelease }),
      candidateIdentity({
        release: previousRelease,
        authored: candidateIdentity().authored,
        materialized: candidateIdentity().materialized,
      }),
      1,
    );

    // A rollback after a same-release update restores the PRIOR revision without moving the release.
    expect(rolledBack.current.live?.release.tag).toBe(release);
    expect(rolledBack.current.live?.revision).toBe(before.current.live?.revision);
  });
});

describe("M20 — ONE installation has ONE live Foundation release", () => {
  it("records exactly the four lifecycle kinds", () => {
    expect([...INSTALLATION_ATTEMPT_KINDS]).toEqual(["install", "update", "upgrade", "rollback"]);
  });

  it("has nowhere to record a per-Spoke release or a per-Spoke upgrade state", () => {
    // There is no per-Spoke Foundation version inside one installation: a Spoke owns pages, assets,
    // configuration and identity — never a release. The live record is the structural proof.
    expect(Object.keys(liveState()).sort()).toEqual(["activatedAt", "previous", "release", "revision"]);
    expect(Object.keys(liveState()).some((key) => /spoke/i.test(key))).toBe(false);
  });
});
