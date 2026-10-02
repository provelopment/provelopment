/**
 * SPOKE IDENTITY (FOUNDATION-MULTISITE-S3C1)
 * ==========================================
 *
 * The PURE half of "an Installation declares which Spokes it owns": the reserved id of the legacy
 * compatibility Spoke, and the identity rules an authored Spoke collection must satisfy.
 *
 * WHERE A SPOKE IS AUTHORED IS NOT THIS MODULE'S BUSINESS
 * ------------------------------------------------------
 * This module knows an ID and nothing else. `spokes.json`, the `spokes/` directory, filesystem paths,
 * roots, `node:fs` and `process.cwd()` all belong to the configuration/build authority
 * (`src/config/**`), which is the layer that turns authored files into these ids. A `SpokeId` is an
 * opaque identity: it is never a path, never a hostname and never a public URL segment, and an
 * authored id is carried VERBATIM (no slugging, no case folding, no trimming of an ordinary id).
 *
 * THE RESERVED ID IS NOT AUTHORABLE
 * ---------------------------------
 * `IMPLICIT_SPOKE_ID` is the marker for "this Installation declares no Spoke collection": in legacy
 * mode the single Spoke IS the Installation root and carries this id. An explicit collection may
 * therefore NEVER declare it — otherwise an authored Spoke would be indistinguishable from the
 * compatibility marker. Exactly as `IMPLICIT_HUB_ID` does for Hub membership, the reserved id is
 * compared on the TRIMMED spelling, so padding it cannot launder a reserved word into an authored
 * identity. Case is NOT normalized: `IMPLICIT` is an ordinary id.
 *
 * Framework-neutral: pure data and pure functions. No filesystem, no configuration, no schema.
 */
import type { SpokeId } from "./model";

/**
 * The reserved Spoke id used when an Installation declares NO Spoke collection: its single Spoke is
 * the Installation root itself, and this is that Spoke's internal identity.
 *
 * It is deterministic, internal, non-public and non-filesystem, and it is specifically NOT authorable:
 * an explicit `spokes.json` entry may never declare it (`spokeCollectionIssues` reports it), so an
 * authored Spoke can never be confused with this compatibility marker.
 *
 * Its spelling has no public, filesystem or hostname meaning; it exists so the pure domain can name
 * the Spoke a legacy Installation already has.
 */
export const IMPLICIT_SPOKE_ID: SpokeId = "implicit";

/**
 * Every reason this authored Spoke-id list cannot be a coherent collection, in reading order — empty
 * when it is valid. Nothing throws here: a caller that must not proceed on a doubt asks for the issues
 * and decides for itself (the configuration layer reports them at build time).
 *
 * The rules are the IDENTITY ones, and only those:
 *
 *   - an explicit collection needs at least one Spoke (there is no such thing as an authored,
 *     empty collection; "no collection" is LEGACY mode, not explicit mode);
 *   - every id is non-blank;
 *   - no id is the reserved `IMPLICIT_SPOKE_ID` (compared on the trimmed spelling);
 *   - ids are unique, compared EXACTLY (so `IMPLICIT` and `one` vs `one ` are different ids).
 *
 * Where a Spoke's ROOT is, whether it exists and whether it holds a configuration are NOT identity
 * questions: they belong to the configuration layer that resolves roots, so this function never
 * touches a filesystem.
 */
export function spokeCollectionIssues(ids: readonly SpokeId[]): readonly string[] {
  const issues: string[] = [];

  if (ids.length === 0) {
    issues.push("an explicit Spoke collection needs at least one Spoke");
  }

  const declaredBy = new Map<SpokeId, number>();

  ids.forEach((id, index) => {
    const where = `Spoke #${index + 1}`;

    if (id.trim() === "") {
      issues.push(`${where} has a blank id`);
      return;
    }

    if (id.trim() === IMPLICIT_SPOKE_ID) {
      issues.push(
        `${where}: id "${IMPLICIT_SPOKE_ID}" is reserved for the legacy compatibility Spoke and ` +
          "cannot be declared explicitly",
      );
    }

    const previous = declaredBy.get(id);
    if (previous !== undefined) {
      issues.push(`${where} repeats id "${id}", already declared by Spoke #${previous}`);
      return;
    }

    declaredBy.set(id, index + 1);
  });

  return issues;
}
