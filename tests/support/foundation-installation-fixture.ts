/**
 * A VALID FOUNDATION-INSTALLATION OPERATIONAL RECORD, BUILT IN PIECES (FOUNDATION-B4A / B4A-A2)
 * ==========================================================================================
 *
 * The lifecycle contract's tests describe STATES, and a state has many fields. These builders name each
 * one once so a test can say exactly what it is about ("health online while nothing is live") without
 * drowning in the fields it does not care about — and so a change to the schema has ONE place in the test
 * tree to follow.
 *
 * They build DATA, never files: the record's persistence is a port's business (`@/application/
 * foundation-installation-ports`), and nothing in `tests/**` writes an installation.
 *
 * The RELEASE side comes from the pure release contract (`@/core/foundation-release`), which the lifecycle
 * domain consumes too — so a test never has to reach into the release tooling for an identity.
 */
import type {
  FoundationInstallationAttempt,
  FoundationInstallationIdentity,
  FoundationInstallationOperationalState,
  InstallationCandidateIdentity,
  InstallationHealth,
  InstallationLifecycleEvent,
  LiveInstallation,
  PreviousLiveInstallation,
} from "@/core/foundation-installation";
import { INSTALLATION_OPERATIONAL_STATE_SCHEMA_VERSION } from "@/core/foundation-installation";
import { FOUNDATION_INITIAL_RELEASE_IDENTITY } from "@/core/foundation-release/identity.mjs";
import type { FoundationReleaseReference } from "@/core/foundation-release/reference";

/** The platform authority a Foundation release comes from. */
export const FOUNDATION_REPOSITORY = "https://github.com/provelopment/provelopment-foundation";

/** A digest of the shape every recorded content identity takes, without pretending to be a real one. */
export const digest = (seed: string): string => `sha256:${seed.repeat(64).slice(0, 64)}`;

/** The grandfathered first release, taken from the identity AUTHORITY rather than restated. */
export const FIRST_RELEASE = FOUNDATION_INITIAL_RELEASE_IDENTITY;

/** A canonical future release identity, the naming contract's own shape. */
export const CANONICAL_RELEASE = "provelopment-foundation-v20261001.0900";

/** Another canonical release, for comparing two of them. */
export const NEXT_RELEASE = "provelopment-foundation-v20261002.1015";

/** ONE immutable Foundation release reference, as an adoption record or a live state names it. */
export function releaseReference(
  overrides: Partial<FoundationReleaseReference> & { tag?: string } = {},
): FoundationReleaseReference {
  const tag = overrides.tag ?? CANONICAL_RELEASE;
  return {
    tag,
    repository: FOUNDATION_REPOSITORY,
    commit: "1".repeat(40),
    tree: "2".repeat(40),
    manifestFormat: 1,
    content: { policy: "foundation-source-v1", digest: digest("9"), fileCount: 334 },
    ...overrides,
    ...(overrides.content === undefined ? {} : { content: overrides.content }),
  };
}

/** The installation's own identity: its name, and the repository its source lives in. */
export function installationIdentity(overrides: Partial<FoundationInstallationIdentity> = {}): FoundationInstallationIdentity {
  return { name: "reference-installation", repository: "https://github.com/example/reference-site", ...overrides };
}

/** ONE candidate identity: the release it contains, its authored input, and the materialised tree. */
export function candidateIdentity(overrides: Partial<InstallationCandidateIdentity> = {}): InstallationCandidateIdentity {
  return { release: CANONICAL_RELEASE, authored: digest("a"), materialized: digest("b"), ...overrides };
}

/** A state that stopped being live, as rollback provenance records it. */
export function previousLive(overrides: Partial<PreviousLiveInstallation> = {}): PreviousLiveInstallation {
  return { release: releaseReference({ tag: FIRST_RELEASE }), revision: digest("c"), retiredAt: "2026-10-01T09:00:00Z", ...overrides };
}

/** What is live: the release, the exact installation revision, and the state it replaced. */
export function liveState(overrides: Partial<LiveInstallation> = {}): LiveInstallation {
  return {
    release: releaseReference(),
    revision: digest("b"),
    activatedAt: "2026-10-01T09:00:00Z",
    previous: null,
    ...overrides,
  };
}

/** ONE settled attempt, as a record stores the last one. */
export function attempt(overrides: Partial<FoundationInstallationAttempt> = {}): FoundationInstallationAttempt {
  return {
    kind: "install",
    target: releaseReference(),
    stage: "live",
    outcome: "succeeded",
    candidate: candidateIdentity(),
    startedAt: "2026-10-01T08:55:00Z",
    endedAt: "2026-10-01T09:00:00Z",
    failure: null,
    ...overrides,
  };
}

/** ONE history event, in the closed vocabulary. */
export function event(overrides: Partial<InstallationLifecycleEvent> = {}): InstallationLifecycleEvent {
  return { type: "promoted", at: "2026-10-01T09:00:00Z", release: CANONICAL_RELEASE, detail: "a candidate became live", ...overrides };
}

/** A COMPLETE, VALID record: an established installation serving one release, with no attempt in flight. */
export function operationalState(overrides: Partial<FoundationInstallationOperationalState> = {}): FoundationInstallationOperationalState {
  return {
    schemaVersion: INSTALLATION_OPERATIONAL_STATE_SCHEMA_VERSION,
    current: {
      installationIdentity: installationIdentity(),
      health: "online",
      healthEvaluatedAt: "2026-10-01T09:00:00Z",
      live: liveState(),
      lastAttempt: attempt(),
    },
    history: [event()],
    ...overrides,
  };
}

/** The record with ONE health value, so a test can state the situation it means. */
export function withHealth(state: FoundationInstallationOperationalState, health: InstallationHealth): FoundationInstallationOperationalState {
  return { ...state, current: { ...state.current, health } };
}
