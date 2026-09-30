/**
 * THE LEGAL MOVES OF AN INSTALLATION'S LIFECYCLE (FOUNDATION-B4A)
 * ==========================================================
 *
 * Every function here is a PURE TRANSITION of the durable record: it takes the current document, refuses
 * anything the lifecycle cannot legally do, and returns the next document. Nothing reads a clock, touches
 * a filesystem, runs a build, copies a release, deploys anything or talks to a network. Those are the
 * MECHANICS of B4B–B4G; this module is the CONTRACT they must obey, expressed once so that a candidate
 * cannot be promoted by accident, a failed upgrade cannot take a healthy site offline, and a rollback
 * target cannot be invented.
 *
 * THE FAILURE SEMANTICS ARE STRUCTURAL, NOT PROSE
 * ----------------------------------------------
 *   A FAILED ATTEMPT changes the ATTEMPT and NOTHING ELSE — `failInstallationAttempt` is not given health or
 *   the live state, so it cannot write them. That is why:
 *     · a fresh install that fails leaves an installation that is NOT activated and therefore OFFLINE — it
 *       never became live, so health never claimed otherwise;
 *     · an upgrade whose candidate is rejected leaves the LIVE release exactly as it was, still ONLINE,
 *       with the failure recorded as the attempt's outcome. The installation does not become offline because
 *       an upgrade failed.
 *   Health moves only where the ACTIVE installation is described: `recordInstallationHealth` (the live-health
 *   contract) is the ONE function that writes it, and it is the only way an installation can become ONLINE.
 *   Activation is NOT health (FOUNDATION-B4B-A1): `completeInstallationPromotion` records what actually
 *   happened — something became the installation's active state — and therefore records the activated
 *   installation as OFFLINE with `healthEvaluatedAt: null` (never evaluated), because no health check ran.
 *   Turning a failed candidate into OFFLINE therefore requires calling a function that describes the live
 *   installation — no code path does it by accident — and no code path claims ONLINE without a check.
 *
 * EXACT PROMOTION
 * ---------------
 * `completeInstallationPromotion` does not accept "a production build": it takes the CANDIDATE IDENTITY and
 * refuses any identity that differs from the one this attempt validated and inspected. The revision that
 * becomes live is that candidate's `materialized` digest, so the chain
 *
 *     validated candidate  ==  staged candidate  ==  promoted candidate
 *
 * is one comparison of one value — and the record itself is checked for the same thing when it is read
 * (`state.ts`).
 *
 * A TRANSITION NEVER RETURNS A RECORD IT WOULD REFUSE TO READ. Each result passes through
 * `parseInstallationOperationalState` before it is handed back, so the schema's invariants hold for every
 * state a lifecycle operation can reach — not only for the states a test happens to build.
 *
 * WHAT IS NOT HERE, DELIBERATELY: no queueing, no scheduling, no sleeping, no retry, no locking and no
 * concurrency control. Serialising lifecycle operations belongs to whoever RUNS them (a CLI, an agent, a
 * future control plane); one attempt at a time is the invariant this module enforces, by refusing to start
 * a second while one is in flight.
 *
 * Framework-neutral: pure functions over plain data.
 */
import { isInstallationFailureCategory, type InstallationFailure, type InstallationFailureCategory } from "./failures";
import {
  INSTALLATION_ATTEMPT_OUTCOMES,
  INSTALLATION_HEALTH,
  INSTALLATION_LIFECYCLE_HISTORY_LIMIT,
  identicalInstallationCandidates,
  isUtcInstant,
  type InstallationCandidateIdentity,
  type FoundationInstallationState,
  type InstallationHealth,
  type FoundationInstallationAttempt,
  type InstallationLifecycleEvent,
  type InstallationLifecycleEventType,
  type FoundationInstallationOperationalState,
  type LiveInstallation,
  type PreviousLiveInstallation,
} from "./model";
import {
  foundationReleaseLabel,
  identicalFoundationReleases,
  type FoundationReleaseReference,
} from "@/core/foundation-release/reference";
import { parseInstallationOperationalState } from "./state";

/** ONE issue, as an exception: the lifecycle refuses what it cannot legally do. */
function refuse(detail: string): never {
  throw new Error(`FOUNDATION-B4A: ${detail}`);
}

