/**
 * THE FOUNDATION RELEASE MANIFEST CONTRACT (FOUNDATION-B4A-A2)
 * ==========================================================
 *
 * The pure half of `foundation-release.json` — the self-description that travels INSIDE every Foundation
 * release: its format, the canonical platform it is of, the content policy it was built under, and the
 * shape a consumer may rely on.
 *
 * WHAT IS PURE (here) AND WHAT IS PROCEDURAL (the tooling)
 * ------------------------------------------------------
 *   here:      the identifiers, the exact key sets, `assertReleaseManifest`, `parseReleaseManifest`
 *   tooling:   CONSTRUCTING a manifest — reading `package.json`, the page-document schema and the
 *              deployment-layout vocabulary out of a payload (`release-manifest.mjs`), the digest, Git
 *              access and the CLI
 *
 * The split is the point of FOUNDATION-B4A-A2: an installation (or a future acquisition adapter) must be
 * able to VERIFY the immutable release it obtained without importing the tooling that builds one, and the
 * lifecycle domain must never depend on a procedural script. Both sides therefore consume this module,
 * and neither restates it.
 *
 * PURE: no filesystem, no Git, no network, no environment, no subprocess. Plain ESM for the same reason
 * `identity.mjs` is (the tooling is dependency-free Node ESM).
 */
import { assertReleaseIdentity } from "./identity.mjs";

/**
 * The manifest schema's own version. Bumped only when the schema below changes shape.
 *
 * It is the IMMUTABLE RELEASE CONTRACT's number — not a release's name, and not the schema of the
 * installation's own operational record (`src/core/foundation-installation`).
 */
export const RELEASE_MANIFEST_FORMAT = 1;

/**
 * The manifest's own file name inside a constructed release.
 *
 * A contract fact, because two consumers need it: release construction (which writes it) and a verification
 * or ACQUISITION adapter (which must exclude it from the payload — it describes the content set rather than
 * belonging to it) without importing the tooling that builds releases.
 */
export const RELEASE_MANIFEST_FILE_NAME = "foundation-release.json";

/**
 * The canonical upstream identity every Foundation release records — CANONICAL PROVENANCE, not a runtime
 * relationship.
 *
 * It answers "which platform is this release OF?", which is what makes a release recognizable and
 * verifiable. It says nothing about where an installation obtained the bytes: a release carrying this
 * provenance may be acquired from the canonical repository, a local copy, an archive or another
 * configured source, and its immutable identity is unchanged either way. No installation depends on this
 * URL at runtime.
 */
export const FOUNDATION_SOURCE_REPOSITORY = "https://github.com/provelopment/provelopment-foundation";

/**
 * The release content policy this platform constructs releases under (FOUNDATION-R1B).
 *
 * The IDENTITY lives here because every manifest and every installation's baseline record states it; the
 * policy's RULES — which tracked path surfaces belong in a release — are the release tooling's
 * application of that policy (`scripts/release/release-content-policy.mjs`), which imports this value.
 */
export const RELEASE_CONTENT_POLICY_ID = "foundation-source-v1";

/** The exact key set of a manifest. An unknown or missing key is a schema failure, not a warning. */
const MANIFEST_TOP_LEVEL_KEYS = ["format", "release", "source", "content", "requirements", "compatibility"];
const MANIFEST_SOURCE_KEYS = ["repository", "commit", "tree"];
const MANIFEST_CONTENT_KEYS = ["policy", "digest", "fileCount"];
const MANIFEST_REQUIREMENT_KEYS = ["node", "pnpm"];
const MANIFEST_COMPATIBILITY_KEYS = ["pageDocumentSchema", "deploymentLayouts"];

/**
 * Validate a manifest's shape strictly, so a consumer never has to guess what it received.
 *
 * @param {unknown} value the parsed manifest
 * @returns {Record<string, any>} the validated manifest
 */
export function assertReleaseManifest(value) {
  const manifest = /** @type {Record<string, any>} */ (value);
  const fail = (/** @type {string} */ detail) => {
    throw new Error(`FOUNDATION-R1B: the release manifest is not valid (${detail}).`);
  };
  const keysOf = (/** @type {any} */ object) => Object.keys(object ?? {}).sort().join(",");
  const requireKeySet = (/** @type {any} */ object, /** @type {string[]} */ keys, /** @type {string} */ what) => {
    if (object === null || typeof object !== "object" || Array.isArray(object)) fail(`${what} is not an object`);
    if (keysOf(object) !== [...keys].sort().join(",")) {
      fail(`${what} has keys [${keysOf(object)}], expected [${[...keys].sort().join(",")}]`);
    }
  };

  requireKeySet(manifest, MANIFEST_TOP_LEVEL_KEYS, "the manifest");
  if (manifest.format !== RELEASE_MANIFEST_FORMAT) {
    fail(`format is ${manifest.format}, expected ${RELEASE_MANIFEST_FORMAT}`);
  }
  assertReleaseIdentity(manifest.release);
  requireKeySet(manifest.source, MANIFEST_SOURCE_KEYS, "source");
  if (manifest.source.repository !== FOUNDATION_SOURCE_REPOSITORY) fail("source.repository is not this platform");
  if (!/^[0-9a-f]{40}$/.test(manifest.source.commit)) fail("source.commit is not a full commit SHA");
  if (!/^[0-9a-f]{40}$/.test(manifest.source.tree)) fail("source.tree is not a full tree SHA");
  requireKeySet(manifest.content, MANIFEST_CONTENT_KEYS, "content");
  if (manifest.content.policy !== RELEASE_CONTENT_POLICY_ID) fail("content.policy is not this tool's policy");
  if (!/^sha256:[0-9a-f]{64}$/.test(manifest.content.digest)) fail("content.digest is not a sha256: digest");
  if (!Number.isInteger(manifest.content.fileCount) || manifest.content.fileCount <= 0) {
    fail("content.fileCount is not a positive integer");
  }
  requireKeySet(manifest.requirements, MANIFEST_REQUIREMENT_KEYS, "requirements");
  if (typeof manifest.requirements.node !== "string" || manifest.requirements.node === "") {
    fail("requirements.node is empty");
  }
  if (!/^\d+\.\d+\.\d+$/.test(manifest.requirements.pnpm)) fail("requirements.pnpm is not a plain version");
  requireKeySet(manifest.compatibility, MANIFEST_COMPATIBILITY_KEYS, "compatibility");
  if (!Number.isInteger(manifest.compatibility.pageDocumentSchema)) {
    fail("compatibility.pageDocumentSchema is not an integer");
  }
  if (
    !Array.isArray(manifest.compatibility.deploymentLayouts) ||
    manifest.compatibility.deploymentLayouts.length === 0
  ) {
    fail("compatibility.deploymentLayouts is empty");
  }

  return manifest;
}

/**
 * Parse and validate a manifest file's text.
 *
 * @param {string} text the file's text
 * @returns {Record<string, any>} the validated manifest
 */
export function parseReleaseManifest(text) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`FOUNDATION-R1B: the release manifest is not JSON (${/** @type {Error} */ (error).message}).`);
  }
  return assertReleaseManifest(parsed);
}
