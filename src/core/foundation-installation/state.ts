/**
 * READING THE RECORD — AND REFUSING A CONTRADICTORY ONE (FOUNDATION-B4A)
 * ====================================================================
 *
 * A durable record is read by people and machines that did NOT write it: a later lifecycle attempt, an
 * operator's diagnostic, a future control plane, a test. So this module answers ONE question exactly —
 * "is this document a valid installation operational record?" — and it answers it WITHOUT repairing
 * anything.
 *
 * INVALID STATE FAILS CLOSED. The rule is that a contradiction is REFUSED, never normalized: a record
 * that says the installation is ONLINE while nothing is live, that promoted a candidate other than the one
 * it validated, that offers a rollback to a state it never had, that names a release identity no
 * Foundation release could have, or that was written by a schema this code does not know — is an error,
 * not an input to be tidied. Silently fixing such a record would hide the very event (a hand edit, a
 * half-finished write, a version skew) that the record exists to make visible.
 *
 * EVERY ISSUE IS REPORTED. `installationOperationalStateIssues` collects all of them, in reading order, so
 * one message names every field to repair rather than the first one. Nothing here throws for a caller who
 * only wants to ask; `parseInstallationOperationalState` throws with the collected list.
 *
 * The invariants this module enforces are the STRUCTURAL half of the lifecycle's failure semantics —
 * `transitions.ts` is the half that keeps them true while a lifecycle operation runs.
 *
 * Framework-neutral: pure data, types and predicates. No filesystem, no clock.
 */
import { isInstallationFailureCategory } from "./failures";
import {
  INSTALLATION_ACTIVATION,
  INSTALLATION_ATTEMPT_KINDS,
  INSTALLATION_ATTEMPT_OUTCOMES,
  INSTALLATION_ATTEMPT_STAGES,
  INSTALLATION_CONTENT_DIGEST_PATTERN,
  INSTALLATION_HEALTH,
  INSTALLATION_LIFECYCLE_EVENT_TYPES,
  INSTALLATION_LIFECYCLE_HISTORY_LIMIT,
  INSTALLATION_OPERATIONAL_STATE_SCHEMA_VERSION,
  isUtcInstant,
  type InstallationActivation,
  type InstallationCandidateIdentity,
  type FoundationInstallationState,
  type InstallationHealth,
  type FoundationInstallationIdentity,
  type FoundationInstallationAttempt,
  type InstallationLifecycleEvent,
  type FoundationInstallationOperationalState,
  type LiveInstallation,
  type PreviousLiveInstallation,
} from "./model";
import { foundationReleaseReferenceIssues } from "@/core/foundation-release/reference";
import { isRecognizedFoundationReleaseIdentity } from "@/core/foundation-release/identity.mjs";

const DOCUMENT_KEYS = ["schemaVersion", "current", "history"] as const;
const CURRENT_KEYS = ["installationIdentity", "health", "healthEvaluatedAt", "live", "lastAttempt"] as const;
const IDENTITY_KEYS = ["name", "repository"] as const;
const LIVE_KEYS = ["release", "revision", "activatedAt", "previous"] as const;
const PREVIOUS_KEYS = ["release", "revision", "retiredAt"] as const;
const ATTEMPT_KEYS = ["kind", "target", "stage", "outcome", "candidate", "startedAt", "endedAt", "failure"] as const;
const CANDIDATE_KEYS = ["release", "authored", "materialized"] as const;
const FAILURE_KEYS = ["category", "message"] as const;
const EVENT_KEYS = ["type", "at", "release", "detail"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && !/\s/.test(value.trim());
}

function isFreeText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** True when `value` is one of a closed vocabulary's literals. */
function isVocabularyValue<T extends string>(vocabulary: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (vocabulary as readonly string[]).includes(value);
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && INSTALLATION_CONTENT_DIGEST_PATTERN.test(value);
}

/** Every schema violation of a nested object: an unexpected shape is reported, never guessed at. */
function keySetIssues(value: unknown, keys: readonly string[], what: string): string[] {
  if (!isPlainObject(value)) return [`${what} must be an object`];
  const actual = Object.keys(value).sort().join(",");
  const expected = [...keys].sort().join(",");
  return actual === expected ? [] : [`${what} has keys [${actual}], expected [${expected}]`];
}

