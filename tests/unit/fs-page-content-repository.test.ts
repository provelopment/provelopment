import { describe, expect, it } from "vitest";

import { parsePageFile } from "@/adapters/content/frontmatter";
import {
  createFileSystemPageContentRepository,
} from "@/adapters/content/fs-page-content-repository";
import { siteConfig } from "@/config";

const defaultLocale = siteConfig.defaultLocale;

describe("parsePageFile", () => {
  it("parses the title and body from frontmatter", () => {
    const page = parsePageFile(
      "---\ntitle: About\n---\n\nHello world\n",
      "about",
      "en",
    );

    expect(page).toEqual({
      slug: "about",
      locale: "en",
      title: "About",
      body: "\nHello world\n",
    });
  });

  it("handles CRLF line endings", () => {
    const page = parsePageFile(
      "---\r\ntitle: About\r\n---\r\nBody copy\r\n",
      "about",
      "en",
    );

    expect(page.title).toBe("About");
    expect(page.body).toContain("Body copy");
  });

  it("strips surrounding quotes from the title", () => {
    const page = parsePageFile(
      '---\ntitle: "About Us"\n---\n',
      "about-us",
      "en",
    );

    expect(page.title).toBe("About Us");
  });

  it("throws when frontmatter is missing", () => {
    expect(() =>
      parsePageFile("Just some text", "broken", "en"),
    ).toThrow(/missing frontmatter/i);
  });

  it("throws when the title is missing from frontmatter", () => {
    expect(() =>
      parsePageFile("---\ndescription: x\n---\n", "broken", "en"),
    ).toThrow(/missing title/i);
  });
});

describe("createFileSystemPageContentRepository", () => {
  const repository = createFileSystemPageContentRepository({
    defaultLocale,
  });

  it("finds content for the requested locale", async () => {
    const page = await repository.findBySlug("about", defaultLocale);

    expect(page?.locale).toBe(defaultLocale);
    expect(page?.title).toBe("About");
  });

  it("falls back to the default locale when a translation is missing", async () => {
    const page = await repository.findBySlug("about", "sv");

    expect(page?.locale).toBe(defaultLocale);
    expect(page?.title).toBe("About");
  });

  it("returns null for slugs that do not exist in any locale", async () => {
    const page = await repository.findBySlug("does-not-exist", defaultLocale);

    expect(page).toBeNull();
  });

  it("rejects unsafe slugs and malformed locales", async () => {
    expect(await repository.findBySlug("../secrets", defaultLocale)).toBeNull();
    expect(await repository.findBySlug("about", "../etc")).toBeNull();
  });

  it("lists page slugs for a locale", async () => {
    const slugs = await repository.listSlugs(defaultLocale);
    expect(slugs).toEqual(["about", "contact", "resources"]);
  });

  it("returns an empty list for a locale with no content", async () => {
    expect(await repository.listSlugs("sv")).toEqual([]);
  });

  it("rejects malformed locales when listing", async () => {
    expect(await repository.listSlugs("../etc")).toEqual([]);
  });
});