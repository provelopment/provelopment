/**
 * THE SAFE MARKDOWN AUTHORING PRIMITIVE
 * ====================================
 *
 * Turns author-written Markdown into HTML that CANNOT carry active web behaviour.
 * This is the primitive the `content/pages/markdown` authoring mode renders through;
 * it is deliberately NOT the renderer the trusted content collections use
 * (`src/components/site/markdown-content.tsx`), which passes raw HTML through
 * because those files are reviewed like source code and are never page sources.
 *
 * TWO INDEPENDENT LAYERS
 * ----------------------
 *   layer 1 — PARSE-TIME POLICY (`AuthoringRenderer`)
 *     · raw HTML is NOT passed through: `html` tokens become INERT TEXT (visible,
 *       escaped), so `<script>`, `<iframe>`, `<div onclick=…>`, `<style>`,
 *       `<form>`, `<object>` … are shown as the words the author typed and never
 *       become markup;
 *     · every text/codespan/fence body is escaped here rather than trusted from
 *       the token;
 *     · every destination (link, image) is classified by `@/core/safe-url` — an
 *       unsafe one is DROPPED (a link keeps its words and loses its destination;
 *       an image becomes its alt text), so the path fails closed instead of
 *       emitting something executable;
 *     · the only class a page can set is a fenced code block's language,
 *       shape-checked.
 *   layer 2 — SANITISATION OF THE GENERATED HTML
 *     · the HTML layer 1 produced is re-parsed (`sanitize-html`, htmlparser2)
 *       against the SAME narrow allowlist (`@/core/markdown-policy`), with
 *       protocol-relative URLs off and unknown schemes stripped. This layer exists
 *       to catch a MISTAKE IN LAYER 1, not to catch author input: if it ever has
 *       to remove something, layer 1 is wrong.
 *
 * HEADING FRAGMENTS (the one attribute this path generates)
 * ---------------------------------------------------------
 * An author links to a section of their own page (`[hours](#opening-hours)`), which
 * needs a target — and they cannot write one, because raw HTML is inert here and no
 * attribute is author-settable. So the renderer GENERATES a heading id from the
 * heading text, by the ONE documented rule in `@/core/heading-anchor`
 * (`# Opening Hours` → `#opening-hours`, repeats disambiguated `-2`, `-3`, …). It
 * is the only attribute produced outside `href`/`title`/`src`/`alt`/`class`, the
 * allowlist grants `id` to headings only, and layer 2 re-checks the SHAPE of every
 * id (`isHeadingAnchor`) — so a mistake in layer 1 cannot put an arbitrary attribute
 * value into a page.
 *
 * The id comes from the heading's WORDS, so it does not change with the heading's
 * rendered level: shifting `# Opening hours` down to `<h2>` still yields
 * `id="opening-hours"`, and every existing fragment link keeps working.
 *
 * HEADING LEVELS ARE RELATIVE TO THE PAGE TITLE
 * ---------------------------------------------
 * A page's title is its ONE level-1 heading, so a heading written in the body is
 * rendered one level BELOW the level the author typed
 * (`MARKDOWN_HEADING_LEVEL_OFFSET`), capped at the deepest level HTML has
 * (`# Services` → `<h2>`, `## Website design` → `<h3>`, `###### …` → `<h6>`).
 * Ordinary Markdown authoring therefore stays ordinary — nobody has to remember to
 * start at `##` — and this path can never emit an authored `h1` (`h1` is not in the
 * allowlist either, so layer 2 would drop one).
 *
 * WHY A LIBRARY RATHER THAN A CLEAN-UP REGEX (dependency justification)
 * -------------------------------------------------------------------
 * `sanitize-html` (MIT, maintained, built on the htmlparser2 HTML parser) applies
 * an ALLOWLIST through a real parser. A hand-written regular expression would be a
 * fragile security boundary — the very thing the project's authoring security
 * contract forbids. It is: required by the safe-Markdown mode (the allowlist
 * guarantee cannot be made honestly without a parser); server-side only, used by
 * this ONE module; and replaceable — everything outside this file talks to
 * `renderSafeMarkdown`, and nothing else in the application imports the
 * sanitiser. The alternative (no sanitiser) would mean the boundary rests on a
 * single hand-written renderer, which is a weaker guarantee than the project
 * accepts for an authoring path.
 */
import { Marked, Renderer, type Token, type Tokens } from "marked";
import sanitizeHtml from "sanitize-html";

