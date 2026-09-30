import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

// These suites SPAWN GIT AND REAL NODE PROCESSES — synthetic repositories, release construction, an
// establishment through the command line — and a loaded CI runner is an order of magnitude slower than a
// developer machine. The budget is raised here, measured rather than guessed; nothing in the platform waits,
// retries or inflates anything.
vi.setConfig({ testTimeout: 60_000 });

import { parseInstallationOperationalState } from "@/core/foundation-installation/index";
import { INSTALLATION_ADOPTION_RECORD_FILE_NAME } from "@/core/foundation-installation/establishment";

import {
  constructSyntheticRelease,
  disposableTree,
  INSTALLATION_CAPSULE_RELATIVE_PATH,
  operationalStateFileOf,
  SYNTHETIC_RELEASE_IDENTITY,
  syntheticSeed,
  syntheticSeedFromExistingInstallation,
} from "../support/installation-establishment-fixture";

/**
 * THE DOCUMENTED OPERATOR SURFACE (FOUNDATION-B4B)
 * ===============================================
 *
 * `pnpm installation:establish` is the ONE supported way to establish an installation, so it is proved as
 * the operator meets it: a real process, real arguments, real exit codes. The command runs the platform's
 * own TypeScript implementation through `scripts/installation/platform-typescript.mjs`, which is also what
 * makes the platform's contracts usable by a plain-Node tool without a bundler or a duplicated copy.
 */
const CLI = path.join(process.cwd(), "scripts", "installation", "index.mjs");

function run(args: readonly string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { status: failure.status ?? -1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

describe("the installation establishment command", () => {
  it("establishes an installation from directories, and reports what it did", () => {
    const release = constructSyntheticRelease();
    const seed = syntheticSeed();
    const targetRoot = path.join(disposableTree("foundation-b4b-cli-"), "target");

    const result = run([
      "establish",
      "--release",
      SYNTHETIC_RELEASE_IDENTITY,
      "--payload",
      release.payloadDirectory,
      "--seed",
      seed,
      "--target",
      targetRoot,
      "--name",
      "b4b cli proof",
      "--repository",
      "https://example.invalid/b4b-cli",
      "--established-by",
      "FOUNDATION-B4B test",
    ]);

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Foundation installation established");
    expect(result.stdout).toContain(SYNTHETIC_RELEASE_IDENTITY);
    expect(result.stdout).toContain("files written");
    // The installation exists, and its record describes an established installation.
    const record = parseInstallationOperationalState(
      JSON.parse(readFileSync(operationalStateFileOf(targetRoot), "utf8")) as unknown,
    );
    expect(record.current.live?.release.tag).toBe(SYNTHETIC_RELEASE_IDENTITY);
  });

  it("accepts an existing installation's capsule as the seed, and says what it did not inherit", () => {
    // THE DOCUMENTED PATH, VERBATIM: `--seed` is an established installation's own capsule, so it carries
    // that installation's adoption record. Establishment must succeed, must say what did not travel, and
    // must leave the seed exactly as it found it.
    const release = constructSyntheticRelease();
    const seed = syntheticSeedFromExistingInstallation();
    const sourceRecord = readFileSync(path.join(seed, INSTALLATION_ADOPTION_RECORD_FILE_NAME), "utf8");
    const targetRoot = path.join(disposableTree("foundation-b4b-cli-existing-"), "target");

    const result = run([
      "establish",
      "--release",
      SYNTHETIC_RELEASE_IDENTITY,
      "--payload",
      release.payloadDirectory,
      "--seed",
      seed,
      "--target",
      targetRoot,
      "--name",
      "b4b cli existing-capsule proof",
      "--repository",
      "https://example.invalid/b4b-cli-existing",
    ]);

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("not inherited");
    expect(result.stdout).toContain(
      `${INSTALLATION_CAPSULE_RELATIVE_PATH}/${INSTALLATION_ADOPTION_RECORD_FILE_NAME}`,
    );
    const established = JSON.parse(
      readFileSync(
        path.join(targetRoot, INSTALLATION_CAPSULE_RELATIVE_PATH, INSTALLATION_ADOPTION_RECORD_FILE_NAME),
        "utf8",
      ),
    ) as { release: { tag: string } };
    expect(established.release.tag).toBe(SYNTHETIC_RELEASE_IDENTITY);
    expect(readFileSync(path.join(seed, INSTALLATION_ADOPTION_RECORD_FILE_NAME), "utf8")).toBe(sourceRecord);
  });

  it("refuses a target it must not use, with a non-zero exit code and the reason printed", () => {
    const release = constructSyntheticRelease();
    const seed = syntheticSeed();
    const targetRoot = disposableTree("foundation-b4b-cli-occupied-");
    writeFileSync(path.join(targetRoot, "somebodys-notes.txt"), "not mine\n", "utf8");

    const result = run([
      "establish",
      "--release",
      SYNTHETIC_RELEASE_IDENTITY,
      "--payload",
      release.payloadDirectory,
      "--seed",
      seed,
      "--target",
      targetRoot,
      "--name",
      "b4b cli proof",
      "--repository",
      "https://example.invalid/b4b-cli",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("ESTABLISHMENT FAILED");
    expect(result.stderr).toContain("not a safe place");
    expect(existsSync(operationalStateFileOf(targetRoot))).toBe(false);
  });

  it("prints its usage, and refuses a missing option as a usage problem rather than an establishment one", () => {
    expect(run(["help"]).stdout).toContain("--target");
    const missing = run(["establish", "--release", SYNTHETIC_RELEASE_IDENTITY]);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain("--payload is required");
  });
});
