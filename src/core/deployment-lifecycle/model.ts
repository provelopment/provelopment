/**
 * THE DEPLOYMENT'S DURABLE OPERATIONAL RECORD (FOUNDATION-B4A)
 * ==========================================================
 *
 * ONE deployment, ONE machine-readable record of what it is running and what has happened to it. It is
 * the answer to "is this deployment online, on which release, and what was the last thing done to it?"
 * WITHOUT reading prose, a dashboard, a log file or another deployment.
 *
 * THREE CONCERNS, DELIBERATELY SEPARATE (this is the shape of the whole lifecycle)
 * ------------------------------------------------------------------------------
 *   ACTIVATION   what is LIVE — `current.live`, or nothing at all (`null`: a deployment that has never
 *                been activated). It is never inferred from an attempt's outcome.
 *   ATTEMPT      what is HAPPENING or last happened — `current.lastAttempt`: the desired release, how
 *                far the candidate got, and why it stopped. Attempts come and go; the live deployment
 *                does not move because one failed.
 *   HEALTH       is the LIVE deployment serving — `current.health`, ONLINE or OFFLINE, dated by
 *                `current.healthEvaluatedAt`.
 *
 * The separation is what makes the failure semantics structural rather than prose (see `transitions.ts`):
 * a rejected candidate changes the ATTEMPT and nothing else, so a healthy deployment cannot become
 * OFFLINE merely because an upgrade failed, and a fresh install that fails leaves a deployment that is
 * not activated (and therefore not serving) — recorded, not invented.
 *
 * CURRENT TRUTH IS NOT HISTORY
 * ----------------------------
 * The document is TWO parts on purpose:
 *
 *   `current`   the snapshot: authoritative, self-contained, and the ONLY thing a reader needs to answer
 *               "what is true now?".
 *   `history`   an append-only list of events, oldest first, BOUNDED by
 *               `DEPLOYMENT_LIFECYCLE_HISTORY_LIMIT`. It explains how the deployment arrived here; it is
 *               never required to determine what is true.
 *
 * Trimming the oldest events therefore cannot lose current truth — and this is not an event-sourcing
 * framework: there is no replay, no projection and no rebuild from history.
 *
 * WHERE IT IS STORED, AND WHY THAT IS NOT THIS MODULE'S BUSINESS
 * ------------------------------------------------------------
 * The record is a DEPLOYMENT-OWNED file named `operational-state.json`; its LOCATION is the deployment
 * root, resolved by the ONE deployment-path authority (`@/config/deployment-root`) like every other
 * deployment-owned location. This module owns the NAME, the SCHEMA and the SEMANTICS — never a path,
 * never a filesystem, and never a writer.
 *
 * It is GENERATED OPERATIONAL STATE rather than authored content: it records what IS running, changes
 * without a human editing it, and must be able to change while the deployment runs one immutable
 * revision. It is therefore not version-controlled — committing it would make every health change a
 * source change, and would let a machine's working tree stop matching the revision it is running (the
 * capsule's `.gitignore` states the policy).
 *
 * DETERMINISM. Every instant in the record is a UTC ISO-8601 instant (`…Z`) and is PROVENANCE, never
 * identity: two runs that produce the same candidate produce the same candidate identity whatever the
 * clock says. Nothing in this module reads a clock — callers pass the instant they recorded, so a test
 * never depends on wall-clock timing.
 *
 * Framework-neutral: pure data, types and predicates. No React, Next.js, filesystem or configuration.
 */
import type { DeploymentFailure } from "./failures";
import type { FoundationReleaseReference } from "./release-reference";


/** The record's file name — part of the durable contract; its LOCATION belongs to the path authority. */
export const DEPLOYMENT_OPERATIONAL_STATE_FILE_NAME = "operational-state.json";

/**
 * The schema version of the document below, from the very first release of the contract.
 *
 * It is deliberately NOT called `version`: this is the schema's own number, and a reader must never
 * confuse it with the Foundation release a deployment is running (that is `live.release.tag`). A record
 * whose `schemaVersion` is not this number is REFUSED — a future migration is a deliberate act that knows
 * both shapes, never a guess made while reading.
 */
export const DEPLOYMENT_OPERATIONAL_STATE_SCHEMA_VERSION = 1;

