/**
 * THE PAGE-SOURCES COMPOSITION — the ONE wiring of modes, readers and order
 * ======================================================================
 *
 * `@/application/page-source-resolution` decides WHICH source answers a request; this
 * adapter wires the concrete sources it chooses between and interprets the winner. It is
 * the composition boundary the routes and the sitemap consume, so no route reimplements
 * the precedence or the file layout.
 *
 *   `json`      `content/pages/json/<site>/<locale>/<route-path>.json` — read through the
 *               declarative reader (`./json-page`) and validated against the ONE document
 *               schema (`@/core/page-document`). The validated document is rendered by the
 *               declarative page composer, and an invalid document stops the build naming
 *               the file and the property.
 *   `markdown`  `content/pages/markdown/<site>/<locale>/<route-path>.md` — read through
 *               the authoring reader (`./authoring-page`) and rendered under the safe
 *               Markdown policy.
 *
 * `<site>` is a recognized lowercase site code (`ca`, `fr`, `ww`) and `<locale>` a lowercase
 * locale PATH KEY (`en`, `fr`, `fr-ca`) — the two segments the public URL is built from too.
 *
 * A `<route-path>` is one segment (`about`) or several
 * (`offerings/website-design`): a page's route mirrors the folders it is authored in
 * (`@/core/page-route-path`), and the declared precedence applies to the COMPLETE route
 * path, so a nested page resolves exactly as a top-level one does.
 *
 * ONE SITE PER CALL (FOUNDATION-S1)
 * --------------------------------
 * A page's identity is `site + locale + routePath`, and this composition is bound to ONE
 * site's tree per call. The readers are therefore built from that site's CODE alone, which
 * makes a cross-site lookup unrepresentable: `ca`'s page tree is never consulted while
 * answering for `fr`, not even when the locale path key matches. The site's OWN locale
 * policy — its supported locales, its default locale and its fallback switch — decides what
 * may answer, and a locale outside the site is not a page request at all.
 *
 * There is no third source and no compatibility fallback: a page comes from one of those
 * two roots, or it does not exist. `content/` holds THIS platform's pages and assets — no
 * file outside the two roots can be consulted for a page.
 *
 * PUBLICATION IS DECIDED BY CONFIGURATION, NOT BY DIRECTORIES: both entry points take the
 * deployment's RESOLVED SITES, so a site or locale directory nobody configured can never
 * produce a route, a sitemap entry or a served page — a directory's existence is not
 * publication.
 */
import { authoringPageRoutesFor, readAuthoringPageFile } from "./authoring-source-discovery";
import { parseAuthoringPageFile } from "./authoring-page";
import { parseJsonPageFile } from "./json-page";
import { resolvePageSource } from "@/application/page-source-resolution";
import type { PageDocument } from "@/core/page-document";
import type { Locale } from "@/core/locale";
import type { SiteCode } from "@/core/site-code";
import { siteSupportsLocalePath, type ResolvedSite } from "@/core/site";

/**
 * One page ready to render — the winner of the declared precedence, in the shape its mode
 * produces. The two modes are the ONLY shapes: a page is safe Markdown with a body, or a
 * validated declarative document.
 */
export interface ResolvedMarkdownPage {
  readonly kind: "markdown";
  readonly siteId: SiteCode;
  /** The page's route path inside its site+locale directory, e.g. `offerings/website-design`. */
  readonly routePath: string;
  /**
   * The LOCALE PATH KEY that actually answered (which may be the site's default one standing
   * in) — the value the page's filesystem identity was spelled with.
   */
  readonly locale: Locale;
  /** True when the site's default locale answered for a different requested locale. */
  readonly fallback: boolean;
  readonly title: string;
  readonly body: string;
  /** An author-supplied summary, when the page declared one. */
  readonly description?: string;
}

export interface ResolvedJsonPage {
  readonly kind: "json";
  readonly siteId: SiteCode;
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
  /** The deployment's resolved sites. Only a declared site can publish anything. */
  readonly sites: readonly ResolvedSite[];
}

export interface PageSources {
  /**
   * The page that answers `routePath` for `siteId` + `locale`, or `null` when no source of
   * THAT site does.
   *
   * Throws when a source EXISTS but cannot be interpreted — a malformed JSON file, a
   * document the schema refuses, unsupported Markdown metadata. The author must be told
   * rather than served something else.
   */
  resolve(siteCode: SiteCode, routePath: string, localePath: Locale): Promise<ResolvedPage | null>;
  /** The publishable page route paths for one configured site + locale (both modes, sorted). */
  listRoutes(siteCode: SiteCode, localePath: Locale): Promise<readonly string[]>;
}

export function createPageSources(options: PageSourcesOptions): PageSources {
  const { sites } = options;

  /** The declared site with this code, or null — an undeclared site serves nothing. */
  const siteOf = (siteCode: SiteCode): ResolvedSite | null =>
    sites.find((site) => site.code === siteCode) ?? null;

  /**
   * Only a CONFIGURED (site, locale) pair can be served. A locale path key outside the site's
   * own set is not a page request — and it is never satisfied by another site.
   */
  const isPublished = (site: ResolvedSite, localePath: Locale): boolean =>
    siteSupportsLocalePath(site, localePath);

  return {
    async resolve(siteCode, routePath, localePath) {
      const site = siteOf(siteCode);
      if (site === null || !isPublished(site, localePath)) return null;

      const resolved = await resolvePageSource<string>(
        // The SITE's own locale policy travels with the request: its default locale and its
        // fallback switch. The deployment's defaults play no part, so a fallback can only
        // ever come from inside this site — never from another site's tree.
        {
          siteId: site.code,
          routePath,
          locale: localePath,
          defaultLocale: site.defaultLocale,
          fallback: site.fallback,
        },
        {
          // Availability only — each provider answers "this locale contributes a source"
          // with the RAW source, and interpretation happens below. The providers are bound
          // to THIS site's code, which is what a cross-site answer would have to bypass.
          json: (candidate) => readAuthoringPageFile("json", site.code, candidate, routePath),
          markdown: (candidate) => readAuthoringPageFile("markdown", site.code, candidate, routePath),
        },
      );
      if (resolved === null) return null;

      if (resolved.kind === "json") {
        const page = parseJsonPageFile(resolved.source, site.code, routePath, resolved.locale);
        return {
          kind: "json",
          siteId: site.code,
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
        siteId: site.code,
        routePath,
        locale: resolved.locale,
        fallback: resolved.fallback,
        title: page.title,
        body: page.body,
        ...(page.description === undefined ? {} : { description: page.description }),
      };
    },

    async listRoutes(siteCode, localePath) {
      const site = siteOf(siteCode);
      if (site === null || !isPublished(site, localePath)) return [];

      const [markdown, json] = await Promise.all([
        authoringPageRoutesFor("markdown", site.code, localePath),
        authoringPageRoutesFor("json", site.code, localePath),
      ]);

      return [...new Set([...markdown, ...json])].sort();
    },
  };
}
