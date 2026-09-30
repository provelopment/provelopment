/**
 * THE FOUNDATION INSTALLATION'S DURABLE OPERATIONAL RECORD (FOUNDATION-B4A / B4A-A2)
 * ===============================================================================
 *
 * ONE Foundation installation, ONE machine-readable record of what it is running and what has happened to
 * it: the answer to "is this installation online, on which immutable Foundation release, and what was the
 * last thing done to it?" — WITHOUT reading prose, a dashboard, a log file, or anything belonging to
 * another installation (there is no other installation anywhere in this model).
 *
 * WHOSE STATE THIS IS: THE COMPLETE FOUNDATION INSTALLATION
 * --------------------------------------------------------
 * The subject is the COMPLETE installation — the platform it runs, its authored state, and the spokes it
 * owns. Every concept in this module and in `transitions.ts` (activation, attempt, health, live state,
 * candidate, staging, promotion, rollback) belongs to the INSTALLATION, because installing, upgrading and
 * rolling back a Foundation release are installation acts.
 *
 * A SPOKE is one of the websites this installation owns and manages. A SITE (`ww`, `de`) is a country or
 * global context inside a spoke. Installation ≠ spoke ≠ Site — and this record is none of the three:
 *
 *   · it holds NO spoke-level state. A spoke has its own lifecycle, which a later phase adds as its OWN
 *     record rather than by widening this one (one ambiguous record serving two levels is exactly what
 *     this note exists to prevent);
 *   · it names no Site: Sites belong to the installation's authored configuration, not to its operational
 *     state;
 *   · it knows NOTHING about another Foundation installation. Another installation is not a parent, a
 *     child, a sibling, a source or a spoke: there is no registry, no fleet, no clone lifecycle, no
 *     cross-installation state and no runtime connection between installations — so nothing here can
 *     name one.
 *
 * THREE CONCERNS, DELIBERATELY SEPARATE (this is the shape of the whole lifecycle)
 * ------------------------------------------------------------------------------
 *   ACTIVATION   what is LIVE — `current.live`, or nothing at all (`null`: an installation that has never
 *                been activated). It is never inferred from an attempt's outcome.
 *   ATTEMPT      what is HAPPENING or last happened — `current.lastAttempt`: the desired release, how
 *                far the candidate got, and why it stopped. Attempts come and go; the live installation
 *                does not move because one failed.
 *   HEALTH       is the LIVE installation serving — `current.health`, ONLINE or OFFLINE, dated by
 *                `current.healthEvaluatedAt`. A `null` instant is the STRUCTURAL statement that health has
 *                never been evaluated, which is exactly what ACTIVATION leaves behind: becoming live is not
 *                an observation that anything serves (FOUNDATION-B4B-A1). Only a real health evaluation
 *                (`recordInstallationHealth`) makes an installation ONLINE.
 *
 * The separation is what makes the failure semantics structural rather than prose (see `transitions.ts`):
 * a rejected candidate changes the ATTEMPT and nothing else, so a healthy installation cannot become
 * OFFLINE merely because an upgrade failed, and a fresh install that fails leaves an installation that is
 * not activated (and therefore not serving) — recorded, not invented.
 *
 * CURRENT TRUTH IS NOT HISTORY
 * ----------------------------
 * The document is TWO parts on purpose:
 *
 *   `current`   the snapshot: authoritative, self-contained, and the ONLY thing a reader needs to answer
 *               "what is true now?".
 *   `history`   an append-only list of events, oldest first, BOUNDED by
 *               `INSTALLATION_LIFECYCLE_HISTORY_LIMIT`. It explains how the installation arrived here; it
 *               is never required to determine what is true.
 *
 * Trimming the oldest events therefore cannot lose current truth — and this is not an event-sourcing
 * framework: there is no replay, no projection and no rebuild from history.
 *
 * WHERE IT IS STORED, AND WHY THAT IS NOT THIS MODULE'S BUSINESS
 * ------------------------------------------------------------
 * The record is an INSTALLATION-OWNED file named `operational-state.json`; its LOCATION is the
 * installation root, resolved by the ONE deployment-path authority (`@/config/deployment-root`, the
 * reviewed ISO-B1 filesystem seam) like every other installation-owned location. This module owns the
 * NAME, the SCHEMA and the SEMANTICS — never a path, never a filesystem, and never a writer.
 *
 * It is GENERATED OPERATIONAL STATE rather than authored content: it records what IS running, changes
 * without a human editing it, and must be able to change while the installation runs one immutable
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
import type { InstallationFailure } from "./failures";
import type { FoundationReleaseReference } from "@/core/foundation-release/reference";



/** The record's file name — part of the durable contract; its LOCATION belongs to the path authority. */
export const INSTALLATION_OPERATIONAL_STATE_FILE_NAME = "operational-state.json";

/**
 * The schema version of the document below, from the very first release of the contract.
 *
 * It is deliberately NOT called `version`: this is the schema's own number, and a reader must never
 * confuse it with the Foundation release an installation is running (that is `live.release.tag`). A record
 * whose `schemaVersion` is not this number is REFUSED — a future migration is a deliberate act that knows
 * both shapes, never a guess made while reading.
 */
