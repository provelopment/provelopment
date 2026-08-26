/**
 * A page of human-authored content.
 *
 * The body is raw Markdown. Converting Markdown to HTML is a presentation
 * concern and must not happen in the domain or application layers.
 */
export interface PageContent {
  readonly slug: string;
  /** The locale of the content actually served (after any fallback). */
  readonly locale: string;
  readonly title: string;
  readonly body: string;
}