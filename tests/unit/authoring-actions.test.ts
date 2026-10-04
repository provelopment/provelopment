/**
 * FOUNDATION-MULTISITE-M20 — AN AUTHORED PAGE'S CLOSING ACTION PAIR
 * =================================================================
 *
 * The Markdown authoring mode gained ONE optional key, `actions:`: a labelled pair of
 * closing links, declared with the same deliberately small block-list form the reference
 * platform's authoring path accepts (two spaces of nesting per level, no general-purpose
 * YAML). It exists because the owner's canonical English About declares exactly that, and
 * it is ADDITIVE: a page with no frontmatter at all, or with only `title`/`description`,
 * is still a complete page.
 *
 * WHAT THESE PROOFS HOLD
 * ----------------------
 *   · the canonical About's OWN TWO ACTIONS, in the author's order, with the canonical
 *     destinations preserved exactly and the page's body untouched;
 *   · the pair's shape: one or two items, `label` + `href` and nothing else, a non-empty
 *     label, and a destination the safe-URL policy classifies;
 *   · the ordinary forms that must keep working (no frontmatter, metadata only, a key
 *     declared with no value and no list);
 *   · every refusal, loudly and by name: a third action, an unexpected field, an empty
 *     label, an unsafe destination, a plain-value item, an empty item, a field with no
 *     value, and an unsupported key.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { AUTHORING_MAX_ACTIONS, parseAuthoringPageFile } from "@/adapters/content/authoring-page";
import { parseFrontmatter } from "@/adapters/content/frontmatter";

/** The installed canonical English About — the deployment's own copy, not a fixture. */
const CANONICAL_ABOUT = path.join(
  process.cwd(),
  "deployment/spokes/foundation/content/pages/markdown/ww/en/about.md",
);

/** A frontmatter block, wrapped the way an authored page writes it. */
function pageWith(frontmatter: string): string {
  return `---\n${frontmatter}\n---\n\nProse written by the author.\n`;
}

describe("the authored closing action pair", () => {
  it("reads the canonical English About's own actions, in the author's order", () => {
    const page = parseAuthoringPageFile(readFileSync(CANONICAL_ABOUT, "utf8"), "about", "en");

    expect(page.title).toBe("About");
    expect(page.titleSource).toBe("metadata");
    expect(page.description).toContain("Provelopment builds, hosts and looks after websites");
    expect(page.actions).toEqual([
      { label: "Services", href: "/en/services", variant: "primary" },
      { label: "See examples", href: "/en/examples", variant: "secondary" },
    ]);

    // The canonical BODY renders as authored: nothing was rewritten to make it parse, and
    // the destinations the owner's document declares are carried through unchanged.
    expect(page.body).toContain("## Who the service is for");
    expect(page.body).toContain("[make your own business](/en/make-your-own-business)");
    expect(page.body).toContain("**Provelopment Foundation**");
  });

  it("accepts ONE action, which reads as the page's primary action", () => {
    const page = parseAuthoringPageFile(
      pageWith("title: Contact\nactions:\n  - label: Get in touch\n    href: /contact"),
      "contact",
      "en",
    );

    expect(page.actions).toEqual([{ label: "Get in touch", href: "/contact", variant: "primary" }]);
  });

  it("still makes plain Markdown with no frontmatter a complete page", () => {
    const page = parseAuthoringPageFile("We are open Monday to Friday.\n", "opening-hours", "en");

    expect(page.title).toBe("Opening hours");
    expect(page.description).toBeUndefined();
    expect(page.actions).toBeUndefined();
  });

  it("keeps a key with no value meaningful when no list follows it", () => {
    const page = parseAuthoringPageFile(pageWith("title:"), "home", "en");

    expect(page.title).toBe("Home");
    expect(page.actions).toBeUndefined();
  });

  it("keeps the two-item ceiling explicit", () => {
    expect(AUTHORING_MAX_ACTIONS).toBe(2);
  });
});

