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
 * exactly three optional keys (`title`, `description`, `actions`) and nothing else:
 *
 *   · `key: value` lines, where a value may be quoted text, `true`/`false`, or an
 *     integer — and quoted text is the ordinary way to write a title;
 *   · blank lines and `#` comments are ignored;
 *   · a key with no value is left unset (the page simply does not declare it) — unless
 *     it is followed by the ONE constrained block list below;
 *   · a BLOCK LIST: `key:` with no value, then `  - field: value` items with
 *     `    field: value` continuation lines. This is how `actions:` declares its
 *     labelled links, and it is the only structured form this mode accepts.
 *
 * AMBIGUOUS INPUT FAILS LOUDLY, NAMING THE PAGE
 * --------------------------------------------
 * An indented line that belongs to no block list, a line that is not `key: value`, or a
 * frontmatter block that did not open with `---` is a build-time error naming the page.
 * Anything deeper than the one block-list form is not supported — deliberately: the
 * moment a page needs more structure than that, it is the declarative JSON authoring
 * mode's job, not a richer Markdown. Which keys a page may use is enforced by its
 * reader (`./authoring-page`), so an unsupported key is reported there rather than
 * silently kept.
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
 * A BLOCK-LIST ITEM: exactly two spaces, a dash, and the item's inline remainder.
 *
 * The indentation is part of the syntax, not a style: it is what makes an item a child
 * of the key above it and what keeps the form unambiguous. A dash indented by anything
 * else is refused rather than guessed at.
 */
const blockItemPattern = /^ {2}-(?: (.*))?$/;

/** A keyed item's continuation FIELD: exactly four spaces, then `key: value`. */
const blockFieldPattern = /^ {4}([A-Za-z0-9_-]+):\s*(.*)$/;

/** A block-list problem, naming the page and the key the list belongs to. */
function blockListError(page: string, key: string, detail: string): Error {
  return new Error(`Invalid frontmatter in page "${page}": ${detail} (under "${key}").`);
}

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

/** One field inside a keyed item: its value may not be empty. */
function parseField(
  page: string,
  key: string,
  field: string,
  rawValue: string,
): string | boolean | number {
  const value = rawValue.trim();
  if (value.length === 0) {
    throw blockListError(page, key, `"${field}" is declared with no value`);
  }
  return parseScalar(value);
}

/**
 * THE ONE CONSTRAINED BLOCK LIST a page's frontmatter may carry.
 *
 *     actions:
 *       - label: Services
 *         href: /en/services
 *       - label: See examples
 *         href: /en/examples
 *
 * `key:` with NO value followed by `  - field: value` items, each with zero or more
 * `    field: value` continuation lines. This is the same deliberately small subset the
 * reference platform's authoring path accepts (two spaces of nesting per level, no
 * general-purpose YAML), and it exists for exactly ONE reason: an author-declared pair
 * of closing links is a labelled structure, and a page that needs MORE structure than
 * this belongs in a declarative JSON page.
 *
 * WHAT IS REFUSED, LOUDLY, NAMING THE PAGE
 * ----------------------------------------
 *   · an item that is only `-` (an empty item);
 *   · an item that is a PLAIN value (`- "Services"`) rather than a `field: value` pair —
 *     a list of loose labels is not a form this platform's pages declare;
 *   · a field declared with no value;
 *   · any indentation other than the two declared levels, or a line that is not
 *     `field: value` — which ENDS the list, so the caller's ordinary rules report it
 *     (an indented line that belongs to no list, or an unsupported line).
 *
 * Returns `null` when the key carries no block list at all — the next content line is
 * not an item — because `key:` with no value is an ordinary, meaningful state: the page
 * simply does not declare that key.
 */
function blockListAt(
  lines: readonly string[],
  start: number,
  page: string,
  key: string,
): { readonly items: readonly Readonly<Record<string, unknown>>[]; readonly next: number } | null {
  let i = start;
  while (i < lines.length && (lines[i].trim().length === 0 || lines[i].trim().startsWith("#"))) {
    i += 1;
  }
  if (i >= lines.length || blockItemPattern.exec(lines[i]) === null) return null;

  const items: Record<string, unknown>[] = [];
  while (i < lines.length) {
    const line = lines[i] as string;
    if (line.trim().length === 0 || line.trim().startsWith("#")) {
      i += 1;
      continue;
    }

    const item = blockItemPattern.exec(line);
    if (item === null) break;

    const remainder = (item[1] ?? "").trim();
    if (remainder.length === 0) {
      throw blockListError(page, key, 'an item is empty (a line that is only "-")');
    }

    const first = keyPattern.exec(remainder);
    if (first === null) {
      throw blockListError(
        page,
        key,
        `the item "${remainder}" is a plain value; an item is a "field: value" pair`,
      );
    }

    const name = first[1] as string;
    const fields: Record<string, unknown> = {};
    fields[name] = parseField(page, key, name, first[2] as string);
    i += 1;

    while (i < lines.length) {
      const continuation = lines[i] as string;
      if (continuation.trim().length === 0 || continuation.trim().startsWith("#")) {
        i += 1;
        continue;
      }
      const field = blockFieldPattern.exec(continuation);
      if (field === null) break;
      const fieldName = field[1] as string;
      fields[fieldName] = parseField(page, key, fieldName, field[2] as string);
      i += 1;
    }

    items.push(fields);
  }

  return { items, next: i };
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
  const lines = frontmatter.split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] as string;
    if (line.trim().length === 0 || line.trim().startsWith("#")) {
      i += 1;
      continue;
    }

    if (line.startsWith(" ") || line.startsWith("\t")) {
      throw new Error(
        `Unexpected indented line in the frontmatter of page "${page}": "${line.trim()}". ` +
          "A page's frontmatter holds \"key: value\" entries, and a key with no value may carry " +
          "one block list of \"- field: value\" items; anything deeper belongs in a declarative " +
          "JSON page.",
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
    const value = (rawValue as string).trim();

    // A key with no value either carries a block list, or is simply not declared by the page.
    if (value.length === 0) {
      const list = blockListAt(lines, i + 1, page, key as string);
      if (list !== null) {
        values[key as string] = list.items;
        i = list.next;
        continue;
      }
      i += 1;
      continue;
    }

    values[key as string] = parseScalar(value);
    i += 1;
  }

  return { values, body };
}
