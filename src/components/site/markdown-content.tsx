import { marked } from "marked";

interface MarkdownContentProps {
  markdown: string;
}

/**
 * Renders raw Markdown as HTML.
 *
 * Trust boundary: the Markdown (including any raw HTML it contains) is rendered
 * as-is. Page bodies are adopter-authored content (`content/pages/<locale>/`),
 * NOT untrusted user input — see CUSTOMIZING.md. Do not pipe visitor-supplied
 * text through this component.
 *
 * Presentation-only concern: the Markdown arrives already loaded through an
 * application port; this component knows nothing about where it came from.
 */
export function MarkdownContent({ markdown }: MarkdownContentProps) {
  const html = marked.parse(markdown, { async: false });

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}