export const INSTALLATION_OPERATIONAL_STATE_SCHEMA_VERSION = 1;

/**
 * How many events `history` keeps: the newest are appended, the oldest are dropped.
 *
 * A bound is a contract rather than an implementation detail, because the record must stay readable and
 * comparable for the life of an installation. Current truth never depends on history (see the module note),
 * so trimming is safe by construction.
 */
export const INSTALLATION_LIFECYCLE_HISTORY_LIMIT = 100;

/**
 * WHICH installation this record describes.
 *
 * The identity is part of the record so that the record is SELF-DESCRIBING: whoever holds these bytes
 * knows they describe THIS installation without trusting the path they were found at. It is the name the
 * operator uses and the repository the installation's own source lives in — its OWN authority, never the
 * platform's, never a branch, and never a pointer to another installation.
 */
export interface FoundationInstallationIdentity {
  readonly name: string;
  /** The installation's OWN repository/authority — not the platform's, and never a branch. */
  readonly repository: string;
}

/** The two health values of the ACTIVE installation. There is deliberately no "degraded" and no "unknown". */
export const INSTALLATION_HEALTH = {
  /** The live installation is serving. */
  ONLINE: "online",
  /**
   * The live installation is not serving — or nothing is live yet (an installation that is not activated),
   * or nothing has ever judged it (an ACTIVATED installation whose `healthEvaluatedAt` is `null`: becoming
   * live is not an observation that anything serves — FOUNDATION-B4B-A1).
   */
  OFFLINE: "offline",
} as const;

/** ONLINE or OFFLINE: the health of the ACTIVE installation, never the outcome of the last attempt. */
export type InstallationHealth = (typeof INSTALLATION_HEALTH)[keyof typeof INSTALLATION_HEALTH];

/** Whether anything is live at all. Derived from `live` — never stored twice. */
export const INSTALLATION_ACTIVATION = {
  /** Nothing has ever been activated: no live release, and no live installation revision. */
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
 *   `authored`     the identity of the installation's OWN authored input the candidate was built from:
 *                  a `sha256:` content digest over the installation's authored surfaces (configuration,
 *                  dictionaries, pages, artwork). A digest rather than a commit, because an installation
 *                  need not be a Git checkout at all — and the algorithm is the building phase's, while
 *                  the CONTRACT is that two identical inputs produce one identity.
 *   `materialized` the `sha256:` content digest of the candidate tree itself.
 *
 * Together they are the identity continuity proof (`model` → `transitions.ts`): validation, staging
 * inspection and promotion compare THIS value, so promotion can never promote "something equivalent
 * rebuilt for production".
 */
export interface InstallationCandidateIdentity {
  /** The release identity the candidate contains (must be the attempt's desired release). */
  readonly release: string;
  /** The `sha256:` content digest of the installation's authored input. */
  readonly authored: string;
  /** The `sha256:` content digest of the materialised candidate tree. */
  readonly materialized: string;
}

/** The ONE digest shape a candidate identity field may take. */

/** WHY a lifecycle attempt was started. The kind decides which preconditions must hold (see `transitions.ts`). */
export const INSTALLATION_ATTEMPT_KINDS = [
  /** Establish an installation that has nothing live yet. */
  "install",
  /** Move a LIVE installation to the desired release. */
  "upgrade",
  /** Return a live installation to the previously known-good live state. */
  "rollback",
] as const;

/** `install`, `upgrade` or `rollback`. */
export type InstallationAttemptKind = (typeof INSTALLATION_ATTEMPT_KINDS)[number];

/**
 * HOW FAR an attempt got. Stages are the lifecycle's own steps, so a reader sees where work stopped
 * without reading a log — and the terminal stages are the only ones that also settle the outcome.
 */
export const INSTALLATION_ATTEMPT_STAGES = [
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
  /** Promotion completed: this candidate IS the live installation. Terminal, successful. */
  "live",
  /** The attempt ended without becoming live. Terminal, failed. */
  "failed",
] as const;

/** One lifecycle step. */
export type InstallationAttemptStage = (typeof INSTALLATION_ATTEMPT_STAGES)[number];

/** Whether an attempt is still moving, and how it ended. */
export const INSTALLATION_ATTEMPT_OUTCOMES = ["pending", "succeeded", "failed"] as const;

/** `pending` while an attempt is in flight; `succeeded`/`failed` once it is done. */
export type InstallationAttemptOutcome = (typeof INSTALLATION_ATTEMPT_OUTCOMES)[number];

/**
 * ONE lifecycle attempt: the desired release, the candidate, how far it got, and why it stopped.
 *
 * The attempt is the ONLY place a desired release is expressed. There is no separate "desired release"
 * configuration to keep in step with reality: an operator (or a control plane) asks for a release by
 * STARTING an attempt, and the attempt records the request until it is settled.
 */
