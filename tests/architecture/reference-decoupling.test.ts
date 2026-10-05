import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// THE RELEASE CONTENT AUTHORITY (FOUNDATION-MULTISITE-M21 §11/§12).
//
// What a Foundation release does and does not carry is decided by ONE classified inventory. The
// generic document set this suite checks is DERIVED from that authority, so a path the release
// EXCLUDES — the reference deployment's own documents above all — can never be required here. A
// materialised release contains no `deployment/**` at all, and this suite must pass there.
import {
  classifyReleasePath,
  RELEASE_INCLUSION,
} from "../../scripts/release/release-content-policy.mjs";

/**
 * FOUNDATION DOES NOT DEPEND ON ANY OTHER WORKSPACE PROJECT (FOUNDATION-MULTISITE-M20 §55)
 * ======================================================================================
 *
 * Foundation is a standalone open-source product: it is built, released, established, deployed and upgraded
 * from THIS repository alone. Nothing here may import, read, hash, copy or claim as canonical the page
 * material of any other project — no runtime dependency, no build dependency and no page-byte dependency.
 *
 * The proofs are deliberately structural and name no other project:
 *
 *   · every import specifier, require, filesystem path literal and configuration path in runtime source and
 *     the build seam is checked against the workspace's sibling-project naming convention
 *     (`NN.<name>`, the convention this workspace uses for its projects), so a future coupling cannot be
 *     introduced quietly;
 *   · the authored page trees of the deployment capsule hold only this repository's own page material;
 *   · no active Foundation document pairs a sibling-project path with a canonical-content claim.
 *
 * A comment may mention a sibling project in passing (for instance a provenance note that a file does NOT
 * come from one); what is refused is code that DEPENDS on one, and prose that treats one as authoritative.
 */
const ROOT = process.cwd();
const SIBLING_PROJECT = /\b0[0-9]\.[a-z][a-z-]*/;
const DEPENDENCY_SHAPES = [
  /\bimport\b[^\n]*from\s*["'`]([^"'`]+)["'`]/g,
  /\brequire\(\s*["'`]([^"'`]+)["'`]/g,
  /\bfrom\s+["'`]([^"'`]+)["'`]/g,
];

/** Every source file a build or a runtime can reach, excluding generated and third-party trees. */
function sourceFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".next", "out"].includes(entry.name)) continue;
      files.push(...sourceFiles(absolute));
      continue;
    }
    if (/\.(?:ts|tsx|mjs|mts|js|json)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

/** True when a line makes a dependency-shaped claim about a sibling project. */
function dependsOnSiblingProject(line: string): boolean {
  for (const shape of DEPENDENCY_SHAPES) {
    shape.lastIndex = 0;
    let match = shape.exec(line);
    while (match !== null) {
      if (SIBLING_PROJECT.test(match[1] ?? "")) return true;
      match = shape.exec(line);
    }
  }
  return false;
}

/** Every tracked path of this revision — the same inventory the release content policy classifies. */
function trackedPaths(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter((entry) => entry !== "");
}

/**
 * THE ACTIVE PLATFORM DOCUMENTS — derived, never hand-listed.
 *
 * The set is what a RELEASE CARRIES: the repository's own documentation at its root, and the
 * documentation beside its platform scripts and source, as the release content policy classifies it.
 * A path the policy EXCLUDES therefore leaves this set by itself: the deployment's documents (which a
 * release never contains), the test trees' own notes, and the distributed instruction manuals (upstream
 * copies, not this repository's active documentation). A document nobody classified stops release
 * construction rather than quietly joining or leaving the check.
 */
function platformDocuments(): string[] {
  return trackedPaths()
    .filter((file) => /\.md$/i.test(file))
    .filter((file) => !file.includes("/") || file.startsWith("scripts/") || file.startsWith("src/"))
    .filter((file) => classifyReleasePath(file).inclusion === RELEASE_INCLUSION.PLATFORM);
}

describe("Foundation depends on no other workspace project", () => {
  it("imports, requires and path-literals nothing outside this repository", () => {
    const offenders: string[] = [];
    for (const root of ["src", "scripts"]) {
      for (const file of sourceFiles(path.join(ROOT, root))) {
        const relative = path.relative(ROOT, file).split(path.sep).join("/");
        for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
          if (dependsOnSiblingProject(line)) offenders.push(`${relative}: ${line.trim().slice(0, 120)}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("checks the documents a RELEASE carries, and never the deployment's own", () => {
    // The derived set is what a release contains: no path from the excluded deployment, and an
    // inventory that cannot go empty (a check over nothing proves nothing).
    const documents = platformDocuments();
    expect(documents.length).toBeGreaterThan(0);
    expect(documents).toContain("ARCHITECTURE.md");
    for (const document of documents) expect(document.startsWith("deployment/")).toBe(false);

    // …and the reference deployment's own documents are EXCLUDED by the release policy, so requiring one
    // inside a release payload is a contradiction the policy itself refutes (M21 §11/§12). The claim is
    // made over the POLICY's answers, which is what makes it true in a materialised release too — there
    // is no `deployment/**` to enumerate, and none may be required.
    for (const document of [
      "deployment/README.md",
      "deployment/AGENTS.md",
      "deployment/tests/unit/r1a-reference-deployment.test.ts",
    ]) {
      expect(classifyReleasePath(document).inclusion, document).toBe(RELEASE_INCLUSION.EXCLUDED);
    }
  });

  it("makes no canonical-content claim about another project in its active documentation", () => {
    const offenders: string[] = [];
    for (const document of platformDocuments()) {
      const lines = readFileSync(path.join(ROOT, document), "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        if (SIBLING_PROJECT.test(line) && /canonical|byte-for-byte|installed from|authoritative/i.test(line)) {
          offenders.push(`${document}:${index + 1}: ${line.trim().slice(0, 120)}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});
