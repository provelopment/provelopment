import { isContentSlug } from "./page-content";
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
 *               `config/pages-markdown/<locale>/<slug>.md`, for an author who
 *               should need nothing but a text editor. Its safety policy lives in
 *               `@/core/markdown-policy` + `@/core/safe-url`.
 *   `json`      the advanced mode: validated declarative data under
 *               `config/pages-json/<locale>/<slug>.json`, for an author who needs
 *               presentation the Markdown mode does not offer. The vocabulary
 *               that interprets it is a later increment; this contract declares
 *               the mode, its root and its place in the order.
 *
 * Those are the TWO modes. The historical `content/pages/**` mechanism is
 * **legacy compatibility**, not a third mode: existing adopters keep it, its
 * trusted-raw-HTML behaviour is preserved unchanged, and new sites are expected
 * to use the two `config/pages-*` roots. It appears in the resolution order
 * because a request must still be answerable from it — it does not appear in
 * `PAGE_AUTHORING_MODES`.
 *
 * A ROOT HOLDS DOCUMENTATION BESIDE ITS LOCALE DIRECTORIES
 * -------------------------------------------------------
 * Only files INSIDE a locale directory are page candidates, so every path built
 * here has exactly three segments — `<root>/<locale>/<slug>.<ext>`. A root-level
 * file has no locale segment, and `README` is not a well-formed slug either (see
 * `isContentSlug`), so an authoring root's documentation can never become a page
 * — for two independent reasons. `.gitkeep` is refused by the same rule.
 *
 * A DIRECTORY'S EXISTENCE IS NOT PUBLICATION
 * ------------------------------------------
 * A locale directory MAY BE EMPTY: a site may prepare a language before it has
 * anything to put in it, and an empty directory is an ordinary state rather than
 * a fault. Creating `config/pages-markdown/de/` publishes nothing, creates no
 * route and adds no sitemap entry — what the public site serves is decided by
 * the site's own locale configuration, never by the authoring tree.
 *
 * RESOLUTION POLICY (the rule a resolver must implement)
 * -----------------------------------------------------
 *   1. requested-locale JSON        4. default-locale JSON
 *   2. requested-locale Markdown    5. default-locale Markdown
 *   3. requested-locale content     6. default-locale content
 *                                   7. not found
 * Steps 4–6 apply ONLY when fallback is permitted. Two consequences must never
 * be "simplified": **JSON wins over Markdown within one locale** (the more
 * capable declaration is served when a slug exists in both), and **an
 * exact-locale page beats a fallback-locale page** (a German Markdown page
 * answers a German URL even when an English JSON page exists, because the
 * visitor asked for German — fallback is a last resort, never a preference of
 * format over language).
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
 * The first-class modes, in precedence order. The legacy content mechanism is
 * deliberately absent — it is compatibility, not a mode.
 */
export const PAGE_AUTHORING_MODES: readonly PageAuthoringMode[] = ["json", "markdown"];

/** The authoring root each mode's pages live under, repository-relative (POSIX). */
export const PAGE_AUTHORING_ROOTS: Readonly<Record<PageAuthoringMode, string>> = {
  json: "config/pages-json",
  markdown: "config/pages-markdown",
};

/** The file extension each mode's page files carry. */
export const PAGE_AUTHORING_EXTENSIONS: Readonly<Record<PageAuthoringMode, string>> = {
  json: "json",
  markdown: "md",
};

/**
 * Every kind a request can be answered from. `content` is the legacy
 * compatibility mechanism: it is a kind, never a first-class authoring mode.
 */
export type PageSourceKind = PageAuthoringMode | "content";

/** Which locale a precedence step names: the one that was requested, or the default one. */
export type PageSourceLocaleRole = "requested" | "default";

/** One step of the resolution policy. */
export interface PageSourceStep {
  readonly kind: PageSourceKind;
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
  { kind: "content", locale: "requested" },
  { kind: "json", locale: "default" },
  { kind: "markdown", locale: "default" },
  { kind: "content", locale: "default" },
];

/**
 * The AUTHORING projection of the resolution order — the two first-class modes,
 * in order, with the compatibility kind removed. A test asserts that the two
 * agree, so the declared policy cannot drift from the applied one.
 */
export function authoringPrecedenceOfResolutionOrder(): readonly PageSourceStep[] {
  return PAGE_RESOLUTION_ORDER.filter((step) => step.kind !== "content");
}

/** A resolution request: what is being asked for, and whether fallback is permitted. */
export interface PageSourceRequest {
  readonly slug: string;
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
  readonly kind: PageSourceKind;
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
 * Returns an empty list for a malformed request — a slug that cannot be a page,
 * or a locale that is not a well-formed language tag. Fallback answers a VALID
 * language that has no page; it must never answer a request that names no
 * language at all.
 */
export function pageResolutionCandidates(
  request: PageSourceRequest,
): readonly PageResolutionCandidate[] {
  const { slug, locale, defaultLocale, fallback = true } = request;
  if (!isContentSlug(slug) || !isWellFormedLocale(locale) || !isWellFormedLocale(defaultLocale)) {
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
 * The page slugs one locale directory's listing contains, for one mode.
 *
 * Only files carrying that mode's extension AND a well-formed slug count, so a
 * README, a placeholder (`.gitkeep`) or an unrelated file is ignored even when it
 * sits inside a locale directory. An empty directory yields no slugs and no
 * error.
 */
export function pageSlugsInLocaleDirectory(
  mode: PageAuthoringMode,
  entries: readonly string[],
): readonly string[] {
  const suffix = `.${PAGE_AUTHORING_EXTENSIONS[mode]}`;
  const slugs = entries
    .filter((entry) => entry.endsWith(suffix))
    .map((entry) => entry.slice(0, -suffix.length))
    .filter((slug) => isContentSlug(slug));
  return [...new Set(slugs)].sort();
}

/**
 * One authoring locale directory, repository-relative (POSIX) — for example
 * `config/pages-markdown/de`. Returns `null` for a malformed mode or locale, so a
 * caller can never build a path from a string it has not validated.
 */
export function pageSourceDirectory(mode: PageAuthoringMode, locale: Locale): string | null {
  if (!PAGE_AUTHORING_MODES.includes(mode) || !isWellFormedLocale(locale)) return null;
  return `${PAGE_AUTHORING_ROOTS[mode]}/${locale}`;
}

/**
 * One page source file, repository-relative (POSIX) — for example
 * `config/pages-markdown/de/ueber-uns.md`. `null` for a malformed mode, locale or
 * slug, so an arbitrary string can never address a file.
 */
export function pageSourceFile(
  mode: PageAuthoringMode,
  locale: Locale,
  slug: string,
): string | null {
  if (!isContentSlug(slug)) return null;
  const directory = pageSourceDirectory(mode, locale);
  return directory === null ? null : `${directory}/${slug}.${PAGE_AUTHORING_EXTENSIONS[mode]}`;
}
