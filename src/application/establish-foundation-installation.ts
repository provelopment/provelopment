/**
 * ESTABLISHING ONE COMPLETE FOUNDATION INSTALLATION (FOUNDATION-B4B)
 * ==================================================================
 *
 * The use case behind `pnpm installation:establish`: given ONE named immutable Foundation release, ONE
 * authored installation seed and ONE explicit target root, it materialises a complete installation and
 * records the lifecycle facts that make the result checkable.
 *
 * THE SEQUENCE IS THE APPROVED LIFECYCLE, NOT A PARALLEL ONE
 * ----------------------------------------------------------
 * Establishment drives `@/core/foundation-installation` step by step, and every step it records is a
 * transition that contract already defines for a FRESH INSTALL:
 *
 *   startInstallationAttempt(install, target = the release)   the attempt begins, stage "preparing"
 *   … materialise into the target root …                      platform payload + seed + adoption record
 *   recordInstallationCandidate(candidate)                    the candidate tree exists, identity known
 *   recordInstallationCandidateValidated()                    identity checked: seed shape, release continuity
 *   recordInstallationCandidateStaged()                       materialised into the installation root
 *   recordInstallationStagingInspected()                      the installation verified itself
 *   beginInstallationPromotion() / completeInstallationPromotion(candidate)
 *                                                             the candidate becomes LIVE, health ONLINE
 *   the operational record is written                         the LAST act — the completion marker
 *
 * A candidate is the only thing that can be promoted, and promotion re-checks the exact identity (release +
 * authored digest + materialised digest), so what goes live is provably the artifact this establishment
 * materialised.
 *
 * FAILURE SEMANTICS: NOTHING IS EVER MISTAKEN FOR SUCCESS
 * ------------------------------------------------------
 * The operational record is the ONE durable artefact that says "this installation exists", and it is written
 * once, at the END, only after the installation has been materialised and its identity verified. Therefore a
 * failure before it exists leaves an unactivated target — no record, nothing live — and a re-run REFUSES the
 * non-empty target rather than overwriting it, so a partial installation can never be mistaken for a
 * successful one. A failure after it exists is impossible by construction, because writing it is the last
 * step.
 *
 * The failure is reported in the platform's own failure vocabulary (`InstallationFailureCategory`) rather
 * than as an arbitrary exception: `release-resolution` when the release cannot be obtained or is not the
 * artifact it claims to be, `installation-validation` when the authored input or the candidate identity is
 * not a valid Foundation installation, `materialization` when nothing can be written where it must go
 * (including an unsafe target root), `promotion` when becoming live — or recording that it did — failed.
 *
 * WHAT ESTABLISHMENT DOES *NOT* DO: it installs no dependencies, runs no build and no tests, creates no Git
 * repository, publishes nothing and creates no tag. Proving that the established installation can install,
 * build and test ITSELF is a separate act with its own evidence (`instruction-manuals/adoption.md`). It also
 * never reads the source installation at run time: the only inputs are the release payload, the seed and the
 * target, so once establishment succeeds the source is irrelevant to operation.
 *
 * Framework-neutral: ports in, plain data out. No filesystem, no clock, no network, no Git, no framework.
 */
import { siteConfigFileSchema } from "@/config/schema";
import {
  contentDigestSubject,
  RELEASE_DIGEST_SCOPE_ID,
  RELEASE_PAYLOAD_FORMAT,
} from "@/core/foundation-release/content-digest.mjs";
import { isRecognizedFoundationReleaseIdentity } from "@/core/foundation-release/identity.mjs";
import { RELEASE_CONTENT_POLICY_ID } from "@/core/foundation-release/manifest.mjs";
import {
  foundationReleaseLabel,
  isFoundationReleaseReference,
  type FoundationReleaseReference,
} from "@/core/foundation-release/reference";
import {
  INSTALLATION_ADOPTION_RECORD_FILE_NAME,
  INSTALLATION_CONTENT_SCOPE,
  INSTALLATION_GENERATED_STATE_IGNORE_RULE,
  INSTALLATION_SEED_REFUSED_PATHS,
  INSTALLATION_SEED_REQUIREMENTS,
  foundationInstallationAdoptionRecord,
  installationIsEstablishedFrom,
  offsetInstant,
} from "@/core/foundation-installation/establishment";
import {
  beginInstallationPromotion,
  completeInstallationPromotion,
  initialInstallationOperationalState,
  parseInstallationOperationalState,
  recordInstallationCandidate,
  recordInstallationCandidateStaged,
  recordInstallationCandidateValidated,
  recordInstallationStagingInspected,
  startInstallationAttempt,
  utcInstant,
  INSTALLATION_OPERATIONAL_STATE_FILE_NAME,
  type FoundationInstallationIdentity,
  type InstallationCandidateIdentity,
  type InstallationFailure,
  type InstallationFailureCategory,
  type InstallationLifecycleEvent,
} from "@/core/foundation-installation/index";

