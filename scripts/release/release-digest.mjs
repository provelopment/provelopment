#!/usr/bin/env node
/**
 * THE NORMALIZED RELEASE CONTENT DIGEST (FOUNDATION-R1B)
 * ======================================================
 *
 * ONE deterministic answer to "is this exactly the content set that release identity names?".
 *
 * WHAT IS DIGESTED
 * ----------------
 * The PAYLOAD: every file of the release content set, EXCLUDING the manifest itself
 * (`foundation-release.json`) and any future archive/checksum sidecar. That exclusion is what makes
 * the manifest non-self-referential: the manifest may record the digest of the content it describes
 * without the digest depending on the file that carries it.
 *
 * HOW IT IS COMPUTED (and why this encoding)
 * ------------------------------------------
 *   header    "release-content-v1 <policyId> manifest-format:<n>\n"
 *   record    "<path>\0<sha256 of the file's exact bytes>\n"   — one per payload file
 *   order     paths sorted BYTE-WISE (locale-independent), so enumeration order can never matter
 *
 * The digest therefore depends only on the paths and the file bytes. It cannot be affected by
 * filesystem enumeration order, mtimes, archive metadata, the local line-ending configuration or
 * ignored working-tree state — the construction never reads a working tree at all
 * (`release-construction.mjs` reads Git objects).
 *
 * DELIMITERS ARE DELIBERATE: NUL cannot appear in a path, and `assertReleasePathIsEncodable` refuses
 * a path containing a newline, so a record boundary can never be ambiguous.
 *
 * NO MODE METADATA: every tracked path in this platform is mode 100644 (measured: 440/440) — no
 * symlinks, no executables — so file mode carries no meaning here and is deliberately NOT invented
 * into the digest. Construction refuses a source revision containing any other mode instead.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  compareContentPaths,
  contentDigestSubject,
  RELEASE_DIGEST_SCOPE_ID,
  RELEASE_PAYLOAD_FORMAT,
} from "../../src/core/foundation-release/content-digest.mjs";
import { RELEASE_MANIFEST_FILE_NAME } from "../../src/core/foundation-release/manifest.mjs";
import { RELEASE_CONTENT_POLICY_ID } from "./release-content-policy.mjs";

// THE ENCODING IS THE CONTRACT'S (FOUNDATION-B4B). The scope line, the record format and the byte-wise
// path order live in `src/core/foundation-release/content-digest.mjs`, because a Foundation installation
// digests content too (the authored input it was established from, and the materialised tree that became
// live) and `src/**` must never import `scripts/**`. This module remains the tooling's surface: it
// re-exports the shared vocabulary and owns the RELEASE-specific application of it — the payload
// exclusions, the hashing, and the payload walk.

/** The manifest's fixed name inside a constructed release. Excluded from the digest, always. */
export const RELEASE_MANIFEST_FILE = RELEASE_MANIFEST_FILE_NAME;

export { RELEASE_DIGEST_SCOPE_ID, RELEASE_PAYLOAD_FORMAT };

/**
 * The SHA-256 of exact bytes, lowercase hex.
 *
 * @param {Buffer|string} bytes the bytes to hash
 * @returns {string} the hex digest
 */
export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * True when a payload-relative path is part of the digested content set.
 *
 * The manifest describes the payload, so it is not part of it; a checksum sidecar (if one is ever
 * published beside an archive) is likewise not payload.
 *
 * @param {string} file a payload-relative path
 * @returns {boolean} whether the file belongs to the digested content set
 */
export function isReleasePayloadPath(file) {
  return file !== RELEASE_MANIFEST_FILE && !file.endsWith(".sha256");
}

/**
 * Byte-wise path order (never locale order). Two paths are compared by their UTF-8 bytes, which is
 * what makes the digest identical on every machine.
 *
 * @param {string} a one path
 * @param {string} b another path
 * @returns {number} negative, zero or positive
 */
export function compareReleasePaths(a, b) {
  return compareContentPaths(a, b);
}