/** The issues of ONE release reference, prefixed so the offending field is unambiguous. */
function releaseIssues(value: unknown, what: string): string[] {
  return foundationReleaseReferenceIssues(value).map((issue) => `${what}: ${issue}`);
}


/** The issues of ONE installation identity (`name`, `repository`). */
function identityIssues(value: unknown): string[] {
  const issues = keySetIssues(value, IDENTITY_KEYS, "current.installationIdentity");
  if (!isPlainObject(value)) return issues;
  if (!isFreeText(value.name)) issues.push("current.installationIdentity.name must be a non-empty name");
  if (!isNonEmptyText(value.repository)) {
    issues.push("current.installationIdentity.repository must be the installation's own repository/authority");
  }
  return issues;
}

/** The issues of ONE candidate identity, plus the release it must contain. */
function candidateIssues(value: unknown, targetTag: unknown): string[] {
  const issues = keySetIssues(value, CANDIDATE_KEYS, "lastAttempt.candidate");
  if (!isPlainObject(value)) return issues;
  const candidate = value as Partial<InstallationCandidateIdentity>;
  if (!isRecognizedFoundationReleaseIdentity(candidate.release)) {
    issues.push(
      `lastAttempt.candidate.release "${String(candidate.release)}" is not a recognized immutable release identity`,
    );
  } else if (candidate.release !== targetTag) {
    issues.push(
      `lastAttempt.candidate.release "${candidate.release}" is not the attempted release ` +
        `"${String(targetTag)}" — a candidate may only contain the release that was asked for`,
    );
  }
  if (!isDigest(candidate.authored)) issues.push("lastAttempt.candidate.authored is not a sha256: digest");
  if (!isDigest(candidate.materialized)) issues.push("lastAttempt.candidate.materialized is not a sha256: digest");
  return issues;
}

/**
 * The issues of ONE previous live state (rollback provenance).
 *
 * A PREVIOUS state is the state a rollback returns to, so it is ALWAYS a different state from the one live
 * now — and M20 defines "different" as a different REVISION, not necessarily a different release: an UPDATE
 * changes the Spokes' authored pages and assets while the Foundation release stays live, so its rollback
 * provenance legitimately carries the same release, and a rollback then restores the earlier revision of that
 * release (adopting a DIFFERENT release is an upgrade). What can never happen is a previous state that IS the
 * live state.
 */
function previousIssues(
  value: unknown,
  live: { readonly tag: unknown; readonly revision: unknown },
): string[] {
  const issues = keySetIssues(value, PREVIOUS_KEYS, "current.live.previous");
  if (!isPlainObject(value)) return issues;
  const previous = value as Partial<PreviousLiveInstallation>;
  issues.push(...releaseIssues(previous.release, "current.live.previous.release"));
  if (!isDigest(previous.revision)) issues.push("current.live.previous.revision is not a sha256: digest");
  if (!isUtcInstant(previous.retiredAt)) issues.push("current.live.previous.retiredAt is not a UTC instant");
  const sameRelease = isPlainObject(previous.release) && previous.release.tag === live.tag;
  if (sameRelease && previous.revision === live.revision) {
    issues.push(
      `current.live.previous names the state that is live now (release "${String(live.tag)}", the same ` +
        "revision) — a previous state is the state a rollback returns to, so it is always a different one",
    );
  }
  return issues;
}


/** The issues of the live state, or none when nothing is live. */
function liveIssues(value: unknown): string[] {
  if (value === null) return [];
  const issues = keySetIssues(value, LIVE_KEYS, "current.live");
  if (!isPlainObject(value)) return issues;
  const live = value as Partial<LiveInstallation>;
  issues.push(...releaseIssues(live.release, "current.live.release"));
  if (!isDigest(live.revision)) issues.push("current.live.revision is not a sha256: digest");
  if (!isUtcInstant(live.activatedAt)) issues.push("current.live.activatedAt is not a UTC instant");
  if (live.previous !== null) {
    // `null` is a first activation; anything else must be a complete previous state — a DIFFERENT revision
    // of the live release (an Update's rollback provenance) or the state of another release (an Upgrade's).
    issues.push(
      ...previousIssues(live.previous, {
        tag: isPlainObject(live.release) ? live.release.tag : undefined,
        revision: live.revision,
      }),
    );
  }
  return issues;
}