/** The single in-flight attempt, or a refusal explaining that nothing is in flight. */
function pendingAttempt(state: FoundationInstallationOperationalState): FoundationInstallationAttempt {
  const attempt = state.current.lastAttempt;
  if (attempt === null || attempt.outcome !== INSTALLATION_ATTEMPT_OUTCOMES[0]) {
    return refuse(
      "there is no attempt in flight — a candidate is prepared, validated, staged and promoted within ONE attempt",
    );
  }
  return attempt;
}

/** The in-flight attempt, provided it has reached ONE of the named stages. */
function pendingAttemptAt(
  state: FoundationInstallationOperationalState,
  stages: readonly string[],
  what: string,
): FoundationInstallationAttempt {
  const attempt = pendingAttempt(state);
  if (!stages.includes(attempt.stage)) {
    return refuse(
      `cannot ${what}: the attempt is at stage "${attempt.stage}", not ` +
        stages.map((stage) => `"${stage}"`).join(" or "),
    );
  }
  return attempt;
}

/** ONE appended event, with the contract's bound applied by dropping the OLDEST events. */
function appendEvent(
  history: readonly InstallationLifecycleEvent[],
  type: InstallationLifecycleEventType,
  release: string,
  detail: string,
  at: string,
): readonly InstallationLifecycleEvent[] {
  const appended = [...history, { type, at, release, detail } satisfies InstallationLifecycleEvent];
  return appended.slice(Math.max(0, appended.length - INSTALLATION_LIFECYCLE_HISTORY_LIMIT));
}

/** The snapshot with ONE attempt replaced. */
function withAttempt(state: FoundationInstallationOperationalState, attempt: FoundationInstallationAttempt): FoundationInstallationState {
  return { ...state.current, lastAttempt: attempt };
}

/** The next document, validated before it is handed back (see the module note). */
function settled(
  state: FoundationInstallationOperationalState,
  current: FoundationInstallationState,
  history: readonly InstallationLifecycleEvent[] = state.history,
): FoundationInstallationOperationalState {
  return parseInstallationOperationalState({ ...state, current, history });
}

/** A UTC instant the caller must supply: the domain never reads a clock. */
function requireInstant(at: unknown, what: string): string {
  return isUtcInstant(at) ? at : refuse(`${what} must be a UTC ISO-8601 instant (…Z), received ${String(at)}`);
}

/** The attempt with ONE stage moved on, keeping everything else (identity, timestamps, failure). */
function atStage(
  attempt: FoundationInstallationAttempt,
  stage: FoundationInstallationAttempt["stage"],
): FoundationInstallationAttempt {
  return { ...attempt, stage };
}

/**
 * START AN ATTEMPT for one desired release: the moment an installation is asked to install, upgrade or roll
 * back. Nothing is materialised, validated or deployed here — the request is RECORDED, and the record is
 * what later steps read.
 *
 * Refused: a second attempt while one is in flight (one at a time, by contract); an `install` where
 * something is already live; an `upgrade` where nothing is; and a `rollback` that does not name the state
 * the installation actually has available — a rollback is a return to a KNOWN-GOOD previous state, never an
 * arbitrary step backwards. (Rolling back further than one step is an ordinary upgrade to a release the
 * installation already knows: releases are immutable, so it needs no special machinery.)
 */
export function startInstallationAttempt(
  state: FoundationInstallationOperationalState,
  request: { kind: FoundationInstallationAttempt["kind"]; target: FoundationReleaseReference; at: string },
): FoundationInstallationOperationalState {
  const at = requireInstant(request.at, "the attempt's start instant");
  const { kind, target } = request;
  const { live, lastAttempt } = state.current;

  if (lastAttempt !== null && lastAttempt.outcome === INSTALLATION_ATTEMPT_OUTCOMES[0]) {
    return refuse(
      `an attempt is already in flight (${lastAttempt.kind} to ${lastAttempt.target.tag}, stage ` +
        `"${lastAttempt.stage}") — it must settle before another begins, so that "what is happening now" ` +
        "always has ONE answer",
    );
  }
  if (kind === "install" && live !== null) {
    return refuse(
      `this installation is already live (${foundationReleaseLabel(live.release)}) — establishing it again is ` +
        "an upgrade, not an install",
    );
  }
  if (kind === "upgrade" && live === null) {
    return refuse("this installation has nothing live to upgrade — a first activation is an install");
  }
  if (kind === "rollback") {
    if (live === null || live.previous === null) {
      return refuse(
        "there is no previously known-good live state to return to — a rollback is only possible after a " +
          "installation has been live at least twice, and it names the state it goes back to",
      );
    }
    if (!identicalFoundationReleases(target, live.previous.release)) {
      return refuse(
        `a rollback may only return to the previous live release (${foundationReleaseLabel(live.previous.release)}), ` +
          `not ${foundationReleaseLabel(target)} — moving to any other release is an upgrade`,
      );
    }
  }

  const attempt: FoundationInstallationAttempt = {
    kind,
    target,
    stage: "preparing",
    outcome: INSTALLATION_ATTEMPT_OUTCOMES[0],
    candidate: null,
    startedAt: at,
    endedAt: null,
    failure: null,
  };
  return settled(
    state,
    withAttempt(state, attempt),
    appendEvent(
      state.history,
      "attempt-started",
      target.tag,
      `${kind} of ${foundationReleaseLabel(target)} started`,
      at,
    ),
  );
}

