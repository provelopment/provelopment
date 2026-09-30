import { describe, expect, it } from "vitest";

import {
  DEPLOYMENT_HEALTH,
  DEPLOYMENT_LIFECYCLE_HISTORY_LIMIT,
  beginDeploymentPromotion,
  completeDeploymentPromotion,
  deploymentActivationState,
  deploymentOperationalStateIssues,
  failDeploymentAttempt,
  initialDeploymentOperationalState,
  isDeploymentAttemptPending,
  isDeploymentCandidatePromotable,
  recordDeploymentCandidate,
  recordDeploymentCandidateStaged,
  recordDeploymentCandidateValidated,
  recordDeploymentHealth,
  recordDeploymentStagingInspected,
  startDeploymentAttempt,
  type DeploymentAttemptKind,
  type DeploymentCandidateIdentity,
  type DeploymentOperationalState,
  type FoundationReleaseReference,
} from "@/core/deployment-lifecycle";

import {
  CANONICAL_RELEASE,
  NEXT_RELEASE,
  candidateIdentity,
  deploymentIdentity,
  operationalState,
  releaseReference,
} from "../support/deployment-lifecycle-fixture";

/**
 * THE LIFECYCLE'S LEGAL MOVES, AND WHAT A FAILED MOVE MAY NOT TOUCH (FOUNDATION-B4A)
 * ================================================================================
 *
 * The domain's promises are only worth what its transitions enforce, so every scenario below drives the
 * REAL transitions and then reads the record they produced. The load-bearing ones are the failure
 * semantics: a rejected candidate must not replace what is live, and must not turn a healthy deployment
 * OFFLINE — both are properties of the DOCUMENT, not of a log line.
 *
 * Every instant is passed in (nothing depends on a clock), and every state a transition produces is
 * checked for validity on the way through, so a transition that produced a contradictory record would fail
 * here rather than in production.
 */
const T = {
  attempt: "2026-10-02T10:00:00Z",
  prepared: "2026-10-02T10:05:00Z",
  validated: "2026-10-02T10:20:00Z",
  staged: "2026-10-02T10:30:00Z",
  inspected: "2026-10-02T10:40:00Z",
  promoting: "2026-10-02T10:45:00Z",
  live: "2026-10-02T10:50:00Z",
  failed: "2026-10-02T10:55:00Z",
  evaluated: "2026-10-02T11:00:00Z",
} as const;

/** Every state this suite produces must be one the contract accepts — asserted on the way through. */
function valid(state: DeploymentOperationalState): DeploymentOperationalState {
  expect(deploymentOperationalStateIssues(state)).toEqual([]);
  return state;
}

/** ONE step of an attempt, named so a test says where it wants the attempt and nothing else. */
const start = (
  state: DeploymentOperationalState,
  kind: DeploymentAttemptKind,
  target?: FoundationReleaseReference,
  shift = 0,
) => valid(startDeploymentAttempt(state, { kind, target: target ?? releaseReference(), at: moment(T.attempt, shift) }));
const prepared = (
  state: DeploymentOperationalState,
  candidate?: DeploymentCandidateIdentity,
  shift = 0,
) =>
  valid(
    recordDeploymentCandidate(state, {
      // A candidate contains the release the attempt ASKED for unless a test deliberately says otherwise.
      candidate: candidate ?? candidateIdentity({ release: state.current.lastAttempt?.target.tag ?? CANONICAL_RELEASE }),
      at: moment(T.prepared, shift),
    }),
  );
const validated = (state: DeploymentOperationalState, shift = 0) =>
  valid(recordDeploymentCandidateValidated(state, { at: moment(T.validated, shift) }));
const staged = (state: DeploymentOperationalState, shift = 0) =>
  valid(recordDeploymentCandidateStaged(state, { at: moment(T.staged, shift) }));
const inspected = (state: DeploymentOperationalState, shift = 0) =>
  valid(recordDeploymentStagingInspected(state, { at: moment(T.inspected, shift) }));
const promoting = (state: DeploymentOperationalState, shift = 0) =>
  valid(beginDeploymentPromotion(state, { at: moment(T.promoting, shift) }));
const becameLive = (state: DeploymentOperationalState, candidate?: DeploymentCandidateIdentity, shift = 0) =>
  valid(completeDeploymentPromotion(state, { candidate: candidate ?? candidateIdentity(), at: moment(T.live, shift) }));
