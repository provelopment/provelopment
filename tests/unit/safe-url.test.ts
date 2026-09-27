import { describe, expect, it } from "vitest";

import {
  AUTHOR_ALLOWED_SCHEMES,
  AUTHOR_EXECUTABLE_SCHEMES,
  classifyAuthorUrl,
  decodeAuthorReferences,
  isSafeAuthorUrl,
  requireSafeAuthorUrl,
} from "@/core/safe-url";

/**
 * THE SAFE-URL POLICY (FOUNDATION-PAGES-A1).
 *
 * An author must never be able to produce an executable destination by typing
 * punctuation, and anything the policy cannot classify must FAIL CLOSED. These are
 * the destinations the authoring modes accept; everything else is refused.
 */
describe("the safe-URL policy for author-written pages", () => {
  it("allows ordinary internal, relative, fragment, web and contact destinations", () => {
    for (const value of [
      "/about",
      "/about?x=1",
      "#section",
      "./x",
      "../x",
      "x",
      "?q=1",
      "https://example.com/a",
      "http://example.com/a",
      "mailto:hello@example.com",
      "tel:+441234567890",
    ]) {
      expect(isSafeAuthorUrl(value), value).toBe(true);
    }
  });

  it("refuses an executable scheme, and says which one", () => {
    expect(classifyAuthorUrl("javascript:alert(1)")).toMatchObject({
      ok: false,
      reason: "executable-scheme",
      detail: "javascript",
    });
    for (const name of AUTHOR_EXECUTABLE_SCHEMES) {
      expect(isSafeAuthorUrl(`${name}:payload`), name).toBe(false);
    }
  });

  it("refuses an unknown or unsupported scheme rather than tolerating it", () => {
    for (const value of ["ftp://example.com", "unknown-scheme:x", "ws://x", "sftp://x"]) {
      expect(classifyAuthorUrl(value), value).toMatchObject({ reason: "unsupported-scheme" });
    }
  });

  it("refuses protocol-relative, control-character, whitespace and break-out values", () => {
    for (const value of [
      "//evil.example",
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      "/a b",
      '/x"><script>',
      "back\\slash",
      "back`tick`",
      "",
      "   ",
      `/${"a".repeat(2001)}`,
    ]) {
      expect(isSafeAuthorUrl(value), JSON.stringify(value)).toBe(false);
    }
  });

  it("classifies the DECODED value — exactly as a browser would read it", () => {
    expect(decodeAuthorReferences("jav&#x61;script:alert(1)")).toBe("javascript:alert(1)");
    expect(isSafeAuthorUrl("jav&#x61;script:alert(1)")).toBe(false);
    // `&#x2f;&#x2f;` is a protocol-relative destination once decoded.
    expect(isSafeAuthorUrl("&#x2f;&#x2f;evil.example")).toBe(false);
    // A DOUBLE-encoded scheme stays literal, so it fails instead of executing.
    expect(classifyAuthorUrl("&amp;#x6a;avascript:alert(1)")).toMatchObject({
      reason: "nested-characters",
    });
  });

  it("returns the very value it classified, so validation and use cannot diverge", () => {
    expect(classifyAuthorUrl("  /about?x=1  ")).toEqual({ ok: true, href: "/about?x=1" });
    expect(classifyAuthorUrl("jav&#x61;script:alert(1)").ok).toBe(false);
  });

  it("fails loudly where authored metadata is validated", () => {
    expect(requireSafeAuthorUrl("/about", 'page "example"')).toBe("/about");
    expect(() => requireSafeAuthorUrl("javascript:alert(1)", 'page "example"')).toThrow(
      /Unsafe destination.*page "example"/,
    );
  });

  it("keeps the allowlist and the refusal list explicit", () => {
    expect(AUTHOR_ALLOWED_SCHEMES).toEqual(["http", "https", "mailto", "tel"]);
    expect(AUTHOR_EXECUTABLE_SCHEMES).toContain("javascript");
    expect(AUTHOR_EXECUTABLE_SCHEMES).toContain("data");
  });
});
