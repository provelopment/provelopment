// deployment/tests/support/authored-page-outline.mjs
// AUTHORED PAGE OUTLINES — a deployment page's own source, read as the TEST's expectation.
// ========================================================================================
//
// WHY THIS EXISTS (FOUNDATION-MULTISITE-M21, pre-freeze hardening)
// ---------------------------------------------------------------
// Authored page prose is DEPLOYMENT DATA, never a test contract. A title, description, heading,
// paragraph, callout or action label changes whenever the owner edits the page, so a test that
// quotes today's wording fails tomorrow for a reason that is not a defect — exactly what PR #237
// exposed, when the owner's editorial pass invalidated eleven assertions that had pinned copy.
//
// The deployment's acceptance suite therefore DERIVES what a page should show from the page's own
// source, at the moment the test runs, and asserts the INVARIANTS instead:
//
//   · the authored source parses (JSON document, Markdown frontmatter),
//   · every authored heading reaches the rendered outline,
//   · the authored prose bodies reach the rendered text,
//   · the authored link destinations reach the rendered anchors,
//   · the page belongs to the right Spoke / Site / locale (route identity, canonical origin),
//   · no other Spoke's content is ever rendered here.
//
// No function here returns a hard-coded string: every value is read out of the file the owner
// authored. Reintroducing a prose pin therefore takes a deliberate act, not a "fix".
//
// The rule itself is recorded for future agents in `AGENTS.md`, `deployment/AGENTS.md` and
// `tests/browser/README.md`.
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * @typedef {object} PageOutline
 * @property {"json" | "markdown"} kind
 * @property {string} title         the authored page title (what the page renders as its h1)
 * @property {string} [description] the authored summary, when the page declares one
 * @property {string[]} headings    every authored heading, in authoring order
 * @property {string[]} prose       every authored body/lede/paragraph, in authoring order
 * @property {string[]} links       every authored link destination
 */

/** The directory that owns a Spoke's authored state: the parent of its `site.config.json`. */
export function spokeDirectory(configFile) {
  return path.dirname(configFile);
}

/** Read a file, or answer `null` when it does not exist (an absent page is not an error here). */
async function readIfPresent(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

/** The frontmatter block of an authored Markdown page, and its body. */
function splitFrontmatter(markdown) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
  if (!match) return { frontmatter: "", body: markdown };
  return { frontmatter: match[1], body: markdown.slice(match[0].length) };
}

