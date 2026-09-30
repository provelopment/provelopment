/**
 * THE PORTS A DEPLOYMENT LIFECYCLE NEEDS (FOUNDATION-B4A)
 * =====================================================
 *
 * The lifecycle domain (`src/core/deployment-lifecycle`) is pure: given a record and a moment, it decides
 * what is legal and what the next record is. Everything that touches the world outside that record — a
 * clock, the deployment's own durable file, a Foundation release — arrives through ONE of the ports below,
 * so the SAME model is driven identically by a human CLI, a downstream agent, a future control plane and a
 * test. No port knows about a terminal, a prompt, GitHub, Vercel, a user identity or a session; those, if
 * they ever exist, are adapters on top of these contracts.
 *
 * THREE PORTS, AND WHY ONLY THREE
 * ------------------------------
 *   · the CLOCK, because a lifecycle operation must record when something happened and the domain may never
 *     read the time itself (a test must not depend on the wall clock).
 *   · the OPERATIONAL STATE STORE, because the record of what is running and what happened must outlive the
 *     process that wrote it — and reading it must be able to answer "there is no record yet", which is a
 *     real state rather than an error.
 *   · the FOUNDATION RELEASE READER, because a deployment names the release it runs, adopts, stages or
 *     promotes by IMMUTABLE IDENTITY, never by a branch — so something must turn that identity into the
 *     reference the domain validates. Reading a release is read-only and resolves nothing about branches.
 *
 * WHAT IS DELIBERATELY *NOT* DECLARED YET. A candidate store/materializer, a validator, a staging deployer
 * and a live promoter are all real needs — of B4B–B4G, which implement the mechanics. Declaring their shape
 * now would fix a design before the phase that has to live with it decides, so they are deferred rather
 * than guessed. This is the smallest port set the DOMAIN model requires to be complete.
 *
 * WHAT A PORT IMPLEMENTATION MAY DO (the write boundary, stated where implementers read it)
 * --------------------------------------------------------------------------------------
 * A lifecycle operation writes only inside the deployment it is operating: its own operational record, and
 * later its own candidate/staging areas. It never writes another deployment, another fixture, the
 * Foundation's source, or a global system path — and when it finds a genuine platform defect it STOPS and
 * reports it rather than patching the platform from inside a deployment. The Foundation is fixed by a
 * Foundation release, which the deployment then adopts like any other.
 *
 * These are TYPES: nothing here is implemented, and nothing here may be imported by `src/core`.
 */
import type { DeploymentOperationalState, FoundationReleaseReference } from "@/core/deployment-lifecycle";

/**
 * The ONE source of "now" for a lifecycle operation.
 *
 * It returns a `Date`; the domain turns it into the recorded UTC instant (`utcInstant`), which is why an
 * implementation cannot introduce a local timezone, a locale format or a sub-second precision into the
 * record. A test passes a fixed clock and gets a deterministic record.
 */
export interface DeploymentClock {
  /** The current moment, as an absolute instant. */
  now(): Date;
}

/**
 * The deployment's OWN durable operational record: the thing that must outlive the process.
 *
 * `read` answers `null` when this deployment has no record yet — a first, unestablished deployment — and
 * otherwise the PARSED JSON exactly as stored, deliberately `unknown`: validating it is the domain's job
 * (`parseDeploymentOperationalState`), and a store that filtered or repaired the record would hide the very
 * corruption the record exists to expose.
 *
 * `write` receives a document the domain has already validated, and the implementation stores it whole —
 * the record's file name and schema are the contract's, its LOCATION is the deployment root resolved by
 * `@/config/deployment-root`, and the deployment's own filesystem is the only place it may write.
 *
 * Both are ASYNC so that a later implementation may place the record somewhere other than a local file
 * (a host's persistent volume, a control plane's store) without changing this contract.
 */
export interface DeploymentOperationalStateStore {
  read(): Promise<unknown | null>;
  write(state: DeploymentOperationalState): Promise<void>;
}

/**
 * Resolving ONE immutable Foundation release identity to the full reference the lifecycle reasons about.
 *
 * The only input is the identity (a tag such as `provelopment-foundation-v20260930.1427` or the
 * grandfathered first release), because that is the only thing a deployment may name. Returning the
 * reference makes the provenance (commit, tree) and the content identity (policy, digest, file count)
 * available for comparison — and an implementation that cannot resolve an identity must FAIL rather than
 * fall back to a branch, a default or "the latest".
 */
export interface FoundationReleaseReader {
  read(identity: string): Promise<FoundationReleaseReference>;
}
