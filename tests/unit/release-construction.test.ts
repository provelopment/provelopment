import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { constructRelease, verifyRelease } from "../../scripts/release/release-construction.mjs";
import { RELEASE_MANIFEST_FILE, digestReleaseEntries } from "../../scripts/release/release-digest.mjs";
import { parseReleaseManifest } from "../../scripts/release/release-manifest.mjs";

/**
 * DETERMINISTIC RELEASE CONSTRUCTION (FOUNDATION-R1B)
 * ===================================================
 *
 * The mechanism is proved on a SYNTHETIC, disposable source repository, so the properties below are
 * about the mechanism rather than about today's contents:
 *
 *   · the payload is the policy's platform set — never a deployment, CI or generated path
 *   · two constructions of the same commit are identical: paths, bytes, manifest and digest
 *   · the bytes come from the COMMIT, so a dirty or generated working tree cannot contaminate them
 *   · an unclassified path, a link or an executable stops construction with the path named
 *   · the manifest derives its values from the payload's own authorities, and refuses to guess
 *
 * Nothing here creates a tag, publishes anything or touches this repository's own state.
 */
const IDENTITY = "provelopment-foundation-v20990101.0000";

// EVERY TEST HERE SPAWNS GIT — a synthetic repository, then one or more constructions that read it
// through the object database. On a loaded CI runner those spawns are an order of magnitude slower
// than on a developer machine, so this file raises the HARNESS budget, measured rather than guessed.
// It is not a property of the release mechanism: nothing in `scripts/release/**` waits, retries or
// inflates anything.
vi.setConfig({ testTimeout: 30_000 });

/** The synthetic platform: every anchor the policy requires, plus representative content. */
const PLATFORM_FILES: Record<string, string> = {
  "LICENSE": "Apache License\nVersion 2.0, January 2004\n",
  ".gitattributes": "# synthetic\n",
  ".gitignore": "# synthetic repository — no ignore rules, so the policy decides every path\n",
  "package.json": `${JSON.stringify(
    { name: "synthetic", private: true, packageManager: "pnpm@11.6.0", engines: { node: ">=22" } },
    null,
    2,
  )}\n`,
  "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
  "pnpm-workspace.yaml": "allowBuilds: {}\n",
  "next.config.ts": "export default {};\n",
  "tsconfig.json": "{}\n",
  "vitest.config.mts": "export default {};\n",
  "eslint.config.mjs": "export default [];\n",
  "postcss.config.mjs": "export default {};\n",
  "README.md": "# Synthetic platform\n",
  "ARCHITECTURE.md": "# Architecture\n",
  "CUSTOMIZING.md": "# Customizing\n",
  "CLAUDE.md": "See AGENTS.md\n",
  "AGENTS.md": "# Agent contract\n",
  "src/app/page.tsx": "export default function Page() { return null; }\n",
  "src/config/deployment-build.mjs": "export function resolveDeploymentForBuild() { return null; }\n",
  "src/config/deployment-root.ts": 'export type DeploymentLayout = "capsule" | "repository" | "override";\n',
  // Deliberately NOT the real value: the manifest must DERIVE it, never assume `1`.
  "src/core/page-document.ts": "export const PAGE_DOCUMENT_SCHEMA_VERSION = 7;\n",
  "tests/unit/example.test.ts": "export {};\n",
  "tests/setup/synthetic-deployment.ts": "export {};\n",
  "tests/setup/production-state-integrity.ts": "export {};\n",
  "tests/support/synthetic-deployment-root.ts": "export {};\n",
  "tests/fixtures/synthetic-deployment/site.config.json": '{ "site": {} }\n',
  "scripts/sync-runtime-assets.mjs": "export {};\n",
  "scripts/generate-country-code-reference.mjs": "export {};\n",
  "scripts/release/index.mjs": "// the release tooling travels with the release\n",
  "instruction-manuals/README.md": "# Manuals\n",
};

