/**
 * THE ONE PLACE ESTABLISHMENT MAY WRITE (FOUNDATION-B4B)
 * =====================================================
 *
 * The write boundary, as code. Establishment receives an explicit target root and may write ONLY beneath it:
 * the port's contract carries root-relative paths, and this implementation is the guard that resolves each
 * one inside the root it was constructed for. It cannot reach the source installation, another installation,
 * a fixture, the Provelopment root, a user's home, global configuration or anything on a network — not by
 * accident and not by a malformed content path.
 *
 * THE RULES, ALL FAIL-CLOSED:
 *
 *   INSPECT — the target must be an absolute path; it must not be a filesystem root; if it exists it must be
 *   a directory that is not itself a link; it must not be, contain or live inside any root establishment is
 *   READING (the release payload, the authored seed); and it must be EMPTY. An existing target is never
 *   overwritten and nothing is ever deleted to make room: a directory that is already an installation, or
 *   holds a previous incomplete establishment, or simply holds somebody's files, is refused with the reason
 *   named, and the operator decides what to do with it.
 *
 *   WRITE — every path must be a root-relative POSIX path with no empty, `.` or `..` segment and no drive
 *   letter; the resolved path must still be inside the root (belt and braces, because a symlinked parent
 *   could move it); a duplicate path in one write is refused; and each file is READ BACK and hashed after it
 *   is written, so "the installation was materialised" means the bytes on disk are the bytes that were
 *   supplied — a partial or altered write fails establishment instead of quietly producing a broken
 *   installation.
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { FoundationContentFile, FoundationInstallationTarget } from "@/application/foundation-establishment-ports";
import { INSTALLATION_OPERATIONAL_STATE_FILE_NAME } from "@/core/foundation-installation/model";

import { sha256Hex } from "./node-content-files";

/** A root an establishment may write into, and the roots it is reading from. */
export interface NodeInstallationTargetOptions {
  /** The absolute target root — the installation's own directory. */
  readonly root: string;
  /** The capsule's relative path inside the root, asked of the platform's own authority. */
  readonly capsuleDirectory: string;
  /** Directories being READ (the release payload, the authored seed): the target must not overlap them. */
  readonly protectedRoots: readonly string[];
}

export class NodeInstallationTarget implements FoundationInstallationTarget {
  readonly description: string;

  private readonly root: string;
  private readonly capsuleDirectory: string;
  private readonly protectedRoots: readonly string[];

  constructor(options: NodeInstallationTargetOptions) {
    this.root = path.resolve(options.root);
    this.capsuleDirectory = options.capsuleDirectory;
    this.protectedRoots = options.protectedRoots.map((entry) => path.resolve(entry));
    this.description = this.root;
  }

