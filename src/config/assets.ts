import { deploymentPaths, type RuntimeAssetNamespace } from "./deployment-root";
import {
  createRuntimeAssetOwnershipResolver,
  owningNamespaceIn,
  type ImageDimensions,
} from "./runtime-asset-resolver";

/**
 * P6-1 — configured icon-asset availability (framework layer); S3F2A2-R4 — THE PRODUCTION CUTOVER
 * ==============================================================================================
 *
 * This module is still the ONE public seam through which the application asks asset questions, and every
 * answer it gives is now produced by the ONE proved runtime-asset resolver:
 *
 *   deploymentPaths().runtimeAssetNamespaces  →  compatibilityResolver  →  this public API
 *
 * What used to live here — a module-level `runtimeNamespaces`/`platformNamespace` pair, a process-wide
 * basename owner cache, a process-wide dimension cache, the `owningNamespace` filesystem search, the
 * `runtimeUrlFor` / `availableRoleAssetPath` projections and five image-header decoders — is GONE, because
 * all of it was a SECOND runtime-asset engine standing beside the proved one. The public names and
 * signatures are unchanged, so no caller migrates and the current build context behaves identically.
 *
 * The two guarantees this module has always backed are preserved exactly, and are now expressed through the
 * resolver's ownership:
 *
 *  1. LOUD BUILD FAILURE — `assertConfiguredIconAssetsExist` runs from the SERVER-ONLY layout (module load /
 *     build — see `[locale]/layout.tsx`), so a configured-but-missing icon fails the build by naming the
 *     exact leaf and the expected file (P5-5A: invalid configuration fails loudly). Deliberately-empty
 *     (`""`) and absent leaves are valid and skipped.
 *
 *  2. SAFE RUNTIME RENDER — `availableIconName` is applied at the framework composition boundary (layout,
 *     site-header, nav-links), so an icon that is unavailable at render time resolves to `""` (no icon) and
 *     the DOM can never contain a broken browser-image placeholder. Config components are never handed a
 *     name that is not backed by a real file.
 *
 * Layer note: this module lives in `src/config` (the framework layer) because the answers it delegates to
 * read the filesystem; `src/core` stays framework-agnostic and the UI primitives stay config-free
 * (architecture boundary tests). It must only be imported from SERVER modules: a CLIENT component (e.g.
 * `ContextNavLinks` imports siteConfig via `@/config`) must never pull filesystem access into a browser
 * chunk — the loud check therefore lives in the server layout, not the loader.
 */

/** The public dimension shape stays available from this module, re-exported from the resolver's ONE type. */
export type { ImageDimensions };

/**
 * THE ONE COMPATIBILITY RESOLVER FOR THE CURRENT BUILD CONTEXT.
 *
 * Built from the SAME namespace authority the legacy engine used — the selected deployment's generated
 * runtime namespaces, in resolution order (platform first, then the declared Spoke's own) — and it is
 * deliberately the only stateful thing in this module: the owner cache and the dimension cache live INSIDE
 * this instance.
 *
 * `SpokeRuntimeContext` is deliberately NOT wired here yet: the application is still the accepted one-Spoke
 * build runtime, so binding a per-request context belongs to the server-render conversion that follows the
 * dictionary work. This cutover changes the IMPLEMENTATION, never the context.
 */
const compatibilityResolver = createRuntimeAssetOwnershipResolver(
  deploymentPaths().runtimeAssetNamespaces,
);

/**
 * The namespace that HOLDS `name`, or `null`, asked of an EXPLICIT namespace list and answered by the
 * resolver module's own pure rule — the very rule the compatibility resolver applies internally, so the
 * parameterised answer and the context answer can never disagree.
 *
 * The caller's own namespace OBJECTS come back unwrapped (identity preserved): a caller asking "which of MY
 * namespaces holds this" must get that namespace itself, not a copy of it.
 */
export function namespaceOwning(
  name: string,
  namespaces: readonly RuntimeAssetNamespace[],
): RuntimeAssetNamespace | null {
  return owningNamespaceIn(name, namespaces);
}

/** True when `<name>` exists as a real file in a namespace this deployment declares. */
export function iconAssetAvailable(name: string | undefined): boolean {
  return compatibilityResolver.iconAssetAvailable(name);
}

/**
 * The ABSOLUTE path of the generated runtime file `<name>`, or `undefined` when no declared namespace holds
 * it — the companion of `availableIconUrl` for a consumer that needs the file itself (to read its header, to
 * assert it ships), and the ONE answer to "which namespace owns this basename".
 */
export function runtimeAssetPath(name: string | undefined): string | undefined {
  return compatibilityResolver.runtimeAssetPath(name);
}

/**
 * The icon filename to render: the name when it is backed by a real asset in a declared namespace; `""` when
 * a CONFIGURED name has no backing file (safely: no icon, never a broken image — the P5-5
 * deliberate-absence value); `undefined`/`""` pass through so the P5-5A contract is preserved verbatim
 * (missing → the caller's shipped-asset fallback applies; `""` → deliberately no icon).
 */