/**
 * How many events `history` keeps: the newest are appended, the oldest are dropped.
 *
 * A bound is a contract rather than an implementation detail, because the record must stay readable and
 * comparable for the life of a deployment. Current truth never depends on history (see the module note),
 * so trimming is safe by construction.
 */
export const DEPLOYMENT_LIFECYCLE_HISTORY_LIMIT = 100;

/**
 * WHICH deployment this record describes.
 *
 * A record is read by its own deployment — but also, later, by whoever manages several deployments, who
 * must be able to tell one record from another WITHOUT trusting a file path. The identity is therefore
 * part of the record: the name its operator uses, and the repository the deployment's own source lives
 * in (the same kind of authority the platform names for itself in its release manifest).
 */
export interface DeploymentIdentity {
  readonly name: string;
  /** The deployment's OWN repository/authority — not the platform's, and never a branch. */
  readonly repository: string;
}

/** The two health values of the ACTIVE deployment. There is deliberately no "degraded" and no "unknown". */
export const DEPLOYMENT_HEALTH = {
  /** The live deployment is serving. */
  ONLINE: "online",
  /** The live deployment is not serving — or nothing is live yet (a deployment that is not activated). */
  OFFLINE: "offline",
} as const;

/** ONLINE or OFFLINE: the health of the ACTIVE deployment, never the outcome of the last attempt. */
export type DeploymentHealth = (typeof DEPLOYMENT_HEALTH)[keyof typeof DEPLOYMENT_HEALTH];

/** Whether anything is live at all. Derived from `live` — never stored twice. */
export const DEPLOYMENT_ACTIVATION = {
  /** Nothing has ever been activated: no live release, and no live deployment revision. */
  UNESTABLISHED: "unestablished",
  /** A live release and revision exist, whatever their health. */
  ACTIVE: "active",
} as const;


/** A UTC ISO-8601 instant with a `Z` designator: the ONE shape every recorded instant takes. */
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/**
 * True when `value` is a UTC ISO-8601 instant naming a REAL calendar date and time.
 *
 * The shape alone is not acceptance: `2026-02-31T00:00:00Z` and `…T24:00:00Z` look plausible and are
 * normalized by `Date` instead of refused, so the round trip through the canonical form IS the calendar
 * check — exactly as the release identity authority treats an impossible release minute.
 */
export function isUtcInstant(value: unknown): value is string {
  if (typeof value !== "string" || !UTC_INSTANT_PATTERN.test(value)) return false;
  const moment = new Date(value);
  if (Number.isNaN(moment.getTime())) return false;
  const iso = moment.toISOString();
  const date = iso.slice(0, 10);
  const time = iso.slice(11, 19);
  const fraction = value.includes(".") ? `.${value.slice(value.indexOf(".") + 1, -1)}` : "";
  return value === `${date}T${time}${fraction}Z`;
}

/**
 * The recorded form of a moment: UTC, seconds precision, `Z`.
 *
 * Sub-second precision is TRUNCATED rather than rounded, so a recorded instant never claims a second
 * that had not begun — and two calls within the same second record the same moment.
 */
export function utcInstant(moment: Date): string {
  const whole = new Date(Math.floor(moment.getTime() / 1000) * 1000);
  return whole.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * WHAT A CANDIDATE IS, durably enough to prove later that the thing validated is the thing promoted.
 *
 * A candidate is an immutable artifact built from two inputs, and this identity names both plus the
 * artifact itself:
 *
 *   `release`      the Foundation release IDENTITY the candidate contains (an immutable release name,
 *                  never a branch).
 *   `authored`     the identity of the deployment's OWN authored input the candidate was built from:
 *                  a `sha256:` content digest over the deployment's authored surfaces (configuration,
 *                  dictionaries, pages, artwork). A digest rather than a commit, because a deployment
 *                  need not be a Git checkout at all — and the algorithm is the building phase's, while
 *                  the CONTRACT is that two identical inputs produce one identity.
 *   `materialized` the `sha256:` content digest of the candidate tree itself.
 *
 * Together they are the identity continuity proof (`model` → `transitions.ts`): validation, staging
 * inspection and promotion compare THIS value, so promotion can never promote "something equivalent
 * rebuilt for production".
 */
