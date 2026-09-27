/**
 * THE SAFE MARKDOWN AUTHORING PRIMITIVE
 * ====================================
 *
 * Turns author-written Markdown into HTML that CANNOT carry active web behaviour.
 * This is the primitive the `config/pages-markdown` authoring mode renders through;
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
import { Marked, Renderer, type Tokens } from "marked";
import sanitizeHtml from "sanitize-html";

import {
  MARKDOWN_ALLOWED_ATTRIBUTES,
  MARKDOWN_ALLOWED_CLASSES,
  MARKDOWN_ALLOWED_SCHEMES,
  MARKDOWN_ALLOWED_TAGS,
  MARKDOWN_CODE_LANGUAGE_CLASS_PREFIX,
  MARKDOWN_CODE_LANGUAGE_PATTERN,
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
 */
const AUTHORING_RENDERER = {
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

/** Our own parser instance: its options cannot be changed by anything else in the application. */
const authoringMarked = new Marked({ async: false, gfm: true });
authoringMarked.use({ renderer: AUTHORING_RENDERER });

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
  parser: { lowerCaseTags: true, lowerCaseAttributeNames: true },
};

/**
 * Markdown → safe HTML. The returned string is already allowlisted, so a
 * component may render it through `dangerouslySetInnerHTML` without adding a
 * policy of its own.
 */
export function renderSafeMarkdown(markdown: string): string {
  if (typeof markdown !== "string" || markdown.length === 0) return "";
  const rendered = authoringMarked.parse(markdown, { async: false });
  const html = typeof rendered === "string" ? rendered : "";
  return html.length === 0 ? "" : sanitizeHtml(html, SANITIZE_OPTIONS);
}