/** The issues of ONE failure object. */
function failureIssues(value: unknown): string[] {
  const issues = keySetIssues(value, FAILURE_KEYS, "lastAttempt.failure");
  if (!isPlainObject(value)) return issues;
  if (!isInstallationFailureCategory(value.category)) {
    issues.push(
      `lastAttempt.failure.category "${String(value.category)}" is not a lifecycle failure category ` +
        "(`src/core/foundation-installation/failures.ts`) — a failure the platform cannot name is not one a " +
        "reader can act on",
    );
  }
  if (!isFreeText(value.message)) issues.push("lastAttempt.failure.message must say what failed");
  return issues;
}

/**
 * The issues of ONE attempt — including the rules that make its own parts agree with each other.
 *
 * This is where "the stage and the outcome cannot disagree", "a candidate exists exactly once
 * materializing is done" and "the promoted candidate IS the validated candidate" are enforced.
 */
function attemptIssues(value: unknown, live: unknown): string[] {
  const issues = keySetIssues(value, ATTEMPT_KEYS, "current.lastAttempt");
  if (!isPlainObject(value)) return issues;
  const attempt = value as Partial<FoundationInstallationAttempt>;
  const targetTag = isPlainObject(attempt.target) ? attempt.target.tag : undefined;

  if (!isVocabularyValue(INSTALLATION_ATTEMPT_KINDS, attempt.kind)) {
    issues.push(`lastAttempt.kind "${String(attempt.kind)}" is not a lifecycle attempt kind`);
  }
  issues.push(...releaseIssues(attempt.target, "lastAttempt.target"));
  if (!isVocabularyValue(INSTALLATION_ATTEMPT_STAGES, attempt.stage)) {
    issues.push(`lastAttempt.stage "${String(attempt.stage)}" is not a lifecycle attempt stage`);
  }
  if (!isVocabularyValue(INSTALLATION_ATTEMPT_OUTCOMES, attempt.outcome)) {
    issues.push(`lastAttempt.outcome "${String(attempt.outcome)}" is not a lifecycle attempt outcome`);
  } else if (attempt.stage === "live" && attempt.outcome !== "succeeded") {
    issues.push('lastAttempt is at stage "live" but its outcome is not "succeeded"');
  } else if (attempt.stage === "failed" && attempt.outcome !== "failed") {
    issues.push('lastAttempt is at stage "failed" but its outcome is not "failed"');
  } else if (attempt.stage !== "live" && attempt.stage !== "failed" && attempt.outcome !== "pending") {
    issues.push(`lastAttempt is at stage "${String(attempt.stage)}" but its outcome is "${attempt.outcome}"`);
  }

  if (attempt.candidate === null) {
    if (attempt.stage !== "preparing") {
      issues.push(`lastAttempt has no candidate but is at stage "${String(attempt.stage)}"`);
    }
  } else {
    issues.push(...candidateIssues(attempt.candidate, targetTag));
    if (attempt.stage === "preparing") {
      issues.push("lastAttempt declares a candidate while it is still preparing one");
    }
  }

  if (!isUtcInstant(attempt.startedAt)) issues.push("lastAttempt.startedAt is not a UTC instant");
  if (attempt.outcome === "pending") {
    if (attempt.endedAt !== null) issues.push("a pending lastAttempt must not record an end instant");
  } else if (!isUtcInstant(attempt.endedAt)) {
    issues.push("lastAttempt.endedAt must be a UTC instant once the attempt has settled");
  }

  if (attempt.outcome === "failed") {
    if (attempt.failure === null) issues.push("a failed lastAttempt must record why it failed");
    else issues.push(...failureIssues(attempt.failure));
  } else if (attempt.failure !== null) {
    issues.push("lastAttempt records a failure but has not failed");
  }

  if (attempt.outcome === "succeeded") {
    if (!isPlainObject(live)) {
      issues.push("lastAttempt succeeded but nothing is live — a successful attempt IS the live installation");
    } else {
      const liveState = live as Partial<LiveInstallation>;
      if (isPlainObject(liveState.release) && liveState.release.tag !== targetTag) {
        issues.push(
          `lastAttempt succeeded for "${String(targetTag)}" but the live release is ` +
            `"${liveState.release.tag}" — promotion promotes the candidate that passed inspection`,
        );
      }
      const materialized = isPlainObject(attempt.candidate)
        ? (attempt.candidate as Partial<InstallationCandidateIdentity>).materialized
        : undefined;
      if (liveState.revision !== materialized) {
        issues.push(
          "the live revision is not the revision of the candidate this attempt validated and promoted — " +
            "the exact candidate that passed inspection is the one that must be serving",
        );
      }
    }
  }

  if ((attempt.kind === "upgrade" || attempt.kind === "rollback") && live === null) {
    issues.push(`a "${String(attempt.kind)}" attempt requires a live installation to move`);
  }
  if (attempt.kind === "install" && attempt.outcome !== "succeeded" && live !== null) {
    issues.push("an unsettled install attempt must leave the installation unestablished (nothing live)");
  }

  return issues;
}

