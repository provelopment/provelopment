import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// DEPLOYMENT SCOPE — this suite validates THIS deployment's own baseline record
// (`deployment/foundation-baseline.json`), so it lives in the capsule (`deployment/tests/**`,
// FOUNDATION-DEPLOYMENT-ISO-B2A) and runs in the `deployment` Vitest project, whose setup selects the
// REAL installed deployment (`tests/setup/real-deployment.ts`, ISO-H2).

// FOUNDATION-R1C — THE TRUE BASELINE
// =================================
//
// After R1C this deployment says one thing: *I deliberately adopt THIS immutable Foundation release.*
// The record keeps two identities apart, because they are not the same thing:
//
//   provenance        the release tag  →  its source commit  →  its source tree
//                     (the source tree contains this capsule and other excluded paths)
//   content identity  the release content policy + the normalized platform-content digest
//                     (what a consumer actually receives; `scripts/release/**` is its ONE authority)
//
// Only STRUCTURE is asserted here. It needs no Git history, no tags and no network, so an invalid
// record cannot enter this deployment silently in any checkout — while the identity-match proof
// (tag → commit → tree → reconstructed digest) stays the focused act of an ADOPTION, reproducible with
// the shipped tooling as `deployment/README.md` records.

import { deploymentPaths } from "@/config/deployment-root";

import { RELEASE_CONTENT_POLICY_ID } from "../../../scripts/release/release-content-policy.mjs";
import {
  FOUNDATION_SOURCE_REPOSITORY,
  RELEASE_IDENTITY_PATTERN,
  RELEASE_MANIFEST_FORMAT,
} from "../../../scripts/release/release-manifest.mjs";

const BASELINE_FILE = path.join(deploymentPaths().root, "foundation-baseline.json");

interface BaselineContent {
  readonly policy: string;
  readonly digest: string;
  readonly fileCount: number;
}

interface BaselineRelease {
  readonly tag: string;
  readonly repository: string;
  readonly commit: string;
  readonly tree: string;
  readonly manifestFormat: number;
  readonly content: BaselineContent;
}

interface FoundationBaseline {
  readonly release: BaselineRelease;
  readonly adoptedAt: string;
  readonly establishedBy: string;
}

const baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8")) as FoundationBaseline;

/** The exact field sets. An unknown or missing field is a schema failure, not a warning. */
const TOP_LEVEL_KEYS = ["adoptedAt", "establishedBy", "release"];
const RELEASE_KEYS = ["commit", "content", "manifestFormat", "repository", "tag", "tree"];
const CONTENT_KEYS = ["digest", "fileCount", "policy"];

const sorted = (keys: string[]) => [...keys].sort().join(",");
const keysOf = (value: object) => sorted(Object.keys(value));

describe("the recorded Foundation baseline is a valid adoption record", () => {
  it("has exactly the contract's fields — no unknown field, no missing field", () => {
    expect(keysOf(baseline)).toBe(sorted(TOP_LEVEL_KEYS));
    expect(keysOf(baseline.release)).toBe(sorted(RELEASE_KEYS));
    expect(keysOf(baseline.release.content)).toBe(sorted(CONTENT_KEYS));
  });

  it("names an immutable release identity, never a mutable branch or a bare commit", () => {
    expect(baseline.release.tag).toMatch(RELEASE_IDENTITY_PATTERN);
    // The identity namespace is what makes the record immutable: a branch, a tag-like pointer or a
    // historical checkpoint identity can never satisfy it.
    for (const mutable of ["main", "HEAD", "origin/main", baseline.release.commit, "v2026.09.27-foundation-two-mode-pages"]) {
      expect(RELEASE_IDENTITY_PATTERN.test(mutable), mutable).toBe(false);
    }
  });

  it("records the full source commit and source tree the release was cut from", () => {
    expect(baseline.release.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(baseline.release.tree).toMatch(/^[0-9a-f]{40}$/);
  });

  it("names the platform's canonical upstream repository", () => {
    expect(baseline.release.repository).toBe(FOUNDATION_SOURCE_REPOSITORY);
  });

  it("records the release content policy this platform recognizes", () => {
    expect(baseline.release.content.policy).toBe(RELEASE_CONTENT_POLICY_ID);
  });

  it("records the normalized platform-content digest — an identity distinct from the source tree", () => {
    expect(baseline.release.content.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    // The source tree includes what a release EXCLUDES (this capsule, the repository's CI, generated
    // state), so the tree and the content digest are deliberately different identities.
    expect(baseline.release.content.digest).not.toBe(`sha256:${baseline.release.tree}`);
    expect(baseline.release.content.digest).not.toContain(baseline.release.tree);
  });

  it("records the manifest format of the release contract it adopted", () => {
    expect(baseline.release.manifestFormat).toBe(RELEASE_MANIFEST_FORMAT);
  });

  it("records a positive payload file count", () => {
    expect(Number.isInteger(baseline.release.content.fileCount)).toBe(true);
    expect(baseline.release.content.fileCount).toBeGreaterThan(0);
  });

  it("records when and by which work the adoption was made", () => {
    expect(baseline.adoptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{2}:\d{2}$/);
    expect(baseline.establishedBy.trim().length).toBeGreaterThan(0);
  });
});