export function availableIconName(name: string | undefined): string | undefined {
  return compatibilityResolver.availableIconName(name);
}

/**
 * S3F1 — the same-origin URL a configured icon FILENAME resolves to: the declared namespace that actually
 * holds it, or `""` when none does (the P5-5 deliberate-absence value, so a configured-but-unavailable icon
 * renders no element rather than a broken image).
 *
 * The answer is not always `/assets/<name>`: in an explicit Installation a Spoke's own artwork is served
 * from that Spoke's namespace, and a hardcoded prefix would point at a platform path that does not hold it.
 * `undefined`/`""` pass through verbatim, exactly as the filename projection does.
 */
export function availableIconUrl(name: string | undefined): string | undefined {
  return compatibilityResolver.availableIconUrl(name);
}

/**
 * S3F1 — the runtime URL of ONE icon CONTROL leaf, with the SHIPPED DEFAULT resolved the same way.
 *
 * The P5-5 three-state contract is preserved exactly: `""` stays a deliberate absence (no icon), an absent
 * leaf falls back to the shipped default ROLE, and any named leaf resolves to the namespace that holds it.
 * Resolving the default at this boundary is what keeps a shipped role icon (the sidebar disclosure assets)
 * served from the Spoke's own namespace in an explicit Installation instead of from a platform path that no
 * longer holds it.
 */
export function resolveIconControlUrl(configured: string | undefined, shippedDefault: string): string {
  return compatibilityResolver.resolveIconControlUrl(configured, shippedDefault);
}

/**
 * P6-2D — resolves a `site.assets.*` value (an FS-4 ABSOLUTE URL, validated against `site.url`) to a path
 * that always fetches from the CURRENT origin when rendered as a real `<img src>`.
 *
 * Why this exists: `site.url` is the site's own canonical origin (used for `<link rel="canonical">`/JSON-LD/
 * OpenGraph, where an absolute URL is correct even if it differs from the browser's current origin). A
 * rendered `<img>` has no such indirection — the browser fetches literally whatever `src` says, so an
 * absolute asset URL whose host is a placeholder/mismatched domain would 404. Every `site.assets.*` value
 * resolves to a same-origin served path in every shipped deployment, so re-deriving the path portion is
 * always correct and removes the coupling between `site.url` accuracy and real rendered images.
 */
export function assetPathFromUrl(absoluteUrl: string | undefined): string | undefined {
  return compatibilityResolver.assetPathFromUrl(absoluteUrl);
}

/**
 * S3F1 — the same-origin URL a configured asset ROLE resolves to, WITHOUT requiring the file to be mirrored:
 * the owning namespace's URL when the basename IS installed by the runtime mirror (which installs by
 * basename, so that is the one place generated artwork actually lives), and the configured pathname verbatim
 * otherwise.
 *
 * The fallback matters: an adopter may serve artwork from the served directory directly (outside the mirror
 * plan), and such a value must keep working exactly as `assetPathFromUrl` resolved it before. A legacy
 * Installation therefore sees no change at all — its platform namespace URL base IS `/assets`, which is the
 * path its configured role URLs already name.
 */
export function runtimeAssetUrl(absoluteUrl: string | undefined): string | undefined {
  return compatibilityResolver.runtimeAssetUrl(absoluteUrl);
}

/**
 * P6-3B — resolves a configured `site.assets.banners[<page>]` value (an FS-4 ABSOLUTE URL) to a same-origin
 * path ONLY when a declared namespace holds a matching file; otherwise `undefined` (the page renders NO
 * banner — no placeholder, no reserved space, never another page's banner).
 */
export function availableBannerPath(absoluteUrl: string | undefined): string | undefined {
  return compatibilityResolver.availableBannerPath(absoluteUrl);
}

/**
 * P12-BG — resolves a configured `site.assets.backgrounds[<role>]` value under the same availability rule as
 * the banner, so a CONFIGURED-but-missing background is `undefined` — which is exactly what drives the
 * documented `background-<page>` → `background-all` → none fallback in the layout (that fallback belongs to
 * the layout: this module answers availability only).
 */
export function availableBackgroundPath(absoluteUrl: string | undefined): string | undefined {
  return compatibilityResolver.availableBackgroundPath(absoluteUrl);
}

/**
 * P12-BG — builds the page-role → same-origin-path map the decorative background layer consumes from the
 * configured `site.assets.backgrounds` record. Entries whose file is missing are DROPPED entirely, so a
 * CONFIGURED-but-missing background is indistinguishable from an ABSENT one.
 */
export function availableBackgroundMap(
  configured: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  return compatibilityResolver.availableBackgroundMap(configured);
}