export interface DeploymentCandidateIdentity {
  /** The release identity the candidate contains (must be the attempt's desired release). */
  readonly release: string;
  /** The `sha256:` content digest of the deployment's authored input. */
  readonly authored: string;
  /** The `sha256:` content digest of the materialised candidate tree. */
  readonly materialized: string;
}

/** The ONE digest shape a candidate identity field may take. */

/** WHY a lifecycle attempt was started. The kind decides which preconditions must hold (see `transitions.ts`). */
export const DEPLOYMENT_ATTEMPT_KINDS = [
  /** Establish a deployment that has nothing live yet. */
  "install",
  /** Move a LIVE deployment to the desired release. */
  "upgrade",
  /** Return a live deployment to the previously known-good live state. */
  "rollback",
] as const;

/** `install`, `upgrade` or `rollback`. */
export type DeploymentAttemptKind = (typeof DEPLOYMENT_ATTEMPT_KINDS)[number];

/**
 * HOW FAR an attempt got. Stages are the lifecycle's own steps, so a reader sees where work stopped
 * without reading a log — and the terminal stages are the only ones that also settle the outcome.
 */
export const DEPLOYMENT_ATTEMPT_STAGES = [
  /** The candidate is being materialised; no candidate tree exists yet. */
  "preparing",
  /** A candidate tree exists and is being validated. */
  "validating",
  /** Validation passed: the candidate MAY be staged. */
  "validated",
  /** The candidate is deployed to the staging environment. */
  "staged",
  /** Staging inspection passed: the candidate MAY be promoted (it is promotable). */
  "inspected",
  /** Promotion is in flight. */
  "promoting",
  /** Promotion completed: this candidate IS the live deployment. Terminal, successful. */
  "live",
  /** The attempt ended without becoming live. Terminal, failed. */
  "failed",
] as const;

/** One lifecycle step. */
export type DeploymentAttemptStage = (typeof DEPLOYMENT_ATTEMPT_STAGES)[number];

/** Whether an attempt is still moving, and how it ended. */
export const DEPLOYMENT_ATTEMPT_OUTCOMES = ["pending", "succeeded", "failed"] as const;

/** `pending` while an attempt is in flight; `succeeded`/`failed` once it is done. */
export type DeploymentAttemptOutcome = (typeof DEPLOYMENT_ATTEMPT_OUTCOMES)[number];

/**
 * ONE lifecycle attempt: the desired release, the candidate, how far it got, and why it stopped.
 *
 * The attempt is the ONLY place a desired release is expressed. There is no separate "desired release"
 * configuration to keep in step with reality: an operator (or a control plane) asks for a release by
 * STARTING an attempt, and the attempt records the request until it is settled.
 */
export interface DeploymentLifecycleAttempt {
  readonly kind: DeploymentAttemptKind;
  /** The release the attempt asked for, in full — identity, provenance and content identity. */
  readonly target: FoundationReleaseReference;
  readonly stage: DeploymentAttemptStage;
  readonly outcome: DeploymentAttemptOutcome;
  /** The candidate identity, or `null` while the attempt is still `preparing`. */
  readonly candidate: DeploymentCandidateIdentity | null;
  /** When the attempt was recorded as started (UTC instant). */
  readonly startedAt: string;
  /** When the attempt settled (UTC instant), or `null` while it is `pending`. */
  readonly endedAt: string | null;
  /** Why the attempt failed, or `null` when it has not failed. */
  readonly failure: DeploymentFailure | null;
}

/**
 * A deployment state that is NO LONGER live, kept as the rollback provenance.
 *
 * It records the exact release AND the exact deployment revision that were live, so "return to the
 * previously known-good state" names a revision rather than a mood — and so a rollback cannot quietly
 * mean "re-materialise whatever that release builds today".
 */
export interface PreviousLiveDeployment {
  readonly release: FoundationReleaseReference;
  /** The `sha256:` digest of the deployment revision that was live. */
  readonly revision: string;
  /** When this state stopped being live (UTC instant). */
  readonly retiredAt: string;
}

/**
 * WHAT IS LIVE: the Foundation release, and the EXACT deployment revision serving it.
 *
 * The two are different facts: several deployment revisions may exist for one release (an authored
 * change), so the release identity alone could not name what is running.
 */
