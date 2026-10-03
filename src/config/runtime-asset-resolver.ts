import { existsSync } from "node:fs";
import path from "node:path";

import type { RuntimeAssetNamespace } from "./deployment-root";

/**
 * S3F2A2-R1 — RUNTIME ASSET NAMESPACE OWNERSHIP BOUND TO AN EXPLICIT CONTEXT
 * =========================================================================
 *
 * The accepted ownership rule, expressed ONCE as a value a caller can hold: a resolver is created from the
 * runtime namespaces ONE runtime context declares, in that context's authoritative order (the platform
 * namespace first, then that context's own Spoke namespace), and it answers two questions — which supplied
 * namespace HOLDS a basename, and what the absolute path of that generated file is.
 *
 * This module is ADDITIVE and UNWIRED (S3F2A2-R1): `./assets` still backs every production asset export
 * exactly as it does today, so no rendering behaviour changes here. It is proved independently first; the
 * later cutover slice points the production exports at it, keeping every public signature.
 *
 * Two rules are load-bearing, and both are proved in
 * `tests/unit/runtime-asset-ownership-resolver.test.ts`:
 *
 *  1. THE SUPPLIED NAMESPACES ARE THE WHOLE AUTHORITY. The resolver searches only the namespaces it was
 *     created with, in order, and never discovers namespaces from generated output: a namespace a context
 *     does not declare is INVISIBLE, however many such directories happen to exist on disk. That is what
 *     stops one Spoke's artwork from being served merely because a build once wrote it.
 *  2. THE CACHES BELONG TO THE RESOLVER INSTANCE. Two contexts may both own the same basename (two Spokes
 *     each shipping `logo-header.svg`), so a basename answer may never be shared process-wide: each
 *     resolver owns its own owner cache, and interleaved A/B/A/B lookups stay stable.
 */
export interface RuntimeAssetOwnershipResolver {
  /** The immutable namespace snapshot, in authoritative resolution order. */
  readonly namespaces: readonly RuntimeAssetNamespace[];

  /** The supplied namespace that HOLDS `name`, or `null`; the platform namespace wins by order alone. */
  namespaceOwning(name: string): RuntimeAssetNamespace | null;

  /** The absolute path of `name` in the namespace that holds it, or `undefined` when none does. */
  runtimeAssetPath(name: string | undefined): string | undefined;
}

/**
 * The accepted ownership rule, as a pure function of an EXPLICIT namespace list: no cache, no process state.
 *
 * Deliberately the same rule as the established primitive in `./assets` (first declaration that holds the
 * basename, in the supplied order, `null` otherwise). Implemented here rather than imported from the live
 * asset module so the eventual cutover never has to import its own dependency: the resolver suite compares
 * the two directly on the same namespace list, so no divergence can creep in.
 */
function owningNamespaceIn(
  name: string,
  namespaces: readonly RuntimeAssetNamespace[],
): RuntimeAssetNamespace | null {
  if (!name || name === "") return null;
  return namespaces.find((namespace) => existsSync(path.join(namespace.directory, name))) ?? null;
}

/**
 * A resolver for ONE runtime context, built from that context's declared namespaces.
 *
 * The supplied list is SNAPSHOT (copied and frozen at construction), so a caller that later mutates its own
 * array cannot change this resolver's answers — resolution order is fixed for the resolver's lifetime, and
 * it is the only selection state that exists. There is no ambient "which Spoke am I" anywhere: a context is
 * an argument, never state.
 */
export function createRuntimeAssetOwnershipResolver(
  namespaces: readonly RuntimeAssetNamespace[],
): RuntimeAssetOwnershipResolver {
  const snapshot: readonly RuntimeAssetNamespace[] = Object.freeze(
    namespaces.map((namespace) =>
      Object.freeze({ directory: namespace.directory, urlBase: namespace.urlBase }),
    ),
  );

  /** Instance-local: a basename answer belongs to THIS context, never to the process. */
  const ownerCache = new Map<string, RuntimeAssetNamespace | null>();

  const ownerOf = (name: string): RuntimeAssetNamespace | null => {
    if (!name || name === "") return null;
    const cached = ownerCache.get(name);
    if (cached !== undefined) return cached;
    const found = owningNamespaceIn(name, snapshot);
    ownerCache.set(name, found);
    return found;
  };

  return Object.freeze({
    namespaces: snapshot,
    namespaceOwning: (name: string): RuntimeAssetNamespace | null => ownerOf(name),
    runtimeAssetPath: (name: string | undefined): string | undefined => {
      if (!name || name === "") return undefined;
      const found = ownerOf(name);
      return found === null ? undefined : path.join(found.directory, name);
    },
  });
}
