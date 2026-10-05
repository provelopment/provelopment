#!/usr/bin/env node
/**
 * DETERMINISTIC RELEASE CONSTRUCTION (FOUNDATION-R1B)
 * ===================================================
 *
 * ONE mechanism that turns `source commit + release identity + destination` into a Foundation release
 * source set. Whoever calls it — a human, an agent, CI, or the future deployment installer — gets the
 * same bytes, because nothing about the caller or the machine can reach the output:
 *
 *   · THE BYTES COME FROM GIT OBJECTS AT THE COMMIT, never from a working tree. This is not
 *     theoretical: on a Windows checkout with `core.autocrlf=true`, tracked text files exist on disk
 *     with CRLF where the committed blob has LF, so a tree-copy builder would produce a
 *     machine-dependent release. Reading `<commit>:<path>` blobs makes the content set identical on
 *     every machine, and it means a dirty, generated or ignored working tree cannot contaminate a
 *     release at all.
 *   · THE FILE SET COMES FROM THE POLICY (`release-content-policy.mjs`), which fails closed on any
 *     tracked path nobody has classified.
 *   · THE ORDER IS FIXED (byte-wise sorted paths) and the manifest carries no timestamp, so two
 *     constructions of the same commit produce identical files and an identical manifest.
 *
 * FILE MODES ARE REFUSED, NOT IGNORED: this platform has no symlinks and no executable tracked files
 * (the release policy refuses any other mode, naming each path), and the digest deliberately carries no
 * mode metadata. A source revision that introduces a link or an executable therefore fails construction
 * with the path named, instead of silently releasing a file whose meaning depends on metadata nobody
 * recorded.
 *
 * A MATERIALISED RELEASE HAS NO COMMIT, AND ITS OWN SELF-PROOF MUST NOT NEED ONE: `constructRelease`
 * reads a COMMIT, which a release work tree created with `git init && git add -A` does not have. The
 * same content set is therefore also constructible from that work tree's INDEX
 * (`constructReleaseFromWorkTree`), with the source identity read from the release's OWN manifest — the
 * content's own record of the commit and tree it was built from. Nothing is invented: with no manifest
 * there is no authority that could name a source revision, and the call is refused.
 *
 * THE MANIFEST IS WRITTEN LAST, so a construction that fails part-way leaves a directory with no
 * manifest — visibly incomplete, never mistakable for a finished release.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  RELEASE_CONTENT_POLICY_ID,
  RELEASE_INCLUSION,
  assertReleaseInventoryClassified,
  assertRequiredPlatformPaths,
  classifyReleasePath,
} from "./release-content-policy.mjs";
import {
  RELEASE_MANIFEST_FILE,
  compareReleasePaths,
  digestReleaseDirectory,
  digestReleaseEntries,
  isReleasePayloadPath,
  listPayloadFiles,
  sha256Hex,
} from "./release-digest.mjs";
import { assertReleaseIdentity } from "./release-identity.mjs";
import {
  buildReleaseManifest,
  parseReleaseManifest,
  readReleaseAuthorities,
  serialiseReleaseManifest,
} from "./release-manifest.mjs";

/** The only file mode this platform's tracked content uses. Anything else is refused (see above). */
const RELEASE_SOURCE_MODE = "100644";

/**
 * Run Git in a repository, capturing text or raw bytes.
 *
 * @param {string} cwd the repository to run in
 * @param {string[]} args the Git arguments
 * @param {{ binary?: boolean }} [options] `binary: true` returns a Buffer (file content)
 * @returns {any} the trimmed text, or a Buffer in binary mode
 */