import {
  createHeadingAnchors,
  isHeadingAnchor,
  type HeadingAnchorAllocator,
} from "@/core/heading-anchor";
import {
  MARKDOWN_ALLOWED_ATTRIBUTES,
  MARKDOWN_ALLOWED_CLASSES,
  MARKDOWN_ALLOWED_SCHEMES,
  MARKDOWN_ALLOWED_TAGS,
  MARKDOWN_CODE_LANGUAGE_CLASS_PREFIX,
  MARKDOWN_CODE_LANGUAGE_PATTERN,
  MARKDOWN_HEADING_LEVEL_OFFSET,
  MARKDOWN_HEADING_TAGS,
  MARKDOWN_MAX_HEADING_LEVEL,
} from "@/core/markdown-policy";
import { classifyAuthorUrl } from "@/core/safe-url";

const TEXT_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape text so it can only ever be read as text. */
export function escapeAuthorText(value: string): string {
  return value.replace(/[&<>"']/g, (character) => TEXT_ESCAPES[character] ?? character);
}

/** A `title="…"` attribute, or nothing. */
function optionalTitle(title: string | null | undefined): string {
  return title && title.length > 0 ? ` title="${escapeAuthorText(title)}"` : "";
}

/**
 * A `class="language-…"` attribute for a fenced code block, or nothing.
 *
 * The fence's info string may carry more than the language (`js title="x"`), so
 * only its first word is considered — and it must match the policy's shape.
 */
function languageAttribute(info: string | null | undefined): string {
  const language = (info ?? "").trim().split(/\s+/)[0] ?? "";
  if (!MARKDOWN_CODE_LANGUAGE_PATTERN.test(language)) return "";
  return ` class="${MARKDOWN_CODE_LANGUAGE_CLASS_PREFIX}${language}"`;
}

/**
 * Layer 1 — the parse-time policy.
 *
 * These are renderer METHODS, not a `Renderer` subclass: marked accepts a
 * `use({ renderer: … })` object of methods and merges them over its own defaults.
 * The methods left out here keep marked's standard behaviour, which is exactly
 * right for ordinary Markdown: paragraphs, headings, emphasis, lists, quotes and
 * tables are not policy decisions.
 *
 * Each destination is classified by `@/core/safe-url`; anything unsafe is
 * dropped, so this layer fails closed on its own.
 *
 * A heading additionally receives its generated fragment id, which is why the
 * renderer is a FACTORY: the anchors of one document are allocated together (see
 * `createHeadingAnchors`), so the allocator is created per rendered page.
 */
const AUTHORING_RENDERER_METHODS = {
  /** Raw HTML is not an authoring capability: show it as text, inertly. */
  html(this: Renderer, token: Tokens.HTML | Tokens.Tag): string {
    const text = escapeAuthorText(token.text ?? "");
    return token.block ? `<p>${text}</p>` : text;
  },

  text(this: Renderer, token: Tokens.Text | Tokens.Escape): string {
    // An `Escape` token carries only text; a `Text` token may WRAP inline tokens —
    // marked produces those inside tight list items — and must then be parsed
    // through its children, exactly as marked's own renderer does it: escaping the
    // token's raw text here would show the page its own Markdown punctuation
    // (`**bold**`, `[label](/x)`) instead of the formatting the author wrote. The
    // children are policy checked individually as they are parsed: raw HTML arrives
    // as an `html` token and stays inert text, and every destination goes through
    // `@/core/safe-url`.
    const inline = "tokens" in token ? token.tokens : undefined;
    if (inline !== undefined && inline.length > 0) {
      return this.parser.parseInline(inline) as string;
    }
    // A LEAF text token is already HTML-escaped by marked's lexer, so escaping it
    // again would show the reader the escape sequences themselves. The escaping that
    // matters for safety (raw HTML, code, destinations) is done by the hooks here
    // and by the sanitiser below.
    return token.text ?? "";
  },

  codespan(this: Renderer, token: Tokens.Codespan): string {
    return `<code>${escapeAuthorText(token.text ?? "")}</code>`;
  },

  code(this: Renderer, token: Tokens.Code): string {
    // `escaped` marks a body the tokenizer already escaped — escaping it twice
    // would corrupt it.
    const body = token.escaped ? token.text : escapeAuthorText(token.text);
    return `<pre><code${languageAttribute(token.lang)}>${body}</code></pre>`;
  },

  /** A task list gets an inert symbol; it must not become a form control. */
  checkbox(this: Renderer, token: Tokens.Checkbox): string {
    return token.checked ? "☑ " : "☐ ";
  },

  link(this: Renderer, token: Tokens.Link): string {
    const label = this.parser.parseInline(token.tokens) as string;
    const verdict = classifyAuthorUrl(token.href ?? "");
    // Fail closed: the author's words survive, an unsafe destination does not.
    if (!verdict.ok) return label;
    return `<a href="${escapeAuthorText(verdict.href)}"${optionalTitle(token.title)}>${label}</a>`;
  },

  image(this: Renderer, token: Tokens.Image): string {
    const verdict = classifyAuthorUrl(token.href ?? "");
    if (!verdict.ok) return escapeAuthorText(token.text ?? "");
    const alt = escapeAuthorText(token.text ?? "");
    return `<img src="${escapeAuthorText(verdict.href)}" alt="${alt}"${optionalTitle(token.title)}>`;
  },
};

/** The words a heading contributes, with inline markup flattened to its own text. */
function headingPlainText(tokens: readonly Token[] | undefined): string {
  if (tokens === undefined || tokens.length === 0) return "";
  return tokens
    .map((token) => {
      const children = (token as { tokens?: Token[] }).tokens;
      if (Array.isArray(children) && children.length > 0) return headingPlainText(children);
      return (token as { text?: string }).text ?? "";
    })
    .join("");
}

/**
 * Layer 1 for ONE document: the policy methods above, plus generated heading
 * fragments.
 *
 * The allocator is passed in rather than held as module state, so one document's
 * heading ids can never leak into another page (or into a concurrent render).
 */
function createAuthoringRenderer(nextHeadingAnchor: HeadingAnchorAllocator) {
  return {
    ...AUTHORING_RENDERER_METHODS,

    /**
     * A heading keeps its ordinary semantics and gains a DETERMINISTIC fragment id:
     * `# Opening hours` becomes `<h2 id="opening-hours">Opening hours</h2>`, so the
     * author's `[hours](#opening-hours)` has a real target.
     *
     * The level is RELATIVE to the page title: the title is the document's one `h1`,
     * so an authored heading is rendered one level below the level the author typed
     * (`#` → `h2`, `##` → `h3`, …) and the depth CAPS at the deepest level HTML has —
     * `#####` and `######` both render `h6`, so no `h7` can be created. The id is
     * derived from the heading's words and therefore does not depend on the level, and
     * it is escaped here as well as shape-checked by layer 2.
     */
    heading(this: Renderer, token: Tokens.Heading): string {
      const depth = Math.min(
        Math.max(token.depth, 1) + MARKDOWN_HEADING_LEVEL_OFFSET,
        MARKDOWN_MAX_HEADING_LEVEL,
      );
      const id = nextHeadingAnchor(headingPlainText(token.tokens));
      const body = this.parser.parseInline(token.tokens) as string;
      return `<h${depth} id="${escapeAuthorText(id)}">${body}</h${depth}>`;
    },
  };
}

/**
 * Layer 2 — keep only an id the heading rule could have produced.
 *
 * The allowlist grants `id` to headings, and the renderer above is its only
 * producer. This transform additionally checks the VALUE, so the policy's claim
 * ("ids look like this") is enforced rather than assumed: an id that does not match
 * the deterministic pattern is DROPPED, never repaired into something else.
 */
const constrainHeadingId: sanitizeHtml.Transformer = (tagName, attribs) => {
  const id = attribs.id;
  if (id === undefined || isHeadingAnchor(id)) return { tagName, attribs };
  const permitted: sanitizeHtml.Attributes = { ...attribs };
  delete permitted.id;
  return { tagName, attribs: permitted };
};

/** Layer 2 — the narrow allowlist, applied to the HTML layer 1 produced. */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...MARKDOWN_ALLOWED_TAGS],
  allowedAttributes: Object.fromEntries(
    Object.entries(MARKDOWN_ALLOWED_ATTRIBUTES).map(([tag, attributes]) => [tag, [...attributes]]),
  ),
  allowedClasses: { code: [...(MARKDOWN_ALLOWED_CLASSES.code ?? [])] },
  allowedSchemes: [...MARKDOWN_ALLOWED_SCHEMES],
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  transformTags: Object.fromEntries(
    MARKDOWN_HEADING_TAGS.map((tag) => [tag, constrainHeadingId]),
  ),
  parser: { lowerCaseTags: true, lowerCaseAttributeNames: true },
};

/**
 * Markdown → safe HTML. The returned string is already allowlisted, so a
 * component may render it through `dangerouslySetInnerHTML` without adding a
 * policy of its own.
 */
export function renderSafeMarkdown(markdown: string): string {
  if (typeof markdown !== "string" || markdown.length === 0) return "";
  // ONE parser per document, so the heading-anchor allocator belongs to exactly this
  // render: ids are unique within the page and cannot leak into another page.
  const parser = new Marked({ async: false, gfm: true });
  parser.use({ renderer: createAuthoringRenderer(createHeadingAnchors()) });
  const rendered = parser.parse(markdown, { async: false });
  const html = typeof rendered === "string" ? rendered : "";
  return html.length === 0 ? "" : sanitizeHtml(html, SANITIZE_OPTIONS);
}
