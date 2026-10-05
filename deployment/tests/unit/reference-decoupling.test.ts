/**
 * THE REFERENCE DEPLOYMENT'S OWN DOCUMENTS (FOUNDATION-MULTISITE-M21 §12)
 * =======================================================================
 *
 * The generic Foundation suite checks PLATFORM documentation only, because a release NEVER carries the
 * reference deployment — `deployment/**` is EXCLUDED by the release content policy, so a generic check
 * may not require a document from here (that contradiction was a real defect, now fixed).
 *
 * The same rule therefore has a second owner: THIS capsule, where the deployment's own documents live.
 * This test states it for them — no document this deployment ships may treat another workspace project
 * as canonical for its content, and none may claim its content is installed FROM one.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
/** A sibling-project reference, by the workspace's own naming convention (`NN.<name>`). */
const SIBLING_PROJECT = /\b0[0-9]\.[a-z][a-z-]*/;
/** A line that would make such a reference a claim about authority rather than a passing mention. */
const CANONICAL_CLAIM = /canonical|byte-for-byte|installed from|authoritative/i;

/** Every Markdown document THIS capsule ships, from the repository's own inventory. */
function capsuleDocuments(): string[] {
  return execFileSync("git", ["ls-files", "-z", "--", "deployment"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter((entry) => entry !== "")
    .filter((file) => /\.md$/i.test(file));
}

describe("the reference deployment's own documents", () => {
  it("ships documents, so the check below can never pass vacuously", () => {
    expect(capsuleDocuments().length, "the capsule documents its own state").toBeGreaterThan(0);
  });

  it("make no canonical-content claim about another workspace project", () => {
    const offenders: string[] = [];
    for (const document of capsuleDocuments()) {
      const lines = readFileSync(path.join(ROOT, document), "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        if (SIBLING_PROJECT.test(line) && CANONICAL_CLAIM.test(line)) {
          offenders.push(`${document}:${index + 1}: ${line.trim().slice(0, 120)}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});
