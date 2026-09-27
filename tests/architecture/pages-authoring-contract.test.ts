import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CONTENT_SLUG_PATTERN, isContentSlug } from "@/core/page-content";
import {
  MARKDOWN_ALLOWED_TAGS,
  MARKDOWN_FORBIDDEN_ATTRIBUTES,
  MARKDOWN_FORBIDDEN_ELEMENTS,
} from "@/core/markdown-policy";
import { PAGE_AUTHORING_MODES, PAGE_AUTHORING_ROOTS } from "@/core/page-source";

/**
 * THE PAGE-AUTHORING ARCHITECTURE CONTRACT (FOUNDATION-PAGES-A1).
 *
 * These are boundaries, not behaviour: exactly two first-class modes, the legacy
 * mechanism as compatibility, ONE decision point for precedence, ONE slug
 * authority, ONE sanitiser import, and a core that stays framework- and
 * filesystem-free. A violation here is an architectural regression even when every
 * page renders.
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
    expect(Object.keys(PAGE_AUTHORING_ROOTS).sort()).toEqual(["json", "markdown"]);
    for (const root of Object.values(PAGE_AUTHORING_ROOTS)) {
      expect(readdirSync(path.join(projectRoot, root))).toContain("README.md");
    }
  });

  it("never treats the legacy content mechanism as a mode", () => {
    expect(PAGE_AUTHORING_MODES).not.toContain("content");
    // It is a KIND in the declared order, and the composition names it as legacy.
    expect(read("core/page-source.ts")).toContain('"content"');
    expect(read("adapters/content/page-sources.ts").toLowerCase()).toContain("legacy");
  });

  it("keeps every page route on ONE decision point, and off the legacy repository", () => {
    for (const route of [
      "app/[locale]/page.tsx",
      "app/[locale]/[item]/page.tsx",
      "app/[locale]/[item]/[slug]/page.tsx",
    ]) {
      const source = read(route);
      expect(source, route).toContain("createPageSources");
      // A route that read the legacy repository itself would own a second,
      // competing precedence rule.
      expect(source, route).not.toContain("createFileSystemPageContentRepository");
    }
  });

  it("gives the sitemap the same inventory the routes use", () => {
    const sitemap = read("app/sitemap.ts");
    expect(sitemap).toContain("createPageSources");
    expect(sitemap).toContain("pages.listSlugs");
    expect(sitemap).not.toContain("pagesRepository");
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
      "config/pages-markdown",
      "config/pages-json",
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
    // The legacy renderer keeps its own documented behaviour — untouched.
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

  it("routes a body through ONE selector and never pretends a JSON page can render", () => {
    const pageBody = read("components/site/page-body.tsx");
    expect(pageBody).toContain("SafeMarkdownContent");
    expect(pageBody).toContain("MarkdownContent");
    // A JSON winner stops the build with the file named, in ONE place.
    expect(read("adapters/content/page-sources.ts")).toContain("not yet interpreted");
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
    for (const file of [
      "core/page-source.ts",
      "adapters/content/fs-page-content-repository.ts",
      "adapters/content/authoring-source-discovery.ts",
      "adapters/content/authoring-page.ts",
      // A configured slug that must name a content file consumes it too.
      "config/schema.ts",
    ]) {
      const source = read(file);
      expect(
        source.includes("isContentSlug") || source.includes("CONTENT_SLUG_PATTERN"),
        `${file} must consume the ONE content-slug authority`,
      ).toBe(true);
    }
  });
});
