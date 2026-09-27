import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  authoringLocaleDirectoriesOf,
  authoringPageRoutesFor,
  hasAuthoringSource,
  readAuthoringPageFile,
} from "@/adapters/content/authoring-source-discovery";

/**
 * FILESYSTEM DISCOVERY, RECURSIVELY (FOUNDATION-PAGES-A1E).
 *
 * Discovery reports what the authoring tree HOLDS, and nothing more: it decides no
 * precedence, parses nothing and publishes nothing. A page's route is the path it is
 * authored at, so the tree is walked — and the rules that keep documentation, empty
 * folders and unusable names inert apply at EVERY level, not merely at the root.
 * These fixtures live in a test-only locale directory under the REAL roots, so the
 * real layout is exercised, and they are removed afterwards.
 */
const root = process.cwd();
const markdownRoot = path.join(root, "content", "pages", "markdown");
const jsonRoot = path.join(root, "content", "pages", "json");
// A locale directory UNIQUE to this suite: vitest runs test FILES in parallel, so two
// suites sharing one fixture directory would overwrite each other's fixtures.
// (Subtags must be 2–8 characters for a name to be a well-formed language tag.)
const DISCOVERY_LOCALE = "zz-disc";
const EMPTY_LOCALE_NAME = "zz-disc-empty";
const MARKDOWN_FIXTURE = path.join(markdownRoot, DISCOVERY_LOCALE);
const EMPTY_LOCALE = path.join(markdownRoot, EMPTY_LOCALE_NAME);
const JSON_FIXTURE = path.join(jsonRoot, DISCOVERY_LOCALE);
const ABOUT_MD = "---\ntitle: About\n---\n\nHello\n";

/** Every file this suite plants, so cleanup is exact rather than assumed. */
const MARKDOWN_FILES: readonly string[] = [
  "about.md",
  "README.md",
  ".gitkeep",
  "Not A Slug.md",
  "notes.txt",
  "blog/choosing-a-domain.md",
  "blog/README.md",
  "blog/.gitkeep",
  "blog/2026/new-year.md",
  "blog/2026/archive/old.md",
  "blog/2026/archive/2019/too-deep.md",
  "Not A Slug/post.md",
];
const JSON_FILES: readonly string[] = [
  "about.json",
  "blog/choosing-a-domain.json",
  "blog/README.md",
];

function plant(directory: string, files: readonly string[], body = "# Fixture\n"): void {
  for (const file of files) {
    const target = path.join(directory, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, file.endsWith(".json") ? "{}\n" : body, "utf8");
  }
}

describe("authoring-source discovery (recursive)", () => {
  beforeAll(() => {
    plant(MARKDOWN_FIXTURE, MARKDOWN_FILES);
    plant(MARKDOWN_FIXTURE, ["about.md"], ABOUT_MD);
    plant(JSON_FIXTURE, JSON_FILES);
    // An EMPTY locale directory must publish nothing, and an empty FOLDER inside a
    // locale directory must do the same.
    mkdirSync(EMPTY_LOCALE, { recursive: true });
    mkdirSync(path.join(MARKDOWN_FIXTURE, "empty"), { recursive: true });
  });

  afterAll(() => {
    rmSync(MARKDOWN_FIXTURE, { recursive: true, force: true });
    rmSync(EMPTY_LOCALE, { recursive: true, force: true });
    rmSync(JSON_FIXTURE, { recursive: true, force: true });
  });

  it("finds nested pages, per mode, and reports their route paths", async () => {
    expect(await authoringPageRoutesFor("markdown", DISCOVERY_LOCALE)).toEqual([
      "about",
      "blog/2026/archive/old",
      "blog/2026/new-year",
      "blog/choosing-a-domain",
    ]);
    // The same tree shape works for the advanced mode.
    expect(await authoringPageRoutesFor("json", DISCOVERY_LOCALE)).toEqual([
      "about",
      "blog/choosing-a-domain",
    ]);
  });

  it("keeps README, placeholders, other modes and unusable names inert at EVERY level", async () => {
    const routes = await authoringPageRoutesFor("markdown", DISCOVERY_LOCALE);

    for (const inert of [
      "README",
      "blog/README",
      "blog/2026/archive/2019/too-deep",
      "Not-A-Slug/post",
      "notes",
      "empty",
    ]) {
      expect(routes, inert).not.toContain(inert);
    }
    // A README beside nested pages is refused for the same reason a root README is:
    // `README` is not a slug. It can never be read as a page either.
    expect(await readAuthoringPageFile("markdown", DISCOVERY_LOCALE, "blog/README")).toBeNull();
    expect(await hasAuthoringSource("markdown", DISCOVERY_LOCALE, "blog/README")).toBe(false);
  });

  it("treats an empty locale directory, and an empty folder, as ordinary states", async () => {
    expect(await authoringPageRoutesFor("markdown", EMPTY_LOCALE_NAME)).toEqual([]);
    expect(await authoringPageRoutesFor("markdown", "zz-nonexistent")).toEqual([]);
    expect(await authoringPageRoutesFor("markdown", "not a locale")).toEqual([]);
    // Discovery still REPORTS a prepared-but-empty locale directory.
    expect(await authoringLocaleDirectoriesOf("markdown")).toContain(EMPTY_LOCALE_NAME);
  });

  it("reads one page's raw text at any depth, and refuses a path it has not validated", async () => {
    expect(await readAuthoringPageFile("markdown", DISCOVERY_LOCALE, "about")).toBe(ABOUT_MD);
    expect(
      await readAuthoringPageFile("markdown", DISCOVERY_LOCALE, "blog/2026/new-year"),
    ).toContain("Fixture");
    expect(await hasAuthoringSource("markdown", DISCOVERY_LOCALE, "blog/choosing-a-domain")).toBe(
      true,
    );

    // Traversal can never leave the authoring root: the path is refused BEFORE any
    // path is built, so nothing outside `content/pages` can be addressed.
    for (const attempt of [
      "../../site.config.json",
      "blog/../../README",
      "..",
      "/about",
      "about/",
      "blog\\post",
      "%2e%2e/escape",
      "README",
    ]) {
      expect(await readAuthoringPageFile("markdown", DISCOVERY_LOCALE, attempt), attempt).toBeNull();
    }
  });

  it("reports the same route for the same file on every call (deterministic)", async () => {
    const first = await authoringPageRoutesFor("markdown", DISCOVERY_LOCALE);
    const second = await authoringPageRoutesFor("markdown", DISCOVERY_LOCALE);
    expect(second).toEqual(first);
  });
});
