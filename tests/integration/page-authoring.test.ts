import { existsSync, mkdirSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// A page route signals "nothing answers this URL" through `notFound()`. In a node
// test that is a controlled signal, so it is stubbed — which also lets the
// not-found path be asserted directly.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import PageRoute, {
  generateMetadata,
  generateStaticParams,
} from "@/app/[locale]/[...path]/page";
import HomePage from "@/app/[locale]/page";
import sitemap from "@/app/sitemap";
import { siteConfig } from "@/config";

/**
 * THE ONE PAGE MODEL, THROUGH THE REAL APPLICATION (FOUNDATION-PAGES-A1/A1E).
 *
 * A1E succeeds only if a REAL file under `content/pages/markdown/<locale>/…`
 * produces a REAL generated page — a static route, its metadata, its sitemap entry —
 * through the normal Foundation application, at ANY depth, without a bespoke route or
 * a second content store. These fixtures prove in particular:
 *
 *   · a NESTED page (`zz-section/website-design.md`) is discovered, statically
 *     generated, served and sitemapped exactly like a top-level one;
 *   · a nested JSON page is ordered above Markdown and stops the build naming the file
 *     (the JSON vocabulary is A2's);
 *   · the document capability an author uses survives routing (a heading fragment on a
 *     NESTED page is reachable);
 *   · a page-shaped file OUTSIDE the two mode roots publishes NOTHING (no route, no
 *     sitemap entry, a 404), and so do an EMPTY locale directory and an UNCONFIGURED
 *     one;
 *   · the locale root still renders the authored home page content-first.
 *
 * Every file here is a run fixture, created in `beforeAll` and removed afterwards:
 * the template still ships no authored pages.
 */
const root = process.cwd();
const MARKDOWN_SLUG = "zz-authoring-fixture";
const HOME_FIXTURE = "zz-home-fixture";
// A nested section, so the whole chain (discovery → params → route → sitemap) is
// exercised at a depth greater than one.
const NESTED_SECTION = "zz-section";
const NESTED_SLUG = "website-design";
const NESTED_ROUTE_PATH = `${NESTED_SECTION}/${NESTED_SLUG}`;
const NESTED_JSON_SLUG = "zz-json-only";
// A file planted outside the two mode roots.
const OUTSIDE_ROOT_SLUG = "zz-outside-root-fixture";
const EMPTY_LOCALE_NAME = "zz-empty";
// A well-formed language tag that the site does NOT configure (subtags are 2–8
// characters), holding a page that must therefore never be published.
const UNCONFIGURED_LOCALE_NAME = "zz-unconf";

const MARKDOWN_LOCALE_DIRECTORY = path.join(root, "content", "pages", "markdown", "en");
const EMPTY_LOCALE_DIRECTORY = path.join(root, "content", "pages", "markdown", EMPTY_LOCALE_NAME);
const UNCONFIGURED_LOCALE_DIRECTORY = path.join(
  root,
  "content",
  "pages",
  "markdown",
  UNCONFIGURED_LOCALE_NAME,
);

const createdPaths = [
  path.join(MARKDOWN_LOCALE_DIRECTORY, `${MARKDOWN_SLUG}.md`),
  path.join(MARKDOWN_LOCALE_DIRECTORY, NESTED_SECTION, `${NESTED_SLUG}.md`),
  path.join(MARKDOWN_LOCALE_DIRECTORY, NESTED_SECTION, "README.md"),
  path.join(root, "content", "pages", "json", "en", NESTED_SECTION, `${NESTED_JSON_SLUG}.json`),
  path.join(root, "content", "pages", "en", `${OUTSIDE_ROOT_SLUG}.md`),
];

function write(file: string, contents: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
}

/**
 * Remove a file, then the folders it needed ONLY while they are empty — never a
 * recursive delete and never past the page roots, so a developer's own pages are safe
 * and a run leaves no fixture directory behind.
 */
function cleanUp(file: string): void {
  rmSync(file, { force: true });
  const rootsDirectory = path.join(root, "content", "pages");
  let directory = path.dirname(file);
  while (directory.startsWith(rootsDirectory) && directory !== rootsDirectory) {
    try {
      rmdirSync(directory);
    } catch {
      /* not empty, or already gone: leave it exactly as it is */
    }
    directory = path.dirname(directory);
  }
}

/** The route params for a page URL, from its segments (`/en/a/b` → `["a","b"]`). */
const params = (...segments: string[]) => ({
  params: Promise.resolve({ locale: "en", path: segments }),
});

