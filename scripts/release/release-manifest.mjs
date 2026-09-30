#!/usr/bin/env node
/**
 * THE RELEASE MANIFEST (FOUNDATION-R1B)
 * =====================================
 *
 * `foundation-release.json` travels inside every constructed release and states what the release is:
 * its identity, the exact source state it was constructed from, the digest of the content it carries,
 * the toolchain a consumer needs, and the content-contract values a consumer must satisfy.
 *
 * ONE AUTHORITY PER VALUE — the manifest DERIVES its facts, it does not restate constants
 *
 *   requirements.node           `package.json` → `engines.node` (the release's own package manifest)
 *   requirements.pnpm           `package.json` → `packageManager` ("pnpm@11.6.0")
 *   compatibility.pageDocumentSchema   `src/core/page-document.ts` → `PAGE_DOCUMENT_SCHEMA_VERSION`
 *   compatibility.deploymentLayouts    `src/config/deployment-root.ts` → the `DeploymentLayout` union
 *   content.policy              the release content policy's own identity (`RELEASE_CONTENT_POLICY_ID`)
 *   source.repository           this platform's canonical upstream identity (constant, documented)
 *   source.commit / source.tree the Git source revision the caller asked to release
 *   content.digest / fileCount  the normalised payload digest (`release-digest.mjs`)
 *
 * Every derived value is EXTRACTED AND VALIDATED, never guessed: if an authority's shape changes, the
 * extraction fails loudly with the file and the pattern instead of writing a plausible-looking number
 * into a release. A release that cannot state its compatibility truthfully must not be produced.
 *
 * The manifest is NOT self-referential: `content.digest` covers the payload only, and the manifest is
 * excluded from that payload by construction (see `release-digest.mjs`).
 */

import { RELEASE_CONTENT_POLICY_ID } from "./release-content-policy.mjs";
import { assertReleaseIdentity } from "./release-identity.mjs";

/** The manifest schema's own version. Bumped only when the schema below changes shape. */
export const RELEASE_MANIFEST_FORMAT = 1;

/** The canonical upstream identity every Foundation release records. A release is of THIS platform. */
export const FOUNDATION_SOURCE_REPOSITORY = "https://github.com/provelopment/provelopment-foundation";

/**
 * The release identity is NOT owned here. A manifest records the identity it was constructed under,
 * and whether that identity may exist at all is the identity authority's question
 * (`release-identity.mjs`): the canonical `provelopment-foundation-vYYYYMMDD.HHMM`, or the
 * grandfathered first release. A tag is never created by this tooling — construction only encodes the
 * identity it is given (R1C publishes).
 */

/** The exact key set of a manifest. An unknown or missing key is a schema failure, not a warning. */
const MANIFEST_TOP_LEVEL_KEYS = ["format", "release", "source", "content", "requirements", "compatibility"];
const MANIFEST_SOURCE_KEYS = ["repository", "commit", "tree"];
const MANIFEST_CONTENT_KEYS = ["policy", "digest", "fileCount"];
const MANIFEST_REQUIREMENT_KEYS = ["node", "pnpm"];
const MANIFEST_COMPATIBILITY_KEYS = ["pageDocumentSchema", "deploymentLayouts"];

/**
 * Read one extracted value, or fail with the authority that refused to answer.
 *
 * @param {string} authority the file the value must come from
 * @param {string} what the value's name
 * @param {string} pattern the shape expected
 * @returns {never} never returns: callers throw
 */
function authorityFailure(authority, what, pattern) {
  throw new Error(
    `FOUNDATION-R1B: ${authority} no longer declares ${what} in the expected shape (${pattern}). The ` +
      "release manifest derives this value from that ONE authority, so it refuses to guess: update " +
      "scripts/release/release-manifest.mjs and the authority together.",
  );
}

/**
 * Extract the manifest's derived values from the payload's own authorities.
 *
 * @param {(path: string) => Buffer} read reads one payload-relative file's exact bytes
 * @returns {{ node: string, pnpm: string, pageDocumentSchema: number, deploymentLayouts: string[] }}
 */