  /** Why this target may not be established into. Empty means safe. */
  async inspect(): Promise<readonly string[]> {
    const refusals: string[] = [];

    if (!path.isAbsolute(this.root) || path.resolve(this.root) !== path.normalize(this.root)) {
      refusals.push(`"${this.root}" is not a normalized absolute path`);
    }
    if (path.parse(this.root).root === this.root) {
      refusals.push(
        `"${this.root}" is a filesystem root: an installation is established inside a directory of its own, ` +
          "never at the root of a filesystem",
      );
    }

    for (const protectedRoot of this.protectedRoots) {
      const relation = relationOf(this.root, protectedRoot);
      if (relation !== "unrelated") {
        refusals.push(
          `"${this.root}" ${relation === "same" ? "is the same directory as" : relation === "inside" ? "is inside" : "contains"} ` +
            `the source establishment is reading (${protectedRoot}): a target must not overlap the release ` +
            "payload or the authored seed",
        );
      }
    }

    if (existsSync(this.root)) {
      if (lstatSync(this.root).isSymbolicLink()) {
        refusals.push(
          `"${this.root}" is a symbolic link: establishment writes to the location it was given and never ` +
            "through a link to somewhere else",
        );
      }
      if (!statSync(this.root).isDirectory()) {
        refusals.push(`"${this.root}" exists and is not a directory`);
      } else {
        let entries: string[] = [];
        try {
          entries = readdirSync(this.root);
        } catch (error) {
          refusals.push(
            `"${this.root}" cannot be read (${error instanceof Error ? error.message : String(error)}), so ` +
              "establishment cannot know whether it is empty: an unreadable target is refused rather than assumed safe",
          );
        }
        if (entries.length > 0) {
          const record = path.join(this.root, ...this.capsuleDirectory.split("/"), INSTALLATION_OPERATIONAL_STATE_FILE_NAME);
          refusals.push(
            existsSync(record)
              ? `"${this.root}" already holds an established Foundation installation (it has ` +
                  `${this.capsuleDirectory}/${INSTALLATION_OPERATIONAL_STATE_FILE_NAME}). Establishment never ` +
                  "re-establishes, repairs or upgrades an installation; adopting a newer release is a " +
                  "separate, deliberate act."
              : `"${this.root}" is not empty (${entries.length} entr${entries.length === 1 ? "y" : "ies"}), and ` +
                  "establishment never overwrites or deletes existing content. Use an empty directory, or " +
                  "clear this one yourself if it holds a previous, failed attempt.",
          );
        }
      }
    }

    return refusals;
  }

  /**
   * Materialise content into the target root.
   *
   * Every path is resolved by the guard below, and every file is read back and hashed: a write that did not
   * land exactly as supplied FAILS here rather than producing an installation that only looks materialised.
   */
  async write(files: readonly FoundationContentFile[]): Promise<void> {
    mkdirSync(this.root, { recursive: true });

    const written = new Set<string>();
    for (const file of files) {
      if (written.has(file.path)) {
        throw new Error(
          `FOUNDATION-B4B: "${file.path}" was supplied twice in one materialisation. Two files cannot become ` +
            "one installation path.",
        );
      }
      written.add(file.path);

      const absolute = this.absolutePathFor(file.path);
      mkdirSync(path.dirname(absolute), { recursive: true });
      writeFileSync(absolute, file.bytes);

      const onDisk = readFileSync(absolute);
      if (sha256Hex(onDisk) !== sha256Hex(file.bytes)) {
        throw new Error(
          `FOUNDATION-B4B: ${file.path} did not survive being written into the installation (the bytes on ` +
            "disk are not the bytes supplied), so the installation is not materialised faithfully.",
        );
      }
    }
  }

  /** The absolute path of a root-relative content path, or a refusal naming the rule it broke. */
  private absolutePathFor(relative: string): string {
    const segments = relative.split("/");
    const malformed =
      relative === "" ||
      path.isAbsolute(relative) ||
      /^[A-Za-z]:/.test(relative) ||
      segments.some((segment) => segment === "" || segment === "." || segment === "..");
    if (malformed) {
      throw new Error(
        `FOUNDATION-B4B: "${relative}" is not a root-relative content path. Establishment addresses content ` +
          "relative to the target root only, never absolutely and never upwards.",
      );
    }

    const absolute = path.resolve(this.root, ...segments);
    const inside = path.relative(this.root, absolute);
    if (inside === "" || inside.startsWith("..") || path.isAbsolute(inside)) {
      throw new Error(
        `FOUNDATION-B4B: "${relative}" resolves to ${absolute}, which is outside the target root ` +
          `(${this.root}). Establishment writes beneath the target root and nowhere else.`,
      );
    }
    return absolute;
  }
}

/** How one directory relates to another, for the overlap rules. */
function relationOf(root: string, other: string): "same" | "inside" | "contains" | "unrelated" {
  if (root === other) return "same";
  const into = path.relative(root, other);
  if (into !== "" && !into.startsWith("..") && !path.isAbsolute(into)) return "contains";
  const outOf = path.relative(other, root);
  if (outOf !== "" && !outOf.startsWith("..") && !path.isAbsolute(outOf)) return "inside";
  return "unrelated";
}
