import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import path from "node:path";

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
const publicAssetsDirectory = path.join(process.cwd(), "public", "assets");

const availabilityCache = new Map<string, boolean>();

/** True when `<name>` exists as a real file under `public/assets/` (cached). */
export function iconAssetAvailable(name: string | undefined): boolean {
  if (!name || name === "") return false;
  const cached = availabilityCache.get(name);
  if (cached !== undefined) return cached;
  const available = existsSync(path.join(publicAssetsDirectory, name));
  availabilityCache.set(name, available);
  return available;
}

/**
 * The icon filename to render: the name when it is backed by a real asset;
 * `""` when a CONFIGURED name has no backing file (safely: no icon, never a
 * broken image — the P5-5 deliberate-absence value); `undefined`/`""` pass
 * through so the P5-5A contract is preserved verbatim (missing → the caller's
 * shipped-asset fallback applies; `""` → deliberately no icon).
 */
export function availableIconName(name: string | undefined): string | undefined {
  if (name === undefined || name === "") return name;
  return iconAssetAvailable(name) ? name : "";
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
 * P6-3B — resolves a configured `site.assets.banners[<page>]` value (an FS-4
 * ABSOLUTE URL) to a same-origin path ONLY when a matching file exists under
 * `public/assets/`; otherwise `undefined` (the page renders NO banner — no
 * placeholder, no reserved space, never another page's banner). The URL's
 * basename is what is checked, via the same asset-availability cache the
 * plain-filename icon contract uses.
 */
export function availableBannerPath(absoluteUrl: string | undefined): string | undefined {
  const pathname = assetPathFromUrl(absoluteUrl);
  if (!pathname) return undefined;
  const name = pathname.split("/").pop() ?? "";
  return iconAssetAvailable(name) ? pathname : undefined;
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

  let dimensions: ImageDimensions | undefined;
  const filePath = path.join(publicAssetsDirectory, name);
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