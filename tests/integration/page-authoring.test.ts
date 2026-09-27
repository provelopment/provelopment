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

import ItemPage, { generateMetadata, generateStaticParams } from "@/app/[locale]/[item]/page";
import AboutPage from "@/app/[locale]/about/page";
import HomePage from "@/app/[locale]/page";
import sitemap from "@/app/sitemap";
import { siteConfig } from "@/config";

/**
 * THE TWO AUTHORING MODES, THROUGH THE REAL APPLICATION (FOUNDATION-PAGES-A1/A1C).
 *
 * A1 succeeds only if a REAL file under `config/pages-markdown/<locale>/<slug>.md`
 * produces a REAL generated page: a static route, its metadata, its sitemap entry —
 * through the normal Foundation application, not a bespoke path. The same fixtures
 * prove that a page-shaped file under `content/pages` publishes NOTHING (no route, no
 * sitemap entry, a 404), that an EMPTY locale directory and an UNCONFIGURED locale
 * directory produce no phantom route, and that a dedicated page route (`/about`)
 * renders its source through the same composition.
 *
 * The file under `config/pages-markdown/en/` is a run fixture, created here and
 * removed afterwards: the template still ships no authored pages.
 */
const root = process.cwd();
const MARKDOWN_SLUG = "zz-authoring-fixture";
const ABOUT_SLUG = "about";
const HOME_FIXTURE = "zz-home-fixture";
// A file planted under `content/pages` — the NON-page collection path.
const COLLECTION_PATH_SLUG = "zz-collection-path-fixture";
const EMPTY_LOCALE_NAME = "zz-empty";
// A well-formed language tag that the site does NOT configure (subtags are 2–8
// characters), holding a page that must therefore never be published.
const UNCONFIGURED_LOCALE_NAME = "zz-unconf";
const EMPTY_LOCALE_DIRECTORY = path.join(root, "config", "pages-markdown", EMPTY_LOCALE_NAME);
const UNCONFIGURED_LOCALE_DIRECTORY = path.join(
  root,
  "config",
  "pages-markdown",
  UNCONFIGURED_LOCALE_NAME,
);
const createdPaths = [
  path.join(root, "config", "pages-markdown", "en", `${MARKDOWN_SLUG}.md`),
  path.join(root, "config", "pages-markdown", "en", `${ABOUT_SLUG}.md`),
  path.join(root, "content", "pages", "en", `${COLLECTION_PATH_SLUG}.md`),
];

function write(file: string, contents: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
}

/** Remove a file, then its directory only if the fixture left it empty. */
function cleanUp(file: string): void {
  rmSync(file, { force: true });
  try {
    rmdirSync(path.dirname(file));
  } catch {
    /* not empty, or already gone: leave it exactly as it is */
  }
}

const params = (item: string) => ({ params: Promise.resolve({ locale: "en", item }) });

