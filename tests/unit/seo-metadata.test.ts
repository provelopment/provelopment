import { describe, expect, it } from "vitest";

import { buildOpenGraphData, buildTwitterData } from "@/core/seo-metadata";

const base = {
  baseUrl: "https://example.com",
  siteName: "Example",
  locale: "en",
  title: "About",
};

describe("buildOpenGraphData (Phase S)", () => {
  it("emits the full deterministic OpenGraph contract", () => {
    const data = buildOpenGraphData({
      ...base,
      description: "A page description.",
      url: "https://example.com/en/about",
      imageUrl: "https://example.com/en/opengraph-image",
      alternateLocales: ["fr", "de"],
    });

    expect(data.title).toBe("About");
    expect(data.description).toBe("A page description.");
    expect(data.type).toBe("website");
    expect(data.url).toBe("https://example.com/en/about");
    expect(data.siteName).toBe("Example");
    expect(data.locale).toBe("en");
    expect(data.images).toEqual([{ url: "https://example.com/en/opengraph-image" }]);
    expect(data.alternateLocale).toEqual(["fr", "de"]);
  });

  it("falls back to the site description when no page description is given", () => {
    const data = buildOpenGraphData({
      ...base,
      fallbackDescription: "The site-wide description.",
    });
    expect(data.description).toBe("The site-wide description.");
  });

  it("page description wins over the fallback", () => {
    const data = buildOpenGraphData({
      ...base,
      description: "Page description.",
      fallbackDescription: "Site description.",
    });
    expect(data.description).toBe("Page description.");
  });

  it("defaults url to the locale root and the OG image to the generated route", () => {
    const data = buildOpenGraphData(base);
    expect(data.url).toBe("https://example.com/en");
    expect(data.images).toEqual([{ url: "https://example.com/en/opengraph-image" }]);
  });

  it("omits alternateLocale when none are supplied", () => {
    const data = buildOpenGraphData(base);
    expect(data.alternateLocale).toBeUndefined();
  });
});

describe("buildTwitterData (Phase S)", () => {
  it("emits a summary_large_image card with title, description and image", () => {
    const data = buildTwitterData({
      title: "About",
      description: "A page description.",
      fallbackDescription: "Site description.",
      imageUrl: "https://example.com/en/opengraph-image",
    });

    expect(data.card).toBe("summary_large_image");
    expect(data.title).toBe("About");
    expect(data.description).toBe("A page description.");
    expect(data.images).toEqual(["https://example.com/en/opengraph-image"]);
  });

  it("falls back to the site description when no page description is given", () => {
    const data = buildTwitterData({
      title: "About",
      fallbackDescription: "The site-wide description.",
      imageUrl: "https://example.com/en/opengraph-image",
    });
    expect(data.description).toBe("The site-wide description.");
  });
});