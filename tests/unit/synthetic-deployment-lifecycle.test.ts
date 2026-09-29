import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import {
  cleanupSyntheticDeployment,
  materializeSyntheticDeployment,
  selectSyntheticDeployment,
  syntheticWritableDeployment,
} from "../support/synthetic-deployment";

/**
 * WHO REMOVES A SYNTHETIC DEPLOYMENT COPY (FOUNDATION-DEPLOYMENT-ISO-B3C2B-A1)
 * ===========================================================================
 *
 * The generic project hands every test file a writable copy of the synthetic deployment. The defect this
 * suite keeps closed: removal was left to a `process.on("exit")` hook, and a Vitest worker never runs one —
 * so every executed `tests/**` file left a COMPLETE deployment copy in OS temp, deterministically (91
 * directories in a full run), and the residue accumulated silently across runs.
 *
 * The rule is OWNERSHIP rather than housekeeping, and these assertions are the durable half of it:
 *
 *   · the copy a materialisation created is removed by ITS OWN explicit cleanup;
 *   · that cleanup is EXACT — never a search, never a name pattern, so a look-alike directory, another
 *     run's copy or a historical copy is never this context's property (the decoy below proves it);
 *   · it is idempotent, and safe when this context owns nothing, because a teardown must run once per test
 *     file whatever the file did;
 *   · removal is registered by the Vitest lifecycle (the generic project's setup file registers `afterAll`
 *     as that file's teardown), not by a process-exit hook that never fires.
 *
 * The end-to-end proof is a property of RUNS, not of a test — a real execution whose OS-temp directory
 * count does not change — and belongs to the task record rather than to this file. What is durable here is
 * the contract that makes such a run possible.
 */
const decoys: string[] = [];

/** A directory with the SAME name shape as a materialised copy, so a pattern-based cleanup would take it. */
function decoyCopy(): string {
  const decoy = mkdtempSync(path.join(tmpdir(), "foundation-synthetic-deployment-decoy-"));
  decoys.push(decoy);
  return decoy;
}

afterAll(() => {
  for (const decoy of decoys) rmSync(decoy, { recursive: true, force: true });
});

/** A sibling module's source, located relative to THIS file (never through a repository path). */
function moduleSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

/** Source with comments removed: prose about a lifecycle is not a lifecycle. */
function moduleCode(relative: string): string {
  return moduleSource(relative)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ""))
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

describe("a materialised copy is removed by its own explicit cleanup", () => {
  it("removes exactly the directory it created, and never a look-alike", () => {
    const copy = materializeSyntheticDeployment();
    const decoy = decoyCopy();
    expect(existsSync(copy.root)).toBe(true);
    expect(existsSync(decoy)).toBe(true);

    copy.cleanup();

    expect(existsSync(copy.root)).toBe(false);
    expect(existsSync(decoy), "cleanup must never be a name pattern").toBe(true);
  });

  it("is idempotent: a second cleanup of the same copy is safe", () => {
    const copy = materializeSyntheticDeployment();

    copy.cleanup();
    expect(() => copy.cleanup()).not.toThrow();

    expect(existsSync(copy.root)).toBe(false);
  });

  it("is safe when this context owns nothing, and says so", () => {
    // This file's own copy has been given back by now, so the context owns nothing at this point —
    // exactly the state the teardown meets in a file that never touched deployment state.
    cleanupSyntheticDeployment();

    expect(cleanupSyntheticDeployment()).toBe(false);
    expect(() => cleanupSyntheticDeployment()).not.toThrow();
  });

  it("removes the SELECTED context's copy, and a later use materialises a fresh one", () => {
    const owned = syntheticWritableDeployment();
    expect(existsSync(owned.root)).toBe(true);

    expect(cleanupSyntheticDeployment()).toBe(true);
    expect(existsSync(owned.root)).toBe(false);

    // Lazy, therefore recoverable: the context keeps working after its copy has been given back…
    const again = syntheticWritableDeployment();
    expect(existsSync(again.root)).toBe(true);
    expect(again.root).not.toBe(owned.root);
    // …and selecting again hands out that same fresh copy rather than a third one.
    expect(selectSyntheticDeployment().root).toBe(again.root);
  });
});

describe("the removal is owned by the Vitest lifecycle", () => {
  it("registers the context's teardown in the setup file that materialised the copy", () => {
    const setup = moduleCode("../setup/synthetic-deployment.ts");

    expect(setup).toMatch(/afterAll\(\(\) => \{\s*cleanupSyntheticDeployment\(\);\s*\}\);/);
  });

  it("does not leave removal to a process-exit hook, which a Vitest worker never runs", () => {
    const owner = moduleCode("../support/synthetic-deployment-root.ts");

    expect(owner).not.toMatch(/process\.on\(\s*["']exit["']/);
  });
});
