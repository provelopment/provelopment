import { describe, expect, it } from "vitest";

import {
  AUTHORING_METADATA_KEYS,
  authoringTitleFromSlug,
  parseAuthoringPageFile,
} from "@/adapters/content/authoring-page";

/**
 * THE SAFE MARKDOWN READER (FOUNDATION-PAGES-A1).
 *
 * The plain-author promise is asserted here: frontmatter is OPTIONAL, a title is
 * always derivable, ordinary prose is a complete page, and anything the mode does
 * not support is reported rather than ignored.
 */
describe("the authoring page reader", () => {
  it("requires no metadata at all", () => {
    expect(AUTHORING_METADATA_KEYS).toEqual(["title", "description"]);
  });

  it("accepts a file that is nothing but prose", () => {
    const page = parseAuthoringPageFile("We are open Monday to Friday.\n", "opening-hours", "en");

    expect(page.title).toBe("Opening hours");
    expect(page.titleSource).toBe("slug");
    expect(page.body).toBe("We are open Monday to Friday.\n");
    expect(page.description).toBeUndefined();
  });

  it("derives a readable title from the filename", () => {
    expect(authoringTitleFromSlug("make-your-own-business")).toBe("Make your own business");
    expect(authoringTitleFromSlug("about")).toBe("About");
  });

  it("takes the title from metadata, else the first heading, else the slug", () => {
    const fromMetadata = parseAuthoringPageFile(
      "---\ntitle: Meta Title\n---\n\n# Heading Title\n",
      "about",
      "en",
    );
    expect(fromMetadata.title).toBe("Meta Title");
    expect(fromMetadata.titleSource).toBe("metadata");

    const fromHeading = parseAuthoringPageFile("# Heading Title\n\nBody\n", "about", "en");
    expect(fromHeading.title).toBe("Heading Title");
    expect(fromHeading.titleSource).toBe("heading");

    const fromSlug = parseAuthoringPageFile("Body only\n", "about-us", "en");
    expect(fromSlug.title).toBe("About us");
    expect(fromSlug.titleSource).toBe("slug");
  });

  it("ignores a heading that is inside a fenced code block", () => {
    const page = parseAuthoringPageFile("```\n# not a title\n```\n", "about", "en");
    expect(page.title).toBe("About");
    expect(page.titleSource).toBe("slug");
  });

  it("keeps the body exactly as authored, and strips only the frontmatter block", () => {
    const page = parseAuthoringPageFile("---\ntitle: T\n---\n\nBody **here**\n", "about", "en");
    expect(page.body).toContain("Body **here**");
    expect(page.body).not.toContain("title: T");
    // No transformation at all — interpretation belongs to the renderer.
    expect(page.body).not.toContain("<");
  });

  it("handles CRLF line endings", () => {
    const page = parseAuthoringPageFile("---\r\ntitle: About\r\n---\r\nBody copy\r\n", "about", "en");
    expect(page.title).toBe("About");
    expect(page.body).toContain("Body copy");
  });

  it("carries an optional description, and leaves it absent when it is blank or missing", () => {
    const withSummary = parseAuthoringPageFile(
      '---\ndescription: "A short summary."\n---\n\nBody\n',
      "about",
      "en",
    );
    expect(withSummary.description).toBe("A short summary.");

    const withoutSummary = parseAuthoringPageFile("Body\n", "about", "en");
    expect(withoutSummary).not.toHaveProperty("description");

    const blankSummary = parseAuthoringPageFile(
      '---\ndescription: "   "\n---\n\nBody\n',
      "about",
      "en",
    );
    expect(blankSummary).not.toHaveProperty("description");
  });

  it("reports an unsupported metadata key instead of ignoring it", () => {
    expect(() =>
      parseAuthoringPageFile("---\ntitle: T\ntypo-key: 1\n---\n\nBody\n", "about", "en"),
    ).toThrow(/Unsupported metadata "typo-key"/);
  });

  it("reports a wrong type instead of guessing", () => {
    expect(() => parseAuthoringPageFile("---\ntitle: 5\n---\n", "about", "en")).toThrow(
      /Invalid "title"/,
    );
    expect(() =>
      parseAuthoringPageFile("---\ndescription: 5\n---\n", "about", "en"),
    ).toThrow(/Invalid "description"/);
  });

  it("refuses a filename that cannot be a page", () => {
    expect(() => parseAuthoringPageFile("Body\n", "README", "en")).toThrow(
      /not a usable page slug/,
    );
  });
});
