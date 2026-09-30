#!/usr/bin/env node
/**
 * FOUNDATION RELEASE TOOLING — THE ONE CALLABLE INTERFACE (FOUNDATION-R1B)
 * ======================================================================
 *
 *   node scripts/release/index.mjs classify [--source <rev>] [--source-repository <dir>]
 *   node scripts/release/index.mjs build    --release <identity> --source <commit SHA> --dest <dir>
 *                                          [--source-repository <dir>]
 *   node scripts/release/index.mjs verify   --payload <dir> [--source-repository <dir>] [--expect-tag]
 *
 * The caller does not matter: a human, an agent, CI and the future deployment installer all invoke
 * this ONE mechanism, and a release is never built a second way for CI. What each command does is
 * defined in `release-construction.mjs`; the content boundary in `release-content-policy.mjs`; the
 * digest in `release-digest.mjs`; the manifest in `release-manifest.mjs`. This file is argument
 * handling and output.
 *
 * `build` REQUIRES an explicit full commit SHA: a release is cut from a named source commit, so a
 * moving branch name is never a release input. The tool never creates a tag — construction only
 * encodes the identity it is given; publication belongs to the release process (R1C).
 *
 * See `scripts/release/README.md` for the contract, the policy, the manifest and the procedure.
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  assertReleaseSourceModes,
  constructRelease,
  listTrackedEntries,
  resolveSourceRevision,
  verifyRelease,
} from "./release-construction.mjs";
import { RELEASE_CONTENT_POLICY_ID, classifyReleaseInventory } from "./release-content-policy.mjs";
import {
  FOUNDATION_INITIAL_RELEASE_IDENTITY,
  FOUNDATION_RELEASE_IDENTITY_CONTRACT,
  isPublishableFoundationReleaseIdentity,
} from "./release-identity.mjs";
import { FOUNDATION_SOURCE_REPOSITORY } from "./release-manifest.mjs";

/** The repository this tooling belongs to. `--source-repository` may point somewhere else (a clone). */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const USAGE = `FOUNDATION-R1B release tooling

  classify [--source <rev>] [--source-repository <dir>]
      Report how the release content policy classifies every tracked path at a revision.

  build --release <identity> --source <commit SHA> --dest <dir> [--source-repository <dir>]
      Construct the Foundation release source set and its manifest into an EMPTY destination.
      The identity must be a recognized Foundation release identity: the canonical
      ${FOUNDATION_RELEASE_IDENTITY_CONTRACT} for a new release — or the grandfathered
      ${FOUNDATION_INITIAL_RELEASE_IDENTITY} when re-constructing the first release.

  verify --payload <dir> [--source-repository <dir>] [--expect-tag]
      Verify a constructed release: its boundary, its digest, its derived values, and — with a
      source repository — that it is exactly the policy's plan for the commit it records.

  Options:
    --source <rev>              the revision to inspect (classify only; defaults to HEAD)
    --source <commit SHA>       the commit to release (build only; a full 40-character SHA)
    --source-repository <dir>   the repository to read (defaults to ${ROOT})
    --release <identity>        the release identity, e.g. provelopment-foundation-v20261003.1427
    --dest <dir>                construction destination (created; must be absent or empty)
    --payload <dir>             the constructed release to verify
    --expect-tag                with verify: require the release identity to resolve to the recorded commit
`;

/** Long options this CLI understands, all of which take a value. */
const VALUE_OPTIONS = ["source", "source-repository", "release", "dest", "payload"];

/** Flags that take no value. */
const FLAG_OPTIONS = ["expect-tag"];

/**
 * Parse `argv` into a command and its options.
 *
 * @param {string[]} argv the arguments after the script name
 * @returns {{ command: string, options: Record<string, string>, flags: Set<string> }}
 */
export function parseArguments(argv) {
  const [command, ...rest] = argv;
  /** @type {Record<string, string>} */ const options = {};
  /** @type {Set<string>} */ const flags = new Set();

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      throw new Error(`FOUNDATION-R1B: unexpected argument "${token}".`);
    }
    const name = token.slice(2);
    if (FLAG_OPTIONS.includes(name)) {
      flags.add(name);
      continue;
    }
    if (!VALUE_OPTIONS.includes(name)) {
      throw new Error(`FOUNDATION-R1B: unknown option "${token}".`);
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`FOUNDATION-R1B: the option "${token}" needs a value.`);
    }
    options[name] = value;
    index += 1;
  }

  return { command: command ?? "", options, flags };
}

/**
 * Require one option, with a message that names the command that needs it.
 *
 * @param {Record<string, string>} options the parsed options
 * @param {string} name the option name, without `--`
 * @param {string} command the command requiring it
 * @returns {string} the value
 */
function requireOption(options, name, command) {
  const value = options[name];
  if (value === undefined || value === "") {
    throw new Error(`FOUNDATION-R1B: "${command}" requires --${name}.`);
  }
  return value;
}

/**
 * `classify` — report the policy's decision for every tracked path at a revision.
 *
 * @param {Record<string, string>} options the parsed options
 * @returns {number} the process exit code
 */
