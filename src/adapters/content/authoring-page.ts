/**
 * THE AUTHORING PAGE READER — PLAIN MARKDOWN IS ENOUGH
 * ===================================================
 *
 * Reads one `content/pages/markdown/<locale>/<slug>.md` file into a page. It is
 * deliberately the OPPOSITE of the collection parser in one respect: **frontmatter
 * is OPTIONAL**. An author writes a paragraph, or a `# Heading` and a paragraph, and
 * that is a page. Nothing has to be remembered, and nothing has to be looked up.
 *
 * WHERE THE TITLE COMES FROM (in order)
 * -------------------------------------
 *   1. `title:` — if the author supplied it, it wins;
 *   2. the page's first level-one heading (`# Heading`) — the ordinary Markdown
 *      way to name a page;
 *   3. a readable title derived from the filename, so a page is never nameless.
 *
 * The source that answered is reported (`titleSource`), so a caller can tell an
 * authored title from a derived one — and a test can prove the order holds.
 *
 * WHAT IS OPTIONAL, AND WHAT IS NOT INVENTED
 * ------------------------------------------
 *   `description:`  an author-supplied search/social summary. When it is absent
 *                   the page keeps the site's own metadata fallback; this reader
 *                   does NOT invent SEO prose out of the page's text.
 *   `actions:`      an OPTIONAL labelled pair of closing links — one or two, each a
 *                   `label` and an `href`. A page that never leaves Markdown simply
 *                   writes ordinary links in the body; an author-declared action pair
 *                   is a labelling decision, and its destinations are classified by
 *                   `@/core/safe-url`, so an unsafe one FAILS the build rather than
 *                   being dropped silently.
 *
 * There are no secret Markdown commands: no shortcodes, no directives, no
 * embedded JSON, no magic comments, no pseudo-components. An ordinary link in the
 * body IS the way to link.
 *
 * FAIL LOUDLY, NEVER SILENTLY
 * ---------------------------
 * An unsupported metadata key or a wrong type FAILS, naming the file: a typo must
 * be reported, never ignored.
 */
import type { Locale } from "@/core/locale";
import { isPageRoutePath, pageRouteLeaf } from "@/core/page-route-path";
import type { PageAction } from "@/core/page-document";
import { PAGE_MAX_LABEL } from "@/core/page-document";
import type { PageContent } from "@/core/page-content";
import { requireSafeAuthorUrl } from "@/core/safe-url";
import { hasFrontmatter, parseFrontmatter } from "./frontmatter";

/** The metadata keys the Markdown authoring mode supports. None of them is required. */
export const AUTHORING_METADATA_KEYS = ["title", "description", "actions"] as const;

/**
 * How many closing actions a page may declare.
 *
 * TWO, because the pair is a presentation fact the platform owns: a primary action and
 * a secondary one, in the order the author wrote them. A third would be a menu, and a
 * menu is a body link or a page of its own.
 */
export const AUTHORING_MAX_ACTIONS = 2;

/** Where a page's title came from. */
export type AuthoringTitleSource = "metadata" | "heading" | "route-path";

/**
 * One authored page, ready to be resolved and rendered.
 */
export interface AuthoringPage extends PageContent {
  /** Which rule produced the title. */
  readonly titleSource: AuthoringTitleSource;
  /**
   * The author-declared closing action pair, in the author's order.
   *
   * Absent means the page declares none — which is the ordinary case, and it renders
   * exactly as every authored page has always rendered: a title and a body.
   */
  readonly actions?: readonly PageAction[];
}

/**
 * The optional `actions:` pair the author declared.
 *
 * ONE OR TWO items, each carrying `label` and `href` and NOTHING else, and every
 * destination classified by the safe-URL policy — an unsafe one fails the build rather
 * than being dropped silently, because an author must be told what is wrong with their
 * page. The order is the author's: the first action reads as the page's primary action
 * and the second as its secondary one, which is a presentation decision the platform
 * makes once (the same pair an authored page renders anywhere in the platform).
 */
