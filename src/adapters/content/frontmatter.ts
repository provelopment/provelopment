/**
 * THE PAGE FRONTMATTER PARSER
 * ==========================
 *
 * Parses the OPTIONAL `---` block at the top of an authored page:
 *
 *     ---
 *     title: Opening hours
 *     description: When we are open, including public holidays.
 *     ---
 *
 * The syntax is deliberately minimal, because the Markdown authoring mode exposes
 * exactly two optional keys (`title`, `description`) and nothing else:
 *
 *   · `key: value` lines, where a value may be quoted text, `true`/`false`, or an
 *     integer — and quoted text is the ordinary way to write a title;
 *   · blank lines and `#` comments are ignored;
 *   · a key with no value is left unset (the page simply does not declare it).
 *
 * AMBIGUOUS INPUT FAILS LOUDLY, NAMING THE PAGE
 * --------------------------------------------
 * An indented line, a line that is not `key: value`, or a frontmatter block that did
 * not open with `---` is a build-time error naming the page. Nested structures are
 * not supported — deliberately: the moment a page needs structured data, that is the
 * declarative JSON authoring mode's job, not a richer Markdown. Which keys a page may
 * use is enforced by its reader (`./authoring-page`), so an unsupported key is
 * reported there rather than silently kept.
 */

/** A page's parsed frontmatter: its declared values, and the body that follows. */
export interface ParsedFrontmatter {
  /** Parsed key/value pairs from the `---` block. */
  readonly values: Readonly<Record<string, unknown>>;
  /** Markdown body after the closing `---`. */
  readonly body: string;
}

const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/;

/** Top-level frontmatter key (letters, digits, `_`, `-`). */
const keyPattern = /^([A-Za-z0-9_-]+):\s*(.*)$/;

/**
 * True when a file opens with a `---` frontmatter block.
 *
 * The Markdown authoring mode uses this to keep frontmatter OPTIONAL: a file that is
 * nothing but prose is a complete page.
 */
export function hasFrontmatter(raw: string): boolean {
  return frontmatterPattern.test(raw);
}

/** A quoted string loses its quotes; booleans and integers are recognised; else text. */
function parseScalar(value: string): string | boolean | number {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  return value;
}

/**
 * One page's frontmatter block → its declared values.
 *
 * `page` is the page's route path, used only to name the file in an error message, so
 * an author is told exactly which page to fix.
 */
export function parseFrontmatter(raw: string, page: string): ParsedFrontmatter {
  const match = frontmatterPattern.exec(raw);

  if (!match) {
    throw new Error(`Missing frontmatter in page "${page}"`);
  }

  const [, frontmatter, body] = match;
  const values: Record<string, unknown> = {};

  for (const line of frontmatter.split(/\r?\n/)) {
    if (line.trim().length === 0 || line.trim().startsWith("#")) continue;

    if (line.startsWith(" ")) {
      throw new Error(
        `Unexpected indented line in the frontmatter of page "${page}": "${line.trim()}". ` +
          "A page's frontmatter holds simple \"key: value\" entries only; structured data " +
          "belongs in a declarative JSON page.",
      );
    }

    const entry = keyPattern.exec(line);
    if (!entry) {
      throw new Error(
        `Unsupported frontmatter line in page "${page}": "${line.trim()}". ` +
          'Expected "key: value" entries.',
      );
    }

    const [, key, rawValue] = entry;
    const value = rawValue.trim();
    // A key with no value is simply not declared by the page.
    if (value.length === 0) continue;
    values[key as string] = parseScalar(value);
  }

  return { values, body };
}
