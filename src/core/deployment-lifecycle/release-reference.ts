/**
 * THE FOUNDATION RELEASE A DEPLOYMENT NAMES (FOUNDATION-B4A)
 * =========================================================
 *
 * A deployment never says "main", "HEAD", "latest" or a branch. Everywhere the lifecycle has to name
 * the platform it is running, adopting, validating, staging or promoting, it names ONE IMMUTABLE
 * FOUNDATION RELEASE — and this module is that value object.
 *
 * WHERE THE CONTRACT COMES FROM (nothing is restated here)
 * -------------------------------------------------------
 * The release contract already has ONE authority per fact, and this module consumes them instead of
 * copying them into a second vocabulary:
 *
 *   the identity question      `scripts/release/release-identity.mjs` — is this a recognized immutable
 *                              release identity at all (the canonical
 *                              `provelopment-foundation-vYYYYMMDD.HHMM`, or the grandfathered first
 *                              release)?
 *   the platform's authority   `scripts/release/release-manifest.mjs` — `FOUNDATION_SOURCE_REPOSITORY`
 *   the reference's fields     the shape `deployment/foundation-baseline.json` already records: tag,
 *                              repository, commit, tree, manifestFormat and the content identity
 *                              (policy, digest, fileCount). The adoption record and this lifecycle
 *                              therefore speak the SAME shape — one representation, two consumers —
 *                              rather than a "lifecycle release" that could drift from the adopted one.
 *
 * WHAT IS *NOT* DECIDED HERE
 * --------------------------
 * COMPATIBILITY. `manifestFormat` and `content.policy` are recorded as the values the release itself
 * states; this module refuses a malformed record, not an inconvenient one. Whether a given release may
 * be adopted by a given deployment is a lifecycle decision made where the release is RESOLVED and
 * VALIDATED — never by quietly accepting or rewriting an artifact's self-description here.
 *
 * Framework-neutral: pure data, types and predicates. No React, Next.js, filesystem or configuration.
 */
import {
  FOUNDATION_INITIAL_RELEASE_IDENTITY,
  FOUNDATION_RELEASE_IDENTITY_CONTRACT,
  isRecognizedFoundationReleaseIdentity,
} from "../../../scripts/release/release-identity.mjs";
import { FOUNDATION_SOURCE_REPOSITORY } from "../../../scripts/release/release-manifest.mjs";

/** The content identity of one Foundation release: what the release contains, not where it came from. */
export interface FoundationReleaseContent {
  /** The release content policy the digest was computed under (e.g. `foundation-source-v1`). */
  readonly policy: string;
  /** The normalized platform-content digest — an identity distinct from the source tree. */
  readonly digest: string;
  /** How many files the release payload carries. */
  readonly fileCount: number;
}

/**
 * ONE immutable Foundation release, as a deployment names it.
 *
 * `tag` is the identity a consumer asks for; `commit`/`tree`/`content` are the provenance and content
 * identity that make the name verifiable — the release identity and the content identity are
 * deliberately different facts (the source tree also contains what a release EXCLUDES).
 */
export interface FoundationReleaseReference {
  /** The immutable release identity — never a branch, never a bare commit, never a checkpoint. */
  readonly tag: string;
  /** The upstream platform authority the release came from. */
  readonly repository: string;
  /** The source revision the release was cut from (full commit SHA). */
  readonly commit: string;
  /** The source tree of that revision (full tree SHA). */
  readonly tree: string;
  /** The release manifest format the release speaks (its own stated value). */
  readonly manifestFormat: number;
  /** The content identity of the release payload. */
  readonly content: FoundationReleaseContent;
}

/** The exact key set of a reference. An unknown or missing key is a failure, not a warning. */
const REFERENCE_KEYS = ["tag", "repository", "commit", "tree", "manifestFormat", "content"] as const;
const CONTENT_KEYS = ["policy", "digest", "fileCount"] as const;

/** A full commit or tree SHA. */
const SHA_PATTERN = /^[0-9a-f]{40}$/;
/** A normalized content digest, in the ONE vocabulary the release tooling already uses. */
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The keys of a value as a sorted list, or `null` when the value is not a plain object. */
function sortedKeys(value: unknown): string | null {
  return isPlainObject(value) ? Object.keys(value).sort().join(",") : null;
}

