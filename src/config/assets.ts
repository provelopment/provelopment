import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { deploymentPaths } from "./deployment-root";
import {
  SPOKE_RUNTIME_CONTAINER,
  spokeRuntimeAssetNamespacePath,
  spokeRuntimeAssetUrlBase,
} from "./spoke-runtime-segment.mjs";

/**
 * P6-1 — configured icon-asset availability (framework layer).
 *
 * The P5-5 icon contract is:
 *  - a plain asset filename (schema-validated, no traversal/URL) →
 *    `/assets/<name>` (rendered by the shared disclosure/nav-item icon paths);
 *  - `""` → a DELIBERATE absence (no icon element at all);
 *  - a name with no backing file → NEVER a broken-image `<img>`.
 *
 * This module is the one place that answers "does the asset actually exist?"
 * against `public/assets/` (the established adopter asset directory). It backs
 * two guarantees:
 *
 *  1. LOUD BUILD FAILURE — `assertConfiguredIconAssetsExist` runs from the
 *     SERVER-ONLY layout (module load / build — see `[locale]/layout.tsx`), so
 *     a configured-but-missing icon fails the build by naming the exact leaf
 *     and the expected file, matching the established "invalid configuration
 *     fails loudly" contract (P5-5A). Deliberately-empty (`""`) and absent
 *     leaves are valid and skipped.
 *
 *  2. SAFE RUNTIME RENDER — `availableIconName` is applied at the framework
 *     composition boundary (layout, site-header, nav-links), so an icon that
 *     is unavailable at render time resolves to `""` (no icon) and the DOM can
 *     never contain a broken browser-image placeholder. Config components are
 *     never handed a name that isn't backed by a real file.
 *
 * Layer note: this module lives in `src/config` (the framework layer) because
 * it touches the filesystem; `src/core` stays framework-agnostic and the UI
 * primitives stay config-free (architecture boundary tests). It must only be
 * imported from SERVER modules: a CLIENT component (e.g. `ContextNavLinks`
 * imports siteConfig via `@/config`) must never pull `node:fs` into a browser
 * chunk — the loud check therefore lives in the server layout, not the loader.
 */
// The paths below come from the ONE deployment-root authority. The generated runtime namespaces are the
// PLATFORM's static-file roots (Next.js serves from `public/` only) and therefore build output — not
// deployment locations: the deployment's own artwork sources live under `deploymentPaths().assetSourceRoot`
// and reach here through `pnpm assets:sync` (see the module note in `./deployment-root`).
/**
 * S3E1C — THE GENERATED RUNTIME NAMESPACES, IN RESOLUTION ORDER (platform first, then the sole Spoke's).
 *
 * A configured asset is a FILENAME or a ROLE URL; where it is actually SERVED depends on which namespace
 * the mirror installed it into. Legacy Installations have exactly one namespace, so every answer below is
 * exactly what it always was; an explicit Installation adds the Spoke's own namespace, so its replaceable
 * artwork is found (and served) there instead of from a platform path that no longer holds it.
 *
 * PLATFORM FIRST is deliberate: a Spoke may never shadow a platform-owned asset (A2).
 */
const runtimeNamespaces = deploymentPaths().runtimeAssetNamespaces;

/** The PLATFORM namespace: FIRST in the resolution order, and the ONE whose URL base is `/assets`. */
const platformNamespace = runtimeNamespaces[0];

/**
 * The same-origin URL a configured ASSET resolves to, given its configured pathname and basename.
 *
 * The PLATFORM namespace keeps the configured pathname: its URL base IS the historical `/assets` prefix,
 * so a legacy Installation's answer is byte-for-byte what it was, and an adopter's own pathname spelling
 * (`/brand/runtime/assets/logo.svg`) is respected exactly as before. A SPOKE-owned file is different — the
 * platform namespace does NOT hold it — so it is served from the Spoke namespace that does, which is the
 * ONLY URL that resolves. A file no namespace holds keeps the configured pathname (never a 404 invented
 * here).
 */
