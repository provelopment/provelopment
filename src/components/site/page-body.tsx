import { MarkdownContent } from "./markdown-content";
import { SafeMarkdownContent } from "./safe-markdown-content";

/**
 * THE ONE PLACE A PAGE'S BODY BECOMES MARKUP
 * =========================================
 *
 * The two renderers correspond to the two TRUST regimes the platform has, and
 * nothing else may choose between them:
 *
 *   `markdown`  the first-class authoring mode (`config/pages-markdown/**`): the
 *               body is parsed under an explicit policy — raw HTML is inert,
 *               unsafe destinations are dropped, the output is allowlisted
 *               (`@/adapters/markdown/safe-markdown`);
 *   `content`   the legacy compatibility mechanism (`content/pages/**`): the body
 *               keeps the trusted-raw-HTML treatment existing adopters depend on.
 *
 * A JSON-authored page never reaches this component: its interpretation is a
 * later increment, and the resolution layer refuses to serve one rather than
 * pretending it can.
 */
export type PageBodyKind = "markdown" | "content";

export interface PageBodyProps {
  readonly kind: PageBodyKind;
  /** The Markdown body, exactly as authored. */
  readonly markdown: string;
}

export function PageBody({ kind, markdown }: PageBodyProps) {
  return kind === "markdown" ? (
    <SafeMarkdownContent markdown={markdown} />
  ) : (
    <MarkdownContent markdown={markdown} />
  );
}