function keySetIssues(value: unknown, keys: readonly string[], what: string): string[] {
  const expected = [...keys].sort().join(",");
  const actual = sortedKeys(value);
  if (actual === null) return [`${what} must be an object`];
  return actual === expected ? [] : [`${what} has keys [${actual}], expected [${expected}]`];
}


/**
 * Every reason ONE release reference is not a usable Foundation release reference.
 *
 * An empty list means the reference may be stored, compared and acted on. The messages name the field
 * and the authority, because whoever reads them is repairing a record rather than reading a spec.
 *
 * `content.policy` is deliberately validated as an IDENTITY (non-empty, no whitespace) and not compared
 * with this platform's current policy: a deployment may legitimately run a release whose policy this
 * platform version does not name, and compatibility is decided where a release is resolved.
 */
export function foundationReleaseReferenceIssues(value: unknown): string[] {
  const issues = keySetIssues(value, REFERENCE_KEYS, "the release reference");
  if (!isPlainObject(value)) return issues;

  const { tag, commit, tree, manifestFormat, content } = value as Partial<FoundationReleaseReference>;

  if (!isRecognizedFoundationReleaseIdentity(tag)) {
    issues.push(
      `tag "${String(tag)}" is not a recognized immutable Foundation release identity — expected the ` +
        `canonical ${FOUNDATION_RELEASE_IDENTITY_CONTRACT}, or the grandfathered ` +
        `${FOUNDATION_INITIAL_RELEASE_IDENTITY}. A branch, a bare commit and a historical checkpoint are ` +
        "never release identities.",
    );
  }
  if (value.repository !== FOUNDATION_SOURCE_REPOSITORY) {
    issues.push(
      `repository is "${String(value.repository)}": a Foundation release is of ${FOUNDATION_SOURCE_REPOSITORY}`,
    );
  }
  if (typeof commit !== "string" || !SHA_PATTERN.test(commit)) {
    issues.push(`commit "${String(commit)}" is not a full 40-character commit SHA`);
  }
  if (typeof tree !== "string" || !SHA_PATTERN.test(tree)) {
    issues.push(`tree "${String(tree)}" is not a full 40-character tree SHA`);
  }
  if (!Number.isInteger(manifestFormat) || (manifestFormat as number) <= 0) {
    issues.push(`manifestFormat "${String(manifestFormat)}" is not a positive integer`);
  }

  issues.push(...keySetIssues(content, CONTENT_KEYS, "the release content identity"));
  if (isPlainObject(content)) {
    const { policy, digest, fileCount } = content as Partial<FoundationReleaseContent>;
    if (typeof policy !== "string" || policy.trim() === "" || /\s/.test(policy)) {
      issues.push(`content.policy "${String(policy)}" is not a non-empty policy identity`);
    }
    if (typeof digest !== "string" || !DIGEST_PATTERN.test(digest)) {
      issues.push(`content.digest "${String(digest)}" is not a sha256: content digest`);
    }
    if (!Number.isInteger(fileCount) || (fileCount as number) <= 0) {
      issues.push(`content.fileCount "${String(fileCount)}" is not a positive integer`);
    }
  }

  return issues;
}

/** True when `value` is a usable Foundation release reference. */
export function isFoundationReleaseReference(value: unknown): boolean {
  return foundationReleaseReferenceIssues(value).length === 0;
}

/**
 * True when two references name the same release IN EVERY RESPECT the contract records.
 *
 * The tag alone is not enough to say "the same release": provenance (commit, tree) and the content
 * identity are what a rollback, a promotion or duplicate detection must actually compare.
 */
export function identicalFoundationReleases(
  left: FoundationReleaseReference,
  right: FoundationReleaseReference,
): boolean {
  return (
    left.tag === right.tag &&
    left.repository === right.repository &&
    left.commit === right.commit &&
    left.tree === right.tree &&
    left.manifestFormat === right.manifestFormat &&
    left.content.policy === right.content.policy &&
    left.content.digest === right.content.digest &&
    left.content.fileCount === right.content.fileCount
  );
}

/**
 * ONE actionable line naming a release, for history details and diagnoses.
 *
 * It states the three facts a reader needs to recognise the release: its identity, its content digest
 * and its payload size — never a branch, and never the mutable revision of a working tree.
 */
export function foundationReleaseLabel(reference: FoundationReleaseReference): string {
  return `${reference.tag} (${reference.content.fileCount} files, ${reference.content.digest})`;
}