/**
 * RECORD THE MATERIALISED CANDIDATE: the attempt's tree now exists, so its identity is known and the next
 * step validates THIS tree rather than an intention.
 *
 * The candidate must contain the release the attempt asked for — a candidate for anything else is refused
 * here rather than discovered at promotion.
 */
export function recordInstallationCandidate(
  state: FoundationInstallationOperationalState,
  materialized: { candidate: InstallationCandidateIdentity; at: string },
): FoundationInstallationOperationalState {
  const at = requireInstant(materialized.at, "the candidate's instant");
  const attempt = pendingAttemptAt(state, ["preparing"], "record a candidate");
  const candidate = materialized.candidate;

  if (candidate.release !== attempt.target.tag) {
    return refuse(
      `the candidate contains "${candidate.release}" but this attempt asked for ` +
        `"${attempt.target.tag}" — a candidate may only contain the release that was requested`,
    );
  }

  return settled(
    state,
    withAttempt(state, { ...atStage(attempt, "validating"), candidate }),
    appendEvent(
      state.history,
      "candidate-prepared",
      candidate.release,
      `candidate ${candidate.materialized} of ${foundationReleaseLabel(attempt.target)} materialised ` +
        `(authored ${candidate.authored})`,
      at,
    ),
  );
}

/** RECORD THAT VALIDATION PASSED: the candidate may be staged. */
export function recordInstallationCandidateValidated(
  state: FoundationInstallationOperationalState,
  moment: { at: string; detail?: string },
): FoundationInstallationOperationalState {
  const at = requireInstant(moment.at, "the validation instant");
  const attempt = pendingAttemptAt(state, ["validating"], "record a validated candidate");
  const candidate = attempt.candidate;
  if (candidate === null) return refuse("the attempt has no candidate to validate");

  return settled(
    state,
    withAttempt(state, atStage(attempt, "validated")),
    appendEvent(
      state.history,
      "candidate-validated",
      candidate.release,
      moment.detail ?? `candidate ${candidate.materialized} of ${foundationReleaseLabel(attempt.target)} passed validation`,
      at,
    ),
  );
}

/** RECORD THAT THE VALIDATED CANDIDATE IS DEPLOYED TO STAGING — the SAME candidate, never a rebuild. */
export function recordInstallationCandidateStaged(
  state: FoundationInstallationOperationalState,
  moment: { at: string; detail?: string },
): FoundationInstallationOperationalState {
  const at = requireInstant(moment.at, "the staging instant");
  const attempt = pendingAttemptAt(state, ["validated"], "stage a candidate");
  const candidate = attempt.candidate;
  if (candidate === null) return refuse("the attempt has no candidate to stage");

  return settled(
    state,
    withAttempt(state, atStage(attempt, "staged")),
    appendEvent(
      state.history,
      "candidate-staged",
      candidate.release,
      moment.detail ?? `candidate ${candidate.materialized} staged for inspection`,
      at,
    ),
  );
}

/**
 * RECORD THAT STAGING INSPECTION PASSED: the candidate is now PROMOTABLE.
 *
 * "Promotable" is therefore a fact about the record (`isInstallationCandidatePromotable`), not a separate
 * flag someone has to keep in step with the stage.
 */
export function recordInstallationStagingInspected(
  state: FoundationInstallationOperationalState,
  moment: { at: string; detail?: string },
): FoundationInstallationOperationalState {
  const at = requireInstant(moment.at, "the inspection instant");
  const attempt = pendingAttemptAt(state, ["staged"], "record a staged candidate as inspected");
  const candidate = attempt.candidate;
  if (candidate === null) return refuse("the attempt has no staged candidate to inspect");

  return settled(
    state,
    withAttempt(state, atStage(attempt, "inspected")),
    appendEvent(
      state.history,
      "candidate-inspected",
      candidate.release,
      moment.detail ?? `staged candidate ${candidate.materialized} passed inspection`,
      at,
    ),
  );
}

