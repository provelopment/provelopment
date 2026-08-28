import type { Locale } from "@/core/locale";
import type { PageContent } from "@/core/page-content";
import type { OfferingsContent } from "@/core/offerings";

const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/;

/**
 * Parses a Markdown file's `---` frontmatter block.
 *
 * The frontmatter syntax is intentionally minimal (a small YAML-ish subset):
 * `key: value` lines, where values may be quoted strings, booleans, or
 * integers. Unknown keys are preserved (plug-in friendly) and ignored by the
 * parsers that consume them.
 */
export interface ParsedFrontmatter {
  /** Parsed key/value pairs from the `---` block. */
  readonly values: Readonly<Record<string, unknown>>;
  /** Markdown body after the closing `---`. */
  readonly body: string;
}

export function parseFrontmatter(raw: string, slug: string): ParsedFrontmatter {
  const match = frontmatterPattern.exec(raw);

  if (!match) {
    throw new Error(`Missing frontmatter in content file "${slug}"`);
  }

  const [, frontmatter, body] = match;
  const values: Record<string, unknown> = {};

  for (const line of frontmatter.split(/\r?\n/)) {
    const entry = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!entry) continue;
    const value = entry[2].trim();
    if (value.length === 0) continue;
    values[entry[1]] = parseScalar(value);
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

export function parseOfferingsFile(raw: string, slug: string, locale: Locale): OfferingsContent {
  const { values, body } = parseFrontmatter(raw, slug);
  const title = requiredString(values, "title", slug);
  const blurb = requiredString(values, "blurb", slug);

  const order = typeof values.order === "number" ? values.order : undefined;
  const featured = typeof values.featured === "boolean" ? values.featured : undefined;
  const price = typeof values.price === "string" ? values.price.trim() : undefined;
  const image = typeof values.image === "string" ? values.image.trim() : undefined;

  return { slug, locale, title, blurb, body, order, featured, price, image };
}