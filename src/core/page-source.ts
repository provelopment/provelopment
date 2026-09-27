import { isPageRoutePath } from "./page-route-path";
import { isWellFormedLocale, type Locale } from "./locale";

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
 *               `content/pages/markdown/<locale>/<route-path>.md`, for an author who
 *               should need nothing but a text editor. Its safety policy lives in
 *               `@/core/markdown-policy` + `@/core/safe-url`.
 *   `json`      the advanced mode: validated declarative data under
 *               `content/pages/json/<locale>/<route-path>.json`, for an author who
 *               needs presentation the Markdown mode does not offer. It is
 *               schema-validated and non-executable, and the vocabulary that
 *               interprets it is a later increment; this contract declares the mode,
 *               its root and its place in the order.
 *
 * A `<route-path>` is one segment (`about`) or several (`offerings/website-design`),
 * because a page's URL is built from folders as well as files: see
 * `@/core/page-route-path` for the ONE rule, which refuses traversal, empty segments
 * and anything that is not a safe slug.
 *
 * Those are the ONLY page-source kinds. There is no third kind and no compatibility
 * kind: `content/` holds this platform's pages and assets and NOTHING else — there
 * are no separate author-facing collections to compete with the page model, so no
 * file outside the two roots can name, answer or shadow a page.
 *
 * A ROOT HOLDS DOCUMENTATION BESIDE ITS LOCALE DIRECTORIES
 * -------------------------------------------------------
 * Only files INSIDE a locale directory are page candidates, so a root-level file has
 * no locale segment, and `README` is not a well-formed slug either (see
 * `isContentSlug`) — so an authoring root's documentation can never become a page,
 * for two independent reasons. `.gitkeep` is refused by the same rule, and because
 * the rule applies at EVERY level, a README beside nested pages is equally inert.
 *
 * A DIRECTORY'S EXISTENCE IS NOT PUBLICATION
 * ------------------------------------------
 * A locale directory — or any folder inside it — MAY BE EMPTY: a site may prepare a
 * language or a section before it has anything to put in it, and an empty directory
 * is an ordinary state rather than a fault. Creating `content/pages/markdown/de/`
 * publishes nothing, creates no route and adds no sitemap entry — what the public
 * site serves is decided by the site's own locale configuration, never by the
 * authoring tree.
 *
 * RESOLUTION POLICY (the rule a resolver must implement)
 * -----------------------------------------------------
 *   1. requested-locale JSON        3. default-locale JSON
 *   2. requested-locale Markdown    4. default-locale Markdown
 *                                   5. not found
 * Steps 3–4 apply ONLY when fallback is permitted. Two consequences must never
 * be "simplified": **JSON wins over Markdown within one locale** (the more
 * capable declaration is served when a route exists in both), and **an
 * exact-locale page beats a fallback-locale page** (a German Markdown page
 * answers a German URL even when an English JSON page exists, because the
 * visitor asked for German — fallback is a last resort, never a preference of
 * format over language). Both rules apply to the COMPLETE route path: a nested page
 * is resolved exactly as a top-level one is.
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
  /** The page's route path: one segment (`about`) or several (`offerings/website-design`). */
  readonly routePath: string;
  /** The locale the visitor asked for. */
  readonly locale: Locale;
  /** The site's default locale — the only locale a fallback may come from. */
  readonly defaultLocale: Locale;
  /** Whether the default locale may answer for the requested one. Defaults to true. */
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
  const { routePath, locale, defaultLocale, fallback = true } = request;
  if (!isPageRoutePath(routePath) || !isWellFormedLocale(locale) || !isWellFormedLocale(defaultLocale)) {
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
 * The locale directories of an authoring root, from its listing.
 *
 * A directory must be a WELL-FORMED LANGUAGE TAG to count. Anything else — the
 * root's README, a stray file, a directory whose name is not a language — is
 * ignored, and ignoring it is never an error. A locale directory MAY BE EMPTY:
 * discovery reports what exists, never what is published.
 */
export function authoringLocaleDirectories(
  entries: readonly AuthoringRootEntry[],
): readonly string[] {
  const locales = entries
    .filter((entry) => entry.directory && isWellFormedLocale(entry.name))
    .map((entry) => entry.name);
  return [...new Set(locales)].sort();
}

/**
 * One authoring locale directory, repository-relative (POSIX) — for example
 * `content/pages/markdown/de`. Returns `null` for a malformed mode or locale, so a
 * caller can never build a path from a string it has not validated.
 */
export function pageSourceDirectory(mode: PageAuthoringMode, locale: Locale): string | null {
  if (!PAGE_AUTHORING_MODES.includes(mode) || !isWellFormedLocale(locale)) return null;
  return `${PAGE_AUTHORING_ROOTS[mode]}/${locale}`;
}

/**
 * One page source file, repository-relative (POSIX) — for example
 * `content/pages/markdown/de/ueber-uns.md`, or
 * `content/pages/markdown/de/offerings/web-design.md` for a nested page. `null` for a
 * malformed mode, locale or route path, so an arbitrary string can never address a
 * file — and a traversal attempt can never leave the authoring root.
 */
export function pageSourceFile(
  mode: PageAuthoringMode,
  locale: Locale,
  routePath: string,
): string | null {
  if (!isPageRoutePath(routePath)) return null;
  const directory = pageSourceDirectory(mode, locale);
  return directory === null ? null : `${directory}/${routePath}.${PAGE_AUTHORING_EXTENSIONS[mode]}`;
}