const urlFor = (routePath: string) => `${siteConfig.url}/en/${routePath}`;

describe("the one page model, through the real application", () => {
  beforeAll(() => {
    // A flat page with hostile fragments in it, and an author's own fragment link.
    write(
      path.join(MARKDOWN_LOCALE_DIRECTORY, `${MARKDOWN_SLUG}.md`),
      [
        "---",
        "title: Authored fixture page",
        "description: A summary written by the author.",
        "---",
        "",
        "Ordinary **Markdown** with a [link](/about).",
        "",
        "| Day | Opens |",
        "| --- | --- |",
        "| Monday | 9:00 |",
        "",
        "See [details](#details-heading) below.",
        "",
        "## Details heading",
        "",
        "The paragraph the author's fragment link must reach.",
        "",
        "<script>window.__authorScript = true;</script>",
        "",
        '<div onclick="window.__authorHandler = true">raw html text</div>',
        "",
      ].join("\n"),
    );
    // A NESTED page: its URL is built from the folder it is authored in.
    write(
      path.join(MARKDOWN_LOCALE_DIRECTORY, NESTED_SECTION, `${NESTED_SLUG}.md`),
      [
        "# Nested fixture page",
        "",
        "See [the section](#nested-details).",
        "",
        "## Nested details",
        "",
        "Served at a nested route, with its own fragment target.",
        "",
      ].join("\n"),
    );
    // Documentation beside nested pages is inert, not content.
    write(path.join(MARKDOWN_LOCALE_DIRECTORY, NESTED_SECTION, "README.md"), "# Not a page\n");
    // A NESTED JSON page: ordered above Markdown, and not yet interpretable.
    write(
      path.join(root, "content", "pages", "json", "en", NESTED_SECTION, `${NESTED_JSON_SLUG}.json`),
      "{}\n",
    );
    // A page-shaped file OUTSIDE the two mode roots: never a page source.
    write(
      path.join(root, "content", "pages", "en", `${OUTSIDE_ROOT_SLUG}.md`),
      `---\ntitle: Outside-root page\n---\n\nThis must never be published.\n`,
    );
    // An EMPTY locale directory, and a locale the site does not configure.
    mkdirSync(EMPTY_LOCALE_DIRECTORY, { recursive: true });
    write(path.join(UNCONFIGURED_LOCALE_DIRECTORY, "a-page.md"), "# Not published\n");
  });

  afterAll(() => {
    for (const file of createdPaths) cleanUp(file);
    rmSync(EMPTY_LOCALE_DIRECTORY, { recursive: true, force: true });
    rmSync(UNCONFIGURED_LOCALE_DIRECTORY, { recursive: true, force: true });
  });

  it("generates a real static route for a flat AND a nested page", async () => {
    const generated = await generateStaticParams();
    const paths = generated
      .filter((route) => route.locale === "en")
      .map((route) => route.path.join("/"));

    expect(paths).toContain(MARKDOWN_SLUG);
    expect(paths).toContain(NESTED_ROUTE_PATH);
    // The home page is served at the locale root, never as `/{locale}/home`.
    expect(paths).not.toContain("home");
    // Documentation is inert at every level, and a file outside the mode roots is not
    // a page, so neither can produce a route.
    expect(paths).not.toContain(`${NESTED_SECTION}/README`);
    expect(paths).not.toContain("README");
    expect(paths.some((routePath) => routePath.includes(OUTSIDE_ROOT_SLUG))).toBe(false);
  });

  it("serves the authored title and summary as the page's metadata", async () => {
    const metadata = await generateMetadata(params(MARKDOWN_SLUG));
    expect(metadata.title).toBe("Authored fixture page");
    expect(metadata.description).toBe("A summary written by the author.");

    // A nested page derives its title from its OWN name, never its folder.
    const nested = await generateMetadata(params(NESTED_SECTION, NESTED_SLUG));
    expect(nested.title).toBe("Nested fixture page");
  });

  it("renders the authored Markdown page, with raw HTML inert", async () => {
    const html = renderToStaticMarkup(await PageRoute(params(MARKDOWN_SLUG)));

    expect(html).toContain("Authored fixture page");
    expect(html).toContain("<strong>Markdown</strong>");
    expect(html).toContain('<a href="/about">link</a>');
    // The hostile parts of the fixture are shown as TEXT, never as markup.
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/<[a-zA-Z][^>]*\son[a-z]+\s*=/i);
    expect(html).toContain("window.__authorScript");
  });

  it("renders the authored page's table and its own fragment target", async () => {
    const html = renderToStaticMarkup(await PageRoute(params(MARKDOWN_SLUG)));

    // The documented capability, through the real route: a GFM table…
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Day</th>");
    expect(html).toContain("<td>Monday</td>");
    // …and a heading the author's own `[details](#details-heading)` can reach.
    expect(html).toContain('<h2 id="details-heading">Details heading</h2>');
    expect(html).toContain('<a href="#details-heading">details</a>');
  });

  it("serves a NESTED page through the same route, with its fragment target intact", async () => {
    const html = renderToStaticMarkup(await PageRoute(params(NESTED_SECTION, NESTED_SLUG)));

    expect(html).toContain("Nested fixture page");
    expect(html).toContain("Served at a nested route, with its own fragment target.");
    // Nesting must not weaken the authoring capability: the generated heading id and
    // the author's fragment link work exactly as they do on a top-level page.
    expect(html).toContain('<h2 id="nested-details">Nested details</h2>');
    expect(html).toContain('<a href="#nested-details">the section</a>');
  });

  it("orders JSON above Markdown at a NESTED route, and stops the build naming the file", async () => {
    await expect(PageRoute(params(NESTED_SECTION, NESTED_JSON_SLUG))).rejects.toThrow(
      /not yet interpreted/,
    );
    await expect(PageRoute(params(NESTED_SECTION, NESTED_JSON_SLUG))).rejects.toThrow(
      new RegExp(`${NESTED_SECTION}[\\\\/]${NESTED_JSON_SLUG}\\.json`),
    );
  });

  it("never publishes a README, in any shape, and never serves an unknown path", async () => {
    const generated = await generateStaticParams();
    for (const readme of ["README", "readme"]) {
      expect(generated.some((route) => route.path.join("/") === readme), readme).toBe(false);
    }
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.some((url) => /\/readme$/i.test(url))).toBe(false);

    // The three documentation files really are present and really are not pages.
    for (const readme of [
      "content/README.md",
      "content/pages/markdown/README.md",
      "content/pages/json/README.md",
    ]) {
      expect(existsSync(path.join(root, readme)), readme).toBe(true);
    }

    // An unknown path, a traversal attempt and the reserved home segment are all 404s.
    await expect(PageRoute(params("does-not-exist"))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(PageRoute(params("README"))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(PageRoute(params("home"))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(PageRoute(params(".."))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(PageRoute(params(NESTED_SECTION, "not a slug"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("publishes no phantom page from an empty or unconfigured locale directory", async () => {
    expect(existsSync(EMPTY_LOCALE_DIRECTORY)).toBe(true);
    const generated = await generateStaticParams();

    for (const route of generated) {
      expect(route.locale, JSON.stringify(route)).not.toBe(EMPTY_LOCALE_NAME);
      expect(route.locale, JSON.stringify(route)).not.toBe(UNCONFIGURED_LOCALE_NAME);
    }
    expect(generated.some((route) => route.path.includes("a-page"))).toBe(false);
  });

  it("lists the authored pages in the sitemap, nested paths included, and nothing else", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls).toContain(urlFor(MARKDOWN_SLUG));
    expect(urls).toContain(urlFor(NESTED_ROUTE_PATH));
    // A file outside the mode roots advertises nothing…
    expect(urls.some((url) => url.includes(OUTSIDE_ROOT_SLUG))).toBe(false);
    // …and neither does an unconfigured locale, a prepared-empty one or a README.
    expect(urls.some((url) => url.includes(UNCONFIGURED_LOCALE_NAME))).toBe(false);
    expect(urls.some((url) => url.includes("a-page"))).toBe(false);
    expect(urls.some((url) => url.endsWith("/README"))).toBe(false);
    expect(urls.some((url) => url.endsWith("/home"))).toBe(false);
  });

  it("lets a safe Markdown file author the home page (content-first, unchanged order)", async () => {
    write(
      path.join(MARKDOWN_LOCALE_DIRECTORY, "home.md"),
      `# ${HOME_FIXTURE}\n\nA safe Markdown home page.\n`,
    );
    try {
      const html = renderToStaticMarkup(
        await HomePage({ params: Promise.resolve({ locale: "en" }) }),
      );
      expect(html).toContain(HOME_FIXTURE);
      expect(html).not.toContain("home-hero");
    } finally {
      cleanUp(path.join(MARKDOWN_LOCALE_DIRECTORY, "home.md"));
    }
  });
});
