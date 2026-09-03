import { describe, expect, it } from "vitest";

import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { parseTestimonialsFile } from "@/adapters/content/frontmatter";
import { siteConfig } from "@/config";
import {
  isValidRating,
  ratingAriaLabel,
  sortTestimonials,
  starRow,
} from "@/core/testimonials";
import type { TestimonialContent } from "@/core/testimonials";

const defaultLocale = siteConfig.defaultLocale;

const repository = createFileSystemPageContentRepository<TestimonialContent>({
  defaultLocale,
  collection: "testimonials",
});

function testimonialFile(overrides: Record<string, unknown> = {}) {
  const base = {
    author: '"Demo Client"',
    quote: '"Template quote."',
  };
  const frontmatter = Object.entries({ ...base, ...overrides })
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  return `---\n${frontmatter}\n---\n`;
}

describe("parseTestimonialsFile (Phase T)", () => {
  it("parses a valid testimonial with optional fields", () => {
    const content = parseTestimonialsFile(
      testimonialFile({
        role: '"Founder"',
        company: '"Acme"',
        rating: 5,
        featured: true,
        order: 1,
      }),
      "demo-client-consulting",
      "en",
    );

    expect(content.author).toBe("Demo Client");
    expect(content.role).toBe("Founder");
    expect(content.company).toBe("Acme");
    expect(content.rating).toBe(5);
    expect(content.featured).toBe(true);
    expect(content.order).toBe(1);
    expect(content.quote).toBe("Template quote.");
    // PageContent compatibility: title maps to the author, body is unused.
    expect(content.title).toBe("Demo Client");
  });

  it("treats rating as optional (absent is valid)", () => {
    const content = parseTestimonialsFile(testimonialFile(), "x", "en");
    expect(content.rating).toBeUndefined();
  });

  it("rejects an out-of-range or non-integer rating loudly", () => {
    for (const bad of [0, 6, 2.5]) {
      expect(() => parseTestimonialsFile(testimonialFile({ rating: bad }), "x", "en")).toThrow(
        /rating/,
      );
    }
  });

  it("requires author and quote", () => {
    expect(() => parseTestimonialsFile(testimonialFile({ author: undefined }), "x", "en")).toThrow(
      /author/,
    );
    expect(() => parseTestimonialsFile(testimonialFile({ quote: undefined }), "x", "en")).toThrow(
      /quote/,
    );
  });
});

describe("testimonial core helpers (Phase T)", () => {
  it("validates ratings as integers 1-5 only", () => {
    expect(isValidRating(1)).toBe(true);
    expect(isValidRating(5)).toBe(true);
    expect(isValidRating(0)).toBe(false);
    expect(isValidRating(6)).toBe(false);
    expect(isValidRating(3.5)).toBe(false);
  });

  it("sorts by order ascending then slug", () => {
    const sorted = sortTestimonials([
      { slug: "b", order: 2 },
      { slug: "a", order: 1 },
      { slug: "c" },
      { slug: "a2", order: 1 },
    ]);
    expect(sorted.map((item) => item.slug)).toEqual(["a", "a2", "b", "c"]);
  });

  it("builds a deterministic star row and aria label", () => {
    expect(starRow(3)).toBe("★★★");
    expect(ratingAriaLabel(4, "Rated {rating} out of 5")).toBe("Rated 4 out of 5");
    expect(ratingAriaLabel(5, "{rating} / 5")).toBe("5 / 5");
  });
});

describe("demo inventory (locked: 3 canonical testimonials)", () => {
  it("lists exactly the locked canonical slugs", async () => {
    const slugs = await repository.listSlugs(defaultLocale);
    expect(slugs.sort()).toEqual([
      "demo-client-consulting",
      "demo-longterm-engagement",
      "demo-working-partnership",
    ]);
  });

  it("serves the featured localized variant in ja and falls back to en elsewhere", async () => {
    const ja = await repository.findBySlug("demo-client-consulting", "ja");
    expect(ja?.locale).toBe("ja");

    const es = await repository.findBySlug("demo-client-consulting", "es");
    expect(es?.locale).toBe(defaultLocale);
    expect(es?.quote).toContain("Template testimonial");
  });
});