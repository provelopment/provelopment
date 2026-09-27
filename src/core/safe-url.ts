/**
 * THE SAFE-URL POLICY FOR AUTHOR-WRITTEN PAGES
 * ===========================================
 *
 * ONE authority for every destination an AUTHOR controls in the first-class
 * authoring modes: a Markdown link, a Markdown image, an authored metadata
 * action — and anything else those modes add later. Nothing they emit may carry a
 * URL this module has not classified, and anything it cannot classify **fails
 * closed**.
 *
 * WHY IT IS NOT `startsWith("/") || /^[a-z]+:/`
 * -------------------------------------------
 * That rule accepts **any** scheme, so `javascript:alert(1)` passes it. An author
 * must not be able to produce an executable destination by typing punctuation, so
 * this policy allowlists schemes instead of tolerating them:
 *
 *   same-site path (`/…`)      allowed — the ordinary internal link
 *   fragment (`#…`)            allowed — the ordinary in-page link
 *   relative reference         allowed — `./x`, `../x`, `x`, `?q=1` (no scheme ⇒
 *                              no execution)
 *   `https:` / `http:`         allowed — ordinary web destinations (plain `http`
 *                              is permitted: it cannot execute)
 *   `mailto:` / `tel:`         allowed — ordinary contact destinations
 *   everything else            REFUSED — `javascript:`, `vbscript:`, `data:`,
 *                              `file:`, `blob:`, `about:`, `chrome:`,
 *                              `view-source:`, protocol-relative `//host`, and
 *                              any unknown or future scheme
 *
 * ENCODING AND OBFUSCATION
 * ------------------------
 * An HTML parser decodes character references inside an attribute VALUE, so a
 * browser reads `href="jav&#x61;script:alert(1)"` as `javascript:alert(1)`.
 * Classification therefore happens on the DECODED value (numeric references,
 * decimal and hex, plus the few named references that matter for a scheme), and
 * the decoded form is what gets emitted — so a value can never be validated
 * differently from how it will be read.
 *
 * Anything that cannot be decoded stays LITERAL, which fails the scheme test
 * rather than passing it. A value that STILL CONTAINS a character reference after
 * one decode pass is REFUSED: a browser decodes an attribute value once, so
 * `&amp;#x6a;avascript:` would be read as `&#x6a;avascript:` and must never be
 * emitted as though it were an ordinary relative path. Control characters are
 * REFUSED rather than stripped (a browser strips ASCII tab/newline before parsing
 * a URL, so `java\tscript:` executes). Values that could break out of an
 * attribute (`<`, `>`, `"`, `'`, backtick, backslash), values containing
 * whitespace, and absurdly long values are refused too.
 *
 * This module is pure and framework-free: it classifies, it does not render.
 */

/** Destination schemes the authoring modes deliberately support. */
export const AUTHOR_ALLOWED_SCHEMES: readonly string[] = ["http", "https", "mailto", "tel"];

/** Schemes that must never reach a page, named separately so a refusal can say why. */
export const AUTHOR_EXECUTABLE_SCHEMES: readonly string[] = [
  "javascript",
  "vbscript",
  "data",
  "file",
  "blob",
  "about",
  "chrome",
  "view-source",
  "jar",
];

/** Why a destination was refused. Every one of these means "do not emit it". */
export type AuthorUrlRejection =
  | "empty"
  | "too-long"
  | "control-characters"
  | "whitespace"
  | "unrepresentable-characters"
  | "nested-characters"
  | "protocol-relative"
  | "executable-scheme"
  | "unsupported-scheme";

/** The verdict for one destination: the value to emit, or why it must not be emitted. */
export type AuthorUrlVerdict =
  | { readonly ok: true; readonly href: string }
  | { readonly ok: false; readonly reason: AuthorUrlRejection; readonly detail?: string };

/** The longest destination the authoring modes accept. */
const MAX_AUTHOR_URL_LENGTH = 2000;

