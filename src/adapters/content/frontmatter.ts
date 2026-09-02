import type { Locale } from "@/core/locale";
import type { PageContent } from "@/core/page-content";
import type { OfferingAction, OfferingsContent } from "@/core/offerings";

const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/;

/**
 * Parses a Markdown file's `---` frontmatter block.
 *
 * The frontmatter syntax is intentionally minimal (a small YAML-ish subset):
 * `key: value` lines, where values may be quoted strings, booleans, or
 * integers. Unknown keys are preserved (plug-in friendly) and ignored by the
 * parsers that consume them.
 *
 * Phase C adds three CONSTRAINED structured forms (no general-purpose YAML):
 *
 *   - string lists   `key:` then `  - "item"` lines;
 *   - object lists   `faq:` then `  - question: "Q"` items with continuation
 *                     `    answer: "A"` fields (two-space nesting per level);
 *   - a fixed object `action:` with `  intent: ...` scalar fields.
 *
 * Anything outside this subset (deeper nesting, mixed list styles, empty
 * blocks, indented lines without a `key:` header) is rejected with a build-time
 * error naming the offending file and field — ambiguous content must fail
 * loudly, never silently misparse.
 */
export interface ParsedFrontmatter {
  /** Parsed key/value pairs from the `---` block. */
  readonly values: Readonly<Record<string, unknown>>;
  /** Markdown body after the closing `---`. */
  readonly body: string;
}

/** Top-level frontmatter key (letters, digits, `_`, `-`). */
const keyPattern = /^([A-Za-z0-9_-]+):\s*(.*)$/;

/** Index of the next non-empty, non-comment line at or after `start`, or null. */
function nextContentLine(lines: readonly string[], start: number): number | null {
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim().length === 0 || line.trim().startsWith("#")) continue;
    return i;
  }
  return null;
}

function unsupportedBlockError(slug: string, key: string, detail: string): Error {
  return new Error(`Invalid frontmatter in content file "${slug}": ${detail} (under "${key}").`);
}

/**
 * Parses a blocked list (`key:` followed by `  - …` items). Two item styles are
 * supported and must not be mixed: string items (`  - "value"`) and object
 * items (`  - question: "Q"` with `    answer: "A"` continuation fields).
 */
function parseBlockList(
  lines: readonly string[],
  start: number,
  slug: string,
  key: string,
): { value: readonly unknown[]; next: number } {
  const items: unknown[] = [];
  let kind: "scalar" | "object" | null = null;
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().length === 0 || line.trim().startsWith("#")) {
      i += 1;
      continue;
    }

    const dash = /^  -(?: (.*))?$/.exec(line);
    if (!dash) break;

    i += 1;
    const rest = (dash[1] ?? "").trim();
    if (rest.length === 0) {
      throw unsupportedBlockError(slug, key, "empty list item");
    }

    const objectEntry = keyPattern.exec(rest);
    if (objectEntry) {
      if (kind === "scalar") {
        throw unsupportedBlockError(slug, key, "string items and keyed items cannot be mixed in one list");
      }
      kind = "object";

      const item: Record<string, unknown> = {};
      const firstKey = objectEntry[1];
      const firstValue = objectEntry[2].trim();
      if (firstValue.length === 0) {
        throw unsupportedBlockError(slug, key, `nested blocks are not supported (item "${firstKey}")`);
      }
      item[firstKey] = parseScalar(firstValue);

      while (i < lines.length) {
        const fieldLine = lines[i];
        if (fieldLine.trim().length === 0 || fieldLine.trim().startsWith("#")) {
          i += 1;
          continue;
        }
        const field = /^    ([A-Za-z0-9_-]+):\s*(.*)$/.exec(fieldLine);
        if (!field) break;
        i += 1;
        const fieldValue = field[2].trim();
        if (fieldValue.length === 0) {
          throw unsupportedBlockError(slug, key, `nested blocks are not supported (field "${field[1]}")`);
        }
        item[field[1]] = parseScalar(fieldValue);
      }

      items.push(item);
    } else {
      if (kind === "object") {
        throw unsupportedBlockError(slug, key, "string items and keyed items cannot be mixed in one list");
      }
      kind = "scalar";
      items.push(parseScalar(rest));
    }
  }

  if (items.length === 0) {
    throw unsupportedBlockError(slug, key, "empty list");
  }

  return { value: items, next: i };
}

/** Parses a blocked object (`key:` followed by `  field: value` lines). */
function parseBlockObject(
  lines: readonly string[],
  start: number,
  slug: string,
  key: string,
): { value: Record<string, unknown>; next: number } {
  const obj: Record<string, unknown> = {};
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().length === 0 || line.trim().startsWith("#")) {
      i += 1;
      continue;
    }
    const field = /^  ([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!field) break;
    i += 1;

    const value = field[2].trim();
    if (value.length === 0) {
      throw unsupportedBlockError(slug, key, `nested blocks are not supported (field "${field[1]}")`);
    }
    obj[field[1]] = parseScalar(value);
  }

  if (Object.keys(obj).length === 0) {
    throw unsupportedBlockError(slug, key, "empty block");
  }

  return { value: obj, next: i };
}