/** State that must NEVER enter a release. */
const EXCLUDED_FILES: Record<string, string> = {
  "deployment/site.config.json": '{ "site": { "name": "a real site" } }\n',
  "deployment/tests/unit/reference.test.ts": "export {};\n",
  "deployment/foundation-baseline.json": '{ "commit": "deadbeef" }\n',
  ".github/workflows/ci.yml": "name: CI\n",
  "scripts/ci/change-scope.mjs": "export {};\n",
  "public/assets/logo.svg": "<svg/>\n",
};

/** Task-owned temp state, removed after each test. */
const created: string[] = [];

afterEach(() => {
  for (const entry of created.splice(0)) rmSync(entry, { recursive: true, force: true });
});

function temporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  created.push(directory);
  return directory;
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function writeTree(root: string, files: Record<string, string>): void {
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(root, ...relative.split("/"));
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, "utf8");
  }
}

/** A disposable synthetic source repository with exactly the files given, committed. */
function createSourceRepository(extra: Record<string, string> = {}) {
  const root = temporaryDirectory("foundation-release-source-");
  writeTree(root, { ...PLATFORM_FILES, ...EXCLUDED_FILES, ...extra });
  git(root, ["init", "-q"]);
  git(root, ["add", "-A"]);
  git(root, ["-c", "user.name=R1B", "-c", "user.email=r1b@example.invalid", "commit", "-q", "-m", "synthetic source"]);
  return { root, commit: git(root, ["rev-parse", "HEAD"]), tree: git(root, ["rev-parse", "HEAD^{tree}"]) };
}

/** Every file of a directory as `path → bytes`, for exact comparison. */
function readTree(root: string, prefix = ""): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (statSync(absolute).isDirectory()) {
      for (const [key, value] of readTree(absolute, relative)) files.set(key, value);
    } else {
      files.set(relative, readFileSync(absolute));
    }
  }
  return files;
}

/** Construct into a fresh destination and return everything a caller could want to compare. */
function construct(sourceRoot: string, commit: string) {
  const destination = path.join(temporaryDirectory("foundation-release-dest-"), "payload");
  return { destination, result: constructRelease({ sourceRepository: sourceRoot, revision: commit, release: IDENTITY, destination }) };
}

describe("a constructed Foundation release", () => {
  it("contains the policy's platform set and NOTHING from a deployment, CI or generated output", () => {
    const source = createSourceRepository();
    const { destination, result } = construct(source.root, source.commit);
    const files = [...readTree(destination).keys()].sort();

    for (const excludedPath of Object.keys(EXCLUDED_FILES)) expect(files, excludedPath).not.toContain(excludedPath);
    for (const platformPath of Object.keys(PLATFORM_FILES)) expect(files, platformPath).toContain(platformPath);
    expect(files).toContain(RELEASE_MANIFEST_FILE);

    expect(result.fileCount).toBe(Object.keys(PLATFORM_FILES).length);
    expect(result.excluded.length).toBe(Object.keys(EXCLUDED_FILES).length);
  });

  it("records the source commit and tree, and derives its values from the payload's own authorities", () => {
    const source = createSourceRepository();
    const { destination, result } = construct(source.root, source.commit);
    const manifest = parseReleaseManifest(readFileSync(path.join(destination, RELEASE_MANIFEST_FILE), "utf8"));

    expect(Object.keys(manifest)).toEqual(["format", "release", "source", "content", "requirements", "compatibility"]);
    expect(manifest.release).toBe(IDENTITY);
    expect(manifest.source.commit).toBe(source.commit);
    expect(manifest.source.tree).toBe(source.tree);
    expect(manifest.requirements).toEqual({ node: ">=22", pnpm: "11.6.0" });
    // Derived from `src/core/page-document.ts` — which the synthetic source deliberately sets to 7.
    expect(manifest.compatibility.pageDocumentSchema).toBe(7);
    expect(manifest.compatibility.deploymentLayouts).toEqual(["capsule", "repository", "override"]);
    expect(manifest.content.policy).toBe("foundation-source-v1");
    expect(manifest.content.fileCount).toBe(result.fileCount);
    expect(manifest.content.digest).toBe(result.digest);
  });

  it("constructs the same release TWICE: identical paths, bytes, digest and manifest", () => {
    const source = createSourceRepository();
    const first = construct(source.root, source.commit);
    const second = construct(source.root, source.commit);
    const firstFiles = readTree(first.destination);
    const secondFiles = readTree(second.destination);

    expect([...firstFiles.keys()].sort()).toEqual([...secondFiles.keys()].sort());
    for (const [file, bytes] of firstFiles) {
      expect(bytes.equals(secondFiles.get(file) ?? Buffer.alloc(0)), file).toBe(true);
    }
    expect(first.result.digest).toBe(second.result.digest);
    expect(readFileSync(first.result.manifestPath, "utf8")).toBe(readFileSync(second.result.manifestPath, "utf8"));
    // Two source repositories and four Git reads: measured, not guessed (a shared CI runner is slower
    // than a developer machine). The timeout is for the harness, never for the release mechanism.
  }, 30_000);

  it("is unaffected by a dirty working tree or untracked files — the bytes come from the commit", () => {
    const source = createSourceRepository();
    const clean = construct(source.root, source.commit);

    writeFileSync(path.join(source.root, "README.md"), "# DIRTY working tree\n", "utf8");
    writeFileSync(path.join(source.root, "src", "app", "untracked.tsx"), "// untracked\n", "utf8");
    mkdirSync(path.join(source.root, "public", "assets"), { recursive: true });
    writeFileSync(path.join(source.root, "public", "assets", "probe.svg"), "<svg/>\n", "utf8");

    const dirty = construct(source.root, source.commit);
    expect(dirty.result.digest).toBe(clean.result.digest);
    expect(dirty.result.fileCount).toBe(clean.result.fileCount);

    const files = readTree(dirty.destination);
    expect(files.has("src/app/untracked.tsx")).toBe(false);
    expect(files.has("public/assets/probe.svg")).toBe(false);
    expect(files.get("README.md")?.toString("utf8")).toBe(PLATFORM_FILES["README.md"]);
  }, 30_000);
});