function runtimeUrlFor(pathname: string, name: string): string {
  const owner = owningNamespace(name);
  if (owner === null || owner.urlBase === platformNamespace.urlBase) return pathname;
  return `${owner.urlBase}/${name}`;
}

/** The namespace that HOLDS `name`, or `null`. Cached: the generated tree is fixed for one process. */
const ownerCache = new Map<string, (typeof runtimeNamespaces)[number] | null>();

/**
 * The generated runtime BASE — the directory every namespace lives in — taken from the authority's own
 * answer (the platform namespace's parent), never spelled here.
 */
const runtimeBaseDirectory = path.dirname(deploymentPaths().publicAssetsDirectory);

/**
 * The namespace that HOLDS `name`, in the ONE documented order:
 *
 *   1. the DECLARED namespaces the build resolved — the platform namespace first (a Spoke may never
 *      shadow a platform-owned asset, A2), then the sole Spoke's own when the Installation is explicit;
 *   2. as a LAST RESORT, a Spoke namespace that EXISTS in the generated tree.
 *
 * Step 2 is deliberately narrow and exists for one honest reason: the GENERATED TREE is what a browser can
 * actually fetch, and a runtime may be served beside output another build of the same repository produced
 * (the generic test project runs a synthetic deployment against this repository's generated mirror). It
 * never overrides a declared answer (1 always wins), it only ever reads the `spokes/` container, and in a
 * real legacy Installation that container does not exist — the installer removes it — so nothing about a
 * legacy deployment's own runtime changes.
 */
function owningNamespace(name: string): (typeof runtimeNamespaces)[number] | null {
  const cached = ownerCache.get(name);
  if (cached !== undefined) return cached;

  let owner = runtimeNamespaces.find((namespace) => existsSync(path.join(namespace.directory, name)));

  if (owner === undefined) {
    const container = path.join(runtimeBaseDirectory, SPOKE_RUNTIME_CONTAINER);
    if (existsSync(container)) {
      for (const segment of readdirSync(container).sort()) {
        const directory = path.join(runtimeBaseDirectory, spokeRuntimeAssetNamespacePath(segment));
        if (existsSync(path.join(directory, name))) {
          owner = { directory, urlBase: spokeRuntimeAssetUrlBase(segment) };
          break;
        }
      }
    }
  }

  const answer = owner ?? null;
  ownerCache.set(name, answer);
  return answer;
}

/** True when `<name>` exists as a real file in ANY generated runtime namespace (cached). */
export function iconAssetAvailable(name: string | undefined): boolean {
  if (!name || name === "") return false;
  return owningNamespace(name) !== null;
}

/**
 * The ABSOLUTE path of the generated runtime file `<name>`, or `undefined` when no namespace holds it.
 *
 * The companion of `availableIconUrl` for a consumer that needs the file itself (reading its header,
 * asserting it ships) rather than the URL it is served from — and the ONE answer to "which namespace owns
 * this basename", so no consumer re-implements the resolution order.
 */
export function runtimeAssetPath(name: string | undefined): string | undefined {
  if (!name || name === "") return undefined;
  const owner = owningNamespace(name);
  return owner === null ? undefined : path.join(owner.directory, name);
}

/**
 * The icon filename to render: the name when it is backed by a real asset in one of the generated
 * runtime namespaces; `""` when a CONFIGURED name has no backing file (safely: no icon, never a
 * broken image — the P5-5 deliberate-absence value); `undefined`/`""` pass through so the P5-5A
 * contract is preserved verbatim (missing → the caller's shipped-asset fallback applies; `""` →
 * deliberately no icon).
 */
export function availableIconName(name: string | undefined): string | undefined {
  if (name === undefined || name === "") return name;
  return iconAssetAvailable(name) ? name : "";
}