/**
 * Digest an explicit set of `{ path, sha256 }` entries.
 *
 * Kept separate from the filesystem walk so the digest can be proved independently of how the files
 * were obtained (constructed bytes, a directory walk, or a test's synthetic pairs).
 *
 * The RELEASE-specific rules live here — the manifest and a checksum sidecar are not payload, and a
 * duplicate or malformed entry is refused by name — while the encoding itself is the shared contract's
 * (`contentDigestSubject`), so a release digest and an installation digest can never disagree about how
 * a content set is described.
 *
 * @param {Iterable<{ path: string, sha256: string }>} entries the payload entries
 * @param {{ policyId?: string, format?: number }} [options] the scope identity recorded in the header
 * @returns {{ digest: string, fileCount: number }} the normalised digest and the payload's file count
 */
export function digestReleaseEntries(entries, options = {}) {
  const policyId = options.policyId ?? RELEASE_CONTENT_POLICY_ID;
  const format = options.format ?? RELEASE_PAYLOAD_FORMAT;
  /** @type {Map<string, string>} */ const unique = new Map();

  for (const entry of entries) {
    if (!isReleasePayloadPath(entry.path)) {
      throw new Error(
        `FOUNDATION-R1B: ${entry.path} is not part of the digested payload. The manifest describes the ` +
          "content set; it is never part of it.",
      );
    }
    if (unique.has(entry.path)) {
      throw new Error(`FOUNDATION-R1B: the path ${entry.path} was supplied more than once to the digest.`);
    }
    if (!/^[0-9a-f]{64}$/.test(entry.sha256)) {
      throw new Error(`FOUNDATION-R1B: ${entry.path} was supplied without a lowercase hex SHA-256.`);
    }
    unique.set(entry.path, entry.sha256);
  }

  const subject = contentDigestSubject(
    [...unique].map(([file, sha256]) => ({ path: file, sha256 })),
    { scope: `${RELEASE_DIGEST_SCOPE_ID} ${policyId} manifest-format:${format}` },
  );

  return { digest: `sha256:${sha256Hex(subject)}`, fileCount: unique.size };
}

/**
 * Every payload file beneath a directory, as payload-relative POSIX paths.
 *
 * A symlink is REFUSED rather than followed: a release is a content set, and a link would make its
 * bytes depend on something outside it.
 *
 * @param {string} root the directory to walk
 * @returns {string[]} the payload-relative paths, byte-wise sorted
 */
export function listPayloadFiles(root) {
  /** @type {string[]} */ const found = [];

  const walk = (directory, prefix) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(absolute, relative);
        continue;
      }
      if (entry.isSymbolicLink()) {
        throw new Error(
          `FOUNDATION-R1B: ${relative} is a symbolic link. A release is a content set; link rather than ` +
            "follow it, because a link's bytes live outside the release.",
        );
      }
      if (!entry.isFile()) {
        throw new Error(`FOUNDATION-R1B: ${relative} is neither a file nor a directory.`);
      }
      if (entry.isFile() && !statSync(absolute).isFile()) {
        throw new Error(`FOUNDATION-R1B: ${relative} is not a regular file.`);
      }
      found.push(relative);
    }
  };

  walk(root, "");
  return found.sort(compareReleasePaths);
}

/**
 * The payload's files with their hashes, and the normalised digest over them.
 *
 * @param {string} root the constructed release (or any payload directory)
 * @param {{ policyId?: string, format?: number }} [options] the scope identity recorded in the header
 * @returns {{ digest: string, fileCount: number, files: string[], entries: { path: string, sha256: string }[] }}
 */
export function digestReleaseDirectory(root, options = {}) {
  const files = listPayloadFiles(root).filter(isReleasePayloadPath);
  const entries = files.map((file) => ({
    path: file,
    sha256: sha256Hex(readFileSync(path.join(root, ...file.split("/")))),
  }));
  const { digest, fileCount } = digestReleaseEntries(entries, options);
  return { digest, fileCount, files, entries };
}
