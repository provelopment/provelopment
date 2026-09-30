/**
 * A FOUNDATION RELEASE OBTAINED AS A LOCAL DIRECTORY (FOUNDATION-B4B)
 * ==================================================================
 *
 * The MINIMUM acquisition mechanism, and the one B4B proves establishment with: a directory holding a
 * constructed release — the payload `pnpm release:build` writes, or an unpacked published release. It is
 * read-only, needs no network, records no connection and remembers nothing, which is exactly what determinism
 * requires. One immutable release is enough to establish an installation; discovering, subscribing to or
 * polling for releases is a different capability that does not have to exist for establishment to be correct,
 * and it is deliberately absent.
 *
 * ONE CLASS, TWO PORTS, ONE READ. FOUNDATION-B4A separated the two concerns for good reasons, and they stay
 * separate:
 *
 *   acquisition   `acquire(identity)` resolves and VERIFIES one release. A directory holding a different
 *                 release, or bytes that are not the content its manifest describes, FAILS. An acquisition
 *                 source never substitutes what it happens to have, never takes "the latest", and never
 *                 returns an unverified reference.
 *   payload       `files()` hands establishment the content it will materialise. The manifest is a release's
 *                 own description rather than part of its content, so it is not reported as a payload file —
 *                 the installation's own records of what it contains are the adoption record and the
 *                 operational record establishment writes.
 *
 * The canonical repository stays the platform's public source of official releases; this adapter exists so
 * that a Foundation installation NEVER NEEDS it, and a future GitHub, archive or mirror adapter can be added
 * without changing establishment's semantics (it would satisfy the same two ports).
 */
import path from "node:path";

import type {
  FoundationContentFile,
  FoundationReleasePayloadSource,
} from "@/application/foundation-establishment-ports";
import type {
  AcquiredFoundationRelease,
  FoundationReleaseAcquisitionSource,
} from "@/application/foundation-installation-ports";
import {
  RELEASE_DIGEST_SCOPE_ID,
  RELEASE_PAYLOAD_FORMAT,
} from "@/core/foundation-release/content-digest.mjs";
import {
  parseReleaseManifest,
  RELEASE_CONTENT_POLICY_ID,
  RELEASE_MANIFEST_FILE_NAME,
} from "@/core/foundation-release/manifest.mjs";
import {
  foundationReleaseReferenceIssues,
  type FoundationReleaseReference,
} from "@/core/foundation-release/reference";

import { contentDigest, readContentFiles } from "./node-content-files";

/** The directory holding a constructed release. */
export interface LocalReleaseSourceOptions {
  /** The absolute (or resolvable) directory holding a constructed release. */
  readonly payloadDirectory: string;
}

export class LocalReleaseSource
  implements FoundationReleaseAcquisitionSource, FoundationReleasePayloadSource
{
  readonly description: string;

  private readonly payloadDirectory: string;

  constructor(options: LocalReleaseSourceOptions) {
    this.payloadDirectory = path.resolve(options.payloadDirectory);
    this.description = `a local release directory (${this.payloadDirectory})`;
  }

  /** Read the directory once: its payload files and its validated manifest. Links are refused. */
  private read(): { files: FoundationContentFile[]; manifest: ReturnType<typeof parseReleaseManifest> } {
    const content = readContentFiles(this.payloadDirectory);
    const manifestFile = content.find((file) => file.path === RELEASE_MANIFEST_FILE_NAME);
    if (manifestFile === undefined) {
      throw new Error(
        `FOUNDATION-B4B: ${this.description} has no ${RELEASE_MANIFEST_FILE_NAME}, so it is not a constructed ` +
          "Foundation release. A release is verified from its own manifest, never assumed from a directory name.",
      );
    }
    return {
      files: content.filter((file) => file.path !== RELEASE_MANIFEST_FILE_NAME),
      manifest: parseReleaseManifest(new TextDecoder().decode(manifestFile.bytes)),
    };
  }

  /**
   * Resolve and verify ONE immutable release from this directory.
   *
   * FAILS CLOSED twice over: the directory must hold the release that was ASKED FOR, and its bytes must be
   * exactly the content its manifest describes — recomputed here with the platform's one content encoding.
   */
  async acquire(identity: string): Promise<AcquiredFoundationRelease> {
    const { files, manifest } = this.read();
    if (manifest.release !== identity) {
      throw new Error(
        `FOUNDATION-B4B: ${this.description} holds ${manifest.release}, not the requested ${identity}. An ` +
          "acquisition source never substitutes a different release.",
      );
    }

    const digest = contentDigest(
      files,
      `${RELEASE_DIGEST_SCOPE_ID} ${RELEASE_CONTENT_POLICY_ID} manifest-format:${RELEASE_PAYLOAD_FORMAT}`,
    );
    if (files.length !== manifest.content.fileCount || digest !== manifest.content.digest) {
      throw new Error(
        `FOUNDATION-B4B: ${this.description} does not hold the content ${manifest.release} describes: it ` +
          `carries ${files.length} file(s) with digest ${digest}, while its manifest records ` +
          `${manifest.content.fileCount} file(s) with digest ${manifest.content.digest}.`,
      );
    }

    const reference: FoundationReleaseReference = {
      tag: manifest.release,
      repository: manifest.source.repository,
      commit: manifest.source.commit,
      tree: manifest.source.tree,
      manifestFormat: manifest.format,
      content: {
        policy: manifest.content.policy,
        digest: manifest.content.digest,
        fileCount: manifest.content.fileCount,
      },
    };
    const issues = foundationReleaseReferenceIssues(reference);
    if (issues.length > 0) {
      throw new Error(
        `FOUNDATION-B4B: ${this.description} describes a release the platform cannot use:\n` +
          issues.map((issue) => `  - ${issue}`).join("\n"),
      );
    }

    return { release: reference, acquiredFrom: this.description };
  }

  /** The release's content set, exactly as it will be materialised. */
  async files(): Promise<readonly FoundationContentFile[]> {
    return this.read().files;
  }
}