function git(cwd, args, options = {}) {
  const output = execFileSync("git", args, {
    cwd,
    encoding: options.binary === true ? "buffer" : "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return options.binary === true ? output : String(output).trim();
}

/**
 * Fail unless the directory is a Git repository this tooling can read a commit from.
 *
 * @param {string} sourceRepository the directory to check
 * @returns {string} the repository's absolute path
 */
export function assertGitRepository(sourceRepository) {
  const root = path.resolve(sourceRepository);
  if (!existsSync(root)) {
    throw new Error(`FOUNDATION-R1B: the source repository ${root} does not exist.`);
  }
  try {
    git(root, ["rev-parse", "--git-dir"]);
  } catch {
    throw new Error(
      `FOUNDATION-R1B: ${root} is not a Git repository. A release is constructed from a Git source ` +
        "commit, never from a directory of files.",
    );
  }
  return root;
}

/**
 * Resolve a revision to the commit and tree a release will be constructed from.
 *
 * @param {string} sourceRepository the repository to read
 * @param {string} revision the commit (a full SHA by preference; the CLI requires one)
 * @returns {{ commit: string, tree: string }} the resolved source identity
 */
export function resolveSourceRevision(sourceRepository, revision) {
  const root = assertGitRepository(sourceRepository);
  /** @type {string} */ let commit;
  try {
    commit = git(root, ["rev-parse", "--verify", `${revision}^{commit}`]);
  } catch {
    throw new Error(`FOUNDATION-R1B: the source revision "${revision}" is not a commit in ${root}.`);
  }
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error(`FOUNDATION-R1B: ${revision} did not resolve to a full commit SHA (got "${commit}").`);
  }
  return { commit, tree: git(root, ["rev-parse", `${commit}^{tree}`]) };
}

/**
 * Every tracked entry at a commit, with its mode — the EXACT inventory of the source revision.
 *
 * @param {string} sourceRepository the repository to read
 * @param {string} commit the source commit
 * @returns {{ path: string, mode: string }[]} the tracked entries, in Git's tree order
 */
export function listTrackedEntries(sourceRepository, commit) {
  const root = assertGitRepository(sourceRepository);
  const raw = /** @type {Buffer} */ (git(root, ["ls-tree", "-r", "-z", commit], { binary: true }));
  /** @type {{ path: string, mode: string }[]} */ const entries = [];

  for (const record of raw.toString("utf8").split("\0")) {
    if (record === "") continue;
    const match = /^(\d{6}) \w+ [0-9a-f]+\t([\s\S]+)$/.exec(record);
    if (match === null) {
      throw new Error(`FOUNDATION-R1B: could not read the tree entry ${JSON.stringify(record)} at ${commit}.`);
    }
    entries.push({ path: match[2], mode: match[1] });
  }

  return entries;
}

/**
 * Every tracked entry in a WORK TREE'S INDEX, with its mode — the inventory of a work tree that has NO
 * commit. A materialised release was created with `git init && git add -A`, so its index carries exactly
 * the content Git recorded, and `git ls-files -s` reports each entry's mode and blob object.
 *
 * @param {string} sourceRepository the repository to read
 * @returns {{ path: string, mode: string, object: string }[]} the index entries, sorted by path
 */
export function listIndexEntries(sourceRepository) {
  const root = assertGitRepository(sourceRepository);
  const raw = /** @type {Buffer} */ (git(root, ["ls-files", "-s", "-z"], { binary: true }));
  /** @type {{ path: string, mode: string, object: string }[]} */ const entries = [];

  for (const record of raw.toString("utf8").split("\0")) {
    if (record === "") continue;
    const match = /^(\d{6}) ([0-9a-f]+) \d+\t([\s\S]+)$/.exec(record);
    if (match === null) {
      throw new Error(`FOUNDATION-R1B: could not read the index entry ${JSON.stringify(record)}.`);
    }
    entries.push({ path: match[3], mode: match[1], object: match[2] });
  }

  return entries.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

/**
 * Fail unless every tracked entry has the one mode this platform's content uses.
 *
 * @param {{ path: string, mode: string }[]} entries the tracked entries
 * @returns {string[]} the entry paths
 */
export function assertReleaseSourceModes(entries) {
  const unusual = entries.filter((entry) => entry.mode !== RELEASE_SOURCE_MODE);
  if (unusual.length > 0) {
    /** @param {string} mode */
    const meaning = (mode) =>
      mode === "120000"
        ? "a symbolic link"
        : mode === "100755"
          ? "an executable file"
          : mode === "160000"
            ? "a submodule"
            : `mode ${mode}`;
    throw new Error(
      "FOUNDATION-R1B: the source revision tracks entries whose file mode carries meaning the release " +
        "digest does not record, so it refuses to release them silently. Classify each one deliberately " +
        `(and extend the digest if the meaning must travel):\n${unusual
          .map((entry) => `    ${entry.path} — ${meaning(entry.mode)}`)
          .join("\n")}`,
    );
  }
  return entries.map((entry) => entry.path);
}

/**
 * The exact bytes of one tracked file AT A COMMIT.
 *
 * @param {string} sourceRepository the repository to read
 * @param {string} commit the source commit
 * @param {string} file the repository-relative path
 * @returns {Buffer} the committed bytes
 */
export function readSourceBlob(sourceRepository, commit, file) {
  return /** @type {Buffer} */ (
    git(assertGitRepository(sourceRepository), ["cat-file", "blob", `${commit}:${file}`], { binary: true })
  );
}

/**
 * The exact bytes of MANY tracked files at a commit, in ONE Git process.
 *
 * `git cat-file --batch` is used rather than a process per file because a payload is hundreds of files
 * (~336 today) and spawning Git per file costs tens of seconds on Windows. The content and the
 * determinism are identical either way — this is the same object database read once.
 *
 * A path that does not exist at the commit makes Git answer `missing` instead of a blob, which is a
 * loud failure here: the plan says the file exists, so a missing blob means the tree and the plan
 * disagree.
 *
 * @param {string} sourceRepository the repository to read
 * @param {string} commit the source commit
 * @param {string[]} files the repository-relative paths
 * @returns {Map<string, Buffer>} the committed bytes, by path
 */
export function readSourceBlobs(sourceRepository, commit, files) {
  const root = assertGitRepository(sourceRepository);
  return readBatchObjects(
    root,
    files.map((file) => ({ key: file, spec: `${commit}:${file}` })),
    `at ${commit}`,
  );
}

/**
 * The exact bytes of MANY Git objects, in ONE `git cat-file --batch` process, keyed by the caller's own
 * labels.
 *
 * ONE parser for both ways a content set is read — a commit's paths (`<commit>:<path>`) and a work tree's
 * index objects (a blob id) — because Git answers both in the same `<oid> blob <size>` framing. A spec
 * Git cannot resolve makes it answer `missing` instead of a blob, which is a loud failure here: the plan
 * says the object exists, so a missing object means the plan and the repository disagree.
 *
 * @param {string} root the repository to read
 * @param {{ key: string, spec: string }[]} requests what to read, and what to call it
 * @param {string} where a description of the source, for failure messages
 * @returns {Map<string, Buffer>} the bytes, by key
 */
function readBatchObjects(root, requests, where) {
  /** @type {Map<string, Buffer>} */ const objects = new Map();
  if (requests.length === 0) return objects;

  const output = /** @type {Buffer} */ (
    execFileSync("git", ["cat-file", "--batch"], {
      cwd: root,
      input: `${requests.map((request) => request.spec).join("\n")}\n`,
      maxBuffer: 512 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    })
  );

  let offset = 0;
  for (const request of requests) {
    const newline = output.indexOf(0x0a, offset);
    const header = newline === -1 ? output.subarray(offset).toString("utf8") : output.subarray(offset, newline).toString("utf8");
    const match = /^([0-9a-f]{40}) (\w+) (\d+)$/.exec(header);
    if (match === null) {
      throw new Error(
        `FOUNDATION-R1B: Git did not return ${request.spec} as a blob ${where} ("${header.trim()}"). The ` +
          "release plan and the source disagree, so nothing can be released from it.",
      );
    }
    const size = Number(match[3]);
    const start = newline + 1;
    objects.set(request.key, Buffer.from(output.subarray(start, start + size)));
    offset = start + size + 1; // the object's own trailing newline
  }

  return objects;
}

/**
 * Fail unless every released FILE's relative imports resolve INSIDE the release.
 *
 * A release is a content set; a file whose import resolves to a path the policy excludes is a file
 * that cannot work in the clean room it will be consumed in. This was not hypothetical: the generic
 * suite contained two tests of the excluded CI router, and the payload's own `tsc` failed in a clean
 * room because the import could not resolve. The rule is checked at CONSTRUCTION, so the boundary is
 * enforced where a release is made rather than noticed afterwards.
 *
 * @param {{ platformPaths: string[], excludedPaths: string[], readText: (file: string) => string }} input
 * @returns {number} how many released files were inspected
 */
export function assertReleasePayloadImportsResolve(input) {
  const excluded = new Set(input.excludedPaths);
  const code = /\.(ts|tsx|mts|mjs|js|jsx|cjs)$/;
  let inspected = 0;

  for (const file of input.platformPaths) {
    if (!code.test(file)) continue;
    inspected += 1;
    for (const match of input.readText(file).matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
      const specifier = match[1];
      if (!specifier.startsWith(".")) continue; // packages, Node builtins and the `@/` platform alias
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      const subject = [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}.mjs`, `${base}/index.ts`].find(
        (candidate) => excluded.has(candidate),
      );
      if (subject !== undefined) {
        throw new Error(
          `FOUNDATION-R1B: ${file} is released but imports ${subject}, which the release content policy ` +
            "EXCLUDES — the file could not resolve in a clean room. Either classify the importer as excluded " +
            "too (with its subject), or stop excluding the subject " +
            "(scripts/release/release-content-policy.mjs).",
        );
      }
    }
  }

  return inspected;
}

/**
 * The release's file plan at a commit: what is platform, what is excluded, and the anchors present.
 *
 * @param {string} sourceRepository the repository to read
 * @param {string} commit the source commit
 * @returns {{ commit: string, platform: string[], excluded: string[], byRule: Record<string, string[]> }}
 */
export function planReleaseContent(sourceRepository, commit) {
  const entries = listTrackedEntries(sourceRepository, commit);
  assertReleaseSourceModes(entries);
  const inventory = assertReleaseInventoryClassified(entries.map((entry) => entry.path));
  assertRequiredPlatformPaths(inventory.platform);
  return { commit, platform: inventory.platform, excluded: inventory.excluded, byRule: inventory.byRule };
}

/**
 * Construct a Foundation release into an empty destination.
 *
 * @param {{ sourceRepository: string, revision: string, release: string, destination: string }} input
 * @returns {{ destination: string, release: string, commit: string, tree: string, digest: string,
 *           fileCount: number, manifest: Record<string, unknown>, manifestPath: string,
 *           platform: string[], excluded: string[] }}
 */
export function constructRelease(input) {
  const release = assertReleaseIdentity(input.release);
  const root = assertGitRepository(input.sourceRepository);
  const { commit, tree } = resolveSourceRevision(root, input.revision);
  const plan = planReleaseContent(root, commit);

  const destination = path.resolve(input.destination);
  if (existsSync(destination) && readdirSync(destination).length > 0) {
    throw new Error(
      `FOUNDATION-R1B: the destination ${destination} is not empty. A release is constructed into a ` +
        "fresh directory, so nothing from a previous construction, an unrelated checkout or a partial run " +
        "can mix into the content set being released.",
    );
  }
  mkdirSync(destination, { recursive: true });

  const ordered = [...plan.platform].sort(compareReleasePaths);
  const blobs = readSourceBlobs(root, commit, ordered);
  /** The bytes of one planned file, or a loud failure — never an empty placeholder. */
  const bytesOf = (/** @type {string} */ file) => {
    const bytes = blobs.get(file);
    if (bytes === undefined) {
      throw new Error(`FOUNDATION-R1B: ${file} is in the release plan but no bytes were read for it.`);
    }
    return bytes;
  };

  /** @type {{ path: string, sha256: string }[]} */ const entries = [];
  for (const file of ordered) {
    const bytes = bytesOf(file);
    const absolute = path.join(destination, ...file.split("/"));
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, bytes);
    entries.push({ path: file, sha256: sha256Hex(bytes) });
  }

  // THE PLAN MUST BE SELF-CONSISTENT: a released file whose import resolves to an excluded path would
  // be unusable in the clean room it is consumed in. Checked here, where a release is made.
  assertReleasePayloadImportsResolve({
    platformPaths: ordered,
    excludedPaths: plan.excluded,
    readText: (file) => bytesOf(file).toString("utf8"),
  });

  const { digest, fileCount } = digestReleaseEntries(entries);
  const authorities = readReleaseAuthorities(bytesOf);
  const manifest = buildReleaseManifest({ release, commit, tree, digest, fileCount, authorities });
  const manifestPath = path.join(destination, RELEASE_MANIFEST_FILE);
  writeFileSync(manifestPath, serialiseReleaseManifest(manifest));

  return {
    destination,
    release,
    commit,
    tree,
    digest,
    fileCount,
    manifest,
    manifestPath,
    platform: [...plan.platform].sort(compareReleasePaths),
    excluded: [...plan.excluded].sort(compareReleasePaths),
  };
}

/**
 * Construct a release FROM A WORK TREE THAT HAS NO COMMIT — a materialised release proving itself.
 *
 * A consumer materialises a release with `git init && git add -A` (the documented recipe, which needs no
 * history), so the content set exists in Git's INDEX while no commit names it. Cutting a release from
 * that state needs exactly two authorities, and both already exist:
 *
 *   · the CONTENT comes from the index (`listIndexEntries` + `readBatchObjects`), which is the same Git
 *     authority `constructRelease` uses — `git add` applied the repository's own filters once, so the
 *     bytes are the bytes a commit would carry;
 *   · the SOURCE IDENTITY comes from the release's OWN manifest, because that is this content's record
 *     of the commit and tree it was constructed from. It is the same record `release:verify --expect-tag`
 *     reads, so nothing new is invented.
 *
 * The construction is also a SELF-PROOF: the digest and file count it computes must equal the ones the
 * carried manifest states, so a work tree whose content has been edited, truncated or added to is refused
 * with both digests named, instead of producing a release that quietly differs from the one it claims to
 * be.
 *
 * @param {{ sourceRepository: string, release: string, destination: string }} input
 * @returns {{ destination: string, release: string, commit: string, tree: string, digest: string,
 *           fileCount: number, manifest: Record<string, unknown>, manifestPath: string,
 *           platform: string[], excluded: string[] }}
 */
export function constructReleaseFromWorkTree(input) {
  const release = assertReleaseIdentity(input.release);
  const root = assertGitRepository(input.sourceRepository);

  const carriedFile = path.join(root, RELEASE_MANIFEST_FILE);
  if (!existsSync(carriedFile)) {
    throw new Error(
      `FOUNDATION-R1B: ${root} carries no "${RELEASE_MANIFEST_FILE}", so it is not a materialised release ` +
        "and nothing there could legitimately name the source commit its content came from. Construct " +
        "from a commit instead (`constructRelease`).",
    );
  }

  const carried = parseReleaseManifest(readFileSync(carriedFile, "utf8"));
  if (carried.content.policy !== RELEASE_CONTENT_POLICY_ID) {
    throw new Error(
      `FOUNDATION-R1B: ${carriedFile} was constructed under the content policy ` +
        `"${carried.content.policy}", and this tooling implements "${RELEASE_CONTENT_POLICY_ID}". A ` +
        "release is re-constructed by the policy that made it, so this refuses rather than classifying " +
        "the content differently.",
    );
  }
  const commit = String(carried.source.commit);
  const tree = String(carried.source.tree);

  const entries = listIndexEntries(root);
  assertReleaseSourceModes(entries);
  const inventory = assertReleaseInventoryClassified(entries.map((entry) => entry.path));
  assertRequiredPlatformPaths(inventory.platform);
  // THE-WORK-TREE-CONSTRUCTION-CONTINUES-HERE
  const destination = path.resolve(input.destination);
  if (existsSync(destination) && readdirSync(destination).length > 0) {
    throw new Error(
      `FOUNDATION-R1B: the destination ${destination} is not empty. A release is constructed into a ` +
        "fresh directory, so nothing from a previous construction, an unrelated checkout or a partial run " +
        "can mix into the content set being released.",
    );
  }
  mkdirSync(destination, { recursive: true });

  const ordered = [...inventory.platform].sort(compareReleasePaths);
  const objectByPath = new Map(entries.map((entry) => [entry.path, entry.object]));
  const blobs = readBatchObjects(
    root,
    ordered.map((file) => {
      const object = objectByPath.get(file);
      if (object === undefined) {
        throw new Error(
          `FOUNDATION-R1B: ${file} is in the release plan but not in ${root}'s index. The work tree and ` +
            "the release plan disagree, so nothing can be released from it.",
        );
      }
      return { key: file, spec: object };
    }),
    `from the index at ${root}`,
  );
  /** The bytes of one planned file, or a loud failure — never an empty placeholder. */
  const bytesOf = (/** @type {string} */ file) => {
    const bytes = blobs.get(file);
    if (bytes === undefined) {
      throw new Error(`FOUNDATION-R1B: ${file} is in the release plan but no bytes were read for it.`);
    }
    return bytes;
  };

  /** @type {{ path: string, sha256: string }[]} */ const written = [];
  for (const file of ordered) {
    const bytes = bytesOf(file);
    const absolute = path.join(destination, ...file.split("/"));
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, bytes);
    written.push({ path: file, sha256: sha256Hex(bytes) });
  }

  assertReleasePayloadImportsResolve({
    platformPaths: ordered,
    excludedPaths: inventory.excluded,
    readText: (file) => bytesOf(file).toString("utf8"),
  });

  const { digest, fileCount } = digestReleaseEntries(written);
  // THE SELF-PROOF: this content set must still be the release its own manifest describes.
  if (digest !== carried.content.digest || fileCount !== carried.content.fileCount) {
    throw new Error(
      `FOUNDATION-R1B: this work tree's content is NOT the release "${carriedFile}" describes. The ` +
        `manifest states ${carried.content.fileCount} file(s) with digest ${carried.content.digest}; the ` +
        `content here is ${fileCount} file(s) with digest ${digest}. A materialised release is expected ` +
        "to be the content it came with, byte for byte.",
    );
  }

  const authorities = readReleaseAuthorities(bytesOf);
  const manifest = buildReleaseManifest({ release, commit, tree, digest, fileCount, authorities });
  const manifestPath = path.join(destination, RELEASE_MANIFEST_FILE);
  writeFileSync(manifestPath, serialiseReleaseManifest(manifest));

  return {
    destination,
    release,
    commit,
    tree,
    digest,
    fileCount,
    manifest,
    manifestPath,
    platform: [...ordered],
    excluded: [...inventory.excluded].sort(compareReleasePaths),
  };
}