export function parseFrontmatter(raw: string, slug: string): ParsedFrontmatter {
  const match = frontmatterPattern.exec(raw);

  if (!match) {
    throw new Error(`Missing frontmatter in content file "${slug}"`);
  }

  const [, frontmatter, body] = match;
  const values: Record<string, unknown> = {};
  const lines = frontmatter.split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    i += 1;

    if (line.trim().length === 0 || line.trim().startsWith("#")) continue;

    if (line.startsWith(" ")) {
      throw new Error(
        `Unexpected indented line in frontmatter of content file "${slug}": "${line.trim()}". ` +
          'Indented content must follow a "key:" line as a list or keyed block.',
      );
    }

    const entry = keyPattern.exec(line);
    if (!entry) {
      throw new Error(
        `Unsupported frontmatter line in content file "${slug}": "${line.trim()}". ` +
          'Expected "key: value" entries.',
      );
    }

    const key = entry[1];
    const rawValue = entry[2].trim();

    if (rawValue.length > 0) {
      values[key] = parseScalar(rawValue);
      continue;
    }

    // A key with no value starts a block (list/object) ONLY when the next
    // content line is indented; otherwise it is treated as having no value
    // (back-compatible with the pre-Phase-C scalar-only parser).
    const next = nextContentLine(lines, i);
    if (next === null) continue;

    if (lines[next].startsWith("  - ")) {
      const block = parseBlockList(lines, i, slug, key);
      values[key] = block.value;
      i = block.next;
    } else if (/^  [A-Za-z0-9_-]+:/.test(lines[next])) {
      const block = parseBlockObject(lines, i, slug, key);
      values[key] = block.value;
      i = block.next;
    }
    // else: no block body — leave the key unset (matches pre-C behavior).
  }

  return { values, body };
}

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

function requiredString(values: Readonly<Record<string, unknown>>, key: string, slug: string): string {
  const value = values[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${key} in frontmatter of content file "${slug}"`);
  }
  return value.trim();
}

export function parsePageFile(raw: string, slug: string, locale: Locale): PageContent {
  const { values, body } = parseFrontmatter(raw, slug);
  return {
    slug,
    locale,
    title: requiredString(values, "title", slug),
    body,
  };
}

/** True for an absolute/deep link (`https:`, `mailto:`, `viber:`, …) — syntactic validation only. */
function isDeepLinkOrRoute(href: string): boolean {
  return href.startsWith("/") || /^[a-z]+:/i.test(href);
}

/** Parses + strictly validates the optional `action` block. */
function parseAction(values: Readonly<Record<string, unknown>>, slug: string): OfferingAction | undefined {
  if (values.action === undefined) return undefined;

  const raw = values.action;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`Invalid "action" in content file "${slug}": expected a keyed block (intent/label/href).`);
  }

  const record = raw as Readonly<Record<string, unknown>>;
  const intent = record.intent;
  if (intent !== "book" && intent !== "contact" && intent !== "external") {
    throw new Error(
      `Invalid "action.intent" in content file "${slug}": must be "book", "contact", or "external".`,
    );
  }

  const href =
    typeof record.href === "string" && record.href.trim().length > 0 ? record.href.trim() : undefined;

  if (intent === "external") {
    if (!href) {
      throw new Error(
        `Invalid "action.href" in content file "${slug}": intent "external" requires a non-empty href.`,
      );
    }
    if (!isDeepLinkOrRoute(href)) {
      throw new Error(
        `Invalid "action.href" in content file "${slug}": "${href}" must be an internal route ("/...") ` +
          'or an absolute/deep link ("https:", "mailto:", "viber:", …).',
      );
    }
  } else if (href) {
    throw new Error(
      `Invalid "action.href" in content file "${slug}": intent "${intent}" must not define its own href ` +
        "(the platform resolves that destination).",
    );
  }

  const label =
    typeof record.label === "string" && record.label.trim().length > 0 ? record.label.trim() : undefined;

  return { intent, ...(href ? { href } : {}), ...(label ? { label } : {}) };
}

export function parseOfferingsFile(raw: string, slug: string, locale: Locale): OfferingsContent {
  const { values, body } = parseFrontmatter(raw, slug);
  const title = requiredString(values, "title", slug);
  const blurb = requiredString(values, "blurb", slug);

  const order = typeof values.order === "number" ? values.order : undefined;
  const featured = typeof values.featured === "boolean" ? values.featured : undefined;
  const price = typeof values.price === "string" ? values.price.trim() : undefined;
  const image = typeof values.image === "string" ? values.image.trim() : undefined;

  let deliverables: readonly string[] | undefined;
  if (values.deliverables !== undefined) {
    const rawDeliverables = values.deliverables;
    if (
      !Array.isArray(rawDeliverables) ||
      rawDeliverables.some((item) => typeof item !== "string" || item.trim().length === 0)
    ) {
      throw new Error(
        `Invalid "deliverables" in content file "${slug}": expected a list of non-empty strings.`,
      );
    }
    deliverables = rawDeliverables.map((item) => (item as string).trim());
  }

  let faq: readonly { question: string; answer: string }[] | undefined;
  if (values.faq !== undefined) {
    const rawFaq = values.faq;
    if (!Array.isArray(rawFaq)) {
      throw new Error(`Invalid "faq" in content file "${slug}": expected a list of question/answer items.`);
    }
    faq = rawFaq.map((item, index) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        throw new Error(`Invalid "faq" item #${index + 1} in content file "${slug}": expected a keyed block.`);
      }
      const record = item as Readonly<Record<string, unknown>>;
      const question = typeof record.question === "string" ? record.question.trim() : "";
      const answer = typeof record.answer === "string" ? record.answer.trim() : "";
      if (question.length === 0 || answer.length === 0) {
        throw new Error(
          `Invalid "faq" item #${index + 1} in content file "${slug}": "question" and "answer" are required.`,
        );
      }
      return { question, answer };
    });
  }

  const action = parseAction(values, slug);

  return { slug, locale, title, blurb, body, order, featured, price, image, deliverables, faq, action };
}