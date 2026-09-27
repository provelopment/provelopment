import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isHeadingAnchor } from "@/core/heading-anchor";
import { CONTENT_SLUG_PATTERN, isContentSlug } from "@/core/page-content";
import {
  MARKDOWN_ALLOWED_ATTRIBUTES,
  MARKDOWN_ALLOWED_TAGS,
  MARKDOWN_FORBIDDEN_ATTRIBUTES,
  MARKDOWN_FORBIDDEN_ELEMENTS,
  MARKDOWN_HEADING_TAGS,
} from "@/core/markdown-policy";
import { PAGE_AUTHORING_MODES, PAGE_AUTHORING_ROOTS } from "@/core/page-source";
import { PAGE_SECTION_TYPES } from "@/core/page-document";

/**
 * THE PAGE-AUTHORING ARCHITECTURE CONTRACT (FOUNDATION-PAGES-A1/A1C).
 *
 * These are boundaries, not behaviour: exactly two first-class modes and no third
 * kind, ONE decision point for precedence, ONE slug authority, ONE sanitiser import,
 * page routes that can never reach the trusted collection renderer, and a core that
 * stays framework- and filesystem-free. A violation here is an architectural
 * regression even when every page renders.
 */
const projectRoot = process.cwd();
const srcDirectory = path.join(projectRoot, "src");

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(entryPath);
    return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

const sourceFiles = listSourceFiles(srcDirectory);
const relative = (file: string): string => path.relative(srcDirectory, file).split(path.sep).join("/");
const read = (file: string): string => readFileSync(path.join(srcDirectory, file), "utf8");