/** RECORD THAT PROMOTION HAS BEGUN: the promotable candidate is being made live. */
export function beginInstallationPromotion(
  state: FoundationInstallationOperationalState,
  moment: { at: string },
): FoundationInstallationOperationalState {
  requireInstant(moment.at, "the promotion instant");
  const attempt = pendingAttemptAt(state, ["inspected"], "begin promotion");
  return settled(state, withAttempt(state, atStage(attempt, "promoting")));
}

/**
 * COMPLETE PROMOTION of EXACTLY the candidate this attempt validated and inspected.
 *
 * The caller names the candidate it is promoting, and it must be the attempt's own candidate in every
 * respect — release, authored input and materialised revision. Nothing here rebuilds, re-resolves or
 * substitutes: the revision that becomes live is that candidate's digest, the release that becomes live is
 * the one this attempt asked for, and the state that was live becomes the rollback provenance.
 *
 * ACTIVATION IS NOT HEALTH, AND THIS FUNCTION CANNOT SPEAK FOR BOTH (FOUNDATION-B4B-A1)
 * ------------------------------------------------------------------------------------
 * What happened here is real and nameable: something became this installation's ACTIVE state. What did NOT
 * happen is any HEALTH EVALUATION — nothing served a request, nothing was probed, nothing was observed — so
 * the record must not claim the installation is ONLINE, and must not date an evaluation nobody made. The
 * activated installation is therefore recorded OFFLINE (the honest default: not proven to be serving) with
 * `healthEvaluatedAt: null` (the structural statement that health has never been evaluated for it).
 *
 * The two facts stay distinguishable WITHOUT prose: `current.live !== null` says the installation IS
 * activated, and `current.healthEvaluatedAt === null` says its serving state has never been judged. A real
 * health check is what turns it ONLINE, and that is `recordInstallationHealth`'s business — it needs
 * something to be live (so this function must have completed first), and nothing else may write health.
 *
 * A promoted candidate therefore cannot differ from the validated one — there is no parameter through which
 * a different, "equivalent" candidate could arrive — and no `health-online` event can be produced by
 * becoming live.
 */
export function completeInstallationPromotion(
  state: FoundationInstallationOperationalState,
  promotion: { candidate: InstallationCandidateIdentity; at: string },
): FoundationInstallationOperationalState {
  const at = requireInstant(promotion.at, "the promotion instant");
  const attempt = pendingAttemptAt(state, ["promoting"], "complete promotion");
  const candidate = attempt.candidate;
  if (candidate === null) return refuse("the attempt has no candidate to promote");

  if (!identicalInstallationCandidates(candidate, promotion.candidate)) {
    return refuse(
      "refusing to promote a candidate that is not the one this attempt validated and inspected: the attempt " +
        `holds ${candidate.materialized} of ${candidate.release} (authored ${candidate.authored}), the ` +
        `promotion names ${promotion.candidate.materialized} of ${promotion.candidate.release} (authored ` +
        `${promotion.candidate.authored}) — promotion promotes the candidate that passed inspection`,
    );
  }

  const wasLive = state.current.live;
  const live: LiveInstallation = {
    release: attempt.target,
    revision: candidate.materialized,
    activatedAt: at,
    previous: wasLive === null ? null : retiredState(wasLive, at),
  };

  const current: FoundationInstallationState = {
    ...state.current,
    live,
    health: INSTALLATION_HEALTH.OFFLINE,
    healthEvaluatedAt: null,
    lastAttempt: { ...atStage(attempt, "live"), outcome: "succeeded", endedAt: at },
  };

  const history = appendEvent(
    state.history,
    "promoted",
    candidate.release,
    `${attempt.kind} promoted candidate ${candidate.materialized} — ${foundationReleaseLabel(attempt.target)} is live`,
    at,
  );

  return settled(state, current, history);
}

/** The state that has just stopped being live, kept as the rollback provenance. */
function retiredState(live: LiveInstallation, at: string): PreviousLiveInstallation {
  return { release: live.release, revision: live.revision, retiredAt: at };
}

