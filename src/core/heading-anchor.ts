/**
 * HEADING FRAGMENTS FOR AUTHORED MARKDOWN
 * ======================================
 *
 * An author writing a page may link to a section of it:
 *
 *     See [Opening hours](#opening-hours) below.
 *     …
 *     ## Opening hours
 *
 * That only works if the heading has a target to jump to, and an author cannot
 * write one: raw HTML is inert in the Markdown mode, and the authoring allowlist
 * has no author-settable attribute. So the RENDERER generates heading ids, and this
 * module is the rule it follows — pure, deterministic and framework-free, so the
 * same heading text always produces the same fragment on every build and on every
 * platform.
 *
 * THE RULE (documented for authors in `content/pages/markdown/README.md`)
 * --------------------------------------------------------------------
 *   1. take the heading's plain text (inline markup flattened, an image
 *      contributes its alt text, typed markup characters contribute themselves);
 *   2. ignore accents and letter case — `Café Hours` and `CAFE HOURS` both become
 *      `cafe-hours` — while keeping non-Latin letters as they are (a Japanese
 *      heading keeps its own characters, and the link `#私たちについて` works);
 *   3. keep letters, digits and hyphens: punctuation is dropped, and runs of spaces
 *      or hyphens collapse into a single `-`;
 *   4. truncate to a fixed maximum, never ending on a hyphen;
 *   5. if nothing usable remains, the heading is `section`;
 *   6. a REPEATED heading is disambiguated with `-2`, `-3`, … in document order, and
 *      allocation never collides with an id already used in the same document.
 *
 * Determinism is the point: the id is a PUBLIC contract an author links to, so it
 * is derived only from the heading text and its position, never from a clock, a
 * random value, the surrounding page or the rendering environment.
 *
 * SAFETY
 * ------
 * The produced id contains only letters, digits and hyphens (`HEADING_ANCHOR_PATTERN`),
 * so it can never carry a quote, an angle bracket, a space or an event-handler
 * attribute — the renderer escapes it as well, and the sanitiser re-checks the
 * shape. The id is also never influenced by raw author HTML except as TEXT: typing
 * `<h2 id="x">` in a page yields no element and no id (see
 * `@/adapters/markdown/safe-markdown`).
 */

/** Longest id the rule can produce, including any `-2`/`-3` disambiguator. */
export const HEADING_ANCHOR_MAX_LENGTH = 80;

/** The exact shape a generated heading anchor has: letters, digits, single hyphens. */
export const HEADING_ANCHOR_PATTERN = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;

/** The id a heading whose text yields nothing usable receives. */
export const HEADING_ANCHOR_FALLBACK = "section";

/** Combining marks left behind by NFKD decomposition (`é` → `e` + U+0301). */
const COMBINING_MARKS = /[\u0300-\u036f]/g;
/** Everything that is not a letter, a digit, whitespace or a hyphen. */
const NOT_ANCHOR_TEXT = /[^\p{L}\p{N}\s-]/gu;
/** Runs of whitespace and hyphens, which become ONE hyphen. */
const ANCHOR_SEPARATOR = /[\s-]+/g;
/** Hyphens at either end, which are never part of an anchor. */
const LEADING_OR_TRAILING_HYPHENS = /^-+|-+$/g;

/**
 * The deterministic fragment id for one heading's plain text.
 *
 * This is the DOCUMENTED rule above, steps 2–5; uniqueness (step 6) is the
 * allocator's job, because it depends on the other headings in the same document.
 */
export function headingAnchorSlug(text: string): string {
  const slug = String(text ?? "")
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(NOT_ANCHOR_TEXT, "")
    .replace(ANCHOR_SEPARATOR, "-")
    .replace(LEADING_OR_TRAILING_HYPHENS, "")
    .slice(0, HEADING_ANCHOR_MAX_LENGTH)
    .replace(LEADING_OR_TRAILING_HYPHENS, "");

  return slug.length > 0 ? slug : HEADING_ANCHOR_FALLBACK;
}

/** Allocates the heading anchors of ONE document, in document order. */
export type HeadingAnchorAllocator = (headingText: string) => string;

/**
 * An allocator for one document: it returns the slug for a heading's text, adding
 * the smallest `-2`, `-3`, … suffix that is still free.
 *
 * Two properties matter and are both asserted:
 *   · UNIQUE within the document — including against an id a LATER heading would
 *     otherwise have claimed naturally (`A`, `A 2`, `A` must not produce two
 *     `a-2`s), so allocation checks every id already emitted, not just the base slug;
 *   · DETERMINISTIC — the same document always yields the same ids, because the
 *     allocator is driven only by document order.
 *
 * One allocator belongs to exactly one rendered document, which is why the renderer
 * creates a fresh one per page (`@/adapters/markdown/safe-markdown`).
 */
export function createHeadingAnchors(): HeadingAnchorAllocator {
  const used = new Set<string>();

  return (headingText: string): string => {
    const base = headingAnchorSlug(headingText);
    let candidate = base;
    let ordinal = 2;

    while (used.has(candidate)) {
      const suffix = `-${ordinal}`;
      // Shorten the base when the suffix would push the id past the maximum, and
      // never let the truncation leave a trailing hyphen.
      const stem = base
        .slice(0, Math.max(HEADING_ANCHOR_MAX_LENGTH - suffix.length, 0))
        .replace(LEADING_OR_TRAILING_HYPHENS, "");
      candidate = `${stem}${suffix}`;
      ordinal += 1;
    }

    used.add(candidate);
    return candidate;
  };
}

/** True when an id is one this rule could have generated. */
export function isHeadingAnchor(id: string): boolean {
  return id.length <= HEADING_ANCHOR_MAX_LENGTH && HEADING_ANCHOR_PATTERN.test(id);
}