/** The issues of ONE history event. */
function eventIssues(value: unknown, index: number, previous: unknown): string[] {
  const what = `history[${index}]`;
  const issues = keySetIssues(value, EVENT_KEYS, what);
  if (!isPlainObject(value)) return issues;
  const event = value as Partial<InstallationLifecycleEvent>;
  if (!isVocabularyValue(INSTALLATION_LIFECYCLE_EVENT_TYPES, event.type)) {
    issues.push(`${what}.type "${String(event.type)}" is not a lifecycle event type`);
  }
  if (!isUtcInstant(event.at)) {
    issues.push(`${what}.at is not a UTC instant`);
  } else if (isPlainObject(previous) && isUtcInstant(previous.at) && event.at < (previous.at as string)) {
    issues.push(
      `${what}.at is earlier than the event before it — history is append-only and ordered oldest first, ` +
        "so an out-of-order record is refused rather than sorted",
    );
  }
  if (!isRecognizedFoundationReleaseIdentity(event.release)) {
    issues.push(`${what}.release "${String(event.release)}" is not a recognized immutable release identity`);
  }
  if (!isFreeText(event.detail)) issues.push(`${what}.detail must say what happened`);
  return issues;
}

/** The issues of the snapshot: the three concerns, and how they must agree. */
function currentIssues(value: unknown): string[] {
  const issues = keySetIssues(value, CURRENT_KEYS, "current");
  if (!isPlainObject(value)) return issues;
  const current = value as Partial<FoundationInstallationState>;

  issues.push(...identityIssues(current.installationIdentity));
  issues.push(...liveIssues(current.live));

  if (current.health !== INSTALLATION_HEALTH.ONLINE && current.health !== INSTALLATION_HEALTH.OFFLINE) {
    issues.push(`current.health "${String(current.health)}" is not "online" or "offline"`);
  }
  // HEALTH IS DATED WHEN — AND ONLY WHEN — IT WAS ACTUALLY EVALUATED (FOUNDATION-B4B-A1).
  //
  // `healthEvaluatedAt: null` is the record's STRUCTURAL statement that health has never been evaluated for
  // this installation, which is a truthful state for an installation that IS activated (FOUNDATION-B4B
  // activates an installation without probing it: establishing files cannot prove that anything serves).
  // The two facts remain distinguishable without prose — `current.live !== null` says the installation is
  // activated, `healthEvaluatedAt === null` says nothing has judged it.
  //
  // What is REFUSED is the genuinely contradictory claim: ONLINE with no evaluation instant. An ONLINE
  // installation is serving because somebody observed it serving, and an undated observation is refused.
  if (current.healthEvaluatedAt === null) {
    if (current.health === INSTALLATION_HEALTH.ONLINE) {
      issues.push(
        "current.health is ONLINE but healthEvaluatedAt is null — being online is an observation, and an " +
          "undated claim is refused",
      );
    }
  } else if (!isUtcInstant(current.healthEvaluatedAt)) {
    issues.push("current.healthEvaluatedAt is not a UTC instant");
  }
  if (current.health === INSTALLATION_HEALTH.ONLINE && current.live === null) {
    issues.push(
      "current.health is ONLINE but nothing is live — an installation that is not activated cannot be serving",
    );
  }

  if (current.lastAttempt !== null && current.lastAttempt !== undefined) {
    issues.push(...attemptIssues(current.lastAttempt, current.live));
  }
  return issues;
}


