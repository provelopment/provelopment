/**
 * THE INDEPENDENT DEPLOYMENT LIFECYCLE (FOUNDATION-B4A)
 * ===================================================
 *
 * The framework-neutral contract an independently managed deployment follows: what may be live, what a
 * candidate is, what "online" means, which moves are legal, and the durable record that answers those
 * questions without reading prose.
 *
 * Import from `@/core/deployment-lifecycle`; the inner modules are the implementation's seams, not the
 * published vocabulary. `README.md` in this directory states the model, the transition table, the failure
 * semantics and the ownership boundaries — read it before changing anything here.
 *
 * THIS MODULE CONTAINS NO MECHANICS. Installing, materialising a candidate, validating it, deploying
 * staging, promoting, rolling back and probing health are later phases (B4B–B4G) that USE this contract;
 * the ports they will implement are declared in `@/application/deployment-lifecycle-ports`.
 */
export {
  DEPLOYMENT_HEALTH,
  DEPLOYMENT_ACTIVATION,
  DEPLOYMENT_ATTEMPT_KINDS,
  DEPLOYMENT_ATTEMPT_OUTCOMES,
  DEPLOYMENT_ATTEMPT_STAGES,
  DEPLOYMENT_CONTENT_DIGEST_PATTERN,
  DEPLOYMENT_LIFECYCLE_EVENT_TYPES,
  DEPLOYMENT_LIFECYCLE_HISTORY_LIMIT,
  DEPLOYMENT_OPERATIONAL_STATE_FILE_NAME,
  DEPLOYMENT_OPERATIONAL_STATE_SCHEMA_VERSION,
  identicalDeploymentCandidates,
  isUtcInstant,
  utcInstant,
} from "./model";
export type {
  DeploymentActivation,
  DeploymentAttemptKind,
  DeploymentAttemptOutcome,
  DeploymentAttemptStage,
  DeploymentCandidateIdentity,
  DeploymentCurrentState,
  DeploymentHealth,
  DeploymentIdentity,
  DeploymentLifecycleAttempt,
  DeploymentLifecycleEvent,
  DeploymentLifecycleEventType,
  DeploymentOperationalState,
  LiveDeployment,
  PreviousLiveDeployment,
} from "./model";

export { DEPLOYMENT_FAILURE_CATEGORIES, isDeploymentFailureCategory } from "./failures";
export type { DeploymentFailure, DeploymentFailureCategory } from "./failures";

export {
  foundationReleaseLabel,
  foundationReleaseReferenceIssues,
  identicalFoundationReleases,
  isFoundationReleaseReference,
} from "./release-reference";
export type { FoundationReleaseContent, FoundationReleaseReference } from "./release-reference";

export {
  deploymentActivationState,
  deploymentHealthOf,
  deploymentOperationalStateIssues,
  initialDeploymentOperationalState,
  parseDeploymentOperationalState,
} from "./state";

export {
  beginDeploymentPromotion,
  completeDeploymentPromotion,
  failDeploymentAttempt,
  isDeploymentAttemptPending,
  isDeploymentCandidatePromotable,
  recordDeploymentCandidate,
  recordDeploymentCandidateStaged,
  recordDeploymentCandidateValidated,
  recordDeploymentHealth,
  recordDeploymentStagingInspected,
  startDeploymentAttempt,
} from "./transitions";