export function runClassify(options) {
  const sourceRepository = options["source-repository"] ?? ROOT;
  const revision = options.source ?? "HEAD";
  const { commit, tree } = resolveSourceRevision(sourceRepository, revision);
  const entries = listTrackedEntries(sourceRepository, commit);
  assertReleaseSourceModes(entries);
  const inventory = classifyReleaseInventory(entries.map((entry) => entry.path));

  console.log(`release content policy — ${RELEASE_CONTENT_POLICY_ID}`);
  console.log(`  source:     ${commit}  (tree ${tree})`);
  console.log(`  tracked:    ${entries.length}`);
  console.log(`  platform:   ${inventory.platform.length}`);
  console.log(`  excluded:   ${inventory.excluded.length}`);
  console.log(`  unclassified: ${inventory.unclassified.length}`);
  for (const ruleId of Object.keys(inventory.byRule).sort()) {
    const files = inventory.byRule[ruleId];
    console.log(`    ${ruleId.padEnd(38)} ${String(files.length).padStart(4)}`);
  }

  if (inventory.unclassified.length > 0) {
    console.error(
      "\nUNCLASSIFIED — a release cannot be constructed from this revision until each path is either " +
        "platform content or repository/deployment state (scripts/release/release-content-policy.mjs):",
    );
    for (const file of inventory.unclassified) console.error(`    ${file}`);
    return 1;
  }

  console.log("\nrelease content policy OK — every tracked path is classified.");
  return 0;
}

/**
 * `build` — construct a release into an empty destination.
 *
 * @param {Record<string, string>} options the parsed options
 * @returns {number} the process exit code
 */
export function runBuild(options) {
  const sourceRepository = options["source-repository"] ?? ROOT;
  const release = requireOption(options, "release", "build");
  const source = requireOption(options, "source", "build");
  const destination = requireOption(options, "dest", "build");

  if (!/^[0-9a-f]{40}$/.test(source)) {
    throw new Error(
      `FOUNDATION-R1B: --source must be a full 40-character commit SHA (got "${source}"). A release is ` +
        "cut from a named source commit; a branch or a short name could move between one construction and " +
        "the next.",
    );
  }

  const result = constructRelease({ sourceRepository, revision: source, release, destination });

  console.log(`Foundation release constructed — ${result.release}`);
  if (!isPublishableFoundationReleaseIdentity(result.release)) {
    console.log(
      "  identity:    recognized existing release — re-constructed for verification only; a NEW release " +
        `is published as ${FOUNDATION_RELEASE_IDENTITY_CONTRACT}`,
    );
  }
  console.log(`  source:      ${result.commit}  (tree ${result.tree})`);
  console.log(`  repository:  ${FOUNDATION_SOURCE_REPOSITORY}`);
  console.log(`  destination: ${result.destination}`);
  console.log(`  payload:     ${result.fileCount} file(s)`);
  console.log(`  digest:      ${result.digest}`);
  console.log(`  excluded:    ${result.excluded.length} tracked path(s) — deployment, CI and generated state stay out`);
  console.log(`  manifest:    ${path.basename(result.manifestPath)}`);
  console.log(
    "\nThe tag is NOT created by this tool. The canonical identity is named at the publication boundary " +
      "from the actual UTC publication minute; a direct publication that collides fails closed, while " +
      "queued publication waits for the next available minute (scripts/release/README.md).",
  );
  return 0;
}

/**
 * `verify` — check a constructed release, read-only.
 *
 * @param {Record<string, string>} options the parsed options
 * @param {Set<string>} flags the parsed flags
 * @returns {number} the process exit code
 */
export function runVerify(options, flags) {
  const payload = requireOption(options, "payload", "verify");
  const result = verifyRelease({
    payload,
    sourceRepository: options["source-repository"] ?? null,
    expectTag: flags.has("expect-tag"),
  });

  if (result.manifest !== null) {
    console.log(`Foundation release verified — ${result.manifest.release}`);
    console.log(`  source:   ${result.manifest.source.commit}  (tree ${result.manifest.source.tree})`);
    console.log(`  payload:  ${result.fileCount} file(s)`);
    console.log(`  digest:   ${result.digest}`);
  }

  if (!result.ok) {
    console.error("\nRELEASE VERIFICATION FAILED");
    for (const problem of result.problems) console.error(`    ${problem}`);
    return 1;
  }

  console.log("\nrelease verification OK — the payload is the content set its manifest describes.");
  return 0;
}

/**
 * Dispatch one invocation. Exported so a test can drive the CLI without spawning a process.
 *
 * @param {string[]} argv the arguments after the script name
 * @returns {number} the process exit code
 */
export function main(argv) {
  const { command, options, flags } = parseArguments(argv);
  switch (command) {
    case "classify":
      return runClassify(options);
    case "build":
      return runBuild(options);
    case "verify":
      return runVerify(options, flags);
    case "help":
      console.log(USAGE);
      return 0;
    case "":
      console.error(USAGE);
      return 1;
    default:
      throw new Error(`FOUNDATION-R1B: unknown command "${command}".\n\n${USAGE}`);
  }
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`\n${/** @type {Error} */ (error).message}`);
    process.exitCode = 1;
  }
}