/**
 * EVERY reason this document is not a valid installation operational record, in reading order.
 *
 * An empty list means the record may be trusted. The function never throws and never repairs: it reports
 * what it found, so a caller may log, refuse, or both.
 */
export function installationOperationalStateIssues(value: unknown): string[] {
  const issues = keySetIssues(value, DOCUMENT_KEYS, "the operational record");
  if (!isPlainObject(value)) return issues;

  if (value.schemaVersion !== INSTALLATION_OPERATIONAL_STATE_SCHEMA_VERSION) {
    issues.push(
      `schemaVersion is ${String(value.schemaVersion)}, expected ${INSTALLATION_OPERATIONAL_STATE_SCHEMA_VERSION} ` +
        "— an unknown version of the record is refused rather than reinterpreted",
    );
  }
  issues.push(...currentIssues(value.current));

  if (!Array.isArray(value.history)) {
    issues.push("history must be an array (it may be empty, but it is never absent)");
  } else {
    const history: unknown[] = value.history;
    if (history.length > INSTALLATION_LIFECYCLE_HISTORY_LIMIT) {
      issues.push(
        `history holds ${history.length} events, more than the contract's ` +
          `${INSTALLATION_LIFECYCLE_HISTORY_LIMIT} — the record is trimmed as it is appended to, so a longer ` +
          "list was not written by the lifecycle",
      );
    }
    history.forEach((event, index) => {
      issues.push(...eventIssues(event, index, history[index - 1]));
    });
  }

  return issues;
}

/**
 * The validated record, or ONE error naming every issue.
 *
 * Callers that must not proceed on a doubt — a lifecycle operation reading its own state — use this rather
 * than asking for issues and deciding what to ignore.
 */
export function parseInstallationOperationalState(value: unknown): FoundationInstallationOperationalState {
  const issues = installationOperationalStateIssues(value);
  if (issues.length > 0) {
    throw new Error(
      "FOUNDATION-B4A: the installation operational record is not valid:\n" +
        issues.map((issue) => `  - ${issue}`).join("\n"),
    );
  }
  return value as FoundationInstallationOperationalState;
}

/**
 * THE FIRST STATE OF AN INSTALLATION: nothing is live, nothing has been attempted, health is OFFLINE.
 *
 * It is offline because an installation that has never been activated is not serving — not because anything
 * was judged: `healthEvaluatedAt` stays `null` until health is first established by an actual evaluation
 * (`recordInstallationHealth`), and ACTIVATION does not establish one (FOUNDATION-B4B-A1). That is what lets
 * a failed first installation be recorded as "not activated, offline, and here is why" — and an established
 * one as "activated, offline, never evaluated, and here is which candidate became live" — without inventing
 * an evaluation nobody made.
 */
export function initialInstallationOperationalState(installation: FoundationInstallationIdentity): FoundationInstallationOperationalState {
  const issues = identityIssues(installation);
  if (issues.length > 0) {
    throw new Error(
      `FOUNDATION-B4A: this is not a usable installation identity:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`,
    );
  }
  return {
    schemaVersion: INSTALLATION_OPERATIONAL_STATE_SCHEMA_VERSION,
    current: {
      installationIdentity: { name: installation.name, repository: installation.repository },
      health: INSTALLATION_HEALTH.OFFLINE,
      healthEvaluatedAt: null,
      live: null,
      lastAttempt: null,
    },
    history: [],
  };
}

/** Whether anything is live — derived from the snapshot, never stored a second time. */
export function installationActivationState(state: FoundationInstallationOperationalState): InstallationActivation {
  return state.current.live === null ? INSTALLATION_ACTIVATION.UNESTABLISHED : INSTALLATION_ACTIVATION.ACTIVE;
}

/** The recorded health of the ACTIVE installation. */
export function installationHealthOf(state: FoundationInstallationOperationalState): InstallationHealth {
  return state.current.health;
}
