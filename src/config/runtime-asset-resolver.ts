import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import path from "node:path";

import type { RuntimeAssetNamespace } from "./deployment-root";

/**
 * S3F2A2-R1 — RUNTIME ASSET NAMESPACE OWNERSHIP BOUND TO AN EXPLICIT CONTEXT
 * =========================================================================
 *
 * The accepted ownership rule, expressed ONCE as a value a caller can hold: a resolver is created from the
 * runtime namespaces ONE runtime context declares, in that context's authoritative order (the platform
 * namespace first, then that context's own Spoke namespace), and it answers two questions — which supplied
 * namespace HOLDS a basename, what the absolute path of that generated file is, and the INTRINSIC pixel
 * size of that file (read from its own header — never from a path or a convention).
 *
 * S3F2A2-R3A adds the URL SIDE of the same answers: the pathname extraction, the runtime URL projection (the
 * platform namespace and an unowned path both keep the configured pathname; a Spoke namespace answers with
 * its own URL base) and the icon availability/name/URL/control-default projections.
 *
 * S3F2A2-R3B adds the PAGE-ROLE surface on top: the banner, background (with its map), footer, header and
 * status graphic roles, every one of them answering through ONE shared availability rule — pathname →
 * basename → this resolver's ownership. A role is available only when a supplied namespace actually holds
 * the file, which is the deliberate, load-bearing distinction from `runtimeAssetUrl`.
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

  /**
   * The INTRINSIC pixel size of the file THIS resolver's ownership resolves `sameOriginPath` to, or
   * `undefined` when no supplied namespace holds it, or the header cannot be decoded.
   *
   * The basename is resolved through this resolver's OWN ownership authority (never a second search and
   * never the production module's global cache), so a context can only ever measure artwork it may serve;
   * the answer is cached per basename, for this resolver only.
   */
  readImageDimensions(sameOriginPath: string | undefined): ImageDimensions | undefined;

  /** The pathname of a configured asset URL (pure): its `pathname`, or the value unchanged if not a URL. */
  assetPathFromUrl(absoluteUrl: string | undefined): string | undefined;

  /** True when a supplied namespace holds `name` — this resolver's OWN ownership, cached per instance. */
  iconAssetAvailable(name: string | undefined): boolean;

  /** The three-state icon filename projection: `undefined`/`""` pass through, an unowned name becomes `""`. */
  availableIconName(name: string | undefined): string | undefined;

  /** The same-origin URL an icon filename is served from, or `""` when no supplied namespace holds it. */
  availableIconUrl(name: string | undefined): string | undefined;

  /** A control leaf's icon URL with the shipped default resolved here, through THIS instance's ownership. */
  resolveIconControlUrl(configured: string | undefined, shippedDefault: string): string;

  /** The same-origin URL a configured asset URL resolves to (the accepted runtime-asset projection). */
  runtimeAssetUrl(absoluteUrl: string | undefined): string | undefined;

  /** The banner role's runtime URL, or `undefined` unless a supplied namespace owns the basename. */
  availableBannerPath(absoluteUrl: string | undefined): string | undefined;

  /** The background role's runtime URL, or `undefined` unless a supplied namespace owns the basename. */
  availableBackgroundPath(absoluteUrl: string | undefined): string | undefined;

  /** The background map with every unavailable entry DROPPED (never an `undefined` value, no placeholder). */
  availableBackgroundMap(
    configured: Readonly<Record<string, string>> | undefined,
  ): Record<string, string>;

  /** The footer graphic role's runtime URL, or `undefined` unless a namespace owns the basename. */
  availableFooterGraphicPath(absoluteUrl: string | undefined): string | undefined;

  /** The header graphic role's runtime URL, or `undefined` unless a namespace owns the basename. */
  availableHeaderGraphicPath(absoluteUrl: string | undefined): string | undefined;

  /** The status graphic role's runtime URL, or `undefined` unless a namespace owns the basename. */
  availableStatusGraphicPath(absoluteUrl: string | undefined): string | undefined;
}