describe("the closing action pair refuses what it cannot represent", () => {
  it("refuses a third action", () => {
    const raw = pageWith(
      "actions:\n  - label: One\n    href: /one\n  - label: Two\n    href: /two\n  - label: Three\n    href: /three",
    );
    expect(() => parseAuthoringPageFile(raw, "services", "en")).toThrow(
      /expected one or two items, and 3 were declared/,
    );
  });

  it("refuses an unexpected field inside an action", () => {
    const raw = pageWith("actions:\n  - label: One\n    href: /one\n    external: true");
    expect(() => parseAuthoringPageFile(raw, "services", "en")).toThrow(
      /unexpected field "external"/,
    );
  });

  it("refuses an action with an empty label", () => {
    const raw = pageWith('actions:\n  - label: "  "\n    href: /one');
    expect(() => parseAuthoringPageFile(raw, "services", "en")).toThrow(
      /"label" must be non-empty text/,
    );
  });

  it("refuses an action with no href", () => {
    const raw = pageWith("actions:\n  - label: One");
    expect(() => parseAuthoringPageFile(raw, "services", "en")).toThrow(/"href" must be text/);
  });

  it("refuses an unsafe destination, naming the action", () => {
    const raw = pageWith('actions:\n  - label: One\n    href: "javascript:alert(1)"');
    expect(() => parseAuthoringPageFile(raw, "services", "en")).toThrow(/"actions" item 1/);
  });

  it("refuses an unsupported metadata key", () => {
    const raw = pageWith("summary: A page");
    expect(() => parseAuthoringPageFile(raw, "services", "en")).toThrow(
      /Unsupported metadata "summary"/,
    );
  });

  it("refuses a plain-value list item rather than guessing", () => {
    const raw = pageWith('actions:\n  - "Services"');
    expect(() => parseAuthoringPageFile(raw, "services", "en")).toThrow(/is a plain value/);
  });

  it("refuses an empty list item", () => {
    const raw = pageWith("actions:\n  -\n    href: /one");
    expect(() => parseAuthoringPageFile(raw, "services", "en")).toThrow(/an item is empty/);
  });

  it("refuses a field declared with no value", () => {
    const raw = pageWith("actions:\n  - label: One\n    href:");
    expect(() => parseAuthoringPageFile(raw, "services", "en")).toThrow(
      /"href" is declared with no value/,
    );
  });
});

describe("the frontmatter reader's one block-list form", () => {
  it("parses exactly the two declared nesting levels", () => {
    const parsed = parseFrontmatter(
      pageWith(
        "title: About\nactions:\n  - label: Services\n    href: /en/services\n  - label: Examples\n    href: /en/examples",
      ),
      "about",
    );

    expect(parsed.values.title).toBe("About");
    expect(parsed.values.actions).toEqual([
      { label: "Services", href: "/en/services" },
      { label: "Examples", href: "/en/examples" },
    ]);
  });

  it("ignores blank lines and comments inside the list", () => {
    const parsed = parseFrontmatter(
      pageWith("actions:\n  - label: One\n\n    # the destination\n    href: /one"),
      "about",
    );

    expect(parsed.values.actions).toEqual([{ label: "One", href: "/one" }]);
  });

  it("ends the list at the next top-level key", () => {
    const parsed = parseFrontmatter(
      pageWith("actions:\n  - label: One\n    href: /one\ntitle: About"),
      "about",
    );

    expect(parsed.values.actions).toEqual([{ label: "One", href: "/one" }]);
    expect(parsed.values.title).toBe("About");
  });

  it("refuses indentation deeper than the declared levels", () => {
    expect(() => parseFrontmatter(pageWith("actions:\n  - label: One\n      href: /one"), "about")).toThrow(
      /Unexpected indented line/,
    );
  });

  it("refuses a dash indented by anything but two spaces", () => {
    expect(() => parseFrontmatter(pageWith("actions:\n - label: One"), "about")).toThrow(
      /Unexpected indented line/,
    );
  });
});
