import { isPageRoutePath } from "./page-route-path";
import type { Locale } from "./locale";
import { isCanonicalSiteCode, isSiteCode, type SiteCode } from "./site-code";
import { isLocalePathKey } from "./site-locale";

/**
 * THE PAGE-SOURCE CONTRACT — TWO FIRST-CLASS AUTHORING MODES
 * =========================================================
 *
 * A page is authored in exactly ONE of two first-class modes, and this module
 * declares — as pure data and pure functions — where each mode's files live and
 * in what ORDER a request is answered. It performs no filesystem access, parses
 * nothing and renders nothing: it is a `@/core` rule.
 *
 *   `markdown`  the accessibility-first mode: ordinary Markdown under
 *               `content/pages/markdown/<site>/<locale>/<route-path>.md`, for an author
 *               who should need nothing but a text editor. Its safety policy lives in
 *               `@/core/markdown-policy` + `@/core/safe-url`.
 *   `json`      the advanced mode: validated declarative data under
 *               `content/pages/json/<site>/<locale>/<route-path>.json`, for an author
 *               who needs presentation the Markdown mode does not offer. It is
 *               schema-validated and non-executable.
 *
 * A `<route-path>` is one segment (`about`) or several (`offerings/website-design`),
 * because a page's URL is built from folders as well as files: see
 * `@/core/page-route-path` for the ONE rule, which refuses traversal, empty segments
 * and anything that is not a safe slug.
 *
 * THE SITE IS PART OF THE ADDRESS (FOUNDATION-S1)
 * ----------------------------------------------
 * A page's identity is `site + locale + routePath`, and the SITE segment comes first: its CODE
 * is a recognized two-letter country code or the reserved `ww` (`@/core/site-code`). Two sites
 * may therefore serve the SAME language at the SAME route path and never collide:
 *
 *     content/pages/markdown/ca/en/about.md      → site ca, en,    about
 *     content/pages/markdown/ca/fr/about.md      → site ca, fr,    about
 *     content/pages/markdown/fr/fr/about.md      → site fr, fr,    about
 *
 * There is ONE shape — always site-scoped — with no site-less alternative and no
 * compatibility alias, so an author has exactly one predictable filesystem model: the URL of a
 * page is its path under `content/`, with the site code first.
 *
 * A MODE ROOT HOLDS DOCUMENTATION BESIDE ITS SITE DIRECTORIES
 * ----------------------------------------------------------
 * `content/pages/markdown/README.md` and `content/pages/json/README.md` are the two
 * authoring guides, and only files INSIDE a site directory (and inside a locale directory
 * within it) are page candidates. `README` is not a well-formed slug and a mode root has no
 * site segment, so documentation can never become a page, for two independent reasons. The
 * same rule applies at EVERY level, so a README beside nested pages is equally inert.
 *
 * A DIRECTORY'S EXISTENCE IS NOT PUBLICATION
 * ------------------------------------------
 * A site directory, a locale directory or any folder inside one MAY BE EMPTY: a deployment
 * may prepare a site, a language or a section before it has anything to put in it, and an
 * empty directory is an ordinary state rather than a fault. What the public site serves is
 * decided by the deployment's SITE configuration — which sites, which locales, which default
 * locale — never by the authoring tree.
 *
 * RESOLUTION POLICY (the rule a resolver must implement)
 * -----------------------------------------------------
 *   1. requested-locale JSON        3. site-default-locale JSON
 *   2. requested-locale Markdown    4. site-default-locale Markdown
 *                                   5. not found
 *
 * Steps 3–4 apply ONLY when the SITE permits fallback, and the default locale is the SITE's
 * — never the deployment's, and never another site's. Two consequences must never be
 * "simplified": **JSON wins over Markdown within one locale** (the more capable declaration
 * is served when a route exists in both, and two modes compete only when they carry the SAME
 * site, locale and route path), and **an exact-locale page beats a fallback-locale page** (a
 * German Markdown page answers a German URL even when an English JSON page exists, because
 * the visitor asked for German — fallback is a last resort, never a preference of format
 * over language). Both rules apply to the COMPLETE route path: a nested page is resolved
 * exactly as a top-level one is.
 *
 * NO CROSS-SITE LOOKUP. The request names ONE site and the providers are bound to that
 * site's tree, so a missing page in one site can never be answered from another — not as a
 * fallback, not as a convenience.
 *
 * SECURITY POSTURE (recorded with the contract)
 * --------------------------------------------
 * Both modes are CONTENT and DATA, never executable code: no `eval`, no
 * executable expressions, no arbitrary JavaScript, no author-selected imports,
 * no script or event-handler injection, no unsafe URL schemes, and no
 * unrestricted HTML escape hatch. The Markdown mode's policy is explicit
 * (`@/core/markdown-policy`); the JSON mode's breadth will come from a validated
 * vocabulary of platform-supported components. Unknown or invalid structured
 * content must FAIL loudly rather than being ignored, guessed at or turned into
 * behaviour.
 */