/**
 * S3F1 — the same-origin URL a configured icon FILENAME resolves to: the RUNTIME NAMESPACE that
 * actually holds it, or `""` when no namespace does (the P5-5 deliberate-absence value, so a configured
 * but unavailable icon renders no element rather than a broken image).
 *
 * This is the companion of `availableIconName` for a consumer that needs the URL rather than the
 * filename. It exists because the answer is not always `/assets/<name>`: in an explicit Installation a
 * Spoke's own artwork is served from that Spoke's namespace, and a hardcoded `/assets/` prefix would
 * point at a platform path that does not hold it. `undefined`/`""` pass through verbatim, exactly as the
 * filename projection does.
 */
export function availableIconUrl(name: string | undefined): string | undefined {
  if (name === undefined || name === "") return name;
  const owner = owningNamespace(name);
  return owner === null ? "" : `${owner.urlBase}/${name}`;
}

/**
 * S3F1 — the runtime URL of ONE icon CONTROL leaf, with the SHIPPED DEFAULT resolved the same way.
 *
 * The P5-5 three-state contract is preserved exactly: `""` stays a deliberate absence (no icon), an
 * absent leaf falls back to the shipped default ROLE, and any named leaf resolves to the namespace that
 * holds it. Resolving the default HERE — at the boundary that can see the generated tree — is what keeps
 * a shipped role icon (the sidebar disclosure assets) served from the Spoke's own namespace in an
 * explicit Installation instead of from a `/assets/` path that no longer holds it.
 */
export function resolveIconControlUrl(configured: string | undefined, shippedDefault: string): string {
  if (configured === "") return "";
  return availableIconUrl(configured ?? shippedDefault) ?? "";
}

/**
 * P6-2D — resolves a `site.assets.*` value (an FS-4 ABSOLUTE URL, validated
 * against `site.url`) to a path that always fetches from the CURRENT origin
 * when rendered as a real `<img src>` — mirroring the existing plain-filename
 * icon-asset convention above (`iconAssetUrl`: name → `/assets/<name>`).
 *
 * Why this exists: `site.url` is the SITE'S OWN canonical origin (used for
 * `<link rel="canonical">`/JSON-LD/OpenGraph, where an absolute URL is
 * correct even if it differs from the browser's current origin — e.g. a
 * staging preview under a different host still points canonical/JSON-LD at
 * the real production origin). A rendered `<img>` has no such indirection:
 * the browser fetches literally whatever `src` says, so if `site.url` is a
 * placeholder/mismatched domain (or the deployment is previewed under a
 * different host), an absolute asset URL 404s. Every `site.assets.*` value
 * always resolves to a same-origin `public/assets/<file>` path in EVERY
 * shipped deployment, so re-deriving the path portion is always correct and
 * removes the coupling between `site.url` accuracy and real rendered images.
 */
export function assetPathFromUrl(absoluteUrl: string | undefined): string | undefined {
  if (!absoluteUrl) return absoluteUrl;
  try {
    return new URL(absoluteUrl).pathname;
  } catch {
    return absoluteUrl;
  }
}

/**
 * The shared "configured asset is real" rule behind the page-role graphic roles
 * (`availableBannerPath` / `availableBackgroundPath`): an FS-4 ABSOLUTE URL
 * resolves to the same-origin URL of the RUNTIME NAMESPACE that holds a file with that basename, and
 * ONLY when one does — otherwise `undefined`. The basename is checked through the same
 * asset-availability rule the plain-filename icon contract uses (`./deployment-root` publishes the
 * namespaces; a legacy Installation has exactly one, so this is the platform path it always was), so a
 * CONFIGURED-but-missing role is always indistinguishable from an ABSENT one — never a placeholder and
 * never a broken image/404.
 */
function availableRoleAssetPath(absoluteUrl: string | undefined): string | undefined {
  const pathname = assetPathFromUrl(absoluteUrl);
  if (!pathname) return undefined;
  const name = pathname.split("/").pop() ?? "";
  if (name === "" || owningNamespace(name) === null) return undefined;
  return runtimeUrlFor(pathname, name);
}

