/**
 * THE PORTS A FOUNDATION INSTALLATION'S LIFECYCLE NEEDS (FOUNDATION-B4A / B4A-A2)
 * ============================================================================
 *
 * The lifecycle domain (`src/core/foundation-installation`) is pure: given a record and a moment, it
 * decides what is legal and what the next record is. Everything that touches the world outside that record
 * — a clock, the installation's own durable file, and the release it is installing — arrives through ONE
 * of the ports below, so the SAME model is driven identically by a human CLI, a downstream agent, a future
 * control plane and a test. No port knows about a terminal, a prompt, a session, a user identity, GitHub,
 * Vercel or a filesystem layout; those, if they exist, are adapters on top of these contracts.
 *
 * THE INSTALLATION KNOWS ONLY ITSELF
 * ----------------------------------
 * Every port describes THIS installation's own business. There is no port for another installation: no
 * peer, parent, child, sibling, source, clone, registry, fleet or cross-installation store, because no such
 * relationship exists in the model. Nothing here can phone home, discover "the latest release", poll an
 * upstream or require a connection to anything — an installation must be able to operate indefinitely with
 * no network at all, using a release it was given.
 *
 * THREE PORTS, AND WHY ONLY THREE
 * ------------------------------
 *   · the CLOCK, because a lifecycle operation must record when something happened and the domain may
 *     never read the time itself (a test must not depend on the wall clock).
 *   · the OPERATIONAL STATE STORE, because the record of what is running and what happened must outlive
 *     the process that wrote it — and reading it must be able to answer "there is no record yet", which is
 *     a real state rather than an error.
 *   · the FOUNDATION RELEASE ACQUISITION SOURCE, because a release must be OBTAINED without the domain
 *     knowing how. The canonical Provelopment repository is the default and canonical PUBLIC acquisition
 *     source for official Foundation releases — and an operator may instead supply a release from a local
 *     directory, an archive, a mirror or another approved provider. The domain therefore never equates
 *     "upgrade" with "connect to GitHub": it accepts ONE VERIFIED IMMUTABLE FOUNDATION RELEASE as input,
 *     and where those bytes came from is this port's business.
 *
 * PROVENANCE IS NOT ACQUISITION (the distinction this port exists to keep)
 * ----------------------------------------------------------------------
 *   provenance   the release's own immutable identity: tag, source commit/tree, content policy, content
 *                digest, manifest format, and the canonical platform it is OF. It travels with the
 *                release and never changes (`@/core/foundation-release`).
 *   acquisition  where THIS installation obtained the bytes for THIS attempt — a mutable, incidental fact
 *                about an act.
 *
 * Acquisition is therefore NOT part of a release's identity, and it is not part of the installation's
 * durable operational state either: the record says WHAT is running (immutable identity); an adapter
 * reports where it got the bytes, in its own diagnostics.
 *
 * WHAT IS DELIBERATELY *NOT* DECLARED YET. A candidate store/materializer, a validator, a staging
 * deployer, a live promoter, a rollback executor and a health probe are real needs — of B4B–B4G, which
 * implement the mechanics. Declaring their shape now would fix a design before the phase that has to live
 * with it decides, so they are deferred rather than guessed. This is the smallest port set the DOMAIN
 * model requires to be complete.
 *
 * WHAT A PORT IMPLEMENTATION MAY DO (the write boundary, stated where implementers read it)
 * --------------------------------------------------------------------------------------
 * A lifecycle operation writes only inside the installation it is operating: its own operational record,
 * and later its own candidate/staging areas. It never writes another installation, another fixture, the
 * Foundation's source, or a global system path — and when it finds a genuine Foundation defect it STOPS
 * and reports it rather than patching the platform from inside an installation. The Foundation is fixed by
 * a Foundation release, which the installation may then choose to adopt like any other.
 *
 * These are TYPES: nothing here is implemented, and nothing here may be imported by `src/core`.
 */
import type { FoundationInstallationOperationalState } from "@/core/foundation-installation";
import type { FoundationReleaseReference } from "@/core/foundation-release/reference";

/**
 * The ONE source of "now" for a lifecycle operation.
 *
 * It returns a `Date`; the domain turns it into the recorded UTC instant (`utcInstant`), which is why an
 * implementation cannot introduce a local timezone, a locale format or a sub-second precision into the
 * record. A test passes a fixed clock and gets a deterministic record.
 */
export interface InstallationClock {
  /** The current moment, as an absolute instant. */
  now(): Date;
}

/**
 * The installation's OWN durable operational record: the thing that must outlive the process.
 *
 * `read` answers `null` when this installation has no record yet — a first, unestablished installation —
 * and otherwise the PARSED JSON exactly as stored, deliberately `unknown`: validating it is the domain's
 * job (`parseInstallationOperationalState`), and a store that filtered or repaired the record would hide
 * the very corruption the record exists to expose.
 *
 * `write` receives a document the domain has already validated, and the implementation stores it whole —
 * the record's file name and schema are the contract's, its LOCATION is the installation root resolved by
 * `@/config/deployment-root`, and the installation's own filesystem is the only place it may write.
 *
 * Both are ASYNC so that a later implementation may place the record somewhere other than a local file (a
 * host's persistent volume, a control plane's store) without changing this contract.
 */
export interface InstallationOperationalStateStore {
  read(): Promise<unknown | null>;
  write(state: FoundationInstallationOperationalState): Promise<void>;
}

/**
 * ONE immutable Foundation release as OBTAINED by this installation: the release itself, plus the
 * acquisition fact that made it available here.
 *
 * The two are deliberately separate fields, because they are different kinds of truth: `release` is
 * immutable and identifies the platform artifact; `acquiredFrom` is a mutable, incidental description of
 * the act (which configured source, which directory, which archive). Nothing downstream may treat
 * `acquiredFrom` as part of the release's identity, which is exactly what makes a locally supplied release
 * interchangeable with one fetched from the canonical repository.
 */
export interface AcquiredFoundationRelease {
  /** The VERIFIED immutable release. Its identity is the release's own, whatever the source. */
  readonly release: FoundationReleaseReference;
  /** Where THIS installation obtained the bytes — a description for diagnostics, never release identity. */
  readonly acquiredFrom: string;
}

/**
 * Obtain ONE immutable Foundation release, however THIS installation is configured to obtain releases.
 *
 * The only input is the immutable release identity (a tag such as
 * `provelopment-foundation-v20260930.1427`, or the grandfathered first release), because that is the only
 * thing an installation may name. The result is the verified release plus where it came from.
 *
 * An implementation obtains bytes from SOMEWHERE it was configured or told to use — the canonical public
 * repository, a local directory, an archive, a mirror, another approved provider. That choice belongs
 * entirely to the adapter; the lifecycle sees only the release. Resolution and verification happen here
 * (a manifest that does not match the identity must FAIL), and an implementation that cannot obtain the
 * named release must fail rather than substitute a different one, a later one or "the latest".
 */
export interface FoundationReleaseAcquisitionSource {
  /** A description of the configured source, for diagnostics — acquisition, never release identity. */
  readonly description: string;
  /** Obtain and verify ONE immutable release, or fail loudly. */
  acquire(identity: string): Promise<AcquiredFoundationRelease>;
}
