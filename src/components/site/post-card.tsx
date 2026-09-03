import Link from "next/link";

import type { PostContent } from "@/core/posts";

interface PostCardProps {
  readonly post: PostContent;
  /** Destination of the card link (e.g. `/{locale}/blog/{slug}`). */
  readonly href: string;
  /** Already-interpolated reading-time label (e.g. "5 min read"). */
  readonly readingTimeLabel: string;
}

/**
 * Phase T — a single blog post card. Displays title, date, excerpt, reading
 * time, and display-only tags. Presentational only; zero client JS.
 */
export function PostCard({ post, href, readingTimeLabel }: PostCardProps) {
  return (
    <article className="rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary">
      <Link href={href} className="block">
        <h2 className="text-xl font-semibold">{post.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {post.date} · {readingTimeLabel}
        </p>
        <p className="mt-3 text-muted-foreground">{post.excerpt}</p>
        {post.tags && post.tags.length > 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{post.tags.join(", ")}</p>
        ) : null}
      </Link>
    </article>
  );
}