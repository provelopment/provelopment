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
  /**
   * An OPTIONAL author-supplied search/social summary.
   *
   * A page that supplies one carries its own short standalone description; a
   * page that omits it keeps the site's configured description, so this is
   * purely additive and changes no existing page's metadata.
   *
   * It is deliberately NOT read by the legacy `content/pages` parser: that path
   * keeps exactly the behaviour existing adopters have today. The first-class
   * authoring modes (`config/pages-markdown`, `config/pages-json`) supply it.
   */
  readonly description?: string;
}

/**
 * THE ONE CONTENT-SLUG RULE.
 *
 * A content slug is simultaneously a **filename** and a **URL path segment**, so
 * its rule is declared ONCE here and imported by everything that must agree on
 * it:
 *
 *   · the legacy content repository — a slug that is not well formed is never
 *     read (`@/adapters/content/fs-page-content-repository`);
 *   · the page-source contract — which spells an authoring file path from a slug
 *     (`@/core/page-source`);
 *   · the authoring-source discovery adapter, which turns a directory listing
 *     into slugs;
 *   · any tooling or test that must accept exactly what the runtime accepts.
 *
 * A competing private regex anywhere else in the tree is a defect: two rules
 * would eventually disagree, and the slug decides both what a file may be called
 * and what URL is published.
 *
 * The rule is deliberately conservative: lowercase alphanumerics in
 * hyphen-separated words. It keeps a slug safe as a filename on every
 * filesystem, safe to build a path from without escaping, and stable as a URL.
 * It also means a filename such as `README.md` can never be a page — `README` is
 * not a well-formed slug — which is what lets an authoring root hold
 * documentation beside its locale directories, and what keeps `.gitkeep` and any
 * other placeholder intrinsically non-routable.
 */
export const CONTENT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** True when `value` may be used as a content slug (and therefore as a page filename). */
export function isContentSlug(value: string): boolean {
  return CONTENT_SLUG_PATTERN.test(value);
}

/**
 * The RESERVED content slug for a site's HOME page.
 *
 * A site may author its home page as ordinary content —
 * `content/pages/<locale>/home.md` — and the locale-root route (`/{locale}`)
 * renders it. Authoring the home page this way is OPTIONAL: a site with no
 * `home.md` keeps the generic configuration-driven starter homepage.
 *
 * Declaring the slug ONCE here keeps the three consequences in agreement, so no
 * caller can re-derive its own literal and drift:
 *
 *   1. the locale-root route looks the content up by this slug;
 *   2. `/{locale}/home` must NOT also be generated (the `[item]` route treats the
 *      slug as a reserved/static route, exactly as it does `about`/`contact`);
 *   3. the sitemap must NOT advertise `/{locale}/home`, because the home page's
 *      real URL is the locale root — which the sitemap already emits.
 */
export const HOME_CONTENT_SLUG = "home";