export function readReleaseAuthorities(read) {
  const packageText = read("package.json").toString("utf8");
  /** @type {{ engines?: { node?: unknown }, packageManager?: unknown }} */
  const packageJson = JSON.parse(packageText);

  const node = typeof packageJson.engines?.node === "string" ? packageJson.engines.node.trim() : "";
  if (node === "") {
    authorityFailure("package.json", 'the supported Node range (`engines.node`)', '{ "engines": { "node": ">=22" } }');
  }

  const packageManager = typeof packageJson.packageManager === "string" ? packageJson.packageManager : "";
  const pnpm = /^pnpm@(\d+\.\d+\.\d+)$/.exec(packageManager);
  if (pnpm === null) {
    authorityFailure("package.json", 'the pnpm version (`packageManager`)', '"packageManager": "pnpm@11.6.0"');
  }

  const pageDocument = read("src/core/page-document.ts").toString("utf8");
  const schemaVersion = /export const PAGE_DOCUMENT_SCHEMA_VERSION = (\d+);/.exec(pageDocument);
  if (schemaVersion === null) {
    authorityFailure(
      "src/core/page-document.ts",
      "the page-document schema version",
      "export const PAGE_DOCUMENT_SCHEMA_VERSION = <n>;",
    );
  }

  const deploymentRoot = read("src/config/deployment-root.ts").toString("utf8");
  const layoutUnion = /export type DeploymentLayout = ([^;]+);/.exec(deploymentRoot);
  if (layoutUnion === null) {
    authorityFailure(
      "src/config/deployment-root.ts",
      "the deployment layout vocabulary",
      'export type DeploymentLayout = "capsule" | "repository" | "override";',
    );
  }
  const deploymentLayouts = [...layoutUnion[1].matchAll(/"([a-z][a-z0-9-]*)"/g)].map((match) => match[1]);
  if (deploymentLayouts.length === 0) {
    authorityFailure(
      "src/config/deployment-root.ts",
      "the deployment layout vocabulary",
      'export type DeploymentLayout = "capsule" | "repository" | "override";',
    );
  }

  return {
    node,
    pnpm: /** @type {string} */ (pnpm[1]),
    pageDocumentSchema: Number(schemaVersion[1]),
    deploymentLayouts,
  };
}

/**
 * Build the manifest object for a constructed release.
 *
 * @param {{ release: string, commit: string, tree: string, digest: string, fileCount: number,
 *           authorities: { node: string, pnpm: string, pageDocumentSchema: number, deploymentLayouts: string[] } }} input
 * @returns {Record<string, unknown>} the manifest, ready to serialise
 */
export function buildReleaseManifest(input) {
  return {
    format: RELEASE_MANIFEST_FORMAT,
    release: assertReleaseIdentity(input.release),
    source: {
      repository: FOUNDATION_SOURCE_REPOSITORY,
      commit: input.commit,
      tree: input.tree,
    },
    content: {
      policy: RELEASE_CONTENT_POLICY_ID,
      digest: input.digest,
      fileCount: input.fileCount,
    },
    requirements: {
      node: input.authorities.node,
      pnpm: input.authorities.pnpm,
    },
    compatibility: {
      pageDocumentSchema: input.authorities.pageDocumentSchema,
      deploymentLayouts: [...input.authorities.deploymentLayouts],
    },
  };
}

/**
 * Serialise a manifest deterministically: two spaces, a trailing newline, keys in schema order.
 *
 * The order comes from the object literal above, which is fixed — no timestamp, no environment value
 * and no ordering that could vary between machines or runs.
 *
 * @param {Record<string, unknown>} manifest the manifest
 * @returns {string} the exact file text
 */
export function serialiseReleaseManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

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
  if (!Array.isArray(manifest.compatibility.deploymentLayouts) || manifest.compatibility.deploymentLayouts.length === 0) {
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