/**
 * S3F1 — the same-origin URL a configured asset ROLE resolves to, WITHOUT requiring the file to be
 * mirrored: the namespace URL when the basename IS installed by the runtime mirror (which installs by
 * basename, so that is the ONE place generated artwork actually lives), and the configured pathname
 * verbatim otherwise.
 *
 * The fallback matters: an adopter may serve artwork from `public/` directly (outside the mirror plan),
 * and such a value must keep working exactly as `assetPathFromUrl` resolved it before. A legacy
 * Installation therefore sees no change at all — its platform namespace URL base IS `/assets`, which is
 * the path its configured role URLs already name.
 */
export function runtimeAssetUrl(absoluteUrl: string | undefined): string | undefined {
  const pathname = assetPathFromUrl(absoluteUrl);
  if (pathname === undefined) return undefined;
  return runtimeUrlFor(pathname, pathname.split("/").pop() ?? "");
}

/**
 * P6-3B — resolves a configured `site.assets.banners[<page>]` value (an FS-4
 * ABSOLUTE URL) to a same-origin path ONLY when a matching file exists under
 * `public/assets/`; otherwise `undefined` (the page renders NO banner — no
 * placeholder, no reserved space, never another page's banner).
 */
export function availableBannerPath(absoluteUrl: string | undefined): string | undefined {
  return availableRoleAssetPath(absoluteUrl);
}

/**
 * P12-BG — resolves a configured `site.assets.backgrounds[<role>]` value (an
 * FS-4 ABSOLUTE URL) to a same-origin path ONLY when a matching file exists
 * under `public/assets/`; otherwise `undefined`. Same availability rule as the
 * banner role (above), so a CONFIGURED-but-missing background resolves to
 * `undefined` — which is exactly what drives the documented
 * `background-<page>` → `background-all` → none fallback in the layout
 * (a missing page-specific asset falls through to the global one, and a missing
 * global one renders nothing at all).
 */
export function availableBackgroundPath(absoluteUrl: string | undefined): string | undefined {
  return availableRoleAssetPath(absoluteUrl);
}

/**
 * P12-BG — builds the page-role → same-origin-path map the decorative background
 * layer consumes from the configured `site.assets.backgrounds` record. Entries
 * whose file is missing are DROPPED entirely, so a CONFIGURED-but-missing
 * background is indistinguishable from an ABSENT one — which is precisely what
 * drives the documented `background-<page>` → `background-all` → none fallback
 * without any special-case fallback code in the runtime.
 */
export function availableBackgroundMap(
  configured: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(configured ?? {}).flatMap(([role, url]) => {
      const path = availableBackgroundPath(url);
      return path ? [[role, path]] : [];
    }),
  );
}

/**
 * P12-FG — resolves a configured `site.assets.footerGraphic` value (an FS-4
 * ABSOLUTE URL) to a same-origin path ONLY when a matching file exists under
 * `public/assets/`; otherwise `undefined`. Same availability rule as the banner
 * and background roles (above), so a CONFIGURED-but-missing footer graphic is
 * indistinguishable from an ABSENT one — the footer simply renders no
 * decorative layer (never a placeholder, never a broken image).
 */
export function availableFooterGraphicPath(absoluteUrl: string | undefined): string | undefined {
  return availableRoleAssetPath(absoluteUrl);
}

/**
 * P12-HG — resolves a configured `site.assets.headerGraphic` value (an FS-4
 * ABSOLUTE URL) to a same-origin path ONLY when a matching file exists under
 * `public/assets/`; otherwise `undefined`. Same availability rule as the banner,
 * background and footer-graphic roles (above), so a CONFIGURED-but-missing
 * header graphic is indistinguishable from an ABSENT one — the header simply
 * paints no decorative band (never a placeholder, never a broken image).
 */
