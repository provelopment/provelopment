/**
 * THE BUILD-TIME RUNTIME ASSET CATALOG (FOUNDATION-MULTISITE-M16/M17 — DEFECT B)
 * =============================================================================
 *
 * THE DEFECT THIS CLOSES. Server-side page composition asked whether each configured icon had a matching
 * file by calling `existsSync`/`statSync`/`openSync`/`readSync` under `public/assets/**`. Locally that
 * tree exists, so every gate passed. In a Vercel serverless function it does NOT: `public/` is static
 * deployment output served by the CDN, and the function bundle carries only what the file tracer could
 * see. The check therefore answered "missing" for artwork the deployment was serving perfectly well, and
 * `/ww/en`, `/ww/en/about`, `/de/de/berlin` failed loudly (500) while `/sitemap.xml`, `/robots.txt` and
 * the generated metadata route kept working — the exact production exception this milestone captured.
 *
 * THE INVARIANT NOW: request-time page rendering must NOT require the generated public tree to exist in
 * the server-function filesystem. Asset ownership and intrinsic sizes are BUILD knowledge — the build
 * already generates every namespace — so they are published once, as immutable data, and the runtime reads
 * that data. No `public/**` file needs duplicating into a function merely so the renderer can ask whether
 * it exists, and no request performs self-HTTP or any other network work to discover it.
 *
 * WHAT THIS MODULE IS
 *   · the ONE reader of the GENERATED catalog, which `scripts/sync-runtime-assets.mjs` derives from the
 *     SAME plan `assets:sync` installs and `assets:check` verifies — so "what is generated" and "what the
 *     runtime believes exists" cannot disagree by construction (no second inventory);
 *   · a pure data module: the catalog is a MODULE IMPORT, so it is bundled into every server function (a
 *     traced `public/**` file is not), and nothing here reads a filesystem;
 *   · addressable by the namespaces' ACCEPTED URL BASES (`/assets`, `/spokes/<segment>/assets`), which is
 *     the same spelling the mirror installs under, so no URL changes and no namespace renames.
 *
 * WHAT IT IS NOT
 *   · not a resolver: `RuntimeAssetOwnershipResolver` remains the ONE runtime abstraction. This module
 *     only supplies the immutable inventory a namespace carries (`withRuntimeAssetInventories`);
 *   · not a serving mechanism: the browser still fetches the real static file from `public/`;
 *   · not a client concern: the JSON is only ever imported by SERVER modules (the context builder and the
 *     compatibility seam). `deployment-root.ts` deliberately takes a TYPE-ONLY import from here so no
 *     client chunk is handed the catalog.
 */

import generated from "./generated/runtime-asset-catalog.json";
import type { RuntimeAssetNamespace } from "./deployment-root";

/** A size the build measured from the asset's OWN header (never from a path or a naming convention). */
export interface CatalogAssetSize {
  readonly width: number;
  readonly height: number;
}

/**
 * One namespace's immutable inventory: runtime basename → measured size, or `null` when the build could
 * not decode the container (the accepted fallback, preserved exactly: no size is invented, and the
 * presentation simply omits the intrinsic dimensions it would otherwise emit).
 *
 * The KEY'S PRESENCE is the entire existence answer. A namespace that carries no inventory at all is the
 * compatibility case (a synthetic fixture over a temporary directory) and falls back to the filesystem.
 */
export type RuntimeAssetInventory = Readonly<Record<string, CatalogAssetSize | null>>;

/** The catalog's shape version, as the build declared it. */
export const RUNTIME_ASSET_CATALOG_VERSION: number = generated.version;

/** The catalog, frozen once at module load: every namespace and every inventory is immutable. */
const CATALOG: Readonly<Record<string, RuntimeAssetInventory>> = Object.freeze(
  Object.fromEntries(
    Object.entries(generated.namespaces).map(([urlBase, files]) => [
      urlBase,
      Object.freeze({ ...files }) as RuntimeAssetInventory,
    ]),
  ),
);

/** The URL bases the build published, sorted — what the runtime can answer for. */
export function catalogNamespaces(): readonly string[] {
  return Object.keys(CATALOG).sort();
}

/** The immutable inventory of one namespace URL base, or `undefined` when the build published none. */
export function catalogInventoryFor(urlBase: string): RuntimeAssetInventory | undefined {
  return CATALOG[urlBase];
}

/**
 * The SAME namespaces, each carrying the inventory this build published for its URL base.
 *
 * This is the ONE binding step between generated build knowledge and the runtime namespace authority: the
 * namespace keeps its directory (still meaningful — it is where the file physically lives for a
 * filesystem-backed consumer) and gains the immutable answer to "does this namespace hold this basename,
 * and how large is it". A namespace with no published inventory is returned UNCHANGED, so nothing that
 * works today can break: the resolver's compatibility read remains for exactly those cases.
 *
 * ORDER IS PRESERVED (platform first, then the declared Spokes), so a Spoke still cannot shadow platform
 * artwork, and a namespace a context does not declare is still absent from its list.
 */
export function withRuntimeAssetInventories(
  namespaces: readonly RuntimeAssetNamespace[],
): readonly RuntimeAssetNamespace[] {
  return namespaces.map((namespace) => {
    const inventory = catalogInventoryFor(namespace.urlBase);
    return inventory === undefined ? namespace : { ...namespace, inventory };
  });
}
