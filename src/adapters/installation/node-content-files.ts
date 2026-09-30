/**
 * THE NODE MECHANISMS BEHIND A CONTENT SET (FOUNDATION-B4B)
 * =======================================================
 *
 * Reading a directory as a content set, hashing exact bytes, and computing a scoped content digest with the
 * platform's ONE encoding (`@/core/foundation-release/content-digest.mjs`). Establishment's adapters share
 * these three mechanisms; the encoding itself is a contract and lives in core, and no application or domain
 * module imports this file.
 *
 * WHY A SEPARATE FILE FROM THE RELEASE TOOLING'S DIGEST. `scripts/release/release-digest.mjs` applies the
 * same encoding to a RELEASE (excluding the manifest by name and owning construction's vocabulary). An
 * acquisition adapter must verify a payload it did not construct, and `src/**` may never import `scripts/**`,
 * so the mechanism is here and the release tooling keeps its own hashing call — a one-line use of
 * `node:crypto`, cross-checked on every construction because a divergence would immediately contradict the
 * digest recorded in a release manifest.
 *
 * SYMLINKS ARE REFUSED, NOT FOLLOWED. A content set is defined by its own bytes; a link's bytes live
 * somewhere else, so an accepted link would make an installation's identity depend on the machine that
 * materialised it. Directory order is irrelevant: the digest sorts byte-wise.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  compareContentPaths,
  contentDigestSubject,
} from "@/core/foundation-release/content-digest.mjs";
import type { FoundationContentFile } from "@/application/foundation-establishment-ports";

/** Lowercase hex SHA-256 of exact bytes. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * The scoped content digest of a content set: `sha256:` of the shared encoding, hashed over exact bytes.
 *
 * The scope is what makes the identity unambiguous — a release's content set, an installation's authored
 * input and an installation's materialised tree are different things and must never share a digest meaning.
 */
export function contentDigest(files: readonly FoundationContentFile[], scope: string): string {
  const entries = files.map((file) => ({ path: file.path, sha256: sha256Hex(file.bytes) }));
  return `sha256:${sha256Hex(new TextEncoder().encode(contentDigestSubject(entries, { scope })))}`;
}

/**
 * Every file beneath a directory, as root-relative POSIX paths and exact bytes, byte-wise path order.
 *
 * Throws rather than skips: a symlink, a path that is neither file nor directory, or a directory that cannot
 * be read is a content set this platform will not claim to have read faithfully.
 */
export function readContentFiles(root: string): FoundationContentFile[] {
  if (!statSync(root).isDirectory()) {
    throw new Error(`FOUNDATION-B4B: "${root}" is not a directory, so it has no content set to read.`);
  }

  const files: FoundationContentFile[] = [];
  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        throw new Error(
          `FOUNDATION-B4B: ${relative} is a symbolic link. A content set is defined by its own bytes; a ` +
            "link's bytes live outside it, so it is refused rather than followed.",
        );
      }
      if (entry.isDirectory()) {
        walk(absolute, relative);
        continue;
      }
      if (!entry.isFile() || !statSync(absolute).isFile()) {
        throw new Error(`FOUNDATION-B4B: ${relative} is neither a regular file nor a directory.`);
      }
      files.push({ path: relative, bytes: readFileSync(absolute) });
    }
  };

  walk(root, "");
  return files.sort((left, right) => compareContentPaths(left.path, right.path));
}