/** An intrinsic pixel size read from an asset header (deliberately the accepted shape from `./assets`). */
export interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

/** The header bytes worth reading — enough for every supported container (the accepted limit). */
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

/**
 * The accepted ownership rule, as a pure function of an EXPLICIT namespace list: no cache, no process state.
 *
 * Deliberately the same rule as the established primitive in `./assets`. It is EXPORTED because
 * S3F2A2-R4 turned that primitive into the live module's delegate: the parameterised public
 * `namespaceOwning(name, namespaces)` now answers through THIS function, so the ownership rule exists in
 * exactly one place in the repository. Because it returns the element of the SUPPLIED list, a caller that
 * asks "which of my namespaces holds this" gets its own namespace object back — identity preserved (a
 * resolver instance answers with its own frozen snapshot copy instead, which is the right answer for a
 * context-bound resolver and the wrong one for that parameterised question).
 */
export function owningNamespaceIn(
  name: string,
  namespaces: readonly RuntimeAssetNamespace[],
): RuntimeAssetNamespace | null {
  if (!name || name === "") return null;
  return namespaces.find((namespace) => existsSync(path.join(namespace.directory, name))) ?? null;
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
 * The pathname of a same-origin path — or of an absolute URL, whose pathname is what a page would fetch.
 * A value that is already a path is returned unchanged, exactly as the accepted `./assets` helper does.
 */
function pathnameOf(value: string | undefined): string | undefined {
  if (!value) return value;
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
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

  /** The FIRST supplied namespace is the PLATFORM namespace: its URL base keeps the configured pathname. */
  const platformUrlBase = snapshot[0]?.urlBase;

  /** Instance-local: a basename OWNER belongs to THIS context, never to the process. */
  const ownerCache = new Map<string, RuntimeAssetNamespace | null>();

  /** Instance-local too: so does a basename's SIZE — two contexts may own the same basename. */
  const dimensionCache = new Map<string, ImageDimensions | undefined>();

  const ownerOf = (name: string): RuntimeAssetNamespace | null => {
    if (!name || name === "") return null;
    const cached = ownerCache.get(name);
    if (cached !== undefined) return cached;
    const found = owningNamespaceIn(name, snapshot);
    ownerCache.set(name, found);
    return found;
  };

  /** The absolute path of `name` in the namespace that holds it, through THIS resolver's ownership. */
  const pathFor = (name: string): string | undefined => {
    const owner = ownerOf(name);
    return owner === null ? undefined : path.join(owner.directory, name);
  };

  /**
   * The accepted header-read flow, resolved through THIS resolver's ownership and cached for THIS resolver:
   * nothing is measured unless a supplied namespace holds the file, and a file that cannot be decoded is a
   * cached `undefined` rather than an exception.
   */
  const dimensionsFor = (name: string): ImageDimensions | undefined => {
    if (dimensionCache.has(name)) return dimensionCache.get(name);
    let dimensions: ImageDimensions | undefined;
    const filePath = pathFor(name);
    if (filePath !== undefined) {
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
    dimensionCache.set(name, dimensions);
    return dimensions;
  };

  /**
   * The runtime URL a configured pathname resolves to — the ACCEPTED rule, projected over THIS resolver's
   * ownership: the PLATFORM namespace (the FIRST supplied namespace, the one whose URL base is the historical
   * `/assets`) keeps the configured pathname, and so does an UNOWNED basename, whose path is therefore left
   * exactly as the adopter spelled it (a directly served public path must keep working, and no 404 is ever
   * invented here). Only a Spoke namespace answers with a URL of its own.
   */
  const runtimeUrlFor = (pathname: string, name: string): string => {
    const owner = ownerOf(name);
    if (owner === null || owner.urlBase === platformUrlBase) return pathname;
    return `${owner.urlBase}/${name}`;
  };

  /** The same-origin URL an icon FILENAME is served from, or `""` when no supplied namespace holds it. */
  const iconUrl = (name: string): string => {
    const owner = ownerOf(name);
    return owner === null ? "" : `${owner.urlBase}/${name}`;
  };

  /**
   * THE SHARED AVAILABILITY RULE behind every page-role graphic — banner, background (and its map), footer,
   * header and status all answer through here, so the rule exists ONCE: pathname → basename → THIS resolver's
   * own ownership, then the already-proven URL projection.
   *
   * The distinction from `runtimeAssetUrl` is deliberate and load-bearing: that method preserves an UNOWNED
   * configured pathname, because a generic configured asset may be directly served outside the mirror, while
   * a configured page-role graphic is AVAILABLE only when a declared runtime namespace actually holds its
   * basename — otherwise `undefined`, so no placeholder, no reserved space, no broken image and no 404 is
   * ever invented.
   */
  const roleUrl = (absoluteUrl: string | undefined): string | undefined => {
    const pathname = pathnameOf(absoluteUrl);
    if (!pathname) return undefined;
    const name = pathname.split("/").pop() ?? "";
    if (name === "" || ownerOf(name) === null) return undefined;
    return runtimeUrlFor(pathname, name);
  };

  return Object.freeze({
    namespaces: snapshot,
    namespaceOwning: (name: string): RuntimeAssetNamespace | null => ownerOf(name),
    runtimeAssetPath: (name: string | undefined): string | undefined => {
      if (!name || name === "") return undefined;
      return pathFor(name);
    },
    readImageDimensions: (sameOriginPath: string | undefined): ImageDimensions | undefined => {
      const pathname = pathnameOf(sameOriginPath);
      if (!pathname) return undefined;
      const name = pathname.split("/").pop() ?? "";
      if (!name) return undefined;
      return dimensionsFor(name);
    },
    assetPathFromUrl: (absoluteUrl: string | undefined): string | undefined => pathnameOf(absoluteUrl),
    iconAssetAvailable: (name: string | undefined): boolean =>
      !name || name === "" ? false : ownerOf(name) !== null,
    availableIconName: (name: string | undefined): string | undefined => {
      if (name === undefined || name === "") return name;
      return ownerOf(name) === null ? "" : name;
    },
    availableIconUrl: (name: string | undefined): string | undefined => {
      if (name === undefined || name === "") return name;
      return iconUrl(name);
    },
    resolveIconControlUrl: (configured: string | undefined, shippedDefault: string): string => {
      if (configured === "") return "";
      return iconUrl(configured ?? shippedDefault);
    },
    runtimeAssetUrl: (absoluteUrl: string | undefined): string | undefined => {
      const pathname = pathnameOf(absoluteUrl);
      if (pathname === undefined) return undefined;
      return runtimeUrlFor(pathname, pathname.split("/").pop() ?? "");
    },
    availableBannerPath: (absoluteUrl: string | undefined): string | undefined => roleUrl(absoluteUrl),
    availableBackgroundPath: (absoluteUrl: string | undefined): string | undefined =>
      roleUrl(absoluteUrl),
    availableBackgroundMap: (
      configured: Readonly<Record<string, string>> | undefined,
    ): Record<string, string> =>
      Object.fromEntries(
        Object.entries(configured ?? {}).flatMap(([role, url]) => {
          const path = roleUrl(url);
          return path ? [[role, path]] : [];
        }),
      ),
    availableFooterGraphicPath: (absoluteUrl: string | undefined): string | undefined =>
      roleUrl(absoluteUrl),
    availableHeaderGraphicPath: (absoluteUrl: string | undefined): string | undefined =>
      roleUrl(absoluteUrl),
    availableStatusGraphicPath: (absoluteUrl: string | undefined): string | undefined =>
      roleUrl(absoluteUrl),
  });
}