export interface FoundationInstallationAttempt {
  readonly kind: InstallationAttemptKind;
  /** The release the attempt asked for, in full — identity, provenance and content identity. */
  readonly target: FoundationReleaseReference;
  readonly stage: InstallationAttemptStage;
  readonly outcome: InstallationAttemptOutcome;
  /** The candidate identity, or `null` while the attempt is still `preparing`. */
  readonly candidate: InstallationCandidateIdentity | null;
  /** When the attempt was recorded as started (UTC instant). */
  readonly startedAt: string;
  /** When the attempt settled (UTC instant), or `null` while it is `pending`. */
  readonly endedAt: string | null;
  /** Why the attempt failed, or `null` when it has not failed. */
  readonly failure: InstallationFailure | null;
}

/**
 * An installation state that is NO LONGER live, kept as the rollback provenance.
 *
 * It records the exact release AND the exact installation revision that were live, so "return to the
 * previously known-good state" names a revision rather than a mood — and so a rollback cannot quietly
 * mean "re-materialise whatever that release builds today".
 */
export interface PreviousLiveInstallation {
  readonly release: FoundationReleaseReference;
  /** The `sha256:` digest of the installation revision that was live. */
  readonly revision: string;
  /** When this state stopped being live (UTC instant). */
  readonly retiredAt: string;
}

/**
 * WHAT IS LIVE: the Foundation release, and the EXACT installation revision serving it.
 *
 * The two are different facts: several installation revisions may exist for one release (an authored
 * change), so the release identity alone could not name what is running.
 */
export interface LiveInstallation {
  readonly release: FoundationReleaseReference;
  /** The `sha256:` digest of the live installation revision. */
  readonly revision: string;
  /** When this state became live (UTC instant). */
  readonly activatedAt: string;
  /** The state that was live before it — the rollback provenance, or `null` for a first activation. */
  readonly previous: PreviousLiveInstallation | null;
}

export const INSTALLATION_CONTENT_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

/** True when two identities name the SAME candidate in every respect a promotion must prove. */

/**
 * WHAT HAPPENED, in a small closed vocabulary.
 *
 * Events explain how the installation reached its current state; they never determine it. Each one names
 * the release it concerns, so a reader can follow one release through an upgrade without cross-referencing
 * anything else. A refusal, a cancelled idea or a validation error thrown at a caller is NOT an event:
 * the history records what the installation actually became, never every question that was asked of it.
 */
export const INSTALLATION_LIFECYCLE_EVENT_TYPES = [
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
  /** A candidate became the live installation (an install, an upgrade or a rollback). */
  "promoted",
  /** The live installation's health became (or was re-asserted as) ONLINE. */
  "health-online",
  /** The live installation's health became OFFLINE. */
  "health-offline",
] as const;

/** One recorded lifecycle event type. */
export type InstallationLifecycleEventType = (typeof INSTALLATION_LIFECYCLE_EVENT_TYPES)[number];

/** ONE appended fact about this installation's lifecycle. */
export interface InstallationLifecycleEvent {
  readonly type: InstallationLifecycleEventType;
  /** When it happened (UTC instant) — provenance, never identity. */
  readonly at: string;
  /** The release identity the event concerns. */
  readonly release: string;
  /** One human sentence: what happened, in the installation's own words. */
  readonly detail: string;
}

/**
 * THE SNAPSHOT: everything that is true about the installation right now.
 *
 * `healthEvaluatedAt` is the instant the current health value was ACTUALLY evaluated. It stays `null` until
 * a real evaluation happens — including for a live installation, because ACTIVATION IS NOT HEALTH
 * (FOUNDATION-B4B-A1): becoming live is not an observation that anything serves. It is therefore the
 * record's structural way of saying "health has never been evaluated", while `current.live` independently
 * says whether the installation is activated.
 */
export interface FoundationInstallationState {
  /**
   * WHICH installation this record describes — its identity, never a path and never another installation.
   *
   * It is the only field that says whose state these bytes are, which is what makes the record
   * self-describing: a reader that finds this file does not have to know where it was found, and does not
   * have to ask any other installation what it is.
   */
  readonly installationIdentity: FoundationInstallationIdentity;
  readonly health: InstallationHealth;
  readonly healthEvaluatedAt: string | null;
  /** What is live, or `null` when this installation has never been activated. */
  readonly live: LiveInstallation | null;
  /** What is happening, or what last happened — `null` only for an installation nothing has acted on. */
  readonly lastAttempt: FoundationInstallationAttempt | null;
}

/**
 * THE DURABLE DOCUMENT: the snapshot plus the bounded history of how it got there.
 *
 * This is the WHOLE record — the exact thing serialised to `operational-state.json`. Its two parts are
 * deliberate (see the module note): `current` answers "what is true?", `history` answers "how?".
 */
export interface FoundationInstallationOperationalState {
  readonly schemaVersion: number;
  readonly current: FoundationInstallationState;
  readonly history: readonly InstallationLifecycleEvent[];
}

export function identicalInstallationCandidates(
  left: InstallationCandidateIdentity,
  right: InstallationCandidateIdentity,
): boolean {
  return (
    left.release === right.release &&
    left.authored === right.authored &&
    left.materialized === right.materialized
  );
}

/** `unestablished` or `active`. */
export type InstallationActivation = (typeof INSTALLATION_ACTIVATION)[keyof typeof INSTALLATION_ACTIVATION];
