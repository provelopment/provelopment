/**
 * THE SPOKE RUNTIME SEGMENT (FOUNDATION-MULTISITE-S3E1C)
 * =====================================================
 *
 * ONE question, answered from ONE input:
 *
 *     runtimeSegmentForSpokeId("foundation")  ->  "foundation"
 *     runtimeSegmentForSpokeId("a/b")         ->  "a~2Fb"
 *
 * THE SEGMENT IS DERIVED FROM THE SPOKE'S IDENTITY, AND FROM NOTHING ELSE
 * ---------------------------------------------------------------------
 * A Spoke owns a runtime namespace (`/spokes/<segment>/assets/**`, `public/spokes/<segment>/assets/**`).
 * That namespace must be a STABLE, COLLISION-FREE function of the Spoke's identity — the `SpokeId` an
 * Installation's `spokes.json` declares — and never of where a Spoke happens to be authored. The
 * authored directory spelling is not identity (`spokes/foundation-web` may hold the Spoke `foundation`
 * and still get `foundation`), and neither a hostname, a Site code nor a filesystem basename may
 * influence it: any of those would make one Spoke's runtime output movable by an unrelated edit, and
 * two Spokes could silently share one namespace.
 *
 * THE ENCODING (frozen by the slice that introduces it)
 * -----------------------------------------------------
 *   ASCII `A-Z a-z 0-9 _ - .`          remain verbatim
 *   a segment that IS "." or ".."      has its dots escaped (never a traversal segment)
 *   `~`                                is ALWAYS escaped as `~7E`
 *   every other UTF-8 byte             becomes `~HH` (UPPERCASE hexadecimal)
 *
 * The result is deterministic, URL-safe, filesystem-safe, case-preserving, stable, never empty and
 * never `.` or `..` — and INJECTIVE: `~` is reserved as the escape introducer, so the encoding is a
 * bijection over UTF-8 byte strings and two different ids can never share a segment (proved in
 * `tests/unit/spoke-runtime-segment.test.ts`, including the boundary pairs the rule was written for).
 *
 * WHY THIS IS PLAIN ESM — ONE MODULE, THREE RUNTIMES
 * --------------------------------------------------
 * The segment is needed by the build/deployment seam (`./deployment-build.mjs`), by the Foundation's
 * own Node tooling (`scripts/sync-runtime-assets.mjs`, which runs under plain `node`) and by
 * TypeScript modules that compose a Spoke's resource record (`./spoke-resources.ts`). Only some of
 * those run through a TypeScript compiler, and a SECOND implementation of an injective encoding is
 * exactly the kind of duplication that drifts. A dependency-free plain ESM module with JSDoc types is
 * therefore the smallest stable boundary — the same reason `./deployment-build.mjs` is one — while
 * `tsc --noEmit` still checks every call site through the JSDoc contract below.
 *
 * No filesystem, no environment, no configuration and no framework: pure string encoding.
 */

/** The one reserved introducer: it may only ever appear as the start of an escape. */
export const RUNTIME_SEGMENT_ESCAPE = "~";

/**
 * The DEDICATED NAMESPACE a Spoke's own runtime artwork is served from, for one segment:
 * `/spokes/<segment>/assets`.
 *
 * Exported HERE so the URL base, the generated directory and the segment itself are spelled ONCE: the
 * runtime path authority (`./deployment-root`), the asset mirror (`scripts/sync-runtime-assets.mjs`)
 * and the Spoke resource record (`./spoke-resources`) all consume these functions rather than composing
 * the namespace for themselves — which is what keeps a Spoke's namespace from being spelled three ways.
 *
 * @param {string} segment a segment produced by {@link runtimeSegmentForSpokeId}
 * @returns {string} the same-origin URL base of that Spoke's runtime assets
 */
export function spokeRuntimeAssetUrlBase(segment) {
  return `/spokes/${segment}/assets`;
}

/**
 * The ONE generated directory beneath which every Spoke namespace lives (`<runtime base>/spokes`), and
 * which therefore also holds a namespace that a manifest no longer declares. Exported so the installer
 * can converge that container without spelling `spokes` a second time.
 */
export const SPOKE_RUNTIME_CONTAINER = "spokes";

/**
 * The GENERATED directory that URL base is served from, RELATIVE to the generated runtime base
 * (`public/`): `spokes/<segment>/assets`. The platform namespace is `assets`, deliberately NOT a parent
 * of a Spoke's — neither is nested in the other, so one Spoke's artwork can never collide with another's
 * or with a platform asset.
 *
 * @param {string} segment a segment produced by {@link runtimeSegmentForSpokeId}
 * @returns {string} the runtime-base-relative generated directory
 */
export function spokeRuntimeAssetNamespacePath(segment) {
  return `${SPOKE_RUNTIME_CONTAINER}/${segment}/assets`;
}

/** The uppercase hexadecimal alphabet the escape uses — frozen so two runs cannot disagree. */
const HEX = "0123456789ABCDEF";

/**
 * The exact ASCII bytes that remain VERBATIM: letters, digits, `_`, `-` and `.`.
 * Every other byte (including every non-ASCII UTF-8 byte) is escaped.
 */
function isVerbatimByte(byte) {
  return (
    (byte >= 0x30 && byte <= 0x39) || // 0-9
    (byte >= 0x41 && byte <= 0x5a) || // A-Z
    (byte >= 0x61 && byte <= 0x7a) || // a-z
    byte === 0x5f || // _
    byte === 0x2d || // -
    byte === 0x2e //   .
  );
}

/** `~HH` for one byte, using uppercase hexadecimal. */
function escapeByte(byte) {
  return `${RUNTIME_SEGMENT_ESCAPE}${HEX[(byte >> 4) & 0xf]}${HEX[byte & 0xf]}`;
}

/**
 * The RUNTIME SEGMENT of one `SpokeId`: the directory/URL token a Spoke's own runtime namespace is
 * built from.
 *
 * @param {string} spokeId the Spoke's identity, exactly as the Installation manifest declares it
 * @returns {string} a non-empty, traversal-free, ASCII-safe segment
 */
export function runtimeSegmentForSpokeId(spokeId) {
  if (typeof spokeId !== "string") {
    throw new Error(
      "FOUNDATION-MULTISITE-S3E1C: a runtime segment is derived from a Spoke id, so the id must be a " +
        `string (received ${typeof spokeId}).`,
    );
  }

  if (spokeId === "") {
    // The Spoke-id domain refuses a blank id, and an empty segment could not name a namespace at all:
    // failing here makes "the segment is never empty" a property of the encoder rather than a hope.
    throw new Error(
      "FOUNDATION-MULTISITE-S3E1C: a blank Spoke id has no runtime segment — an id must be non-empty.",
    );
  }

  // A segment that IS "." or ".." would be a traversal name in every filesystem and URL context, so
  // its dots are escaped. The rule is deliberately about the WHOLE segment: "a." and "..." are
  // ordinary names and stay verbatim.
  const traversal = spokeId === "." || spokeId === "..";

  let segment = "";
  for (const byte of new TextEncoder().encode(spokeId)) {
    if (byte === 0x7e) {
      // `~` is the escape introducer and is therefore ALWAYS escaped, whatever it neighbours.
      segment += escapeByte(byte);
      continue;
    }
    if (isVerbatimByte(byte) && !(traversal && byte === 0x2e)) {
      segment += String.fromCharCode(byte);
      continue;
    }
    segment += escapeByte(byte);
  }

  return segment;
}