/** Character references that matter when a scheme is being smuggled through one. */
const NAMED_REFERENCES: Readonly<Record<string, string>> = {
  Tab: "\t",
  NewLine: "\n",
  colon: ":",
  sol: "/",
  period: ".",
  semi: ";",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

const REFERENCE_SOURCE = String.raw`&(#(?:[0-9]+|[xX][0-9a-fA-F]+)|[A-Za-z][A-Za-z0-9]*);`;
/** Global, for decoding. */
const REFERENCE_PATTERN = new RegExp(REFERENCE_SOURCE, "g");
/** Non-global, for a stateless "does a reference remain?" test. */
const ANY_REFERENCE_PATTERN = new RegExp(REFERENCE_SOURCE);

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/;
const UNREPRESENTABLE_PATTERN = /[<>"'`\\]/;
const SCHEME_PATTERN = /^([A-Za-z][A-Za-z0-9+.-]*):/;

/**
 * Decode character references ONCE — the same number of passes a browser
 * performs. A double-encoded scheme therefore stays literal and fails
 * classification instead of executing.
 */
export function decodeAuthorReferences(value: string): string {
  return value.replace(REFERENCE_PATTERN, (match, body: string) => {
    if (body.startsWith("#")) {
      const hexadecimal = body[1] === "x" || body[1] === "X";
      const digits = hexadecimal ? body.slice(2) : body.slice(1);
      const code = Number.parseInt(digits, hexadecimal ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      // Surrogate code points are not characters.
      if (code >= 0xd800 && code <= 0xdfff) return match;
      return String.fromCodePoint(code);
    }
    return NAMED_REFERENCES[body] ?? match;
  });
}

/**
 * Classify one author-controlled destination. `ok: true` carries the DECODED,
 * trimmed href — the exact value that will be emitted, so validation and reading
 * can never diverge.
 */
export function classifyAuthorUrl(value: string): AuthorUrlVerdict {
  const decoded = decodeAuthorReferences(value.trim());

  if (decoded.length === 0) return { ok: false, reason: "empty" };
  if (decoded.length > MAX_AUTHOR_URL_LENGTH) return { ok: false, reason: "too-long" };
  if (CONTROL_CHARACTER_PATTERN.test(decoded)) return { ok: false, reason: "control-characters" };
  if (/\s/.test(decoded)) return { ok: false, reason: "whitespace" };
  if (UNREPRESENTABLE_PATTERN.test(decoded)) {
    return { ok: false, reason: "unrepresentable-characters" };
  }
  // A reference that survived the single decode pass would be decoded AGAIN by the
  // browser, so the value we validated is not the value a visitor would follow.
  // Refuse it rather than emit it.
  if (ANY_REFERENCE_PATTERN.test(decoded)) {
    return { ok: false, reason: "nested-characters" };
  }
  if (decoded.startsWith("//")) return { ok: false, reason: "protocol-relative" };

  const scheme = SCHEME_PATTERN.exec(decoded);
  if (scheme) {
    const name = scheme[1].toLowerCase();
    if (AUTHOR_EXECUTABLE_SCHEMES.includes(name)) {
      return { ok: false, reason: "executable-scheme", detail: name };
    }
    if (!AUTHOR_ALLOWED_SCHEMES.includes(name)) {
      return { ok: false, reason: "unsupported-scheme", detail: name };
    }
    return { ok: true, href: decoded };
  }

  // No scheme: a same-site path, a fragment or a relative reference. None of these
  // can execute.
  return { ok: true, href: decoded };
}

/** True when a destination may be emitted by an authoring mode. */
export function isSafeAuthorUrl(value: string): boolean {
  return classifyAuthorUrl(value).ok;
}

/**
 * The destination, or a build-time failure.
 *
 * Authored metadata is validated where it is READ, so a page that names an
 * impossible destination fails loudly and names itself — it never silently loses
 * the link, and never publishes something the author did not mean.
 */
export function requireSafeAuthorUrl(value: string, subject: string): string {
  const verdict = classifyAuthorUrl(value);
  if (verdict.ok) return verdict.href;
  const detail = verdict.detail ? ` ("${verdict.detail}")` : "";
  throw new Error(
    `Unsafe destination${detail} in ${subject}: "${value}" — ${verdict.reason}. ` +
      "An author-written page may link to a same-site path, a fragment, or a relative path, or use " +
      `${AUTHOR_ALLOWED_SCHEMES.join(", ")} — and nothing else.`,
  );
}