/** The two first-class authoring modes. A page is authored in exactly one of them. */
export type PageAuthoringMode = "json" | "markdown";

/**
 * The authoring modes, in precedence order — the ONLY page-source kinds. There is
 * no third entry and no compatibility entry: a page source is always one of these.
 */
export const PAGE_AUTHORING_MODES: readonly PageAuthoringMode[] = ["json", "markdown"];

/** The authoring root each mode's pages live under, repository-relative (POSIX). */
export const PAGE_AUTHORING_ROOTS: Readonly<Record<PageAuthoringMode, string>> = {
  json: "content/pages/json",
  markdown: "content/pages/markdown",
};

/** The file extension each mode's page files carry. */
export const PAGE_AUTHORING_EXTENSIONS: Readonly<Record<PageAuthoringMode, string>> = {
  json: "json",
  markdown: "md",
};

/** Which locale a precedence step names: the one that was requested, or the default one. */
export type PageSourceLocaleRole = "requested" | "default";

/** One step of the resolution policy. */
export interface PageSourceStep {
  readonly kind: PageAuthoringMode;
  readonly locale: PageSourceLocaleRole;
}

/**
 * THE PRECEDENCE CONTRACT, in order. Read top to bottom: the first step whose
 * source exists answers the request. The default-locale steps are only considered
 * when fallback is permitted for the request.
 */
export const PAGE_RESOLUTION_ORDER: readonly PageSourceStep[] = [
  { kind: "json", locale: "requested" },
  { kind: "markdown", locale: "requested" },
  { kind: "json", locale: "default" },
  { kind: "markdown", locale: "default" },
];

/** A resolution request: what is being asked for, and whether fallback is permitted. */
export interface PageSourceRequest {
  /**
   * The CODE of the site whose tree may answer (`ca`, `fr`, `ww`). A page's identity is
   * `site + locale + routePath`, so a request always names ONE site — which is what makes a
   * cross-site lookup unrepresentable rather than merely forbidden.
   */
  readonly siteId: SiteCode;
  /** The page's route path: one segment (`about`) or several (`offerings/website-design`). */
  readonly routePath: string;
  /** The LOCALE PATH KEY the visitor asked for (`en`, `fr-ca`) — the content directory. */
  readonly locale: Locale;
  /** THE SITE'S default LOCALE PATH KEY — the only locale a fallback may come from. */
  readonly defaultLocale: Locale;
  /** Whether the site's default locale may answer for the requested one. Defaults to true. */
  readonly fallback?: boolean;
}

/**
 * One place a request could be answered from, after the requested/default role has
 * been resolved to an actual locale. It deliberately carries no path: how a kind
 * locates its source is that kind's own business, so the precedence logic never
 * restates a filesystem layout.
 */
export interface PageResolutionCandidate {
  readonly kind: PageAuthoringMode;
  readonly locale: Locale;
  /**
   * True when this candidate's locale is the DEFAULT locale standing in for a
   * different requested locale — the fact a page needs in order to declare itself
   * a fallback honestly.
   */
  readonly fallback: boolean;
}

