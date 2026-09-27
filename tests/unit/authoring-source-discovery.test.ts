import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  authoringLocaleDirectoriesOf,
  authoringSlugsFor,
  hasAuthoringSource,
  readAuthoringPageFile,
} from "@/adapters/content/authoring-source-discovery";

/**
 * FILESYSTEM DISCOVERY (FOUNDATION-PAGES-A1).
 *
 * Discovery reports what the authoring tree HOLDS, and nothing more: it decides no
 * precedence, parses nothing and publishes nothing. These fixtures live in a
 * test-only locale directory (`zz-test`) under the REAL roots, so the real layout is
 * exercised, and they are removed afterwards.
 */
const root = process.cwd();
const markdownRoot = path.join(root, "content", "pages", "markdown");
const jsonRoot = path.join(root, "content", "pages", "json");
// A locale directory UNIQUE to this suite: vitest runs test FILES in parallel, so
// two suites sharing one fixture directory would overwrite each other's fixtures.
// (Subtags must be 2–8 characters for a name to be a well-formed language tag.)
const DISCOVERY_LOCALE = "zz-disc";
const EMPTY_LOCALE_NAME = "zz-disc-empty";
const MARKDOWN_FIXTURE = path.join(markdownRoot, DISCOVERY_LOCALE);
const EMPTY_LOCALE = path.join(markdownRoot, EMPTY_LOCALE_NAME);
const JSON_FIXTURE = path.join(jsonRoot, DISCOVERY_LOCALE);
const ABOUT_MD = "---\ntitle: About\n---\n\nHello\n";

describe("authoring-source discovery", () => {
  beforeAll(() => {
    mkdirSync(MARKDOWN_FIXTURE, { recursive: true });
    mkdirSync(EMPTY_LOCALE, { recursive: true });
    mkdirSync(JSON_FIXTURE, { recursive: true });
    writeFileSync(path.join(MARKDOWN_FIXTURE, "about.md"), ABOUT_MD, "utf8");
    // Everything below must be ignored, for one reason each.
    writeFileSync(path.join(MARKDOWN_FIXTURE, "README.md"), "# Not a page\n", "utf8");
    writeFileSync(path.join(MARKDOWN_FIXTURE, ".gitkeep"), "", "utf8");
    writeFileSync(path.join(MARKDOWN_FIXTURE, "Not A Slug.md"), "x\n", "utf8");
    writeFileSync(path.join(MARKDOWN_FIXTURE, "notes.txt"), "x\n", "utf8");
    writeFileSync(path.join(JSON_FIXTURE, "about.json"), "{}\n", "utf8");
    writeFileSync(path.join(JSON_FIXTURE, "README.md"), "# Not a page\n", "utf8");
  });

  afterAll(() => {
    rmSync(MARKDOWN_FIXTURE, { recursive: true, force: true });
    rmSync(EMPTY_LOCALE, { recursive: true, force: true });
    rmSync(JSON_FIXTURE, { recursive: true, force: true });
  });

  it("lists the page slugs a locale directory holds, per mode", async () => {
    expect(await authoringSlugsFor("markdown", DISCOVERY_LOCALE)).toEqual(["about"]);
    expect(await authoringSlugsFor("json", DISCOVERY_LOCALE)).toEqual(["about"]);
    // A locale directory with nothing in it is an ordinary state, not a fault.
    expect(await authoringSlugsFor("markdown", EMPTY_LOCALE_NAME)).toEqual([]);
    // A locale directory that does not exist holds nothing either.
    expect(await authoringSlugsFor("markdown", "zz-missing")).toEqual([]);
    // A malformed locale can never name a directory.
    expect(await authoringSlugsFor("markdown", "../etc")).toEqual([]);
  });

  it("ignores README, placeholders, malformed filenames and files of the other mode", async () => {
    const markdownSlugs = await authoringSlugsFor("markdown", DISCOVERY_LOCALE);
    expect(markdownSlugs).not.toContain("README");
    expect(markdownSlugs).not.toContain(".gitkeep");
    expect(markdownSlugs).not.toContain("Not A Slug");
    // The JSON directory holds a README.md, which is not a JSON source.
    expect(await authoringSlugsFor("json", DISCOVERY_LOCALE)).toEqual(["about"]);
  });

  it("reports the locale DIRECTORY, so discovery is not publication", async () => {
    const locales = await authoringLocaleDirectoriesOf("markdown");
    expect(locales).toContain(DISCOVERY_LOCALE);
    // A prepared-but-empty language directory appears here and still publishes
    // nothing: what the site serves is decided by its configured locales.
    expect(locales).toContain(EMPTY_LOCALE_NAME);
    // A root-level file is not a language directory.
    expect(locales).not.toContain("README.md");
  });

  it("reads one source's raw text, and refuses to build a path it has not validated", async () => {
    expect(await readAuthoringPageFile("markdown", DISCOVERY_LOCALE, "about")).toBe(ABOUT_MD);
    expect(await readAuthoringPageFile("markdown", DISCOVERY_LOCALE, "missing")).toBeNull();
    expect(await readAuthoringPageFile("markdown", DISCOVERY_LOCALE, "README")).toBeNull();
    expect(await readAuthoringPageFile("markdown", "../etc", "about")).toBeNull();
    expect(await hasAuthoringSource("markdown", DISCOVERY_LOCALE, "about")).toBe(true);
    expect(await hasAuthoringSource("json", DISCOVERY_LOCALE, "about")).toBe(true);
    expect(await hasAuthoringSource("json", DISCOVERY_LOCALE, "missing")).toBe(false);
  });

  it("ships both roots' documentation, and never treats it as a page", () => {
    for (const rootDirectory of [markdownRoot, jsonRoot]) {
      const readme = path.join(rootDirectory, "README.md");
      expect(existsSync(readme), readme).toBe(true);
      expect(readFileSync(readme, "utf8").length).toBeGreaterThan(0);
    }
  });
});