/**
 * RECORD THAT THE ATTEMPT FAILED, at whatever stage it reached.
 *
 * This is the ONE function that writes a failure — and it deliberately cannot write health or the live
 * state, which is why a rejected candidate never changes what the installation IS. The installation's health is
 * a fact about the live installation; a failed attempt is a fact about an attempt. When the LIVE installation
 * itself fails, that is `recordInstallationHealth`.
 *
 * The category comes from the closed vocabulary, so "why did it fail?" is answerable by a machine; the
 * message carries the detail a human needs.
 */
export function failInstallationAttempt(
  state: FoundationInstallationOperationalState,
  failure: { category: InstallationFailureCategory; message: string; at: string },
): FoundationInstallationOperationalState {
  const at = requireInstant(failure.at, "the failure instant");
  const attempt = pendingAttempt(state);

  if (!isInstallationFailureCategory(failure.category)) {
    return refuse(
      `"${String(failure.category)}" is not a lifecycle failure category — a failure the platform cannot name ` +
        "is not one a reader can act on",
    );
  }
  if (typeof failure.message !== "string" || failure.message.trim() === "") {
    return refuse("a failure must carry a message saying what failed");
  }

  const recorded: InstallationFailure = { category: failure.category, message: failure.message };
  const current = withAttempt(state, {
    ...attempt,
    stage: "failed",
    outcome: "failed",
    endedAt: at,
    failure: recorded,
  });

  return settled(
    state,
    current,
    appendEvent(
      state.history,
      "attempt-failed",
      attempt.target.tag,
      `${attempt.kind} of ${foundationReleaseLabel(attempt.target)} failed at stage "${attempt.stage}" ` +
        `(${failure.category}): ${failure.message}`,
      at,
    ),
  );
}

/**
 * RECORD THE HEALTH OF THE LIVE INSTALLATION — and only that.
 *
 * An installation cannot be ONLINE while nothing is live (refused here, and refused again when the record is
 * read). This is the ONE way a healthy installation becomes OFFLINE: by describing the live installation
 * itself, which is exactly what a live-health failure is. A failed candidate cannot reach this function.
 *
 * Re-asserting the health an installation already has updates `healthEvaluatedAt` without inventing an event:
 * the history records CHANGES, while the snapshot records the current truth and when it was established.
 */
export function recordInstallationHealth(
  state: FoundationInstallationOperationalState,
  health: { health: InstallationHealth; at: string; detail?: string },
): FoundationInstallationOperationalState {
  const at = requireInstant(health.at, "the health instant");
  const live = state.current.live;

  if (health.health !== INSTALLATION_HEALTH.ONLINE && health.health !== INSTALLATION_HEALTH.OFFLINE) {
    return refuse(`"${String(health.health)}" is not an installation health — the contract has online and offline only`);
  }
  if (health.health === INSTALLATION_HEALTH.ONLINE && live === null) {
    return refuse(
      "nothing is live, so this installation cannot be ONLINE — an installation that is not activated is not serving",
    );
  }

  const current: FoundationInstallationState = { ...state.current, health: health.health, healthEvaluatedAt: at };
  const release = live?.release.tag ?? null;
  if (state.current.health === health.health || release === null) return settled(state, current);

  const type: InstallationLifecycleEventType =
    health.health === INSTALLATION_HEALTH.ONLINE ? "health-online" : "health-offline";
  const detail =
    health.detail ??
    (health.health === INSTALLATION_HEALTH.ONLINE
      ? "the live installation is serving"
      : "the live installation is not serving");
  return settled(state, current, appendEvent(state.history, type, release, detail, at));
}

/** True when an attempt is in flight (its candidate may still move). */
export function isInstallationAttemptPending(state: FoundationInstallationOperationalState): boolean {
  return state.current.lastAttempt?.outcome === INSTALLATION_ATTEMPT_OUTCOMES[0];
}

/**
 * True when the candidate in flight is PROMOTABLE: it passed validation and staging inspection.
 *
 * The predicate is DERIVED from the attempt's stage and identity, so nothing can claim promotability
 * without having got there — there is no flag to set and no flag to forget.
 */
export function isInstallationCandidatePromotable(state: FoundationInstallationOperationalState): boolean {
  const attempt = state.current.lastAttempt;
  return (
    attempt !== null &&
    attempt.outcome === INSTALLATION_ATTEMPT_OUTCOMES[0] &&
    attempt.stage === "inspected" &&
    attempt.candidate !== null
  );
}