export interface LiveDeployment {
  readonly release: FoundationReleaseReference;
  /** The `sha256:` digest of the live deployment revision. */
  readonly revision: string;
  /** When this state became live (UTC instant). */
  readonly activatedAt: string;
  /** The state that was live before it — the rollback provenance, or `null` for a first activation. */
  readonly previous: PreviousLiveDeployment | null;
}

export const DEPLOYMENT_CONTENT_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

/** True when two identities name the SAME candidate in every respect a promotion must prove. */

/**
 * WHAT HAPPENED, in a small closed vocabulary.
 *
 * Events explain how the deployment reached its current state; they never determine it. Each one names
 * the release it concerns, so a reader can follow one release through an upgrade without cross-referencing
 * anything else. A refusal, a cancelled idea or a validation error thrown at a caller is NOT an event:
 * the history records what the deployment actually became, never every question that was asked of it.
 */
export const DEPLOYMENT_LIFECYCLE_EVENT_TYPES = [
  /** An attempt was started for a desired release. */
  "attempt-started",
  /** A candidate tree was materialised with a known identity, and validation may begin. */
  "candidate-prepared",
  /** The candidate passed validation and may be staged. */
  "candidate-validated",
  /** The candidate was deployed to the staging environment. */
  "candidate-staged",
  /** The staged candidate passed inspection and may be promoted. */
  "candidate-inspected",
  /** The attempt ended without becoming live. */
  "attempt-failed",
  /** A candidate became the live deployment (an install, an upgrade or a rollback). */
  "promoted",
  /** The live deployment's health became (or was re-asserted as) ONLINE. */
  "health-online",
  /** The live deployment's health became OFFLINE. */
  "health-offline",
] as const;

/** One recorded lifecycle event type. */
export type DeploymentLifecycleEventType = (typeof DEPLOYMENT_LIFECYCLE_EVENT_TYPES)[number];

/** ONE appended fact about this deployment's lifecycle. */
export interface DeploymentLifecycleEvent {
  readonly type: DeploymentLifecycleEventType;
  /** When it happened (UTC instant) — provenance, never identity. */
  readonly at: string;
  /** The release identity the event concerns. */
  readonly release: string;
  /** One human sentence: what happened, in the deployment's own words. */
  readonly detail: string;
}

/**
 * THE SNAPSHOT: everything that is true about the deployment right now.
 *
 * `healthEvaluatedAt` is the instant the current health value was established. It is `null` only for a
 * deployment that has never been evaluated at all — which is why a record with a LIVE deployment must
 * carry one: "the live deployment is online" is a claim about a moment, and an undated claim is not one.
 */
export interface DeploymentCurrentState {
  /**
   * WHICH deployment this record describes (its identity, never a path).
   *
   * The field is spelled `deploymentIdentity` rather than the bare word for a mechanical reason worth
   * knowing: a quoted `deployment` in application source is a CAPSULE-DIRECTORY spelling, and
   * `tests/architecture/deployment-root-guard.test.ts` keeps that spelling in the ONE path authority.
   * That rule is about PATHS; this is a field name, so it says what it holds and the guard stays a rule
   * about locations.
   */
  readonly deploymentIdentity: DeploymentIdentity;
  readonly health: DeploymentHealth;
  readonly healthEvaluatedAt: string | null;
  /** What is live, or `null` when this deployment has never been activated. */
  readonly live: LiveDeployment | null;
  /** What is happening, or what last happened — `null` only for a deployment nothing has acted on. */
  readonly lastAttempt: DeploymentLifecycleAttempt | null;
}

/**
 * THE DURABLE DOCUMENT: the snapshot plus the bounded history of how it got there.
 *
 * This is the WHOLE record — the exact thing serialised to `operational-state.json`. Its two parts are
 * deliberate (see the module note): `current` answers "what is true?", `history` answers "how?".
 */
export interface DeploymentOperationalState {
  readonly schemaVersion: number;
  readonly current: DeploymentCurrentState;
  readonly history: readonly DeploymentLifecycleEvent[];
}

export function identicalDeploymentCandidates(
  left: DeploymentCandidateIdentity,
  right: DeploymentCandidateIdentity,
): boolean {
  return (
    left.release === right.release &&
    left.authored === right.authored &&
    left.materialized === right.materialized
  );
}

/** `unestablished` or `active`. */
export type DeploymentActivation = (typeof DEPLOYMENT_ACTIVATION)[keyof typeof DEPLOYMENT_ACTIVATION];