export function availableHeaderGraphicPath(absoluteUrl: string | undefined): string | undefined {
  return availableRoleAssetPath(absoluteUrl);
}

/**
 * P12-SG — resolves a configured `site.assets.statusGraphic` value (an FS-4
 * ABSOLUTE URL) to a same-origin path ONLY when a matching file exists under
 * `public/assets/`; otherwise `undefined`. Same availability rule as the banner,
 * background, footer-graphic and header-graphic roles (above), so a
 * CONFIGURED-but-missing status graphic is indistinguishable from an ABSENT one
 * — the status surfaces simply render no decorative graphic (never a
 * placeholder, never a broken image).
 */
export function availableStatusGraphicPath(absoluteUrl: string | undefined): string | undefined {
  return availableRoleAssetPath(absoluteUrl);
}

/** An intrinsic pixel size read from an asset header. */
export interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

const dimensionsCache = new Map<string, ImageDimensions | undefined>();

/** The header bytes worth reading — enough for every supported container. */
const MAX_HEADER_BYTES = 512 * 1024;

function svgLength(source: string, attribute: string): number | undefined {
  const match = new RegExp(`${attribute}\\s*=\\s*["']\\s*([0-9.]+)\\s*(?:px)?\\s*["']`, "i").exec(source);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * SVG: the size declared on the ROOT `<svg …>` element — explicit
 * width/height (unitless or `px`), else the viewBox. Only the root tag is
 * consulted, so a nested element (e.g. an embedded `<image width="…">`) can
 * never be mistaken for the document size; a root length in a non-pixel unit
 * is left to the viewBox, which describes the artwork's own grid.
 */
function svgDimensions(head: string): ImageDimensions | undefined {
  const rootTag = /<svg\b[^>]*>/i.exec(head)?.[0];
  if (!rootTag) return undefined;
  const box = /viewBox\s*=\s*["']\s*-?[\d.]+[\s,]+-?[\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(rootTag);
  const viewWidth = box ? Number(box[1]) : undefined;
  const viewHeight = box ? Number(box[2]) : undefined;
  const width = svgLength(rootTag, "width");
  const height = svgLength(rootTag, "height");
  if (width !== undefined && height !== undefined) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  if (viewWidth && viewHeight && viewWidth > 0 && viewHeight > 0) {
    if (width !== undefined) {
      return { width: Math.round(width), height: Math.round((width * viewHeight) / viewWidth) };
    }
    if (height !== undefined) {
      return { width: Math.round((height * viewWidth) / viewHeight), height: Math.round(height) };
    }
    return { width: Math.round(viewWidth), height: Math.round(viewHeight) };
  }
  return undefined;
}

/** PNG: IHDR width/height (big-endian) straight after the signature + length/type. */
function pngDimensions(head: Buffer): ImageDimensions | undefined {
  if (head.length < 24) return undefined;
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

/** GIF: logical screen descriptor width/height (little-endian). */
function gifDimensions(head: Buffer): ImageDimensions | undefined {
  if (head.length < 10) return undefined;
  return { width: head.readUInt16LE(6), height: head.readUInt16LE(8) };
}

/** JPEG: walk the segment chain until a Start-Of-Frame carries the frame size. */
function jpegDimensions(head: Buffer): ImageDimensions | undefined {
  let offset = 2;
  while (offset + 9 <= head.length) {
    if (head[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = head[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    // Standalone markers (no payload): RSTn / SOI / EOI.
    if (marker >= 0xd0 && marker <= 0xd9) {
      offset += 2;
      continue;
    }
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      return { height: head.readUInt16BE(offset + 5), width: head.readUInt16BE(offset + 7) };
    }
    const segmentLength = head.readUInt16BE(offset + 2);
    if (segmentLength < 2) return undefined;
    offset += 2 + segmentLength;
  }
  return undefined;
}

/** WebP: VP8X (extended) / VP8 (lossy) / VP8L (lossless) all expose the canvas size. */
function webpDimensions(head: Buffer): ImageDimensions | undefined {
  const chunk = head.toString("ascii", 12, 16);
  if (chunk === "VP8X" && head.length >= 30) {
    return {
      width: 1 + (head[24] | (head[25] << 8) | (head[26] << 16)),
      height: 1 + (head[27] | (head[28] << 8) | (head[29] << 16)),
    };
  }
  if (chunk === "VP8 " && head.length >= 30) {
    const width = head.readUInt16LE(26) & 0x3fff;
    const height = head.readUInt16LE(28) & 0x3fff;
    return width && height ? { width, height } : undefined;
  }
  if (chunk === "VP8L" && head.length >= 25) {
    const bits = head.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return undefined;
}

/** Dispatches on the container's magic bytes (never the file extension). */
function dimensionsFromBytes(head: Buffer): ImageDimensions | undefined {
  if (head.length >= 24 && head.readUInt32BE(0) === 0x89504e47) return pngDimensions(head);
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return jpegDimensions(head);
  }
  const gifHeader = head.length >= 6 ? head.toString("ascii", 0, 6) : "";
  if (gifHeader === "GIF87a" || gifHeader === "GIF89a") return gifDimensions(head);
  if (head.length >= 16 && head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WEBP") {
    return webpDimensions(head);
  }
  const text = head.toString("utf8", 0, Math.min(head.length, 4096));
  return /<svg[\s>]/i.test(text) ? svgDimensions(text) : undefined;
}

/**
 * P6-3C — the INTRINSIC pixel size of a configured banner graphic, when it can
 * be read (server-only; cached per asset filename).
 *
 * The banner sizing contract is `displayWidth = min(availableWidth, 1.5 ×
 * naturalWidth)`. No CSS expression can reference a replaced element's own
 * intrinsic width, so the framework layer reads the asset's header once at
 * composition time and the renderer passes the derived cap down as an inline
 * custom property (the established token-only pattern — no component style
 * rule). Supported containers: SVG, PNG, JPEG, GIF, WebP.
 *
 * Returns `undefined` for anything undecodable, so the renderer falls back to a
 * never-upscale presentation rather than guessing a size.
 */
export function readImageDimensions(sameOriginPath: string | undefined): ImageDimensions | undefined {
  const pathname = assetPathFromUrl(sameOriginPath);
  if (!pathname) return undefined;
  const name = pathname.split("/").pop() ?? "";
  if (!name) return undefined;
  if (dimensionsCache.has(name)) return dimensionsCache.get(name);

  // S3E1C — the header is read from the namespace that HOLDS the file (a Spoke's own artwork lives in
  // the Spoke's namespace, not the platform one), so the reported size is the size the browser gets.
  const owner = owningNamespace(name);
  let dimensions: ImageDimensions | undefined;
  if (owner !== null) {
    const filePath = path.join(owner.directory, name);
    try {
      const fileSize = statSync(filePath).size;
      const length = Math.min(fileSize, MAX_HEADER_BYTES);
      if (length > 0) {
        const descriptor = openSync(filePath, "r");
        try {
          const head = Buffer.alloc(length);
          const read = readSync(descriptor, head, 0, length, 0);
          dimensions = dimensionsFromBytes(head.subarray(0, read));
        } finally {
          closeSync(descriptor);
        }
      }
    } catch {
      dimensions = undefined;
    }
  }
  dimensionsCache.set(name, dimensions);
  return dimensions;
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
 * P6-1 — every icon leaf in the configuration that is a plain filename must be
 * backed by a real file under `public/assets/`. Missing files are loud build
 * failures (P5-5A: invalid → loud configuration failure), so an adopter who
 * references a typo'd/absent asset can never ship a broken-image icon.
 *
 * Deliberate absence (`""`) on a control leaf remains valid (icon-only →
 * text-only etc.), exactly as before — only a NAME with no file fails.
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

  const missing = leaves.filter((leaf) => !iconAssetAvailable(leaf.value));
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