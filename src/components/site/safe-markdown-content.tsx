import { renderSafeMarkdown } from "@/adapters/markdown/safe-markdown";

/**
 * THE RENDERER OF THE SAFE MARKDOWN AUTHORING MODE
 * ===============================================
 *
 * WHAT MAKES THIS DIFFERENT FROM `MarkdownContent`
 * ------------------------------------------------
 * `MarkdownContent` renders the platform's TRUSTED collection content
 * (`content/<collection>/**`: offerings, legal, portfolio, posts, testimonials),
 * passing raw HTML through because those files are reviewed like source code. This
 * component serves the first-class PAGE authoring contract instead — the one an
 * author writes into expecting safety — so its Markdown is parsed under a policy
 * (`@/adapters/markdown/safe-markdown`) that neutralises raw HTML, drops unsafe
 * destinations and allowlists the output.
 *
 * Nothing here decides anything: by the time the HTML reaches this component it has
 * already been through both policy layers, so the only thing left is presentation.
 * The table-overflow treatment the trusted renderer applies to its own output is not
 * duplicated here: the sanitiser's allowlist owns what may appear, and a Markdown
 * table stays a real table.
 */
interface SafeMarkdownContentProps {
  readonly markdown: string;
  /** Extra classes for the prose container. */
  readonly className?: string;
}

export function SafeMarkdownContent({ markdown, className }: SafeMarkdownContentProps) {
  // Allowlisted by `renderSafeMarkdown` — the policy lives with the parser, never
  // with the view.
  const html = renderSafeMarkdown(markdown);

  return (
    <div
      className={["prose", className].filter(Boolean).join(" ")}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