/**
 * P12-FG — resolves a configured `site.assets.footerGraphic` value (an FS-4 ABSOLUTE URL) to a same-origin
 * path ONLY when a declared namespace holds a matching file; otherwise `undefined`. Same availability rule as
 * the banner and background roles, so a CONFIGURED-but-missing footer graphic is indistinguishable from an
 * ABSENT one — the footer renders no decorative layer (never a placeholder, never a broken image).
 */
export function availableFooterGraphicPath(absoluteUrl: string | undefined): string | undefined {
  return compatibilityResolver.availableFooterGraphicPath(absoluteUrl);
}

/**
 * P12-HG — resolves a configured `site.assets.headerGraphic` value under the same availability rule as the
 * banner, background and footer-graphic roles, so a CONFIGURED-but-missing header graphic is
 * indistinguishable from an ABSENT one — the header paints no decorative band (never a placeholder, never a
 * broken image).
 */
export function availableHeaderGraphicPath(absoluteUrl: string | undefined): string | undefined {
  return compatibilityResolver.availableHeaderGraphicPath(absoluteUrl);
}

/**
 * P12-SG — resolves a configured `site.assets.statusGraphic` value under the same availability rule as the
 * four roles above, so a CONFIGURED-but-missing status graphic is indistinguishable from an ABSENT one — the
 * status surfaces render no decorative graphic (never a placeholder, never a broken image).
 */
export function availableStatusGraphicPath(absoluteUrl: string | undefined): string | undefined {
  return compatibilityResolver.availableStatusGraphicPath(absoluteUrl);
}

/**
 * P6-3C — the INTRINSIC pixel size of a configured graphic, when it can be read (server-only; cached per
 * asset filename INSIDE the resolver instance).
 *
 * The banner sizing contract is `displayWidth = min(availableWidth, 1.5 × naturalWidth)`. No CSS expression
 * can reference a replaced element's own intrinsic width, so the framework layer reads the asset's header
 * once at composition time and the renderer passes the derived cap down as an inline custom property (the
 * established token-only pattern — no component style rule). Supported containers: SVG, PNG, JPEG, GIF,
 * WebP.
 *
 * Returns `undefined` for anything undecodable, so the renderer falls back to a never-upscale presentation
 * rather than guessing a size.
 */
export function readImageDimensions(sameOriginPath: string | undefined): ImageDimensions | undefined {
  return compatibilityResolver.readImageDimensions(sameOriginPath);
}

interface IconLeafRef {
  readonly label: string;
  readonly value: string | undefined;
}

/** The icon-bearing part of the parsed configuration (structural projection). */
export interface IconConfigSource {
  readonly ui?: {
    readonly navigation?: {
      readonly sidebar?: {
        readonly open?: { readonly icon?: string };
        readonly close?: { readonly icon?: string };
      };
    };
    readonly cta?: { readonly icon?: string };
  };
  readonly navigation?: readonly {
    readonly icon?: string;
    readonly iconOpen?: string;
    readonly iconClosed?: string;
  }[];
}

/**
 * P6-1 — every icon leaf in the configuration that is a plain filename must be backed by a real file in a
 * declared runtime namespace. Missing files are loud build failures (P5-5A: invalid → loud configuration
 * failure), so an adopter who references a typo'd/absent asset can never ship a broken-image icon.
 *
 * Deliberate absence (`""`) on a control leaf remains valid (icon-only → text-only etc.), exactly as before —
 * only a NAME with no file fails. The availability question is asked of the ONE compatibility resolver, so
 * this build-time diagnostic and the runtime projection can never disagree about what exists.
 */
export function assertConfiguredIconAssetsExist(json: IconConfigSource): void {
  const leaves: IconLeafRef[] = [];
  const push = (label: string, value: string | undefined) => {
    if (value && value !== "") leaves.push({ label, value });
  };

  push("ui.navigation.sidebar.open.icon", json.ui?.navigation?.sidebar?.open?.icon);
  push("ui.navigation.sidebar.close.icon", json.ui?.navigation?.sidebar?.close?.icon);
  push("ui.cta.icon", json.ui?.cta?.icon);
  for (const [index, item] of (json.navigation ?? []).entries()) {
    push(`navigation[${index}].icon`, item.icon);
    push(`navigation[${index}].iconOpen`, item.iconOpen);
    push(`navigation[${index}].iconClosed`, item.iconClosed);
  }

  const missing = leaves.filter((leaf) => !compatibilityResolver.iconAssetAvailable(leaf.value));
  if (missing.length > 0) {
    const details = missing
      .map((leaf) => `  - ${leaf.label}: "${leaf.value}" not found under public/assets/`)
      .join("\n");
    throw new Error(
      `Invalid site configuration: configured icon leaf(s) have no matching asset file:\n${details}\n` +
        `Place the asset in public/assets/ (a plain filename) or use "" to deliberately omit the icon.`,
    );
  }
}
