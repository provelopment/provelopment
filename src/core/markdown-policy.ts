/**
 * THE AUTHORING ALLOWLIST FOR MARKDOWN PAGES
 * =========================================
 *
 * The declared policy for the `content/pages/markdown` authoring mode: which
 * elements a Markdown page may produce, which attributes those elements may
 * carry, and which destination schemes may appear. It is deliberately NARROW —
 * ordinary Markdown semantics and nothing else — and it is the ONE authority for
 * both layers of the safe path:
 *
 *   layer 1  the renderer (`@/adapters/markdown/safe-markdown`) emits only these
 *            tags, escapes raw HTML instead of passing it through, and asks
 *            `@/core/safe-url` about every destination;
 *   layer 2  the sanitiser re-parses the generated HTML against this same
 *            allowlist, so a mistake in layer 1 cannot produce active markup
 *            either.
 *
 * WHAT IS NOT AN AUTHORING CAPABILITY
 * -----------------------------------
 * Raw HTML, `<style>`, script, frames, forms and controls, embedded/object
 * content, media elements, SVG/MathML, `<base>`, `<meta>`, event-handler
 * attributes, arbitrary `style` attributes, and executable or unknown URL
 * schemes. The author of a Markdown page must not be able to introduce active web
 * behaviour by typing punctuation — and where Markdown's native power is
 * insufficient, the correct answer is the JSON authoring mode, not a richer
 * Markdown.
 *
 * The lists below are data, not logic: documentation tooling can read them and
 * tests assert them, which is how the policy stays honest.
 */
import { AUTHOR_ALLOWED_SCHEMES } from "./safe-url";

/** Every element a Markdown page may produce. Ordinary Markdown semantics, complete. */
export const MARKDOWN_ALLOWED_TAGS: readonly string[] = [
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
];

/**
 * Every attribute allowed, per element. Nothing else may appear — not even `style`.
 *
 * `id` appears for headings ONLY, and it is not an author-settable attribute: raw
 * HTML is inert in this mode, so the sole producer is the renderer's heading
 * fragment (`@/core/heading-anchor`), which the sanitiser re-checks against
 * `HEADING_ANCHOR_PATTERN`. An author writes `## Opening hours` and links to
 * `#opening-hours`; they cannot write an attribute at all.
 */
export const MARKDOWN_ALLOWED_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  a: ["href", "title"],
  img: ["src", "alt", "title"],
  code: ["class"],
  h1: ["id"],
  h2: ["id"],
  h3: ["id"],
  h4: ["id"],
  h5: ["id"],
  h6: ["id"],
};

/**
 * Elements whose `id` the renderer may generate. It is exactly the headings, so a
 * page can never put an id anywhere else — another reason the allowlist stays
 * narrow.
 */
export const MARKDOWN_HEADING_TAGS: readonly string[] = ["h1", "h2", "h3", "h4", "h5", "h6"];

/** The only class a page may set: the language of a fenced code block. */
export const MARKDOWN_ALLOWED_CLASSES: Readonly<Record<string, readonly string[]>> = {
  code: ["language-*"],
};

/** Destination schemes the authoring path supports (see `@/core/safe-url`). */
export const MARKDOWN_ALLOWED_SCHEMES: readonly string[] = AUTHOR_ALLOWED_SCHEMES;

/** The prefix and shape of an allowed fenced-code language class. */
export const MARKDOWN_CODE_LANGUAGE_CLASS_PREFIX = "language-";
export const MARKDOWN_CODE_LANGUAGE_PATTERN = /^[A-Za-z0-9+#._-]{1,32}$/;

/**
 * Elements that must NEVER appear in a page this path produced. Named explicitly
 * so the policy can be reported and asserted rather than inferred from an
 * absence.
 */
export const MARKDOWN_FORBIDDEN_ELEMENTS: readonly string[] = [
  "applet",
  "audio",
  "base",
  "button",
  "canvas",
  "dialog",
  "embed",
  "form",
  "frame",
  "frameset",
  "iframe",
  "input",
  "label",
  "link",
  "math",
  "meta",
  "noscript",
  "object",
  "option",
  "portal",
  "script",
  "select",
  "source",
  "style",
  "svg",
  "template",
  "textarea",
  "track",
  "video",
];

/** Attributes that must NEVER appear, including every event handler and inline style. */
export const MARKDOWN_FORBIDDEN_ATTRIBUTES: readonly string[] = [
  "action",
  "background",
  "dynsrc",
  "formaction",
  "http-equiv",
  "lowsrc",
  "onclick",
  "onerror",
  "onload",
  "onsubmit",
  "srcdoc",
  "style",
  "target",
  "xlink:href",
  "xmlns",
];

/** The shape of a refused attribute name: a browser runs any attribute starting with `on`. */
export const MARKDOWN_EVENT_HANDLER_PATTERN = /^on/i;