import type {
  FoundationContentFile,
  FoundationContentHasher,
  FoundationEstablishmentDependencies,
} from "./foundation-establishment-ports";


const utf8 = new TextEncoder();

/**
 * The capsule directory's own relative path inside an installation root is SUPPLIED BY THE CALLER, never
 * spelled here.
 *
 * The name belongs to the platform's build selection authority (`src/config/deployment-build.mjs`), and
 * `src/**` may not import that module: it touches `node:fs`, so an application module importing it would
 * drag a filesystem import into a client chunk (`tests/architecture/deployment-root-guard.test.ts`). The
 * operator surface asks the authority and passes the answer in; this function refuses anything that is not
 * a single, plain directory name, because an installation whose authored material sits anywhere else would
 * not be an installation the platform can serve.
 */
function capsulePathIssues(capsuleDirectory: string): string[] {
  const segments = capsuleDirectory.split("/");
  if (capsuleDirectory === "" || segments.length !== 1 || segments[0] === "." || segments[0] === "..") {
    return [
      `the capsule directory "${capsuleDirectory}" is not a single directory name. The platform composes ` +
        "this from its own authority; an installation's authored material lives in that ONE directory.",
    ];
  }
  return [];
}

/**
 * The scoped digest of a content set: the platform's ONE encoding
 * (`@/core/foundation-release/content-digest.mjs`) hashed by the injected mechanism, so two installations
 * established from the same release and the same authored input compute the same digests on any machine.
 */
function contentDigest(
  files: readonly FoundationContentFile[],
  scope: string,
  hasher: FoundationContentHasher,
): string {
  const entries = files.map((file) => ({ path: file.path, sha256: hasher.sha256Hex(file.bytes) }));
  return `sha256:${hasher.sha256Hex(utf8.encode(contentDigestSubject(entries, { scope })))}`;
}

/** Why this seed cannot become a complete installation. Empty means the seed is usable. */
function seedRefusals(files: readonly FoundationContentFile[]): string[] {
  const refusals: string[] = [];
  const paths = files.map((file) => file.path);

  for (const requirement of INSTALLATION_SEED_REQUIREMENTS) {
    const present =
      requirement.kind === "file"
        ? paths.includes(requirement.path)
        : paths.some((path) => path.startsWith(`${requirement.path}/`));
    if (!present) refusals.push(`the seed has no ${requirement.path} — ${requirement.reason}`);
  }

  for (const refused of INSTALLATION_SEED_REFUSED_PATHS) {
    if (paths.includes(refused.path)) {
      refusals.push(`the seed contains ${refused.path} — ${refused.reason}`);
    }
  }

  const ignoreFile = files.find((file) => file.path === ".gitignore");
  const ignoreLines =
    ignoreFile === undefined ? [] : new TextDecoder().decode(ignoreFile.bytes).split(/\r?\n/);
  const ignoresGeneratedState = ignoreLines.some((line) => {
    const rule = line.trim();
    return (
      rule !== "" &&
      !rule.startsWith("#") &&
      rule.replace(/^[/!]/, "").endsWith(INSTALLATION_GENERATED_STATE_IGNORE_RULE)
    );
  });
  if (!ignoresGeneratedState) {
    refusals.push(
      `the seed's .gitignore does not ignore ${INSTALLATION_GENERATED_STATE_IGNORE_RULE} — generated ` +
        "operational state must never become authored, version-controlled source state",
    );
  }

  return refusals;
}