describe("the first-class authoring modes, through the real application", () => {
  beforeAll(() => {
    write(
      path.join(root, "config", "pages-markdown", "en", `${MARKDOWN_SLUG}.md`),
      [
        "---",
        "title: Authored fixture page",
        "description: A summary written by the author.",
        "---",
        "",
        "Ordinary **Markdown** with a [link](/about).",
        "",
        "<script>window.__authorScript = true;</script>",
        "",
        '<div onclick="window.__authorHandler = true">raw html text</div>',
        "",
      ].join("\n"),
    );
    write(
      path.join(root, "config", "pages-markdown", "en", `${ABOUT_SLUG}.md`),
      "# About the fixture\n\nA safe Markdown page for the dedicated About route.\n",
    );
    // A page-shaped file under `content/pages`: NOT a page source, at all.
    write(
      path.join(root, "content", "pages", "en", `${COLLECTION_PATH_SLUG}.md`),
      `---\ntitle: Collection-path page\n---\n\nThis must never be published.\n`,
    );
    // An EMPTY locale directory, and a locale the site does not configure.
    mkdirSync(EMPTY_LOCALE_DIRECTORY, { recursive: true });
    write(path.join(UNCONFIGURED_LOCALE_DIRECTORY, "a-page.md"), "# Not published\n");
  });

  afterAll(() => {
    for (const file of createdPaths) cleanUp(file);
    rmSync(EMPTY_LOCALE_DIRECTORY, { recursive: true, force: true });
    rmSync(UNCONFIGURED_LOCALE_DIRECTORY, { recursive: true, force: true });
    // Never leave the page-specific collection directory behind: `content/pages` is
    // not a collection.
    try {
      rmdirSync(path.join(root, "content", "pages"));
    } catch {
      /* not empty, or already gone: leave it exactly as it is */
    }
  });

  it("generates a real static route for a safe Markdown page", async () => {
    const generated = await generateStaticParams();
    expect(generated).toContainEqual({ locale: "en", item: MARKDOWN_SLUG });
  });

  it("generates NO route for a page-shaped file under `content/pages`", async () => {
    const generated = await generateStaticParams();
    // The collection path is not a page source: it creates no route…
    expect(generated.some((route) => route.item === COLLECTION_PATH_SLUG)).toBe(false);
    // …and the route that would serve it is a proper 404.
    await expect(ItemPage(params(COLLECTION_PATH_SLUG))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("publishes no phantom page from an empty or unconfigured locale directory", async () => {
    expect(existsSync(EMPTY_LOCALE_DIRECTORY)).toBe(true);
    const generated = await generateStaticParams();

    for (const route of generated) {
      expect(route.locale, JSON.stringify(route)).not.toBe(EMPTY_LOCALE_NAME);
      expect(route.locale, JSON.stringify(route)).not.toBe(UNCONFIGURED_LOCALE_NAME);
      // A documentation file can never become a route.
      expect(route.item).not.toBe("README");
    }
    expect(generated.some((route) => route.item === "a-page")).toBe(false);
  });

  it("serves the authored title and summary as the page's metadata", async () => {
    const metadata = await generateMetadata(params(MARKDOWN_SLUG));
    expect(metadata.title).toBe("Authored fixture page");
    expect(metadata.description).toBe("A summary written by the author.");
  });

  it("renders the safe Markdown body of a dedicated page route", async () => {
    // `/about` owns its URL, but its SOURCE is an ordinary page: the route renders
    // the authored Markdown under the safe policy, like every other page.
    const html = renderToStaticMarkup(await AboutPage({ params: Promise.resolve({ locale: "en" }) }));

    expect(html).toContain("About the fixture");
    expect(html).toContain("A safe Markdown page for the dedicated About route.");
  });

  it("renders the authored Markdown page, with raw HTML inert", async () => {
    const html = renderToStaticMarkup(await ItemPage(params(MARKDOWN_SLUG)));

    expect(html).toContain("Authored fixture page");
    expect(html).toContain("<strong>Markdown</strong>");
    expect(html).toContain('<a href="/about">link</a>');
    // The hostile parts of the fixture are shown as TEXT, never as markup.
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/<[a-zA-Z][^>]*\son[a-z]+\s*=/i);
    expect(html).toContain("window.__authorScript");
  });

  it("treats an absent page as not found", async () => {
    await expect(ItemPage(params("does-not-exist"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("lists the authored pages in the sitemap, and nothing else", async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toContain(`${siteConfig.url}/en/${MARKDOWN_SLUG}`);
    expect(urls).toContain(`${siteConfig.url}/en/${ABOUT_SLUG}`);
    // The collection path advertises nothing…
    expect(urls.some((url) => url.includes(COLLECTION_PATH_SLUG))).toBe(false);
    // …and neither does an unconfigured locale, a prepared-empty one or a README.
    expect(urls.some((url) => url.includes(UNCONFIGURED_LOCALE_NAME))).toBe(false);
    expect(urls.some((url) => url.includes("a-page"))).toBe(false);
    expect(urls.some((url) => url.endsWith("/README"))).toBe(false);
  });

  it("lets a safe Markdown file author the home page (content-first, unchanged order)", async () => {
    write(
      path.join(root, "config", "pages-markdown", "en", "home.md"),
      `# ${HOME_FIXTURE}\n\nA safe Markdown home page.\n`,
    );
    try {
      const html = renderToStaticMarkup(await HomePage({ params: Promise.resolve({ locale: "en" }) }));
      expect(html).toContain(HOME_FIXTURE);
      expect(html).not.toContain("home-hero");
    } finally {
      cleanUp(path.join(root, "config", "pages-markdown", "en", "home.md"));
    }
  });
});