describe("release construction refuses what it cannot release faithfully", () => {
  it("fails closed on a tracked path nobody classified", () => {
    const source = createSourceRepository({ "spoke-tools/install.mjs": "export {};\n" });
    const destination = path.join(temporaryDirectory("foundation-release-dest-"), "payload");
    expect(() =>
      constructRelease({ sourceRepository: source.root, revision: source.commit, release: IDENTITY, destination }),
    ).toThrow(/spoke-tools\/install\.mjs/);
  });

  it("fails closed on a symbolic link or an executable entry", () => {
    const source = createSourceRepository();
    const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], {
      cwd: source.root,
      input: "src/app/page.tsx\n",
      encoding: "utf8",
    }).trim();
    git(source.root, ["update-index", "--add", "--cacheinfo", `120000,${blob},linked.txt`]);
    git(source.root, ["-c", "user.name=R1B", "-c", "user.email=r1b@example.invalid", "commit", "-q", "-m", "a link"]);
    // The link is committed, so the revision being released is the NEW commit — not the one before it.
    const withLink = git(source.root, ["rev-parse", "HEAD"]);

    const destination = path.join(temporaryDirectory("foundation-release-dest-"), "payload");
    expect(() =>
      constructRelease({ sourceRepository: source.root, revision: withLink, release: IDENTITY, destination }),
    ).toThrow(/linked\.txt — a symbolic link/);
  });

  it("refuses a destination that is not empty, and an identity that is not a release identity", () => {
    const source = createSourceRepository();
    const occupied = temporaryDirectory("foundation-release-dest-");
    writeFileSync(path.join(occupied, "already-here.txt"), "x", "utf8");
    expect(() =>
      constructRelease({ sourceRepository: source.root, revision: source.commit, release: IDENTITY, destination: occupied }),
    ).toThrow(/is not empty/);

    // A new release is named by the canonical UTC identity, so a historical checkpoint, an old-style
    // release name and a canonical-LOOKING name that breaks the contract are all refused.
    for (const refused of [
      "v2026.09.27-foundation-markdown-single-h1",
      "v2099.01.01-foundation-release-r1b-test",
      "provelopment-foundation-v20261301.1200",
      "provelopment-foundation-v20260930.1200Z",
    ]) {
      const fresh = path.join(temporaryDirectory("foundation-release-dest-"), "payload");
      expect(() =>
        constructRelease({ sourceRepository: source.root, revision: source.commit, release: refused, destination: fresh }),
      ).toThrow(/is not a contract release identity/);
    }
  });

  it("keeps release identity and platform content identity separate — two identities, one digest", () => {
    const source = createSourceRepository();
    const first = construct(source.root, source.commit);
    const second = constructRelease({
      sourceRepository: source.root,
      revision: source.commit,
      release: "provelopment-foundation-v20990101.0001",
      destination: path.join(temporaryDirectory("foundation-release-dest-"), "payload"),
    });

    // The CONTENT digest is an identity of the payload, so it does not depend on what the release is
    // called… and the manifest does differ, because it records which release this construction is.
    expect(second.digest).toBe(first.result.digest);
    expect(second.fileCount).toBe(first.result.fileCount);
    const firstManifest = readFileSync(first.result.manifestPath, "utf8");
    const secondManifest = readFileSync(second.manifestPath, "utf8");
    expect(secondManifest).not.toBe(firstManifest);
    expect(secondManifest).toContain("provelopment-foundation-v20990101.0001");
    expect(firstManifest).toContain(IDENTITY);
    // Same manifest FILENAME in two destinations: the identity is a value inside it, never its location.
    expect(path.basename(second.manifestPath)).toBe(path.basename(first.result.manifestPath));
  });

  it("fails loudly when an authority it derives a value from disappears", () => {
    const source = createSourceRepository({
      "src/core/page-document.ts": "// the schema-version authority no longer declares one\nexport const OTHER = 1;\n",
    });
    const destination = path.join(temporaryDirectory("foundation-release-dest-"), "payload");
    expect(() =>
      constructRelease({ sourceRepository: source.root, revision: source.commit, release: IDENTITY, destination }),
    ).toThrow(/src\/core\/page-document\.ts no longer declares/);
  });
});

