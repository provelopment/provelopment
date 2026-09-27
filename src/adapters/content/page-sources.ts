/**
 * THE PAGE-SOURCES COMPOSITION — the ONE wiring of modes, readers and order
 * ======================================================================
 *
 * `@/application/page-source-resolution` decides WHICH source answers a request;
 * this adapter wires the concrete sources it chooses between and interprets the
 * winner. It is the composition boundary the routes and the sitemap consume, so no
 * route reimplements the precedence or the file layout.
 *
 *   `json`      `content/pages/json/<locale>/<slug>.json` — discovered and ordered,
 *               NOT yet interpreted. A JSON source that wins the resolution FAILS
 *               LOUDLY, naming its file: the vocabulary that renders declarative
 *               JSON belongs to a later increment, and silently falling through to
 *               another source would ignore the file the author wrote.
 *   `markdown`  `content/pages/markdown/<locale>/<slug>.md` — read through the
 *               authoring reader (`./authoring-page`) and rendered under the safe
 *               Markdown policy.
 *
 * There is no third source and no compatibility fallback: a page comes from one of
 * those two roots, or it does not exist. `content/**` hosts the platform's OTHER
 * content collections (offerings, legal, portfolio, posts, testimonials) and is
 * never consulted for a page.
 *
 * PUBLICATION IS DECIDED BY CONFIGURATION, NOT BY DIRECTORIES: both entry points
 * take the site's CONFIGURED locales, so a locale directory nobody configured can
 * never produce a route, a sitemap entry or a served page — a directory's
 * existence is not publication.
 */
import { authoringSlugsFor, readAuthoringPageFile } from "./authoring-source-discovery";
import { parseAuthoringPageFile } from "./authoring-page";
import { resolvePageSource } from "@/application/page-source-resolution";
import { PAGE_AUTHORING_ROOTS, pageSourceFile } from "@/core/page-source";
import type { Locale } from "@/core/locale";

/** One page ready to render. */
export interface ResolvedPage {
  /**
   * The mode that answered. Only the Markdown mode is interpretable today, so a
   * resolved page is always `markdown`; the JSON mode is discovered and ordered but
   * refuses to be served (see `resolve`).
   */
  readonly kind: "markdown";
  readonly slug: string;
  /** The locale that actually answered (which may be the default one standing in). */
  readonly locale: Locale;
  /** True when the default locale answered for a different requested locale. */
  readonly fallback: boolean;
  readonly title: string;
  readonly body: string;
  /** An author-supplied summary, when the page declared one. */
  readonly description?: string;
}

export interface PageSourcesOptions {
  readonly defaultLocale: Locale;
  /** The site's configured locales. Only these can publish anything. */
  readonly locales: readonly Locale[];
}

export interface PageSources {
  /**
   * The page that answers `slug` for `locale`, or `null` when no source does.
   *
   * Throws when a JSON source wins: it is discovered and ordered, but not yet
   * interpretable — the author must be told, not silently ignored.
   */
  resolve(slug: string, locale: Locale): Promise<ResolvedPage | null>;
  /** The publishable page slugs for one configured locale (both modes, sorted). */
  listSlugs(locale: Locale): Promise<readonly string[]>;
}

/** The authoring roots, for diagnostics — the core contract owns their names. */
const AUTHORING_ROOTS_HINT = Object.values(PAGE_AUTHORING_ROOTS).join(" or ");

export function createPageSources(options: PageSourcesOptions): PageSources {
  const { defaultLocale, locales } = options;

  /** Only a CONFIGURED locale can be served; anything else is not a page request. */
  const isPublishedLocale = (locale: Locale): boolean => locales.includes(locale);

  return {
    async resolve(slug, locale) {
      if (!isPublishedLocale(locale)) return null;

      const resolved = await resolvePageSource<string>(
        { slug, locale, defaultLocale },
        {
          // Availability only — each provider answers "this locale contributes a
          // source" with the RAW source, and interpretation happens below.
          json: (candidate) => readAuthoringPageFile("json", candidate, slug),
          markdown: (candidate) => readAuthoringPageFile("markdown", candidate, slug),
        },
      );
      if (resolved === null) return null;

      if (resolved.kind === "json") {
        const file = pageSourceFile("json", resolved.locale, slug) ?? slug;
        throw new Error(
          `JSON page authoring is declared but not yet interpreted: "${file}" would be served in ` +
            "place of any Markdown source, so this build stops instead of ignoring it. " +
            `Remove the file, or author the page in ${AUTHORING_ROOTS_HINT}.`,
        );
      }

      const page = parseAuthoringPageFile(resolved.source, slug, resolved.locale);
      return {
        kind: "markdown",
        slug,
        locale: resolved.locale,
        fallback: resolved.fallback,
        title: page.title,
        body: page.body,
        ...(page.description === undefined ? {} : { description: page.description }),
      };
    },

    async listSlugs(locale) {
      if (!isPublishedLocale(locale)) return [];

      const [markdown, json] = await Promise.all([
        authoringSlugsFor("markdown", locale),
        authoringSlugsFor("json", locale),
      ]);

      return [...new Set([...markdown, ...json])].sort();
    },
  };
}
