import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * THE PROTECTED PRODUCTION SURFACES OF A DEPLOYMENT, AS BYTES (FOUNDATION-DEPLOYMENT-ISO-B3C2B)
 * =============================================================================================
 *
 * A deployment's AUTHORED state — the configuration, the dictionaries, the pages an owner writes and the
 * artwork an owner replaces — is the one thing executable repository code must never use as disposable
 * fixture space. This module is the mechanical way to SAY that without snapshotting any hash into a test
 * source file: capture a manifest before a scope of work, capture it again afterwards, and compare.
 *
 * It is deliberately small and pure — walk, hash, diff — because the point is a runtime BEFORE/AFTER
 * proof, not a policy engine:
 *
 *   · `tests/setup/production-state-integrity.ts` brackets each Vitest project with it, so a test run
 *     that leaves a mutation behind FAILS instead of quietly damaging the deployment it was describing;
 *   · the generator and copy contracts assert the same thing against SYNTHETIC trees, where a write is
 *     expected and its exact extent can be proved (`tests/unit/country-code-generator-deployment-root`).
 *
 * The generated `content/COUNTRY-CODES.md` is included: it is deployment-owned documentation, and the
 * gate is expected to prove it unchanged by RUNNING `country-codes:check` (which never writes) rather
 * than by regenerating it.
 */

/** The deployment-owned surfaces that no test may mutate. Deployment-relative, in POSIX spelling. */
export const PROTECTED_PRODUCTION_SURFACES = [
  "site.config.json",
  "config",
  "content/pages",
  "content/assets",
  "content/COUNTRY-CODES.md",
  // S3F1 — an EXPLICIT Installation authors its website material under `spokes/**` and declares its
  // Spokes in `spokes.json`, so the proof covers that form too: the legacy locations above are simply
  // absent there, and these two contribute nothing for a legacy Installation.
  "spokes.json",
  "spokes",
] as const;

/** A relative POSIX path mapped to the SHA-256 of its bytes. */
export type ProductionStateManifest = ReadonlyMap<string, string>;

/** Every FILE beneath `directory`, as deployment-relative POSIX paths (directories are not entries). */
function filesUnder(root: string, relative: string): string[] {
  const absolute = path.join(root, ...relative.split("/"));
  if (!existsSync(absolute)) return [];
  if (!statSync(absolute).isDirectory()) return [relative];
  const found: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    found.push(...filesUnder(root, `${relative}/${entry.name}`));
  }
  return found;
}

/**
 * Captures the protected surfaces of a deployment as `path → sha256`.
 *
 * An absent surface simply contributes nothing, so this works for a partial tree (a synthetic fixture)
 * exactly as it does for a full capsule, and it never throws for a missing deployment.
 */
export function captureProductionStateManifest(
  deploymentRoot: string,
  surfaces: readonly string[] = PROTECTED_PRODUCTION_SURFACES,
): ProductionStateManifest {
  const manifest = new Map<string, string>();
  for (const surface of surfaces) {
    for (const relative of filesUnder(deploymentRoot, surface)) {
      const file = path.join(deploymentRoot, ...relative.split("/"));
      manifest.set(relative, createHash("sha256").update(readFileSync(file)).digest("hex"));
    }
  }
  return manifest;
}

/**
 * Every difference between two manifests, one entry per path, sorted.
 *
 * The spelling is deliberately blunt — `path (added|modified|removed)` — because these strings are
 * reported to whoever has to find the mutation.
 */
export function productionStateDrift(
  before: ProductionStateManifest,
  after: ProductionStateManifest,
): string[] {
  const drift: string[] = [];
  for (const [relative, hash] of before) {
    const now = after.get(relative);
    if (now === undefined) drift.push(`${relative} (removed)`);
    else if (now !== hash) drift.push(`${relative} (modified)`);
  }
  for (const relative of after.keys()) {
    if (!before.has(relative)) drift.push(`${relative} (added)`);
  }
  return drift.sort();
}