describe("release verification", () => {
  it("accepts a constructed release and detects a tampered byte or an added path", () => {
    const source = createSourceRepository();
    const { destination, result } = construct(source.root, source.commit);

    expect(verifyRelease({ payload: destination, sourceRepository: source.root }).ok).toBe(true);
    expect(verifyRelease({ payload: destination }).digest).toBe(result.digest);

    writeFileSync(path.join(destination, "README.md"), "# tampered\n", "utf8");
    const tampered = verifyRelease({ payload: destination, sourceRepository: source.root });
    expect(tampered.ok).toBe(false);
    expect(tampered.problems.join("\n")).toContain("content digest");

    writeFileSync(path.join(destination, "README.md"), PLATFORM_FILES["README.md"], "utf8");
    expect(verifyRelease({ payload: destination, sourceRepository: source.root }).ok).toBe(true);

    writeFileSync(path.join(destination, "deployment-notes.txt"), "x", "utf8");
    const added = verifyRelease({ payload: destination, sourceRepository: source.root });
    expect(added.ok).toBe(false);
    expect(added.problems.join("\n")).toContain("deployment-notes.txt");
  });

  it("rejects a directory that is not a constructed release at all", () => {
    const empty = temporaryDirectory("foundation-release-empty-");
    const result = verifyRelease({ payload: empty });
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("is not a constructed Foundation release");
  });
});

describe("the normalized content digest", () => {
  it("does not depend on the order entries are supplied in, and covers the payload only", () => {
    const entries = [
      { path: "b.txt", sha256: "11".repeat(32) },
      { path: "a.txt", sha256: "22".repeat(32) },
    ];
    const forward = digestReleaseEntries(entries);
    const reversed = digestReleaseEntries([...entries].reverse());
    expect(forward.digest).toBe(reversed.digest);
    expect(forward.fileCount).toBe(2);

    const changed = digestReleaseEntries([
      { path: "a.txt", sha256: "33".repeat(32) },
      { path: "b.txt", sha256: "11".repeat(32) },
    ]);
    expect(changed.digest).not.toBe(forward.digest);

    expect(() => digestReleaseEntries([{ path: RELEASE_MANIFEST_FILE, sha256: "00".repeat(32) }])).toThrow(
      /not part of the digested payload/,
    );
  });
});
