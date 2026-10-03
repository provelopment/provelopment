#!/usr/bin/env node
/**
 * IMAGE HEADER DECODING — ONE implementation, used at BUILD time and (compatibility) at runtime
 * ============================================================================================
 *
 * FOUNDATION-MULTISITE-M16/M17 (Defect B). An intrinsic pixel size is read from an asset's own header —
 * never from a path or a filename convention — and there are exactly two moments it is needed:
 *
 *   BUILD TIME   `scripts/sync-runtime-assets.mjs` decodes every planned asset ONCE and publishes the
 *                sizes in the generated runtime-asset catalog, so the running site already knows them.
 *   RUNTIME      only for a namespace that carries NO catalog inventory — the synthetic namespaces the
 *                unit fixtures build over temporary directories. That is the compatibility source, and
 *                it is why this decoder lives here as a value rather than only inside the script.
 *
 * WHY PLAIN ESM
 * -------------
 * The build script is native Node ESM (`node scripts/…`, no loader, no TypeScript flag — the same choice
 * `src/config/deployment-build.mjs`, `spoke-runtime-segment.mjs` and `spoke-host-routing.mjs` already
 * made), while the resolver is TypeScript. A shared `.mjs` is the ONE place both can import, so the
 * supported containers, the header limit and the "undecodable is `undefined`, never an exception"
 * fallback cannot drift between what the build publishes and what the runtime believes.
 *
 * SUPPORTED CONTAINERS (unchanged, and deliberately never keyed on a file extension)
 *   SVG   the ROOT `<svg …>` element's own width/height (unitless or `px`), else its viewBox
 *   PNG   IHDR width/height
 *   GIF   logical screen descriptor
 *   JPEG  the first Start-Of-Frame segment
 *   WebP  VP8X (extended) / VP8 (lossy) / VP8L (lossless)
 */

/** The header bytes worth reading — enough for every supported container (the accepted limit). */
export const MAX_HEADER_BYTES = 512 * 1024;

/** @typedef {{ readonly width: number, readonly height: number }} ImageDimensions */

/**
 * @param {string} source the root `<svg …>` tag
 * @param {string} attribute `width` or `height`
 * @returns {number | undefined} the declared length, or `undefined`
 */
function svgLength(source, attribute) {
  const match = new RegExp(`${attribute}\\s*=\\s*["']\\s*([0-9.]+)\\s*(?:px)?\\s*["']`, "i").exec(source);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * SVG: the size declared on the ROOT `<svg …>` element — explicit width/height (unitless or `px`), else
 * the viewBox. Only the root tag is consulted, so a nested element (e.g. an embedded `<image width="…">`)
 * can never be mistaken for the document size; a root length in a non-pixel unit is left to the viewBox,
 * which describes the artwork's own grid.
 *
 * @param {string} head the file's leading text
 * @returns {ImageDimensions | undefined}
 */
function svgDimensions(head) {
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
 * @param {Buffer} head
 * @returns {ImageDimensions | undefined}
 */
function pngDimensions(head) {
  if (head.length < 24) return undefined;
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

/**
 * @param {Buffer} head
 * @returns {ImageDimensions | undefined}
 */
function gifDimensions(head) {
  if (head.length < 10) return undefined;
  return { width: head.readUInt16LE(6), height: head.readUInt16LE(8) };
}

/**
 * JPEG: walk the segment chain until a Start-Of-Frame carries the frame size.
 *
 * @param {Buffer} head
 * @returns {ImageDimensions | undefined}
 */
function jpegDimensions(head) {
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

/**
 * WebP: VP8X (extended) / VP8 (lossy) / VP8L (lossless) all expose the canvas size.
 *
 * @param {Buffer} head
 * @returns {ImageDimensions | undefined}
 */
function webpDimensions(head) {
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

/**
 * The intrinsic size of an asset's leading bytes, or `undefined` when the container is unsupported or the
 * header is too short — the accepted fallback, which is a VALUE and never an exception.
 *
 * @param {Buffer} head the file's leading bytes
 * @returns {ImageDimensions | undefined}
 */
export function dimensionsFromBytes(head) {
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
