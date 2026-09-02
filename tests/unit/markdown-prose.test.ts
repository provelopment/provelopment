import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownContent } from "@/components/site/markdown-content";

const sample = `## Heading two

A paragraph with **strong** text and a [link](https://example.com).

- item one
- item two

> A blockquote.

\`\`\`
const code = true;
\`\`\`
`;

describe("MarkdownContent prose presentation (Phase D)", () => {
  it("applies the token-driven .prose contract class", () => {
    const html = renderToStaticMarkup(MarkdownContent({ markdown: sample }));
    expect(html).toContain('class="prose"');
  });

  it("renders structured Markdown with semantic elements inside prose", () => {
    const html = renderToStaticMarkup(MarkdownContent({ markdown: sample }));

    expect(html).toContain("<h2>Heading two</h2>");
    expect(html).toContain("<p>");
    expect(html).toContain("<strong>strong</strong>");
    expect(html).toContain('<a href="https://example.com">link</a>');
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>item one</li>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<pre>");
  });
});