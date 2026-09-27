import { describe, expect, it } from "vitest";

import { renderSafeMarkdown } from "@/adapters/markdown/safe-markdown";
import {
  MARKDOWN_ALLOWED_TAGS,
  MARKDOWN_FORBIDDEN_ATTRIBUTES,
  MARKDOWN_FORBIDDEN_ELEMENTS,
} from "@/core/markdown-policy";

/**
 * THE SAFE MARKDOWN PRIMITIVE (FOUNDATION-PAGES-A1).
 *
 * The Markdown authoring mode is genuinely safe: ordinary Markdown renders, and
 * author-supplied raw HTML can never become active markup. The two policy layers
 * (`@/core/markdown-policy`, `@/core/safe-url`) are asserted through the real
 * renderer here, so a regression in either is caught.
 */
const tagsIn = (html: string): string[] =>
  [...html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)].map((match) => match[1].toLowerCase());

const RICH_MARKDOWN = [
  "# Title",
  "",
  "A paragraph with **strong**, *emphasis*, `code`, a [link](/about) and an ![image](/img.png).",
  "",
  "- one",
  "- two",
  "",
  "1. first",
  "",
  "> A quote.",
  "",
  "| a | b |",
  "| - | - |",
  "| 1 | 2 |",
  "",
  "```js",
  "const code = true;",
  "```",
  "",
  "---",
  "",
].join("\n");

const HOSTILE_MARKDOWN = [
  "<script>alert(1)</script>",
  "",
  '<div onclick="steal()">click</div>',
  "",
  '<iframe src="//evil.example"></iframe>',
  "",
  "<style>body{display:none}</style>",
  "",
  '<form action="/x"><input name="a"></form>',
  "",
  '<object data="x"></object>',
  "",
  '<img src=x onerror="alert(1)">',
  "",
  "[click me](javascript:alert(1))",
  "",
  "![alt text](data:text/html;base64,PHNjcmlwdD4=)",
  "",
  "[encode me](jav&#x61;script:alert(1))",
  "",
].join("\n");

describe("the safe Markdown renderer", () => {
  it("renders ordinary Markdown as ordinary Markdown", () => {
    const html = renderSafeMarkdown(RICH_MARKDOWN);

    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>strong</strong>");
    expect(html).toContain("<em>emphasis</em>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain('<a href="/about">link</a>');
    expect(html).toMatch(/<img src="\/img\.png" alt="image" ?\/?>/);
    expect(html).toContain("<ul>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<table>");
    expect(html).toMatch(/<hr ?\/?>/);
    expect(html).toContain('<code class="language-js">');
  });

  it("turns author-supplied raw HTML into INERT TEXT", () => {
    const html = renderSafeMarkdown(HOSTILE_MARKDOWN);

    for (const forbidden of MARKDOWN_FORBIDDEN_ELEMENTS) {
      expect(html.toLowerCase(), forbidden).not.toContain(`<${forbidden}`);
    }
    // The author's words are still there — as text, never as markup.
    expect(html).toMatch(/script/);
    expect(html).not.toMatch(/<script/i);
  });

  it("carries no event handler and no inline style anywhere", () => {
    const html = renderSafeMarkdown(HOSTILE_MARKDOWN);

    // Assert on the MARKUP, not on the text: the author's escaped HTML legitimately
    // contains the words `onclick=` as inert text, so the check must look inside
    // real tags only.
    const attributes = [
      ...html.matchAll(/<[a-zA-Z][^>]*>/g),
    ].flatMap((tag) => [...tag[0].matchAll(/\s([a-zA-Z-:]+)\s*=/g)].map((match) => match[1].toLowerCase()));

    for (const attribute of attributes) {
      expect(attribute, `unexpected attribute ${attribute}=`).not.toMatch(/^on/i);
      expect(attribute, `unexpected attribute ${attribute}=`).not.toBe("style");
      expect(MARKDOWN_FORBIDDEN_ATTRIBUTES, `forbidden attribute ${attribute}=`).not.toContain(attribute);
    }
    // Every attribute that DOES appear is one the policy allows.
    expect(new Set(attributes)).toEqual(new Set(["href", "title", "src", "alt", "class"].filter((name) => attributes.includes(name))));
  });

  it("drops an unsafe destination but keeps the author's words", () => {
    const html = renderSafeMarkdown(HOSTILE_MARKDOWN);

    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text/html");
    // The link's words survive without a destination; the image becomes its alt text.
    expect(html).toContain("click me");
    expect(html).toContain("alt text");
    expect(html).not.toContain("<img src");
  });

  it("emits ONLY allowlisted elements", () => {
    const html = renderSafeMarkdown(`${RICH_MARKDOWN}\n${HOSTILE_MARKDOWN}`);

    const tags = tagsIn(html);
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) {
      expect(MARKDOWN_ALLOWED_TAGS, `unexpected element <${tag}>`).toContain(tag);
    }
  });

  it("shape-checks the one class a page may set", () => {
    expect(renderSafeMarkdown("```\nplain\n```\n")).toContain("<pre><code>");
    expect(renderSafeMarkdown('```"><script>alert(1)</script>\nx\n```\n')).not.toMatch(/<script/i);
  });

  it("renders an empty document as an empty string", () => {
    expect(renderSafeMarkdown("")).toBe("");
  });
});