/**
 * A request's candidates, IN RESOLUTION ORDER — a mechanical expansion of
 * `PAGE_RESOLUTION_ORDER`, with the default-locale steps omitted when fallback is
 * not permitted (or when the requested locale IS the default locale, in which
 * case a fallback step would merely repeat the exact-locale ones).
 *
 * Returns an empty list for a malformed request — a route path that could not name
 * a page (a traversal attempt, an empty segment, too deep), or a locale that is not
 * a well-formed language tag. Fallback answers a VALID language that has no page; it
 * must never answer a request that names no language at all.
 */
export function pageResolutionCandidates(
  request: PageSourceRequest,
): readonly PageResolutionCandidate[] {
  const { siteId, routePath, locale, defaultLocale, fallback = true } = request;
  if (
    !isSiteCode(siteId) ||
    !isPageRoutePath(routePath) ||
    !isLocalePathKey(locale) ||
    !isLocalePathKey(defaultLocale)
  ) {
    return [];
  }

  const fallbackAllowed = fallback && locale !== defaultLocale;
  const candidates: PageResolutionCandidate[] = [];

  for (const step of PAGE_RESOLUTION_ORDER) {
    if (step.locale === "default" && !fallbackAllowed) continue;
    const stepLocale = step.locale === "requested" ? locale : defaultLocale;
    candidates.push({ kind: step.kind, locale: stepLocale, fallback: stepLocale !== locale });
  }

  return candidates;
}

/** One entry of an authoring root's directory listing, in the shape a reader supplies. */
export interface AuthoringRootEntry {
  readonly name: string;
  readonly directory: boolean;
}

/**
 * The SITE directories of an authoring root, from its listing.
 *
 * A directory must be a recognized LOWERCASE site code (or `ww`) to count. Anything else — the
 * root's README, a stray file, a directory whose name is not a site code — is ignored, and
 * ignoring it is never an error. A site directory MAY BE EMPTY: discovery reports what
 * exists, never what is published.
 */
export function authoringSiteDirectories(entries: readonly AuthoringRootEntry[]): readonly string[] {
  const sites = entries
    .filter((entry) => entry.directory && isCanonicalSiteCode(entry.name))
    .map((entry) => entry.name);
  return [...new Set(sites)].sort();
}

/**
 * The locale directories of ONE SITE inside an authoring root, from that site directory's
 * listing. A directory must be a LOCALE PATH KEY (lowercase: `en`, `fr`, `fr-ca`) to count.
 */
export function authoringLocaleDirectories(
  entries: readonly AuthoringRootEntry[],
): readonly string[] {
  const locales = entries
    .filter((entry) => entry.directory && isLocalePathKey(entry.name))
    .map((entry) => entry.name);
  return [...new Set(locales)].sort();
}

/**
 * One site's locale directory, repository-relative (POSIX) — for example
 * `content/pages/markdown/ca/en`. Returns `null` for a malformed mode, site or locale, so
 * a caller can never build a path from a string it has not validated.
 */
export function pageSourceDirectory(
  mode: PageAuthoringMode,
  siteId: SiteCode,
  locale: Locale,
): string | null {
  if (!PAGE_AUTHORING_MODES.includes(mode) || !isSiteCode(siteId) || !isLocalePathKey(locale)) {
    return null;
  }
  return `${PAGE_AUTHORING_ROOTS[mode]}/${siteId}/${locale}`;
}

/**
 * One page source file, repository-relative (POSIX) — for example
 * `content/pages/markdown/ca/en/ueber-uns.md`, or
 * `content/pages/json/fr/fr/offerings/web-design.json` for a nested page in another site.
 * `null` for a malformed mode, site, locale or route path, so an arbitrary
 * string can never address a file — and a traversal attempt can never leave the root.
 */
export function pageSourceFile(
  mode: PageAuthoringMode,
  siteId: SiteCode,
  locale: Locale,
  routePath: string,
): string | null {
  if (!isPageRoutePath(routePath)) return null;
  const directory = pageSourceDirectory(mode, siteId, locale);
  return directory === null ? null : `${directory}/${routePath}.${PAGE_AUTHORING_EXTENSIONS[mode]}`;
}
