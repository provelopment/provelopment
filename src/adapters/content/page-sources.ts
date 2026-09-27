/**
 * THE PAGE-SOURCES COMPOSITION — the ONE wiring of modes, readers and order
 * ======================================================================
 *
 * `@/application/page-source-resolution` decides WHICH source answers a request;
 * this adapter wires the concrete sources it chooses between and interprets the
 * winner. It is the composition boundary the routes and the sitemap consume, so no
 * route reimplements the precedence or the file layout.
 *
 *   `json`      `content/pages/json/<locale>/<route-path>.json` — read through the
 *               declarative reader (`./json-page`) and validated against the ONE
 *               document schema (`@/core/page-document`). The validated document is
 *               rendered by the declarative page composer, and an invalid document
 *               stops the build naming the file and the property.
 *   `markdown`  `content/pages/markdown/<locale>/<route-path>.md` — read through the
 *               authoring reader (`./authoring-page`) and rendered under the safe
 *               Markdown policy.
 *
 * A `<route-path>` is one segment (`about`) or several
 * (`offerings/website-design`): a page's route mirrors the folders it is authored in
 * (`@/core/page-route-path`), and the declared precedence applies to the COMPLETE
 * route path, so a nested page resolves exactly as a top-level one does.
 *
 * There is no third source and no compatibility fallback: a page comes from one of
 * those two roots, or it does not exist. `content/` holds THIS platform's pages and
 * assets — there are no other author-facing collections competing with the page
 * model, so no file outside the two roots can be consulted for a page.
 *
 * PUBLICATION IS DECIDED BY CONFIGURATION, NOT BY DIRECTORIES: both entry points
 * take the site's CONFIGURED locales, so a locale directory nobody configured can
 * never produce a route, a sitemap entry or a served page — a directory's
 * existence is not publication.
 */
import { authoringPageRoutesFor, readAuthoringPageFile } from "./authoring-source-discovery";
import { parseAuthoringPageFile } from "./authoring-page";
import { parseJsonPageFile } from "./json-page";
import { resolvePageSource } from "@/application/page-source-resolution";
import type { PageDocument } from "@/core/page-document";
import type { Locale } from "@/core/locale";

/**
 * One page ready to render — the winner of the declared precedence, in the shape its
 * mode produces. The two modes are the ONLY shapes: a page is safe Markdown with a body,
 * or a validated declarative document.
 */
export interface ResolvedMarkdownPage {
  readonly kind: "markdown";
  /** The page's route path inside its locale directory, e.g. `offerings/website-design`. */
  readonly routePath: string;
  /** The locale that actually answered (which may be the default one standing in). */
  readonly locale: Locale;
  /** True when the default locale answered for a different requested locale. */
  readonly fallback: boolean;
  readonly title: string;
  readonly body: string;
  /** An author-supplied summary, when the page declared one. */
  readonly description?: string;
}

export interface ResolvedJsonPage {
  readonly kind: "json";
  readonly routePath: string;
  readonly locale: Locale;
  readonly fallback: boolean;
  readonly title: string;
  /** The validated declarative document, in authoring order. */
  readonly document: PageDocument;
  readonly description?: string;
}

export type ResolvedPage = ResolvedMarkdownPage | ResolvedJsonPage;

export interface PageSourcesOptions {
  readonly defaultLocale: Locale;
  /** The site's configured locales. Only these can publish anything. */
  readonly locales: readonly Locale[];
}

export interface PageSources {
  /**
   * The page that answers `routePath` for `locale`, or `null` when no source does.
   *
   * Throws when a source EXISTS but cannot be interpreted — a malformed JSON file, a
   * document the schema refuses, unsupported Markdown metadata. The author must be told
   * rather than served something else.
   */
  resolve(routePath: string, locale: Locale): Promise<ResolvedPage | null>;
  /** The publishable page route paths for one configured locale (both modes, sorted). */
  listRoutes(locale: Locale): Promise<readonly string[]>;
}

export function createPageSources(options: PageSourcesOptions): PageSources {
  const { defaultLocale, locales } = options;

  /** Only a CONFIGURED locale can be served; anything else is not a page request. */
  const isPublishedLocale = (locale: Locale): boolean => locales.includes(locale);

  return {
    async resolve(routePath, locale) {
      if (!isPublishedLocale(locale)) return null;

      const resolved = await resolvePageSource<string>(
        { routePath, locale, defaultLocale },
        {
          // Availability only — each provider answers "this locale contributes a
          // source" with the RAW source, and interpretation happens below.
          json: (candidate) => readAuthoringPageFile("json", candidate, routePath),
          markdown: (candidate) => readAuthoringPageFile("markdown", candidate, routePath),
        },
      );
      if (resolved === null) return null;

      if (resolved.kind === "json") {
        const page = parseJsonPageFile(resolved.source, routePath, resolved.locale);
        return {
          kind: "json",
          routePath,
          locale: resolved.locale,
          fallback: resolved.fallback,
          title: page.title,
          document: page.document,
          ...(page.description === undefined ? {} : { description: page.description }),
        };
      }

      const page = parseAuthoringPageFile(resolved.source, routePath, resolved.locale);
      return {
        kind: "markdown",
        routePath,
        locale: resolved.locale,
        fallback: resolved.fallback,
        title: page.title,
        body: page.body,
        ...(page.description === undefined ? {} : { description: page.description }),
      };
    },

    async listRoutes(locale) {
      if (!isPublishedLocale(locale)) return [];

      const [markdown, json] = await Promise.all([
        authoringPageRoutesFor("markdown", locale),
        authoringPageRoutesFor("json", locale),
      ]);

      return [...new Set([...markdown, ...json])].sort();
    },
  };
}