const failed = (
  state: DeploymentOperationalState,
  category: Parameters<typeof failDeploymentAttempt>[1]["category"],
  shift = 0,
) => valid(failDeploymentAttempt(state, { category, message: `the ${category} step did not pass`, at: moment(T.failed, shift) }));

/** A moment `shiftHours` after one of the phase instants: a LATER attempt really happens later. */
function moment(at: string, shiftHours: number): string {
  const shifted = new Date(new Date(at).getTime() + shiftHours * 3_600_000);
  return shifted.toISOString().replace(".000Z", "Z");
}

/** A fresh, unestablished deployment with an attempt driven all the way to promotion. */
function promotable(candidate: DeploymentCandidateIdentity = candidateIdentity()): DeploymentOperationalState {
  return promoting(
    inspected(staged(validated(prepared(start(initialDeploymentOperationalState(deploymentIdentity()), "install"), candidate)))),
  );
}

/** An ESTABLISHED, healthy deployment: release A live, serving, with nothing in flight. */
const established = (): DeploymentOperationalState => valid(operationalState());

/** The kinds of a state's history, in order: the readable shape of "what happened". */
const historyTypes = (state: DeploymentOperationalState): string[] => state.history.map((entry) => entry.type);

describe("a fresh deployment establishes live identity and health by promoting one candidate", () => {
  it("starts unestablished, and NOTHING before promotion makes it live", () => {
    const fresh = initialDeploymentOperationalState(deploymentIdentity());
    expect(deploymentActivationState(fresh)).toBe("unestablished");

    const started = start(fresh, "install");
    expect(started.current.lastAttempt?.stage).toBe("preparing");
    expect(started.current.lastAttempt?.candidate).toBeNull();
    expect(isDeploymentAttemptPending(started)).toBe(true);
    expect(started.current.live).toBeNull();
    expect(started.current.health).toBe(DEPLOYMENT_HEALTH.OFFLINE);

    const withCandidate = prepared(started);
    expect(withCandidate.current.lastAttempt?.candidate).toEqual(candidateIdentity());
    expect(withCandidate.current.live).toBeNull();

    const validatedState = validated(withCandidate);
    expect(isDeploymentCandidatePromotable(validatedState)).toBe(false);
    expect(deploymentActivationState(validatedState)).toBe("unestablished");

    const stagedState = staged(validatedState);
    const inspectedState = inspected(stagedState);
    expect(isDeploymentCandidatePromotable(inspectedState)).toBe(true);
    expect(inspectedState.current.live).toBeNull();
    expect(inspectedState.current.health).toBe(DEPLOYMENT_HEALTH.OFFLINE);
  });

  it("becomes live and ONLINE when that candidate is promoted — and records how", () => {
    const live = becameLive(promotable());

    expect(deploymentActivationState(live)).toBe("active");
    expect(live.current.live?.release.tag).toBe(CANONICAL_RELEASE);
    expect(live.current.live?.revision).toBe(candidateIdentity().materialized);
    expect(live.current.live?.previous).toBeNull();
    expect(live.current.health).toBe(DEPLOYMENT_HEALTH.ONLINE);
    expect(live.current.healthEvaluatedAt).toBe(T.live);
    expect(live.current.lastAttempt?.stage).toBe("live");
    expect(live.current.lastAttempt?.outcome).toBe("succeeded");
    expect(live.current.lastAttempt?.endedAt).toBe(T.live);
    expect(isDeploymentAttemptPending(live)).toBe(false);
    expect(historyTypes(live)).toEqual([
      "attempt-started",
      "candidate-prepared",
      "candidate-validated",
      "candidate-staged",
      "candidate-inspected",
      "promoted",
      "health-online",
    ]);
  });

  it("keeps history bounded, dropping the OLDEST events and keeping current truth", () => {
    let state = established();
    const live = state.current.live;
    const base = new Date("2026-10-03T10:00:00Z").getTime();

    for (let step = 0; step < DEPLOYMENT_LIFECYCLE_HISTORY_LIMIT + 20; step += 1) {
      const at = new Date(base + step * 1000).toISOString().replace(".000Z", "Z");
      state = valid(recordDeploymentHealth(state, { health: step % 2 === 0 ? "offline" : "online", at }));
    }

    expect(state.history.length).toBe(DEPLOYMENT_LIFECYCLE_HISTORY_LIMIT);
    // Trimming the oldest events cannot lose current truth: the snapshot still names what is live.
    expect(state.current.live).toEqual(live);
    expect(state.current.lastAttempt).toEqual(established().current.lastAttempt);
    expect(state.current.health).toBe(DEPLOYMENT_HEALTH.ONLINE);
  });

  it("does not mutate the document it was given", () => {
    const before = established();
    const snapshot = structuredClone(before);

    recordDeploymentHealth(before, { health: "offline", at: T.evaluated });

    expect(before).toEqual(snapshot);
  });
});


