#!/usr/bin/env node
/**
 * ESTABLISH ONE COMPLETE FOUNDATION INSTALLATION (FOUNDATION-B4B)
 * ==============================================================
 *
 *   node scripts/installation/index.mjs establish --release <identity> --payload <dir> --seed <dir>
 *                                                --target <dir> --name <name> --repository <url>
 *                                                [--established-by <work>]
 *
 * This is the ONE supported way to establish a Foundation installation, and it is deliberately the only
 * command here: establishment is a single act with a single result, and a second way to do it would be a
 * second thing to keep correct. Everything it does is decided by the platform's own contract — the
 * lifecycle in `@/core/foundation-installation`, the use case in
 * `@/application/establish-foundation-installation` — and this file is argument handling, reporting and the
 * exit code.
 *
 * WHAT IT NEEDS, AND WHAT IT REFUSES TO ASSUME
 *
 *   --release     the immutable release identity to establish from (never a branch, never "latest")
 *   --payload     a directory holding that release: what `pnpm release:build --dest <dir>` produces, or an
 *                 unpacked published release
 *   --seed        a directory holding the authored installation material (`site.config.json`, `config/i18n/`,
 *                 `content/`) — the one input the platform cannot invent
 *   --target      the directory that becomes the installation root: absent, or empty. Establishment never
 *                 overwrites, repairs or deletes anything
 *   --name        the installation's own name, as its operator uses it
 *   --repository  the installation's OWN repository/authority (not the platform's)
 *
 * NO INTERACTION, NO GITHUB, NO WORKING-DIRECTORY ASSUMPTION and no machine identity: it reads the release
 * from the directory it was given, writes only beneath the target it was given, and reports what it did. It
 * installs no dependencies, builds nothing and creates no Git repository — the installation it creates can
 * do those things itself, which is how they are proven (`instruction-manuals/adoption.md`).
 *
 * EXIT CODES: 0 established · 1 establishment refused or failed (the reason is printed) · 2 usage/runtime.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

import { capsuleDirectory } from "../../src/config/deployment-build.mjs";

import { loadPlatformModule } from "./platform-typescript.mjs";

const USAGE = `FOUNDATION-B4B installation establishment

  establish --release <identity> --payload <dir> --seed <dir> --target <dir> --name <name>
            --repository <url> [--established-by <work>]
      Establish ONE complete Foundation installation inside <dir>, from ONE immutable Foundation release
      (read from <dir>) plus the authored installation material in <dir>.

      --release <identity>   the immutable release, e.g. provelopment-foundation-v20261003.1427, or the
                             grandfathered v2026.09.30-foundation-release-initial
      --payload <dir>        a directory holding that release (a constructed or unpacked release)
      --seed <dir>           the authored installation capsule (site.config.json, config/i18n, content)
      --target <dir>         the installation root: absent, or an EMPTY directory
      --name <name>          the installation's own name, recorded in its operational record
      --repository <url>     the installation's OWN repository, recorded in its operational record
      --established-by <work>
                             which work is establishing it, recorded in its adoption record
                             (default: ${"pnpm installation:establish"})

  help
      Print this text.

  Establishment writes only beneath --target. It never writes the release directory, the seed directory, the
  platform it is run from, or anything else, and it never deletes anything.
`;

/** Long options this CLI understands, all of which take a value. */
const VALUE_OPTIONS = ["release", "payload", "seed", "target", "name", "repository", "established-by"];

/** The work id a record carries when the operator did not name one. */
const DEFAULT_ESTABLISHED_BY = "pnpm installation:establish";

/**
 * Parse `argv` into a command and its options.
 *
 * @param {string[]} argv the arguments after the script name
 * @returns {{ command: string, options: Record<string, string> }}
 */
function parseArguments(argv) {
  const command = argv[0] ?? "";
  /** @type {Record<string, string>} */ const options = {};

  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`FOUNDATION-B4B: unexpected argument "${token}".\n\n${USAGE}`);
    }
    const name = token.slice(2);
    if (!VALUE_OPTIONS.includes(name)) {
      throw new Error(`FOUNDATION-B4B: unknown option "${token}".\n\n${USAGE}`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`FOUNDATION-B4B: option "--${name}" needs a value.\n\n${USAGE}`);
    }
    options[name] = value;
    index += 1;
  }

  return { command, options };
}

/** One required option, or a loud usage failure naming what is missing. */
function requireOption(options, name) {
  const value = options[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`FOUNDATION-B4B: --${name} is required.\n\n${USAGE}`);
  }
  return value;
}

