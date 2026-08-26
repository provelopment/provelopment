import { marked } from "marked";

interface MarkdownContentProps {
  markdown: string;
}

/**
 * Renders raw Markdown as HTML.
 *
 * Presentation-only concern: the Markdown arrives already loaded through
 * an application port; this component knows nothing about where it came
 * from.
 */
export function MarkdownContent({ markdown }: MarkdownContentProps) {
  const html = marked.parse(markdown, { async: false });

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}