describe("a failed candidate never moves the deployment", () => {
  it("a failed fresh install leaves an unestablished, OFFLINE deployment — recorded, not invented", () => {
    const failedInstall = failed(prepared(start(initialDeploymentOperationalState(deploymentIdentity()), "install")), "build");

    expect(failedInstall.current.live).toBeNull();
    expect(deploymentActivationState(failedInstall)).toBe("unestablished");
    expect(failedInstall.current.health).toBe(DEPLOYMENT_HEALTH.OFFLINE);
    expect(failedInstall.current.lastAttempt?.stage).toBe("failed");
    expect(failedInstall.current.lastAttempt?.outcome).toBe("failed");
    expect(failedInstall.current.lastAttempt?.failure).toEqual({
      category: "build",
      message: "the build step did not pass",
    });
    expect(historyTypes(failedInstall)).toEqual(["attempt-started", "candidate-prepared", "attempt-failed"]);

    // It cannot become live by accident: nothing is in flight, so promotion has nothing to promote.
    expect(() => becameLive(failedInstall)).toThrow(/no attempt in flight/);

    // …and the deployment is retryable, because the attempt was CLOSED rather than left pending.
    expect(start(failedInstall, "install", undefined, 1).current.lastAttempt?.outcome).toBe("pending");
  });

  it("a rejected upgrade leaves the LIVE release and its health exactly as they were", () => {
    const before = established();
    const attempting = prepared(start(before, "upgrade", releaseReference({ tag: NEXT_RELEASE })));

    const rejected = failed(attempting, "browser-acceptance");

    expect(rejected.current.live).toEqual(before.current.live);
    expect(rejected.current.health).toBe(DEPLOYMENT_HEALTH.ONLINE);
    expect(rejected.current.healthEvaluatedAt).toBe(before.current.healthEvaluatedAt);
    expect(rejected.current.lastAttempt?.target.tag).toBe(NEXT_RELEASE);
    expect(rejected.current.lastAttempt?.failure?.category).toBe("browser-acceptance");
    // The deployment is still what it was, and still serving: only the attempt changed.
    expect(deploymentActivationState(rejected)).toBe("active");
    expect(historyTypes(rejected).at(-1)).toBe("attempt-failed");
  });

  it("an attempt that got as far as promotion, then failed, still leaves the live release untouched", () => {
    const before = established();
    const attempting = promoting(
      inspected(staged(validated(prepared(start(before, "upgrade", releaseReference({ tag: NEXT_RELEASE })))))),
    );
    const rejected = failed(attempting, "promotion");

    expect(rejected.current.live).toEqual(before.current.live);
    expect(rejected.current.health).toBe(DEPLOYMENT_HEALTH.ONLINE);
    expect(isDeploymentAttemptPending(rejected)).toBe(false);
  });
});

describe("health describes the LIVE deployment, never an attempt", () => {
  it("a live-health failure does make a healthy deployment OFFLINE", () => {
    const before = established();
    const offline = valid(recordDeploymentHealth(before, { health: "offline", at: T.evaluated, detail: "the live site did not answer" }));

    expect(offline.current.health).toBe(DEPLOYMENT_HEALTH.OFFLINE);
    expect(offline.current.healthEvaluatedAt).toBe(T.evaluated);
    // The release is still what is live: OFFLINE says it is not serving, not that it was never deployed.
    expect(offline.current.live).toEqual(before.current.live);
    expect(deploymentActivationState(offline)).toBe("active");
    expect(historyTypes(offline).at(-1)).toBe("health-offline");
    expect(offline.history.at(-1)?.detail).toBe("the live site did not answer");
  });

  it("refuses to record a deployment ONLINE while nothing is live", () => {
    const fresh = initialDeploymentOperationalState(deploymentIdentity());

    expect(() => recordDeploymentHealth(fresh, { health: "online", at: T.evaluated })).toThrow(/cannot be ONLINE/);
    expect(() => recordDeploymentHealth(established(), { health: "degraded" as never, at: T.evaluated })).toThrow(
      /online and offline only/,
    );
  });

  it("re-asserting the health a deployment already has updates the moment without inventing an event", () => {
    const before = established();
    const again = valid(recordDeploymentHealth(before, { health: "online", at: T.evaluated }));

    expect(again.current.healthEvaluatedAt).toBe(T.evaluated);
    expect(again.history).toEqual(before.history);
  });
});