/** Every module specifier a file IMPORTS (prose references in comments do not count). */
function importsOf(file: string): string[] {
  const source = read(file);
  const pattern = /(?:from\s+|import\s+|require\()\s*["']([^"']+)["']/g;
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

describe("pages-authoring contract — exactly two first-class modes", () => {
  it("declares the two authoring roots, each shipping its own documentation", () => {
    expect(PAGE_AUTHORING_ROOTS).toEqual({
      json: "content/pages/json",
      markdown: "content/pages/markdown",
    });
    for (const root of Object.values(PAGE_AUTHORING_ROOTS)) {
      expect(readdirSync(path.join(projectRoot, root))).toContain("README.md");
    }
    // One human-facing content area: every authored page root lives under
    // `content/`, and the `content/` README is the obvious entry point.
    for (const root of Object.values(PAGE_AUTHORING_ROOTS)) {
      expect(root.startsWith("content/")).toBe(true);
    }
    expect(readdirSync(projectRoot)).toContain("content");
  });

  it("keeps the documented authoring roots, and leaves the retired ones absent", () => {
    // The human-facing layout A1D establishes: one content area, two mode roots.
    expect(PAGE_AUTHORING_ROOTS).toEqual({
      markdown: "content/pages/markdown",
      json: "content/pages/json",
    });
    for (const retired of ["config/pages-markdown", "config/pages-json", "assets"]) {
      expect(existsSync(path.join(projectRoot, retired)), `${retired} must not exist`).toBe(false);
    }
    // The documentation a user needs is present, in the content area itself.
    for (const readme of [
      "content/README.md",
      "content/pages/markdown/README.md",
      "content/pages/json/README.md",
      "content/assets/README.md",
    ]) {
      expect(existsSync(path.join(projectRoot, readme)), readme).toBe(true);
    }
  });

  it("keeps the retired `config/pages-*` roots out of the source entirely", () => {
    // A1D replaced the temporary A1/A1C roots. Nothing in the application may name
    // them, and no code may read a page from them: the move is complete, not aliased.
    for (const file of sourceFiles.map(relative)) {
      expect(read(file), file).not.toContain("config/pages");
    }
  });

  it("has no compatibility kind and no page source outside the two roots", () => {
    // The contract exposes exactly the two modes: there is no third kind.
    expect(PAGE_AUTHORING_MODES).toHaveLength(2);

    // The composition consults only the two authoring roots, and takes their
    // spelling from the ONE core contract — it names no path literal itself, so the
    // retired `config/pages-*` spelling cannot come back through it.
    const composition = read("adapters/content/page-sources.ts");
    // The composition spells no path and does no filesystem work of its own: the roots and
    // the file layout come from the ONE core contract, consumed by the discovery adapter.
    expect(composition).not.toContain("path.join");
    expect(composition).not.toContain("node:fs");
    expect(composition).not.toContain("config/pages");
    expect(composition).not.toContain("fs-page-content-repository");
    expect(read("core/page-source.ts")).toContain("PAGE_AUTHORING_ROOTS");
    expect(read("adapters/content/authoring-source-discovery.ts")).toContain("PAGE_AUTHORING_EXTENSIONS");
  });

  it("is the ONLY page authority: no collection repository and no collection root remains", () => {
    // A1E removed the author-facing collections (offerings/legal/portfolio/posts/
    // testimonials) and the second content store that served them. A page route must
    // not be able to reach a competing store, and nothing may reintroduce one.
    expect(existsSync(path.join(srcDirectory, "adapters/content/fs-page-content-repository.ts"))).toBe(
      false,
    );
    expect(existsSync(path.join(srcDirectory, "application/page-content-repository.ts"))).toBe(false);

    for (const file of sourceFiles.map(relative)) {
      const source = read(file);
      expect(source, file).not.toContain("createFileSystemPageContentRepository");
      expect(source, file).not.toContain("ContentCollection");
    }

    // The human-facing area holds ONE page tree and the assets beside it — no
    // historical collection directories, empty or otherwise.
    expect(readdirSync(path.join(projectRoot, "content")).filter((entry) => entry !== "assets").sort()).toEqual(
      ["README.md", "pages"],
    );
  });

  it("keeps every page route on ONE decision point, and off any other store", () => {
    for (const route of [
      "app/[locale]/page.tsx",
      "app/[locale]/[...path]/page.tsx",
      "app/[locale]/connect/page.tsx",
      "app/[locale]/contact/page.tsx",
    ]) {
      const source = read(route);
      expect(source, route).toContain("createPageSources");
      // A route that read a second store itself would own a competing precedence rule.
      expect(source, route).not.toContain("createFileSystemPageContentRepository");
      expect(source, route).not.toContain("config/pages");
      // A page body is ALWAYS rendered under the safe Markdown policy: the trusted
      // collection renderer is unreachable from a page route.
      expect(source, route).toContain("SafeMarkdownContent");
      expect(source, route).not.toContain('from "@/components/site/markdown-content"');
    }
  });

  it("serves EVERY page through the one generic route, and keeps dedicated routes to specialised chrome", () => {
    // The framework route files that remain exist for URL semantics or specialised
    // features, never for a kind of content: home is the locale root, `connect` and
    // `contact` carry their own chrome (the connectivity inventory and the contact
    // form), and every other page — flat, nested or regional — is served by the ONE
    // catch-all route, which resolves through the same composition.
    const routeFiles = readdirSync(path.join(srcDirectory, "app/[locale]"))
      .filter((entry) => entry.endsWith(".tsx"))
      .sort();
    expect(routeFiles).toEqual([
      "error.tsx",
      "global-error.tsx",
      "layout.tsx",
      "not-found.tsx",
      "opengraph-image.tsx",
      "page.tsx",
    ]);
    const directories = readdirSync(path.join(srcDirectory, "app/[locale]"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(directories).toEqual(["[...path]", "connect", "contact"]);
  });

  it("gives the sitemap the same inventory the routes use", () => {
    const sitemap = read("app/sitemap.ts");
    expect(sitemap).toContain("createPageSources");
    expect(sitemap).toContain("pages.listRoutes");
    expect(sitemap).not.toContain("pagesRepository");
    expect(sitemap).not.toContain("PageContentRepository");
  });
});

describe("pages-authoring contract — dependency direction", () => {
  it("keeps the core source and safety modules free of frameworks and the filesystem", () => {
    for (const file of [
      "core/page-source.ts",
      "core/page-content.ts",
      "core/safe-url.ts",
      "core/markdown-policy.ts",
    ]) {
      const imported = importsOf(file);
      // (A pure module such as `safe-url.ts` legitimately imports nothing at all, so
      // the scan asserts forbidden specifiers rather than a minimum count.)
      for (const forbidden of [
        "node:fs",
        "node:path",
        "react",
        "next/",
        "@/adapters",
        "@/config",
        "@/components",
        "@/app",
      ]) {
        expect(
          imported.filter((specifier) => specifier === forbidden || specifier.startsWith(forbidden)),
          `${file} imports ${forbidden}`,
        ).toEqual([]);
      }
    }
  });

  it("keeps the resolver free of adapters, frameworks and file layout", () => {
    const source = read("application/page-source-resolution.ts");
    for (const forbidden of [
      "@/adapters",
      "react",
      "next/",
      "node:fs",
      "node:path",
      "content/pages/markdown",
      "content/pages/json",
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });

  it("keeps discovery free of precedence and interpretation", () => {
    const source = read("adapters/content/authoring-source-discovery.ts");
    for (const forbidden of [
      "PAGE_RESOLUTION_ORDER",
      "resolvePageSource",
      "parseAuthoringPageFile",
      "renderSafeMarkdown",
      "isSafeAuthorUrl",
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });
});

describe("pages-authoring contract — the safe Markdown boundary", () => {
  it("imports the HTML sanitiser in exactly ONE module", () => {
    const importers = sourceFiles
      .filter((file) => /from\s+["']sanitize-html["']/.test(readFileSync(file, "utf8")))
      .map(relative);
    expect(importers).toEqual(["adapters/markdown/safe-markdown.ts"]);
  });

  it("never passes author raw HTML through in the new path", () => {
    const source = read("adapters/markdown/safe-markdown.ts");
    // The `html` hook escapes; there is no passthrough of the token's raw text.
    expect(source).toContain("escapeAuthorText(token.text");
    expect(source).not.toContain("token.raw");
    // The trusted collection renderer keeps its own documented behaviour — untouched.
    expect(read("components/site/markdown-content.tsx")).toContain("dangerouslySetInnerHTML");
  });

  it("names the elements, attributes and schemes it refuses", () => {
    for (const element of ["script", "iframe", "style", "form", "object", "svg", "base", "meta"]) {
      expect(MARKDOWN_FORBIDDEN_ELEMENTS, element).toContain(element);
    }
    expect(MARKDOWN_ALLOWED_TAGS).not.toContain("script");
    for (const attribute of ["style", "srcdoc", "action", "target"]) {
      expect(MARKDOWN_FORBIDDEN_ATTRIBUTES, attribute).toContain(attribute);
    }
    // The allowlist is narrow: ordinary Markdown semantics and nothing more.
    expect(MARKDOWN_ALLOWED_TAGS).not.toContain("div");
    expect(MARKDOWN_ALLOWED_TAGS).not.toContain("span");
  });

  it("allows a generated id on HEADINGS only, and nowhere else", () => {
    // The heading fragment is the ONE attribute this path generates beyond
    // href/title/src/alt/class — and an author cannot set it (raw HTML is inert).
    const carriers = Object.entries(MARKDOWN_ALLOWED_ATTRIBUTES)
      .filter(([, attributes]) => attributes.includes("id"))
      .map(([tag]) => tag)
      .sort();

    expect(carriers).toEqual([...MARKDOWN_HEADING_TAGS].sort());
    expect(MARKDOWN_HEADING_TAGS).toEqual(["h1", "h2", "h3", "h4", "h5", "h6"]);
    for (const tag of MARKDOWN_HEADING_TAGS) {
      expect(MARKDOWN_ALLOWED_TAGS).toContain(tag);
    }
    // No other element may carry an id — not a link, an image, a list or a table cell.
    for (const tag of ["a", "img", "code", "p", "li", "td", "table", "blockquote"]) {
      expect(MARKDOWN_ALLOWED_ATTRIBUTES[tag] ?? [], tag).not.toContain("id");
    }
    // The id's SHAPE is a core rule both layers share, so layer 2 can enforce it.
    expect(read("adapters/markdown/safe-markdown.ts")).toContain("isHeadingAnchor");
    expect(read("core/heading-anchor.ts")).toContain("createHeadingAnchors");
  });

  it("keeps the heading-anchor rule framework-free and deterministic (core purity)", () => {
    const source = read("core/heading-anchor.ts");
    for (const forbidden of ["node:", "react", "next/", "Math.random", "Date.now", "new Date"]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
    // The rule is documented for authors, and the pattern is the ONLY shape allowed.
    expect(source).toContain("HEADING_ANCHOR_PATTERN");
    expect(isHeadingAnchor("opening-hours")).toBe(true);
    expect(isHeadingAnchor("opening hours")).toBe(false);
  });

  it("renders a JSON page through ONE composer, and keeps that boundary in ONE place", () => {
    // A2: a JSON source is now INTERPRETED. The reader validates it, the composition
    // resolves it, and exactly ONE component maps the validated vocabulary to
    // presentation — so no route switches on a section type, and no second renderer or
    // second schema can appear.
    expect(read("adapters/content/page-sources.ts")).toContain("parseJsonPageFile");
    expect(read("adapters/content/page-sources.ts")).not.toContain("not yet interpreted");
    for (const route of [
      "app/[locale]/page.tsx",
      "app/[locale]/[...path]/page.tsx",
      "app/[locale]/connect/page.tsx",
      "app/[locale]/contact/page.tsx",
    ]) {
      const source = read(route);
      expect(source, route).toContain("PageDocumentContent");
      // The route branches on the MODE, never on a section type.
      for (const type of PAGE_SECTION_TYPES) {
        expect(source, `${route} must not switch on "${type}"`).not.toContain(`case "${type}"`);
      }
    }

    // ONE document schema, ONE declarative composer, ONE safe Markdown renderer.
    const schemaOwners = sourceFiles
      .filter((file) => readFileSync(file, "utf8").includes("pageDocumentSchema"))
      .map(relative)
      .sort();
    expect(schemaOwners).toEqual(["adapters/content/json-page.ts", "core/page-document.ts"]);

    const composers = sourceFiles
      .filter((file) => readFileSync(file, "utf8").includes("from \"@/components/site/page-document-content\""))
      .map(relative)
      .sort();
    expect(composers).toEqual([
      "app/[locale]/[...path]/page.tsx",
      "app/[locale]/connect/page.tsx",
      "app/[locale]/contact/page.tsx",
      "app/[locale]/page.tsx",
    ]);

    // The composer is site-neutral and configuration-independent: it may compose the
    // section renderers and the shared primitives, and nothing else.
    const composer = read("components/site/page-document-content.tsx");
    for (const forbidden of ["@/config", "@/adapters", "siteConfig", "dangerouslySetInnerHTML"]) {
      expect(composer, forbidden).not.toContain(forbidden);
    }
    // The Markdown renderer is the SAME one the Markdown mode uses.
    expect(read("components/site/page-sections/section-support.tsx")).toContain("SafeMarkdownContent");
  });
});

describe("pages-authoring contract — ONE slug authority", () => {
  it("declares the page-slug rule ONCE in src/, and consumers import it", () => {
    const literals = sourceFiles
      .filter((file) => readFileSync(file, "utf8").includes("^[a-z0-9]+(?:-[a-z0-9]+)*$"))
      .map(relative);
    // The ONE page-slug authority, plus one deliberately separate concept: the
    // `connect.methods` id, which is an identifier rather than a page slug and is
    // named as such in the config schema.
    expect(literals).toEqual(["config/schema.ts", "core/page-content.ts"]);
    expect(read("config/schema.ts")).toMatch(
      /connectMethodIdPattern\s*=\s*\/\^\[a-z0-9\]\+\(\?:-\[a-z0-9\]\+\)\*\$\/;/,
    );
    expect((read("config/schema.ts").match(/\^\[a-z0-9\]\+\(\?:-\[a-z0-9\]\+\)\*\$/g) ?? []).length).toBe(1);

    expect(isContentSlug("about")).toBe(true);
    expect(isContentSlug("README")).toBe(false);
    expect(CONTENT_SLUG_PATTERN.test(".gitkeep")).toBe(false);
  });

  it("is consumed by every source that must agree with it", () => {
    // TWO layers, one authority each: the segment rule (`CONTENT_SLUG_PATTERN`) defines
    // what a segment may be, and the route-path rule is built on it. Everything
    // downstream consumes the ROUTE PATH rather than re-testing names itself, so no
    // second opinion about names can exist in the tree.
    for (const file of ["core/page-route-path.ts", "config/schema.ts"]) {
      const source = read(file);
      expect(
        source.includes("isContentSlug") || source.includes("CONTENT_SLUG_PATTERN"),
        `${file} must consume the ONE content-slug authority`,
      ).toBe(true);
    }

    const routePathConsumers: readonly [string, RegExp][] = [
      ["core/page-source.ts", /isPageRoutePath/],
      ["adapters/content/authoring-source-discovery.ts", /pageRoutePathFromFile/],
      ["adapters/content/authoring-page.ts", /isPageRoutePath|pageRouteLeaf/],
    ];
    for (const [file, pattern] of routePathConsumers) {
      expect(read(file), `${file} must consume the ONE route-path rule`).toMatch(pattern);
    }
  });
});
