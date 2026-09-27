import { describe, expect, it } from "vitest";

import {
  resolvePageSource,
  type PageSourceProviders,
} from "@/application/page-source-resolution";

/**
 * THE RESOLVER'S CONTRACT (FOUNDATION-PAGES-A1).
 *
 * `resolvePageSource` answers ONE question — which source is authoritative — and
 * these stubs prove it does exactly that: no filesystem, no parsing, no
 * rendering, no invented fallback. Interpretation is the caller's, behind the
 * providers, which is why the loop can be asserted this precisely.
 */
type StubSource = string;

function providersOf(
  available: Readonly<Record<string, readonly string[]>>,
): { readonly providers: PageSourceProviders<StubSource>; readonly asked: string[] } {
  const asked: string[] = [];
  const provider = (kind: string) => (locale: string) => {
    asked.push(`${kind}:${locale}`);
    return available[kind]?.includes(locale) ? `${kind}:${locale}` : null;
  };
  return {
    asked,
    providers: {
      json: provider("json"),
      markdown: provider("markdown"),
      content: provider("content"),
    },
  };
}

describe("the page-source resolver", () => {
  it("returns the first source any provider can supply, in the declared order", async () => {
    const { providers } = providersOf({ json: ["de"], markdown: ["de"] });
    const resolved = await resolvePageSource(
      { slug: "about", locale: "de", defaultLocale: "en" },
      providers,
    );

    expect(resolved).toEqual({
      kind: "json",
      slug: "about",
      locale: "de",
      fallback: false,
      source: "json:de",
    });
  });

  it("prefers JSON over Markdown within the requested locale, and Markdown over legacy", async () => {
    const markdownOnly = await resolvePageSource(
      { slug: "about", locale: "de", defaultLocale: "en" },
      providersOf({ markdown: ["de"], content: ["de"] }).providers,
    );
    expect(markdownOnly?.kind).toBe("markdown");

    const legacyOnly = await resolvePageSource(
      { slug: "about", locale: "de", defaultLocale: "en" },
      providersOf({ content: ["de"] }).providers,
    );
    expect(legacyOnly?.kind).toBe("content");
  });

  it("prefers an exact-locale page over a default-locale one, whatever the format", async () => {
    const { providers, asked } = providersOf({ json: ["en"], markdown: ["de"] });
    const resolved = await resolvePageSource(
      { slug: "about", locale: "de", defaultLocale: "en" },
      providers,
    );

    expect(resolved?.source).toBe("markdown:de");
    expect(resolved?.fallback).toBe(false);
    // The German Markdown source won BEFORE the English JSON source was even asked.
    expect(asked).toEqual(["json:de", "markdown:de"]);
  });

  it("falls back to the default locale last, and says so", async () => {
    const { providers, asked } = providersOf({ markdown: ["en"] });
    const resolved = await resolvePageSource(
      { slug: "about", locale: "de", defaultLocale: "en" },
      providers,
    );

    expect(resolved).toEqual({
      kind: "markdown",
      slug: "about",
      locale: "en",
      fallback: true,
      source: "markdown:en",
    });
    expect(asked).toEqual([
      "json:de",
      "markdown:de",
      "content:de",
      "json:en",
      "markdown:en",
    ]);
  });

  it("returns null when no source exists anywhere — never an invented page", async () => {
    const { providers } = providersOf({});
    expect(
      await resolvePageSource({ slug: "about", locale: "de", defaultLocale: "en" }, providers),
    ).toBeNull();
  });

  it("asks NOTHING when the request itself is malformed", async () => {
    const { providers, asked } = providersOf({ markdown: ["en"] });
    expect(
      await resolvePageSource({ slug: "README", locale: "en", defaultLocale: "en" }, providers),
    ).toBeNull();
    expect(asked).toEqual([]);
  });

  it("does not catch a provider error: a source that exists but is malformed fails loudly", async () => {
    const providers: PageSourceProviders<StubSource> = {
      json: () => null,
      markdown: () => {
        throw new Error('Invalid metadata in authored page "about"');
      },
      content: () => null,
    };

    await expect(
      resolvePageSource({ slug: "about", locale: "en", defaultLocale: "en" }, providers),
    ).rejects.toThrow(/Invalid metadata in authored page "about"/);
  });
});