describe("promotion promotes exactly the candidate that passed inspection", () => {
  it("records the validated candidate's revision as the live revision", () => {
    const candidate = candidateIdentity({ materialized: `sha256:${"7".repeat(64)}` });
    const live = becameLive(promotable(candidate), candidate);

    expect(live.current.live?.revision).toBe(candidate.materialized);
    expect(live.current.lastAttempt?.candidate).toEqual(candidate);
  });

  it("refuses a candidate that differs in its revision, its authored input or its release", () => {
    const state = promotable();

    expect(() => becameLive(state, candidateIdentity({ materialized: `sha256:${"8".repeat(64)}` }))).toThrow(
      /not the one this attempt validated and inspected/,
    );
    expect(() => becameLive(state, candidateIdentity({ authored: `sha256:${"9".repeat(64)}` }))).toThrow(
      /not the one this attempt validated and inspected/,
    );
    expect(() => becameLive(state, candidateIdentity({ release: NEXT_RELEASE }))).toThrow(
      /not the one this attempt validated and inspected/,
    );
    // The state itself is untouched: a refused promotion changes nothing.
    expect(state.current.live).toBeNull();
  });

  it("refuses to promote before inspection, and refuses a second promotion of the same attempt", () => {
    expect(() => becameLive(staged(validated(prepared(start(initialDeploymentOperationalState(deploymentIdentity()), "install")))))).toThrow(
      /cannot complete promotion/,
    );

    const live = becameLive(promotable());
    expect(() => becameLive(live)).toThrow(/no attempt in flight/);
  });
});

describe("rollback returns to the previously known-good live state", () => {
  /** An established deployment on release A that has already been upgraded to release B. */
  function upgradedToB(): DeploymentOperationalState {
    const withA = becameLive(promotable());
    const candidateB = candidateIdentity({ release: NEXT_RELEASE, materialized: `sha256:${"d".repeat(64)}` });
    const target = releaseReference({ tag: NEXT_RELEASE, commit: "3".repeat(40) });
    const attemptB = prepared(start(withA, "upgrade", target, 1), candidateB, 1);
    return becameLive(promoting(inspected(staged(validated(attemptB, 1), 1), 1), 1), candidateB, 1);
  }

  it("records the state it replaced as the rollback provenance", () => {
    const state = upgradedToB();

    expect(state.current.live?.release.tag).toBe(NEXT_RELEASE);
    expect(state.current.live?.previous?.release.tag).toBe(CANONICAL_RELEASE);
    expect(state.current.live?.previous?.revision).toBe(candidateIdentity().materialized);
    expect(state.current.live?.previous?.retiredAt).toBe(moment(T.live, 1));
  });

  it("accepts a rollback ONLY to that previous state, and completes it as a new live state", () => {
    const state = upgradedToB();

    // Any other release is an upgrade, not a rollback.
    expect(() => start(state, "rollback", releaseReference({ tag: NEXT_RELEASE }))).toThrow(/may only return to the previous live release/);
    expect(() => start(state, "rollback", releaseReference({ tag: "provelopment-foundation-v20261005.1200" }))).toThrow(
      /may only return to the previous live release/,
    );

    const rollingBack = startedRollback(state);
    const rolledBack = becameLive(rollingBack, candidateIdentity({ release: CANONICAL_RELEASE }), 2);

    expect(rolledBack.current.live?.release.tag).toBe(CANONICAL_RELEASE);
    // The state it moved away from is now the provenance, so the deployment can go forward again.
    expect(rolledBack.current.live?.previous?.release.tag).toBe(NEXT_RELEASE);
    expect(rolledBack.current.health).toBe(DEPLOYMENT_HEALTH.ONLINE);
    expect(rolledBack.current.lastAttempt?.kind).toBe("rollback");
    expect(rolledBack.current.lastAttempt?.outcome).toBe("succeeded");
  });

  it("refuses a rollback on a deployment that has never been live twice", () => {
    const withA = becameLive(promotable());

    expect(withA.current.live?.previous).toBeNull();
    expect(() => start(withA, "rollback")).toThrow(/no previously known-good live state/);
  });

  /** A rollback attempt driven to the point of promotion, targeting the recorded previous release. */
  function startedRollback(state: DeploymentOperationalState): DeploymentOperationalState {
    const previous = state.current.live?.previous;
    if (previous === undefined || previous === null) throw new Error("this fixture has no previous live state");
    const candidate = candidateIdentity({ release: previous.release.tag, materialized: previous.revision });
    const attempt = prepared(start(state, "rollback", previous.release, 2), candidate, 2);
    return promoting(inspected(staged(validated(attempt, 2), 2), 2), 2);
  }
});


