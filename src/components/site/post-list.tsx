import type { PostContent } from "@/core/posts";
import { Grid } from "@/components/ui/grid";
import { PostCard } from "./post-card";

interface PostListProps {
  readonly posts: readonly PostContent[];
  readonly baseHref: string;
  /** Localized empty-state text. */
  readonly emptyLabel: string;
  /** Reading-time label factory (already localized); body-derived per post. */
  readonly readingTimeLabelFor: (post: PostContent) => string;
}

/**
 * Phase T — the blog listing (date-descending published posts), accessible
 * `<ul>`, zero client JS.
 */
export function PostList({
  posts,
  baseHref,
  emptyLabel,
  readingTimeLabelFor,
}: PostListProps) {
  if (posts.length === 0) {
    return <p className="text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <Grid columns="lg:grid-cols-2">
      {posts.map((post) => (
        <li key={post.slug} className="flex">
          <PostCard
            post={post}
            href={`${baseHref}/${post.slug}`}
            readingTimeLabel={readingTimeLabelFor(post)}
          />
        </li>
      ))}
    </Grid>
  );
}