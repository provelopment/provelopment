import Link from "next/link";

import type { PostContent } from "@/core/posts";
import { Section } from "@/components/ui/section";
import { MarkdownContent } from "./markdown-content";

interface PostDetailProps {
  readonly post: PostContent;
  readonly backHref: string;
  readonly backLabel: string;
  /** Already-interpolated reading-time label. */
  readonly readingTimeLabel: string;
}

/**
 * Phase T — a blog post detail page. Body rendered by `MarkdownContent`
 * (adopter-authored content; trust boundary preserved). Draft posts never
 * reach this component (they are excluded at the route boundary).
 */
export function PostDetail({
  post,
  backHref,
  backLabel,
  readingTimeLabel,
}: PostDetailProps) {
  return (
    <Section as="article">
      <p className="mb-6">
        <Link href={backHref} className="text-sm font-medium text-primary hover:underline">
          ← {backLabel}
        </Link>
      </p>
      <h1 className="text-3xl font-bold tracking-tight">{post.title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {post.date} · {readingTimeLabel}
      </p>
      {post.tags && post.tags.length > 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{post.tags.join(", ")}</p>
      ) : null}
      <div className="mt-8">
        <MarkdownContent markdown={post.body} />
      </div>
    </Section>
  );
}