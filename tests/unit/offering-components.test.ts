import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OfferingCard } from "@/components/site/offering-card";
import { OfferingDetail } from "@/components/site/offering-detail";
import { OfferingList } from "@/components/site/offering-list";
import type { OfferingsContent, OfferingsListItem, ResolvedOfferingAction } from "@/core/offerings";

function makeListItem(overrides: Partial<OfferingsListItem> = {}): OfferingsListItem {
  return {
    slug: "starter-package",
    title: "Starter package",
    blurb: "A practical package of essentials.",
    price: "From $150",
    featured: true,
    ...overrides,
  };
}

function makeContent(overrides: Partial<OfferingsContent> = {}): OfferingsContent {
  return {
    slug: "starter-package",
    locale: "en",
    title: "Starter package",
    blurb: "A practical package of essentials.",
    body: "Long-form detail.\n",
    price: "From $150",
    featured: true,
    deliverables: ["What is included", "How delivery works"],
    faq: [{ question: "How long does it take?", answer: "Within one week." }],
    action: { intent: "book" },
    ...overrides,
  };
}

const detailLabels = {
  deliverablesHeading: "What's included",
  faqHeading: "Frequently asked questions",
  featuredBadge: "Featured",
  actionLabel: "Book a call",
  backToListing: "Back to offerings",
};

function countOccurrences(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe("OfferingCard (listing card)", () => {
  it("renders ONE whole-card link whose text carries the accessible name", () => {
    const html = renderToStaticMarkup(
      OfferingCard({
        offering: makeListItem(),
        href: "/en/offerings/starter-package",
        featuredLabel: "Featured",
      }),
    );

    expect(countOccurrences(html, "<a ")).toBe(1);
    expect(html).toContain('href="/en/offerings/starter-package"');
    expect(html).toContain("Starter package");
    expect(html).toContain("A practical package of essentials.");
    expect(html).toContain("From $150");
    expect(html).toContain("Featured");
    // No interactive control other than the card link.
    expect(html).not.toContain("<button");
  });

  it("omits the featured badge and price when not configured", () => {
    const html = renderToStaticMarkup(
      OfferingCard({
        offering: makeListItem({ featured: false, price: undefined }),
        href: "/en/offerings/x",
      }),
    );
    expect(html).not.toContain("Featured");
    expect(html).not.toContain("From $150");
  });

  it("gives the image a meaningful alt from the offering title", () => {
    const html = renderToStaticMarkup(
      OfferingCard({
        offering: makeListItem({ image: "/images/offerings/starter.jpg" }),
        href: "/en/offerings/starter-package",
      }),
    );
    expect(html).toContain('alt="Starter package"');
  });
});

describe("OfferingList (listing grid)", () => {
  it("renders a semantic <ul> with one <li>/card per offering under the base path", () => {
    const html = renderToStaticMarkup(
      OfferingList({
        offerings: [
          makeListItem({ slug: "starter-package", title: "Starter package" }),
          makeListItem({ slug: "consultation", title: "Consultation" }),
        ],
        baseHref: "/en/offerings",
        featuredLabel: "Featured",
      }),
    );

    expect(html).toContain("<ul");
    expect(countOccurrences(html, "<li")).toBe(2);
    expect(html).toContain('href="/en/offerings/starter-package"');
    expect(html).toContain('href="/en/offerings/consultation"');
  });
});

describe("OfferingDetail (detail page semantics + accessibility)", () => {
  it("renders exactly one h1 and the deterministic section order", () => {
    const html = renderToStaticMarkup(
      OfferingDetail({
        offering: makeContent(),
        action: { kind: "link", href: "https://cal.example.com/book", external: true },
        backHref: "/en/offerings",
        labels: detailLabels,
      }),
    );

    expect(countOccurrences(html, "<h1")).toBe(1);
    expect(html).toContain("Starter package");
    expect(html).toContain("Long-form detail.");
    expect(html).toContain("From $150");
    expect(html).toContain("Featured");
  });

  it("renders deliverables as a real list and FAQ as native <details>/<summary>", () => {
    const html = renderToStaticMarkup(
      OfferingDetail({
        offering: makeContent(),
        action: { kind: "link", href: "https://cal.example.com/book", external: true },
        backHref: "/en/offerings",
        labels: detailLabels,
      }),
    );

    // HTML-escaped apostrophe (React SSR), same as the French hours heading.
    expect(html).toContain("What&#x27;s included");
    expect(html).toContain("<ul");
    expect(html).toContain("What is included");
    expect(html).toContain("How delivery works");
    expect(html).toContain("<details");
    expect(html).toContain(">How long does it take?</summary>");
    expect(html).toContain("Within one week.");
    // No custom JS accordion behavior is introduced.
    expect(html).not.toContain("<button");
  });

  it("renders the external CTA as a new-tab link and the back-link (2 anchors)", () => {
    const html = renderToStaticMarkup(
      OfferingDetail({
        offering: makeContent(),
        action: { kind: "link", href: "https://cal.example.com/book", external: true },
        backHref: "/en/offerings",
        labels: detailLabels,
      }),
    );

    expect(countOccurrences(html, "<a ")).toBe(2);
    expect(html).toContain('href="https://cal.example.com/book"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
    expect(html).toContain('href="/en/offerings"');
    expect(html).toContain("Back to offerings");
  });

  it("renders the internal contact CTA without new-tab attributes", () => {
    const html = renderToStaticMarkup(
      OfferingDetail({
        offering: makeContent(),
        action: { kind: "link", href: "/en/contact", external: false },
        backHref: "/en/offerings",
        labels: detailLabels,
      }),
    );
    expect(html).toContain('href="/en/contact"');
    expect(html).not.toContain('target="_blank"');
  });

  it("renders NO CTA when the resolved action is none (zero focusable residue)", () => {
    const action: ResolvedOfferingAction = { kind: "none" };
    const html = renderToStaticMarkup(
      OfferingDetail({
        offering: makeContent(),
        action,
        backHref: "/en/offerings",
        labels: { ...detailLabels, actionLabel: null },
      }),
    );

    expect(countOccurrences(html, "<a ")).toBe(1); // back link only
    expect(html).toContain('href="/en/offerings"');
    expect(html).not.toContain('href="https://cal.example.com/book"');
  });
});