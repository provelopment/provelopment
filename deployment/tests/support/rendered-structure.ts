/**
 * STRUCTURAL FACTS ABOUT A RENDERED PAGE (FOUNDATION-MULTISITE-M21)
 * ================================================================
 *
 * What a deployment's own tests may legitimately assert about a rendered page: its SHAPE and its
 * RESOLUTION. Never its wording, and never the authored content behind it.
 *
 * This module deliberately knows nothing about pages. It does not read a JSON document, a Markdown
 * file or any other authored source: the APPLICATION owns parsing and validation, and test-owned
 * fixtures prove that parser. What is read here is the RENDERED OUTPUT plus the deployment's own
 * resolution authority.
 *
 * The rule it implements is recorded in `AGENTS.md` §14: a test must not fail because a page's prose
 * changed, a heading was renamed, or two websites happen to share a title.
 */

/** The heading levels of a rendered document, in document order. */
export function headingLevels(html: string): number[] {
  return [...html.matchAll(/<h([1-6])\b[^>]*>/gi)].map((match) => Number(match[1]));
}

/**
 * The structural issues of a heading outline: it must open with its level-1 heading, carry EXACTLY one,
 * and never skip a level. Assistive technology and search engines read this shape; the words are moot.
 */
export function headingOutlineIssues(levels: readonly number[]): string[] {
  const issues: string[] = [];
  const firstLevel = levels[0];
  if (firstLevel !== 1) issues.push("the document does not open with its level-1 heading");
  const h1Count = levels.filter((level) => level === 1).length;
  if (h1Count !== 1) issues.push(`expected exactly one level-1 heading, found ${h1Count}`);
  for (let index = 1; index < levels.length; index += 1) {
    if (levels[index]! - levels[index - 1]! > 1) {
      issues.push(`heading level skips from h${levels[index - 1]} to h${levels[index]}`);
    }
  }
  return issues;
}

/**
 * How many declarative sections the JSON composer stamped, in authoring order.
 *
 * `src/components/site/page-document-content.tsx` numbers each authored section (`page-section-<n>`)
 * and the presentation of the sections that carry a heading emits that id — so a rendered page whose
 * ids are UNIQUE and STRICTLY INCREASING proves the DOCUMENT was composed, in the order it declares.
 * A Markdown page carries none of these ids, which is what keeps the two modes distinguishable.
 * No authored word is read.
 */
export function declarativeSectionCount(html: string): number {
  const numbers = [...html.matchAll(/id="page-section-(\d+)"/g)].map((match) => Number(match[1]));
  if (numbers.length === 0) return 0;
  const strictlyIncreasing = numbers.every((value, index) => index === 0 || value > numbers[index - 1]!);
  const unique = new Set(numbers).size === numbers.length;
  return strictlyIncreasing && unique ? numbers.length : 0;
}

/**
 * The Markdown renderer's OWN section anchors — its generated heading ids, with the declarative
 * composer's `page-section-<n>` ids excluded, so the two authoring modes stay distinguishable.
 */
export function markdownSectionAnchors(html: string): string[] {
  return [...html.matchAll(/<h[2-6]\b[^>]*\bid="([^"]+)"[^>]*>/gi)]
    .map((match) => match[1]!)
    .filter((id) => !id.startsWith("page-section-"));
}

/** The internal destinations a rendered document carries, with fragments stripped (anchors only). */
export function internalDestinations(html: string): string[] {
  return [
    ...new Set(
      [...html.matchAll(/<a\b[^>]*?\bhref="(\/[^"#]*)"/gi)]
        .map((match) => match[1]!)
        .filter((href) => href !== ""),
    ),
  ];
}

/**
 * The internal destinations of a rendered page that do NOT resolve.
 *
 * The caller supplies the deployment's own resolution authority, so an internal link is "valid"
 * because the page really exists — not because it matches a string a test was told to expect.
 */
export async function unresolvedDestinations(
  html: string,
  resolve: (slug: string) => Promise<unknown>,
  options: { readonly prefixes: readonly string[]; readonly homeSlug: string },
): Promise<string[]> {
  const unresolved: string[] = [];
  for (const href of internalDestinations(html)) {
    // The deployment's ACCEPTED destination forms: the site-scoped path and the locale-rooted path
    // (the platform completes the latter into the former — its own documented locale policy).
    const prefix = options.prefixes.find((candidate) => href.startsWith(candidate)) ?? "";
    const slug = href.slice(prefix.length).replace(/^\/+/, "");
    const answers = await resolve(slug === "" ? options.homeSlug : slug);
    if (answers === null || answers === undefined) unresolved.push(href);
  }
  return unresolved;
}