/**
 * WHAT establishment needs, and what it must be given.
 *
 * Caller-agnostic by construction: the operator surface (`scripts/installation/index.mjs`) fills these from
 * command-line arguments, a test fills them from a disposable fixture, and a future controller would fill
 * them from whatever it is told. Nothing here is interactive, nothing assumes a working directory, and
 * nothing names GitHub, another installation, `01.web-01` or any machine.
 */
export interface FoundationEstablishmentRequest {
  /** The immutable Foundation release to establish from — a recognized release identity, never a branch. */
  readonly release: string;
  /** The absolute path of the target root. It may be absent; it must be empty if it exists. */
  readonly targetRoot: string;
  /**
   * The installation's capsule: the ONE directory inside the target root that holds its authored material.
   * The caller asks the platform's own authority for it (`@/config/deployment-build.mjs` —
   * `capsuleDirectory("")` yields the relative name); establishment refuses anything that is not a single
   * plain directory name.
   */
  readonly capsuleDirectory: string;
  /** Which work is establishing this installation — recorded in the adoption record. */
  readonly establishedBy: string;
  /** The installation's OWN identity: the name its operator uses, and its own repository. */
  readonly installation: FoundationInstallationIdentity;
}

/** What establishment did, in the terms the lifecycle recorded. */
export interface FoundationEstablishmentResult {
  /** The immutable release this installation now runs, exactly as acquired and verified. */
  readonly release: FoundationReleaseReference;
  /** The candidate identity that became live: release + authored digest + materialised digest. */
  readonly candidate: InstallationCandidateIdentity;
  /** Where the release bytes came from — acquisition, for diagnostics only. */
  readonly acquiredFrom: string;
  /** Where the authored input came from — likewise a fact about the act. */
  readonly seedFrom: string;
  /** The root the installation was established in. */
  readonly targetRoot: string;
  /** Every file establishment wrote, target-relative, in the order it wrote them. */
  readonly writtenFiles: readonly string[];
  /** The lifecycle history the operational record carries. */
  readonly events: readonly InstallationLifecycleEvent[];
  /** The operational record establishment wrote — target-relative, and the completion marker. */
  readonly operationalStateFile: string;
}

/** The outcome: either a complete installation exists, or it does not and the reason is named. */
export type FoundationEstablishmentOutcome =
  | { readonly ok: true; readonly result: FoundationEstablishmentResult }
  | {
      readonly ok: false;
      readonly failure: InstallationFailure;
      /** The human reasons a refusal list carries (an unsafe target, an unusable seed); empty otherwise. */
      readonly refusals: readonly string[];
    };

/** The failure category each establishment step reports under. */
const FAILURE_CATEGORY = {
  release: "release-resolution",
  installation: "installation-validation",
  materialization: "materialization",
  promotion: "promotion",
} as const satisfies Record<string, InstallationFailureCategory>;

/**
 * Establish ONE complete Foundation installation.
 *
 * The order is deliberate and is the whole failure-safety argument: inspect the target, obtain and verify the
 * release, validate the authored input, materialise everything in ONE write, record the candidate's lifecycle
 * through promotion, and write the operational record LAST. Nothing durable claims success before the
 * installation is complete, and the record is written exactly once.
 */