/**
 * Verify a constructed release: its boundary, its digest and — when a source repository is available —
 * that it is exactly the content the manifest claims to describe.
 *
 * Read-only and filesystem-first: a consumer that received a release and its manifest can run this
 * WITHOUT the Git history. Supplying `sourceRepository` adds the strongest check there is: the payload
 * is compared to the policy's plan AT THE RECORDED COMMIT.
 *
 * @param {{ payload: string, sourceRepository?: string|null, expectTag?: boolean }} input
 * @returns {{ ok: boolean, problems: string[], digest: string|null, fileCount: number|null,
 *             manifest: Record<string, any>|null }}
 */
export function verifyRelease(input) {
  const payload = path.resolve(input.payload);
  /** @type {string[]} */ const problems = [];
  const manifestPath = path.join(payload, RELEASE_MANIFEST_FILE);
  /** @type {Record<string, any>|null} */ let manifest = null;
  /** @type {string|null} */ let digest = null;
  /** @type {number|null} */ let fileCount = null;

  if (!existsSync(payload)) {
    return { ok: false, problems: [`${payload} does not exist`], digest: null, fileCount: null, manifest: null };
  }
  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      problems: [`${payload} has no ${RELEASE_MANIFEST_FILE}; it is not a constructed Foundation release`],
      digest: null,
      fileCount: null,
      manifest: null,
    };
  }

  try {
    manifest = parseReleaseManifest(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    return { ok: false, problems: [/** @type {Error} */ (error).message], digest: null, fileCount: null, manifest: null };
  }

  // THE BOUNDARY: everything in the payload must be platform content, and nothing excluded may be
  // present. A release that contains `deployment/**`, CI or generated output is not a Foundation release.
  try {
    for (const file of listPayloadFiles(payload)) {
      if (!isReleasePayloadPath(file)) continue;
      const decision = classifyReleasePath(file);
      if (decision.inclusion !== RELEASE_INCLUSION.PLATFORM) {
        problems.push(
          `${file} is present in the payload but the release content policy calls it ` +
            `${decision.inclusion ?? "unclassified"} (${decision.reason})`,
        );
      }
    }
  } catch (error) {
    problems.push(/** @type {Error} */ (error).message);
  }

  // THE DIGEST: recomputed from the bytes on disk, never trusted from the manifest.
  try {
    const recomputed = digestReleaseDirectory(payload);
    digest = recomputed.digest;
    fileCount = recomputed.fileCount;
    if (digest !== manifest.content.digest) {
      problems.push(`the payload's content digest is ${digest}, but the manifest records ${manifest.content.digest}`);
    }
    if (fileCount !== manifest.content.fileCount) {
      problems.push(`the payload has ${fileCount} file(s), but the manifest records ${manifest.content.fileCount}`);
    }
  } catch (error) {
    problems.push(/** @type {Error} */ (error).message);
  }

  // THE AUTHORITIES: the manifest must agree with the payload it describes, not with its own author.
  try {
    const authorities = readReleaseAuthorities((file) => readFileSync(path.join(payload, ...file.split("/"))));
    if (manifest.requirements.node !== authorities.node) {
      problems.push(`requirements.node is ${manifest.requirements.node}, but the payload declares ${authorities.node}`);
    }
    if (manifest.requirements.pnpm !== authorities.pnpm) {
      problems.push(`requirements.pnpm is ${manifest.requirements.pnpm}, but the payload declares ${authorities.pnpm}`);
    }
    if (manifest.compatibility.pageDocumentSchema !== authorities.pageDocumentSchema) {
      problems.push(
        `compatibility.pageDocumentSchema is ${manifest.compatibility.pageDocumentSchema}, but the payload ` +
          `declares ${authorities.pageDocumentSchema}`,
      );
    }
    if (manifest.compatibility.deploymentLayouts.join(",") !== authorities.deploymentLayouts.join(",")) {
      problems.push(
        `compatibility.deploymentLayouts is ${manifest.compatibility.deploymentLayouts.join(",")}, but the ` +
          `payload declares ${authorities.deploymentLayouts.join(",")}`,
      );
    }
  } catch (error) {
    problems.push(/** @type {Error} */ (error).message);
  }

  // THE SOURCE: with the source repository available, prove the payload IS the plan for that commit.
  if (input.sourceRepository !== undefined && input.sourceRepository !== null && input.sourceRepository !== "") {
    try {
      const root = assertGitRepository(input.sourceRepository);
      const resolved = resolveSourceRevision(root, manifest.source.commit);
      if (resolved.tree !== manifest.source.tree) {
        problems.push(
          `the recorded source commit ${manifest.source.commit} has tree ${resolved.tree}, but the manifest ` +
            `records ${manifest.source.tree}`,
        );
      }
      const plan = planReleaseContent(root, manifest.source.commit);
      assertReleasePayloadImportsResolve({
        platformPaths: plan.platform,
        excludedPaths: plan.excluded,
        readText: (file) => readFileSync(path.join(payload, ...file.split("/")), "utf8"),
      });
      const expected = new Set(plan.platform);
      const actual = new Set(listPayloadFiles(payload).filter(isReleasePayloadPath));
      for (const file of [...expected].filter((entry) => !actual.has(entry)).sort(compareReleasePaths)) {
        problems.push(`${file} is platform content at ${manifest.source.commit} but is MISSING from the payload`);
      }
      for (const file of [...actual].filter((entry) => !expected.has(entry)).sort(compareReleasePaths)) {
        problems.push(`${file} is in the payload but is NOT platform content at ${manifest.source.commit}`);
      }
      if (input.expectTag === true) {
        const tagTarget = git(root, ["rev-parse", "--verify", `${manifest.release}^{commit}`]);
        if (tagTarget !== manifest.source.commit) {
          problems.push(
            `the release identity ${manifest.release} resolves to ${tagTarget} in ${root}, but the manifest ` +
              `records ${manifest.source.commit}`,
          );
        }
      }
    } catch (error) {
      problems.push(/** @type {Error} */ (error).message);
    }
  }

  return { ok: problems.length === 0, problems, digest, fileCount, manifest };
}
