import { describe, expect, it } from "vitest";

import { parsePageFile } from "@/adapters/content/fs-page-content-repository";

describe("parsePageFile", () => {
  it("parses the title and body from frontmatter", () => {
    const page = parsePageFile(
      "---\ntitle: About\n---\n\nHello world\n",
      "about",
    );

    expect(page).toEqual({
      slug: "about",
      title: "About",
      body: "\nHello world\n",
    });
  });

  it("handles CRLF line endings", () => {
    const page = parsePageFile(
      "---\r\ntitle: About\r\n---\r\nBody copy\r\n",
      "about",
    );

    expect(page.title).toBe("About");
    expect(page.body).toContain("Body copy");
  });

  it("strips surrounding quotes from the title", () => {
    const page = parsePageFile('---\ntitle: "About Us"\n---\n', "about-us");

    expect(page.title).toBe("About Us");
  });

  it("throws when frontmatter is missing", () => {
    expect(() => parsePageFile("Just some text", "broken")).toThrow(
      /missing frontmatter/i,
    );
  });

  it("throws when the title is missing from frontmatter", () => {
    expect(() => parsePageFile("---\ndescription: x\n---\n", "broken"))
      .toThrow(/missing title/i);
  });
});