/**
 * `establish` — create one complete installation, and report exactly what was created.
 *
 * @param {Record<string, string>} options the parsed options
 * @returns {Promise<number>} the process exit code
 */
export async function runEstablish(options) {
  const request = {
    release: requireOption(options, "release"),
    payloadDirectory: requireOption(options, "payload"),
    seedDirectory: requireOption(options, "seed"),
    targetRoot: requireOption(options, "target"),
    // WHERE an installation's authored material lives is the platform's own answer, asked here because
    // `src/**` may not import the build-selection authority (it touches `node:fs`).
    capsuleDirectory: capsuleDirectory(""),
    installationName: requireOption(options, "name"),
    installationRepository: requireOption(options, "repository"),
    establishedBy: options["established-by"] ?? DEFAULT_ESTABLISHED_BY,
  };

  const { establishInstallationFromDirectories } = await loadPlatformModule(
    "src/adapters/installation/establish.ts",
  );
  const outcome = await establishInstallationFromDirectories(request);

  if (!outcome.ok) {
    console.error(`\nESTABLISHMENT FAILED — ${outcome.failure.category}`);
    console.error(`  ${outcome.failure.message}`);
    for (const refusal of outcome.refusals) console.error(`    - ${refusal}`);
    console.error(
      "\nNo installation was established: nothing durable claims success, and the target (if anything was " +
        "written at all) is incomplete and unactivated. Nothing was overwritten or deleted.",
    );
    return 1;
  }

  const { result } = outcome;
  console.log(`Foundation installation established — ${request.installationName}`);
  console.log(`  release:            ${result.release.tag}`);
  console.log(`  source:             ${result.release.commit}  (tree ${result.release.tree})`);
  console.log(`  platform content:   ${result.release.content.fileCount} file(s), ${result.release.content.digest}`);
  console.log(`  acquired from:      ${result.acquiredFrom}`);
  console.log(`  authored from:      ${result.seedFrom}`);
  // WHICH AUTHORING MODE THE SEED WAS READ IN (FOUNDATION-MULTISITE-M20): an operator establishing a
  // multi-Spoke Installation must see that the capsule was understood as a Spoke collection rather than as
  // one implicit Spoke, because that is what decided which authored surfaces had to exist.
  console.log(
    `  authoring mode:     ${
      result.seedMode === "legacy"
        ? "implicit — one Spoke, the installation root itself"
        : `explicit Spoke collection — ${result.seedSpokes.length} declared Spoke(s): ${result.seedSpokes.join(", ")}`
    }`,
  );
  console.log(`  installation root:  ${result.targetRoot}`);
  console.log(`  candidate:          release ${result.candidate.release}`);
  console.log(`                      authored      ${result.candidate.authored}`);
  console.log(`                      materialised  ${result.candidate.materialized}`);
  console.log(`  files written:      ${result.writtenFiles.length}`);
  // A SOURCE INSTALLATION'S OWN RECORDS DO NOT TRAVEL (FOUNDATION-B4B-A2): using another installation's
  // capsule as the seed is the ordinary case, so the operator is told which of its files were deliberately
  // not inherited rather than left to discover it.
  if (result.notInherited.length > 0) {
    console.log(`  not inherited:      ${result.notInherited.join(", ")}`);
  }
  console.log(`  operational record: ${result.operationalStateFile}`);
  console.log(`  recorded history:   ${result.events.length} lifecycle event(s)`);
  // ESTABLISHED IS NOT THE SAME AS SERVING (FOUNDATION-B4B-A1): establishment activates the installation
  // and never probes it, so the operator is told which of the two actually happened.
  console.log(
    "  runtime health:     NOT evaluated — establishment activates the installation; it does not prove\n" +
      "                      that anything serves yet (the record says so: offline, with no evaluation instant)",
  );
  console.log(
    "\nThe installation is complete and its own records name the release it runs. It has NOT been installed,\n" +
      "built or tested yet — do that inside the installation itself (`pnpm install`, then the checks its own\n" +
      "manual lists), which is what proves it can operate without the source it came from.",
  );
  return 0;
}

/**
 * Dispatch one invocation. Exported so a test can drive the CLI without spawning a process.
 *
 * @param {string[]} argv the arguments after the script name
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv) {
  const { command, options } = parseArguments(argv);
  switch (command) {
    case "establish":
      return runEstablish(options);
    case "help":
      console.log(USAGE);
      return 0;
    case "":
      console.error(USAGE);
      return 2;
    default:
      console.error(`FOUNDATION-B4B: unknown command "${command}".\n\n${USAGE}`);
      return 2;
  }
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(`\n${/** @type {Error} */ (error).message}`);
    process.exitCode = 2;
  }
}