export async function establishFoundationInstallation(
  request: FoundationEstablishmentRequest,
  dependencies: FoundationEstablishmentDependencies,
): Promise<FoundationEstablishmentOutcome> {
  const { clock, acquisition, payload, seed, target, store, hasher } = dependencies;
  const now = () => utcInstant(clock.now());
  const inCapsule = (relative: string): string => `${request.capsuleDirectory}/${relative}`;

  /** A refusal, in the platform's own failure vocabulary. */
  const refused = (
    failureCategory: InstallationFailureCategory,
    message: string,
    refusals: readonly string[] = [],
  ): FoundationEstablishmentOutcome => ({
    ok: false,
    failure: { category: failureCategory, message },
    refusals,
  });

  let category: InstallationFailureCategory = FAILURE_CATEGORY.materialization;

  try {
    const capsuleIssues = capsulePathIssues(request.capsuleDirectory);
    if (capsuleIssues.length > 0) {
      return refused(FAILURE_CATEGORY.materialization, "the request does not describe an installation:", capsuleIssues);
    }

    if (!isRecognizedFoundationReleaseIdentity(request.release)) {
      return refused(
        FAILURE_CATEGORY.release,
        `"${request.release}" is not a recognized immutable Foundation release identity. An installation is ` +
          'established from a named, immutable release — never a branch, a bare commit or "latest".',
      );
    }

    // 1. THE TARGET ROOT MUST BE SAFE — checked before anything is read, and long before anything is written.
    category = FAILURE_CATEGORY.materialization;
    const targetRefusals = await target.inspect();
    if (targetRefusals.length > 0) {
      return refused(
        FAILURE_CATEGORY.materialization,
        `the target root is not a safe place to establish an installation (${target.description}):`,
        targetRefusals,
      );
    }

    // 2. OBTAIN THE RELEASE. The acquisition source resolves and verifies; where it got the bytes is its own
    //    business, and a source that cannot obtain THIS release must fail rather than substitute another.
    category = FAILURE_CATEGORY.release;
    const acquired = await acquisition.acquire(request.release);
    const reference = acquired.release;
    if (!isFoundationReleaseReference(reference) || reference.tag !== request.release) {
      throw new Error(
        `the acquisition source reported ${String(reference?.tag)} instead of the requested release ` +
          `${request.release}: an installation is never established from a release nobody asked for`,
      );
    }
    if (reference.content.policy !== RELEASE_CONTENT_POLICY_ID) {
      throw new Error(
        `the release's content policy is "${reference.content.policy}", which this platform does not know ` +
          `(expected "${RELEASE_CONTENT_POLICY_ID}"): its content identity cannot be verified`,
      );
    }

    // 3. PROVE THE PAYLOAD IS THAT RELEASE'S CONTENT. The digest is computed HERE, by the platform's own
    //    encoding, so ANY acquisition source is verified — and the platform content the installation receives
    //    is provably the content the release identity names.
    const payloadFiles = await payload.files();
    const platformDigest = contentDigest(
      payloadFiles,
      `${RELEASE_DIGEST_SCOPE_ID} ${RELEASE_CONTENT_POLICY_ID} manifest-format:${RELEASE_PAYLOAD_FORMAT}`,
      hasher,
    );
    if (payloadFiles.length !== reference.content.fileCount || platformDigest !== reference.content.digest) {
      throw new Error(
        `the acquired content is not ${foundationReleaseLabel(reference)}: it carries ` +
          `${payloadFiles.length} file(s) with digest ${platformDigest}. An installation is established from ` +
          "the release it was told to establish from, never from whatever the source happened to hold.",
      );
    }

    // 4. THE AUTHORED INPUT MUST BE USABLE — its shape, its generated state, and its configuration.
    category = FAILURE_CATEGORY.installation;
    const seedFiles = await seed.files();
    const seedIssues = seedRefusals(seedFiles);
    if (seedIssues.length > 0) {
      return refused(
        FAILURE_CATEGORY.installation,
        `the authored input cannot become a complete Foundation installation (${seed.description}):`,
        seedIssues,
      );
    }

    const configProblems: string[] = [];
    let config: unknown = null;
    try {
      const configFile = seedFiles.find((file) => file.path === "site.config.json");
      config = JSON.parse(new TextDecoder().decode(configFile?.bytes ?? new Uint8Array()));
    } catch (error) {
      configProblems.push(
        `site.config.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (configProblems.length === 0) {
      const parsed = siteConfigFileSchema.safeParse(config);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          configProblems.push(`${issue.path.join(".") || "(root)"}: ${issue.message}`);
        }
      }
    }
    if (configProblems.length > 0) {
      return refused(
        FAILURE_CATEGORY.installation,
        "the authored configuration is not a valid Foundation configuration:",
        configProblems,
      );
    }

    // 5. THE ADOPTION RECORD — this installation's own adoption of the release it is being established from.
    //    A seed's own record is deliberately NOT carried over: it would describe an adoption that never
    //    happened here. It is named in `writtenFiles`, so nothing about it is silent.
    const adoptionRecord = foundationInstallationAdoptionRecord(reference, {
      adoptedAt: offsetInstant(clock.now()),
      establishedBy: request.establishedBy,
    });
    const adoptionFile: FoundationContentFile = {
      path: inCapsule(INSTALLATION_ADOPTION_RECORD_FILE_NAME),
      bytes: utf8.encode(`${JSON.stringify(adoptionRecord, null, 2)}\n`),
    };

    // 6. THE CANDIDATE IDENTITY — release, authored input, materialised tree. The materialised digest covers
    //    every file establishment writes, at the path it writes it to, so the artifact that becomes live is
    //    the artifact that was materialised.
    const authored = contentDigest(seedFiles, INSTALLATION_CONTENT_SCOPE.AUTHORED, hasher);
    const materialisedFiles: readonly FoundationContentFile[] = [
      ...payloadFiles,
      ...seedFiles.map((file) => ({ path: inCapsule(file.path), bytes: file.bytes })),
      adoptionFile,
    ];
    const materialized = contentDigest(materialisedFiles, INSTALLATION_CONTENT_SCOPE.MATERIALIZED, hasher);
    const candidate: InstallationCandidateIdentity = { release: reference.tag, authored, materialized };

    // 7. THE LIFECYCLE — the approved sequence for a FRESH INSTALL, recorded as it happens.
    let state = startInstallationAttempt(initialInstallationOperationalState(request.installation), {
      kind: "install",
      target: reference,
      at: now(),
    });

    // 8. MATERIALISE. ONE write, inside the target root only: the guard in the adapter resolves every path
    //    beneath the root it was constructed for, so establishment cannot reach anything else.
    category = FAILURE_CATEGORY.materialization;
    await target.write(materialisedFiles);

    // 9. RECORD WHAT WAS MATERIALISED, then that it validated, was staged and was inspected. Each step is a
    //    transition of the approved contract, and each re-parses the record it produces.
    category = FAILURE_CATEGORY.installation;
    state = recordInstallationCandidate(state, { candidate, at: now() });
    state = recordInstallationCandidateValidated(state, {
      at: now(),
      detail: `the authored input (${authored}) and the release's content (${platformDigest}) were verified`,
    });
    state = recordInstallationCandidateStaged(state, {
      at: now(),
      detail: `materialised into this installation (${materialisedFiles.length} file(s))`,
    });
    state = recordInstallationStagingInspected(state, {
      at: now(),
      detail: "the installation's configuration and content identity were verified before promotion",
    });

    // 10. PROMOTE — the exact candidate, in the contract's own terms: release, authored input, revision.
    state = beginInstallationPromotion(state, { at: now() });
    state = completeInstallationPromotion(state, { candidate, at: now() });

    // 11. THE COMPLETION MARKER. The operational record is written once, last: nothing durable said "this
    //     installation exists" before this line, and nothing can claim success without it.
    category = FAILURE_CATEGORY.promotion;
    await store.write(state);

    const stored = parseInstallationOperationalState(await store.read());
    if (!installationIsEstablishedFrom(stored, { release: reference, candidate })) {
      throw new Error(
        "the operational record does not describe an installation established from this release and this " +
          "candidate, so establishment is NOT complete",
      );
    }

    return {
      ok: true,
      result: {
        release: reference,
        candidate,
        acquiredFrom: acquired.acquiredFrom,
        seedFrom: seed.description,
        targetRoot: request.targetRoot,
        writtenFiles: materialisedFiles.map((file) => file.path),
        events: stored.history,
        operationalStateFile: inCapsule(INSTALLATION_OPERATIONAL_STATE_FILE_NAME),
      },
    };
  } catch (error) {
    return refused(category, error instanceof Error ? error.message : String(error));
  }
}

