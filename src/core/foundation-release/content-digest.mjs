/**
 * THE NORMALISED CONTENT DIGEST — ONE ENCODING, SEVERAL SCOPES (FOUNDATION-R1B / B4B)
 * ================================================================================
 *
 * ONE deterministic encoding for "what content set exactly is this?". It is used by the release tooling
 * (the platform-content digest a release identity names) AND by a Foundation installation (the authored
 * input it was established from, and the materialised tree that became live), so a digest is never
 * scope-ambiguous and two consumers can never disagree about how a content set is described.
 *
 * WHAT IS ENCODED
 * ---------------
 *   scope line   "<scope>\n"                                     — exactly what is being digested
 *   one record   "<path>\0<sha256 of the file's exact bytes>\n"   — per file
 *   order        paths sorted BYTE-WISE (locale-independent), so enumeration order can never matter
 *
 * The result depends only on the paths and the file bytes: never on enumeration order, mtimes, archive
 * metadata, the local line-ending configuration or a working tree's ignored state.
 *
 * DELIMITERS ARE DELIBERATE: NUL cannot appear in a path, and a path containing a newline is REFUSED, so
 * a record boundary can never be ambiguous.
 *
 * SCOPE, NOT POLICY: this module owns the ENCODING. Which scope is being digested — the release's content
 * set, an installation's authored input, an installation's materialised tree — is chosen by the caller
 * (`RELEASE_DIGEST_SCOPE_ID` here for the release content set; the installation contract owns its own),
 * which is what keeps ONE encoding while the identities stay distinct.
 *
 * HASHING IS NOT HERE: assembling the subject is pure, portable string work; producing the SHA-256 needs
 * a platform mechanism and is an adapter's business (see `src/adapters/installation/node-content-digest.mjs`,
 * which both the Node release tooling and the installation's adapters hash with). Core stays free of
 * `node:crypto` because core modules are bundled into the client as well as the server.
 *
 * Framework-neutral: pure functions over plain data, no filesystem, no cryptography, no Node builtins.
 */

/** The digest scope of a RELEASE's content set: the payload its manifest describes. */
export const RELEASE_DIGEST_SCOPE_ID = "release-content-v1";

/** The payload format the release digest's scope claims. Bumped only with the encoding itself. */
export const RELEASE_PAYLOAD_FORMAT = 1;

/** The shape of one digested file's hash: lowercase hex SHA-256. */
export const CONTENT_DIGEST_FILE_SHAPE = /^[0-9a-f]{64}$/;

/** UTF-8 bytes of a string, without depending on a Node builtin (this module must stay portable). */
const utf8 = new TextEncoder();

/**
 * Byte-wise path order (never locale order).
 *
 * Two paths are compared by their UTF-8 bytes, which is what makes a digest identical on every machine:
 * `localeCompare` would order the same two paths differently under a different locale.
 *
 * @param {string} left one path
 * @param {string} right another path
 * @returns {number} negative, zero or positive
 */
export function compareContentPaths(left, right) {
  if (left === right) return 0;
  const a = utf8.encode(left);
  const b = utf8.encode(right);
  const shared = Math.min(a.length, b.length);
  for (let index = 0; index < shared; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}

/**
 * The exact subject a scoped content digest hashes.
 *
 * @param {Iterable<{ path: string, sha256: string }>} entries the files of the content set
 * @param {{ scope: string }} options the scope line's own text (what is being digested)
 * @returns {string} the subject, ready to hash as UTF-8
 */
export function contentDigestSubject(entries, options) {
  const scope = options?.scope;
  if (typeof scope !== "string" || scope.trim() === "" || /[\r\n]/.test(scope)) {
    throw new Error(
      "FOUNDATION-R1B/B4B: a content digest needs a non-empty, single-line scope naming what is being " +
        "digested; without one, two different content sets could share a digest meaning.",
    );
  }

  /** @type {Map<string, string>} */ const unique = new Map();
  for (const entry of entries) {
    const file = entry?.path;
    if (typeof file !== "string" || file === "" || file.startsWith("/") || /[\0\r\n]/.test(file)) {
      throw new Error(
        `FOUNDATION-R1B/B4B: "${String(file)}" is not encodable as a content path. A digest path is a ` +
          "non-empty relative path with no NUL and no newline, so a record boundary can never be ambiguous.",
      );
    }
    if (unique.has(file)) {
      throw new Error(`FOUNDATION-R1B/B4B: the path ${file} was supplied more than once to the digest.`);
    }
    if (typeof entry.sha256 !== "string" || !CONTENT_DIGEST_FILE_SHAPE.test(entry.sha256)) {
      throw new Error(`FOUNDATION-R1B/B4B: ${file} was supplied without a lowercase hex SHA-256.`);
    }
    unique.set(file, entry.sha256);
  }

  if (unique.size === 0) {
    throw new Error(
      "FOUNDATION-R1B/B4B: a content digest over no files would describe nothing, so it is refused. An " +
        "empty content set is a construction defect, not an identity.",
    );
  }

  let subject = `${scope}\n`;
  for (const file of [...unique.keys()].sort(compareContentPaths)) {
    subject += `${file}\0${unique.get(file)}\n`;
  }
  return subject;
}