describe("one attempt at a time, and only the moves the lifecycle has", () => {
  it("refuses a second attempt while one is in flight, and allows one after it settles", () => {
    const inFlight = prepared(start(established(), "upgrade", releaseReference({ tag: NEXT_RELEASE })));

    expect(() => start(inFlight, "upgrade", releaseReference({ tag: NEXT_RELEASE }))).toThrow(/already in flight/);
    expect(
      start(failed(inFlight, "promotion"), "upgrade", releaseReference({ tag: NEXT_RELEASE }), 1).current.lastAttempt?.outcome,
    ).toBe("pending");
  });

  it("refuses an install onto a live deployment, and an upgrade of an unestablished one", () => {
    expect(() => start(established(), "install")).toThrow(/an upgrade, not an install/);
    expect(() => start(initialDeploymentOperationalState(deploymentIdentity()), "upgrade")).toThrow(
      /a first activation is an install/,
    );
  });

  it("refuses a candidate built for a different release than the attempt asked for", () => {
    const attempting = start(established(), "upgrade", releaseReference({ tag: NEXT_RELEASE }));

    expect(() => prepared(attempting, candidateIdentity({ release: CANONICAL_RELEASE }))).toThrow(
      /may only contain the release that was requested/,
    );
  });

  it("refuses a stage that the attempt has not earned", () => {
    const attempting = start(established(), "upgrade", releaseReference({ tag: NEXT_RELEASE }));

    expect(() => validated(attempting)).toThrow(/cannot record a validated candidate/);
    expect(() => staged(attempting)).toThrow(/cannot stage a candidate/);
    expect(() => inspected(attempting)).toThrow(/cannot record a staged candidate as inspected/);
    expect(() => promoting(attempting)).toThrow(/cannot begin promotion/);
    expect(() => becameLive(attempting)).toThrow(/cannot complete promotion/);

    expect(() => prepared(prepared(attempting))).toThrow(/cannot record a candidate/);
    const validatedState = validated(prepared(attempting));
    expect(() => staged(validatedState)).not.toThrow();
    expect(() => staged(staged(validatedState))).toThrow(/cannot stage a candidate/);
  });

  it("refuses to record a failure when nothing is in flight, or with an unusable category", () => {
    expect(() => failed(established(), "promotion")).toThrow(/no attempt in flight/);

    const attempting = prepared(start(established(), "upgrade", releaseReference({ tag: NEXT_RELEASE })));
    expect(() => failDeploymentAttempt(attempting, { category: "vibes" as never, message: "it felt wrong", at: T.failed })).toThrow(
      /not a lifecycle failure category/,
    );
    expect(() => failDeploymentAttempt(attempting, { category: "promotion", message: "   ", at: T.failed })).toThrow(
      /must carry a message/,
    );
  });

  it("refuses an instant that is not a UTC ISO-8601 instant, wherever a moment is recorded", () => {
    const fresh = initialDeploymentOperationalState(deploymentIdentity());

    expect(() => startDeploymentAttempt(fresh, { kind: "install", target: releaseReference(), at: "2026-10-02" })).toThrow(
      /must be a UTC ISO-8601 instant/,
    );
    expect(() => startDeploymentAttempt(fresh, { kind: "install", target: releaseReference(), at: "2026-10-02T10:00:00+02:00" })).toThrow(
      /must be a UTC ISO-8601 instant/,
    );
    expect(() => recordDeploymentHealth(established(), { health: "online", at: "yesterday" })).toThrow(
      /must be a UTC ISO-8601 instant/,
    );
    expect(() => promoting(promotable())).toThrow(/cannot begin promotion/);
  });
});