function metadataActionsOf(
  values: Readonly<Record<string, unknown>>,
  routePath: string,
): readonly PageAction[] | undefined {
  const raw = values.actions;
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > AUTHORING_MAX_ACTIONS) {
    throw new Error(
      `Invalid "actions" in authored page "${routePath}": expected one or two items, ` +
        `and ${Array.isArray(raw) ? raw.length : 0} were declared.`,
    );
  }

  return raw.map((entry, index) => {
    const subject = `"actions" item ${index + 1} of authored page "${routePath}"`;
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Invalid ${subject}: expected "label" and "href" fields.`);
    }
    const fields = entry as Readonly<Record<string, unknown>>;
    const unknown = Object.keys(fields).filter((field) => field !== "label" && field !== "href");
    if (unknown.length > 0) {
      throw new Error(`Invalid ${subject}: unexpected field "${unknown[0]}".`);
    }

    const label = fields.label;
    const href = fields.href;
    if (typeof label !== "string" || label.trim().length === 0) {
      throw new Error(`Invalid ${subject}: "label" must be non-empty text.`);
    }
    if (label.trim().length > PAGE_MAX_LABEL) {
      throw new Error(`Invalid ${subject}: "label" must be at most ${PAGE_MAX_LABEL} characters.`);
    }
    if (typeof href !== "string") {
      throw new Error(`Invalid ${subject}: "href" must be text.`);
    }

    return {
      label: label.trim(),
      href: requireSafeAuthorUrl(href.trim(), subject),
      variant: index === 0 ? "primary" : "secondary",
    } satisfies PageAction;
  });
}

/**
 * The last segment of a nested page, made readable:
 * `make-your-own-business` → `Make your own business`, and
 * `offerings/website-design` → `Website design`.
 *
 * The page's OWN name decides the title, not the folder it lives in, so a nested
 * page is never named after its section. Sentence case, matching the site's voice.
 */
export function authoringTitleFromRoutePath(routePath: string): string {
  const leaf = pageRouteLeaf(routePath);
  if (leaf.length === 0) {
    throw new Error(
      `"${routePath}" is not a usable page route path (lowercase words joined by hyphens, ` +
        "folders allowed).",
    );
  }
  const words = leaf.split("-");
  return words.join(" ").replace(/^./, (character) => character.toUpperCase());
}

/** The first `# Heading` in the body, or null. Fenced code is ignored. */
function firstHeadingTitle(body: string): string | null {
  let insideFence = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) continue;
    const match = /^#\s+(.+?)\s*$/.exec(line);
    if (match) {
      const heading = match[1].replace(/#+\s*$/, "").trim();
      if (heading.length > 0) return heading;
    }
  }
  return null;
}

/** The optional `title:` value. */
function metadataTitleOf(values: Readonly<Record<string, unknown>>, routePath: string): string | null {
  const raw = values.title;
  if (raw === undefined) return null;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error(`Invalid "title" in authored page "${routePath}": expected non-empty text.`);
  }
  return raw.trim();
}

/** The optional `description:` value. Absent is valid — the site's fallback then applies. */
function metadataDescriptionOf(
  values: Readonly<Record<string, unknown>>,
  routePath: string,
): string | undefined {
  const raw = values.description;
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") {
    throw new Error(`Invalid "description" in authored page "${routePath}": expected text.`);
  }
  const description = raw.trim();
  return description.length > 0 ? description : undefined;
}

/** Metadata this mode does not support is an error — a typo must be reported, never ignored. */
function assertSupportedMetadata(values: Readonly<Record<string, unknown>>, routePath: string): void {
  const unsupported = Object.keys(values).filter(
    (key) => !(AUTHORING_METADATA_KEYS as readonly string[]).includes(key),
  );
  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported metadata "${unsupported[0]}" in authored page "${routePath}": ` +
        `the supported keys are ${AUTHORING_METADATA_KEYS.join(", ")} — and none of them is required.`,
    );
  }
}

/**
 * One authored Markdown file → one page. Frontmatter is optional; a file that is
 * nothing but prose is a complete page, and its title comes from its own heading
 * or its own filename.
 *
 * `routePath` may include folders (`offerings/website-design`); it is the page's
 * identity, and the derived-title fallback uses its last segment.
 */
export function parseAuthoringPageFile(raw: string, routePath: string, locale: Locale): AuthoringPage {
  if (!isPageRoutePath(routePath)) {
    throw new Error(
      `"${routePath}" is not a usable page route path (lowercase words joined by hyphens, ` +
        "folders allowed).",
    );
  }
  const parsed = hasFrontmatter(raw) ? parseFrontmatter(raw, routePath) : { values: {}, body: raw };
  assertSupportedMetadata(parsed.values, routePath);

  const metadataTitle = metadataTitleOf(parsed.values, routePath);
  const headingTitle = metadataTitle === null ? firstHeadingTitle(parsed.body) : null;
  const title = metadataTitle ?? headingTitle ?? authoringTitleFromRoutePath(routePath);
  const titleSource: AuthoringTitleSource = metadataTitle !== null
    ? "metadata"
    : headingTitle !== null
      ? "heading"
      : "route-path";

  const description = metadataDescriptionOf(parsed.values, routePath);
  const actions = metadataActionsOf(parsed.values, routePath);

  return {
    routePath,
    locale,
    title,
    titleSource,
    body: parsed.body,
    ...(description === undefined ? {} : { description }),
    ...(actions === undefined ? {} : { actions }),
  };
}