/** Every heading text of a Markdown body, in authoring order (levels 1-6). */
export function markdownHeadings(markdown) {
  return [...splitFrontmatter(markdown).body.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((match) => match[1]);
}

/**
 * Every authored prose line of a Markdown body — paragraphs and list items, with the list marker
 * removed. Headings, rules and blank lines are not prose.
 */
export function markdownProse(markdown) {
  return splitFrontmatter(markdown)
    .body.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#") && !/^([-*_])\1{2,}$/.test(line))
    .map((line) => line.replace(/^([-*]|\d+\.)\s+/, "").trim())
    .filter((line) => line !== "");
}

/** Every link destination an authored Markdown body names. */
export function markdownLinks(markdown) {
  const text = splitFrontmatter(markdown).body;
  const inline = [...text.matchAll(/\[[^\]]*\]\((?:<)?([^)\s>]+)(?:>)?\)/g)].map((match) => match[1]);
  const bare = [...text.matchAll(/https?:\/\/[^\s)<>"']+/g)].map((match) => match[0]);
  return [...new Set([...inline, ...bare])];
}

/** The authored title declared in a Markdown page's frontmatter. */
export function markdownTitle(markdown) {
  const match = /^title:\s*(.+?)\s*$/m.exec(splitFrontmatter(markdown).frontmatter);
  return match ? match[1].replace(/^["']|["']$/g, "") : "";
}

/** The authored summary declared in a Markdown page's frontmatter. */
export function markdownDescription(markdown) {
  const match = /^description:\s*(.+?)\s*$/m.exec(splitFrontmatter(markdown).frontmatter);
  return match ? match[1].replace(/^["']|["']$/g, "") : "";
}

/** Every string value of a named property anywhere inside a declarative document, in authoring order. */
function collectStrings(value, property) {
  const found = [];
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (const entry of node) walk(entry);
      return;
    }
    if (node === null || typeof node !== "object") return;
    for (const [key, entry] of Object.entries(node)) {
      if (key === property) {
        if (typeof entry === "string" && entry.trim() !== "") found.push(entry.trim());
        else if (entry && typeof entry === "object") walk(entry);
      } else {
        walk(entry);
      }
    }
  };
  walk(value);
  return found;
}

/** The outline of a validated declarative (JSON) page document. */
export function jsonOutline(document) {
  // Section headings, plus the column/card item titles that render as the section's sub-headings.
  const headings = collectStrings(document.sections, "heading");
  const itemTitles = collectStrings(document.sections, "title").filter(
    (title) => title !== document.title,
  );
  const prose = [
    ...collectStrings(document.sections, "lede"),
    ...collectStrings(document.sections, "body"),
    ...collectStrings(document.sections, "intro"),
  ];
  return {
    kind: "json",
    title: typeof document.title === "string" ? document.title : "",
    description: typeof document.description === "string" ? document.description : undefined,
    headings: [...new Set([...headings, ...itemTitles])],
    prose,
    links: [...new Set([...collectStrings(document.sections, "href"), ...prose.flatMap(markdownLinks)])],
  };
}

/** The outline of an authored Markdown page. */
export function markdownOutline(markdown) {
  return {
    kind: "markdown",
    title: markdownTitle(markdown),
    description: markdownDescription(markdown) || undefined,
    headings: markdownHeadings(markdown),
    prose: markdownProse(markdown),
    links: markdownLinks(markdown),
  };
}

/** The JSON page file of one coordinate, then the Markdown one — the declared precedence. */
function pageFileCandidates(spokeDir, site, locale, slug) {
  return [
    { kind: "json", file: path.join(spokeDir, "content", "pages", "json", site, locale, `${slug}.json`) },
    {
      kind: "markdown",
      file: path.join(spokeDir, "content", "pages", "markdown", site, locale, `${slug}.md`),
    },
  ];
}

/**
 * ONE authored coordinate's outline, read from the DEPLOYMENT's own tree — the test's authority.
 *
 * @param {string} spokeDir the Spoke's directory (see `spokeDirectory`)
 * @param {{ site: string, locale: string, slug: string }} coordinate
 * @returns {Promise<PageOutline | null>} `null` when this coordinate authors no page
 */
export async function readPageOutline(spokeDir, { site, locale, slug }) {
  for (const candidate of pageFileCandidates(spokeDir, site, locale, slug)) {
    const content = await readIfPresent(candidate.file);
    if (content === null) continue;
    return candidate.kind === "json" ? jsonOutline(JSON.parse(content)) : markdownOutline(content);
  }
  return null;
}

/** The authored titles a Spoke publishes for a set of coordinates — the isolation markers. */
export async function readAuthoredTitles(spokeDir, coordinates) {
  const titles = [];
  for (const coordinate of coordinates) {
    const outline = await readPageOutline(spokeDir, coordinate);
    if (outline && outline.title !== "") titles.push(outline.title);
  }
  return [...new Set(titles)];
}

/**
 * A Spoke's own UI dictionary for one locale, as authored — so a test can assert what a RENDERED
 * control shows against the dictionary that is supposed to feed it, instead of quoting the label.
 */
export async function readSpokeDictionary(spokeDir, locale) {
  return JSON.parse(await readFile(path.join(spokeDir, "config", "i18n", `${locale}.json`), "utf8"));
}

/** A Spoke's configured region labels, in configuration order (the Location control's own choices). */
export async function readConfiguredRegionLabels(spokeDir) {
  const config = JSON.parse(await readFile(path.join(spokeDir, "site.config.json"), "utf8"));
  return Object.values(config.business?.regions ?? {}).map((region) => region.label);
}

/** The visible text of an HTML document: scripts and styles dropped, tags spaced, entities decoded. */
export function textOfHtml(html) {
  return String(html)
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A comparison key for authored prose: Markdown emphasis, links and list markers, and ALL
 * whitespace, are removed on both sides of a comparison. That makes "does this authored sentence
 * reach the served page?" robust to how a renderer inserts or omits whitespace between elements.
 */
export function proseKey(text) {
  return String(text)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, "");
}

/**
 * Does a served document carry this authored text?
 *
 * The haystack may be raw HTML: tags are dropped first, so an inline `<strong>`/`<a>` inside a
 * sentence cannot break the match, and Markdown emphasis/whitespace differences are ignored.
 */
export function includesProse(haystack, needle) {
  const key = proseKey(needle);
  return key !== "" && proseKey(textOfHtml(haystack)).includes(key);
}

/** Does a served document carry ANY of these authored strings? (A cross-Spoke leak marker.) */
export function includesAnyProse(haystack, needles) {
  return needles.some((needle) => includesProse(haystack, needle));
}

/** Every level-1 heading text of a served document, in document order. */
export function h1Texts(html) {
  return [...String(html).matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => textOfHtml(match[1]));
}

/** Every heading tag (any level) of a served document, as raw markup, in document order. */
export function headingTags(html) {
  return [...String(html).matchAll(/<h[1-6]\b[^>]*>/gi)].map((match) => match[0]);
}

/** The `id` each heading carries, or `null` where a heading declares none. */
export function headingIds(html) {
  return headingTags(html).map((tag) => /id="([^"]*)"/.exec(tag)?.[1] ?? null);
}
