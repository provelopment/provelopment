/**
 * THE AUTONOMOUS FOUNDATION INSTALLATION'S LIFECYCLE (FOUNDATION-B4A / B4A-A2)
 * =========================================================================
 *
 * The framework-neutral contract ONE Foundation installation follows: what may be live, what a candidate is,
 * what "online" means, which moves are legal, and the durable record that answers those questions without
 * reading prose.
 *
 * THE SUBJECT IS THE COMPLETE INSTALLATION — it runs the platform, owns its authored state and manages its
 * own spokes (a Site lives inside a spoke). It knows NOTHING about any other installation: no parent, child,
 * sibling, source, clone, registry or fleet, and no runtime connection of any kind. See `README.md` in this
 * directory for the hierarchy, the independence contract and the release provenance/acquisition split.
 *
 * THE RELEASE CONTRACT IS ITS OWN AUTHORITY: what an immutable Foundation release IS lives in
 * `@/core/foundation-release`, consumed by this lifecycle AND by the release tooling — `src/core/**` never
 * depends on `scripts/**`.
 *
 * Import from `@/core/foundation-installation`; the inner modules are the implementation's seams, not the
 * published vocabulary. `README.md` in this directory states the model, the transition table, the failure
 * semantics and the ownership boundaries — read it before changing anything here.
 *
 * THIS MODULE CONTAINS NO MECHANICS. Installing, materialising a candidate, validating it, deploying
 * staging, promoting, rolling back and probing health are later phases (B4B–B4G) that USE this contract;
 * the ports they will implement are declared in `@/application/foundation-installation-ports`.
 */
export {
  INSTALLATION_HEALTH,
  INSTALLATION_ACTIVATION,
  INSTALLATION_ATTEMPT_KINDS,
  INSTALLATION_ATTEMPT_OUTCOMES,
  INSTALLATION_ATTEMPT_STAGES,
  INSTALLATION_CONTENT_DIGEST_PATTERN,
  INSTALLATION_LIFECYCLE_EVENT_TYPES,
  INSTALLATION_LIFECYCLE_HISTORY_LIMIT,
  INSTALLATION_OPERATIONAL_STATE_FILE_NAME,
  INSTALLATION_OPERATIONAL_STATE_SCHEMA_VERSION,
  identicalInstallationCandidates,
  isUtcInstant,
  utcInstant,
} from "./model";
export type {
  InstallationActivation,
  InstallationAttemptKind,
  InstallationAttemptOutcome,
  InstallationAttemptStage,
  InstallationCandidateIdentity,
  FoundationInstallationState,
  InstallationHealth,
  FoundationInstallationIdentity,
  FoundationInstallationAttempt,
  InstallationLifecycleEvent,
  InstallationLifecycleEventType,
  FoundationInstallationOperationalState,
  LiveInstallation,
  PreviousLiveInstallation,
} from "./model";

export { INSTALLATION_FAILURE_CATEGORIES, isInstallationFailureCategory } from "./failures";
export type { InstallationFailure, InstallationFailureCategory } from "./failures";

// The release contract is NOT re-exported here: it is its own authority (`@/core/foundation-release`),
// consumed by this lifecycle, by the release tooling and by future acquisition/verification adapters. One
// authority, one import path — a second door would only invite the two to drift apart.

export {
  installationActivationState,
  installationHealthOf,
  installationOperationalStateIssues,
  initialInstallationOperationalState,
  parseInstallationOperationalState,
} from "./state";

export {
  beginInstallationPromotion,
  completeInstallationPromotion,
  failInstallationAttempt,
  isInstallationAttemptPending,
  isInstallationCandidatePromotable,
  recordInstallationCandidate,
  recordInstallationCandidateStaged,
  recordInstallationCandidateValidated,
  recordInstallationHealth,
  recordInstallationStagingInspected,
  startInstallationAttempt,
} from "./transitions";
