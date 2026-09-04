import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

let mockPath = "/en";
vi.mock("next/navigation", () => ({ usePathname: () => mockPath }));

import { ContextNavLinks, type ContextNavLink } from "@/components/site/context-nav-links";

const links: readonly ContextNavLink[] = [
    { href: "/", label: "Home" },
    { href: "/about", label: "About" },
    { href: "https://example.com", label: "External" },
];

function render() {
    return renderToStaticMarkup(ContextNavLinks({ locale: "en", links }));
}

/**
 * UI-10 B2 — active navigation semantics in the shared ContextNavLinks consumer.
 *
 * The consumer feeds the ≥md header nav, the aside (sidebar) bands, the mobile
 * drawer/overlay children, and the footer — so one fix propagates across every
 * placement. `aria-current="page"` must land on the ACTIVE INTERNAL link only,
 * using the same route comparison as the bottom navigation; external links never
 * carry it.
 */
describe("ContextNavLinks — active navigation semantics (UI-10 B2)", () => {
    it("marks the active internal page with aria-current and nothing else", () => {
        mockPath = "/en";
        const html = render();
        expect(html.match(/aria-current="page"/g) ?? []).toHaveLength(1);
        // Home ("/") resolves to "/en" and is current (either attribute order):
        expect(html).toMatch(
            /href="\/en"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/en"/,
        );
    });

    it("marks a deep internal page and NEVER an external link", () => {
        mockPath = "/en/about";
        const html = render();
        expect(html.match(/aria-current="page"/g) ?? []).toHaveLength(1);
        expect(html).toMatch(
            /href="\/en\/about"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/en\/about"/,
        );
        // The external link is present, opens a new tab, but carries no aria-current:
        expect(html).toContain("https://example.com");
        expect(html).toContain('target="_blank"');
        expect(html).not.toMatch(/href="https:[^"]+"[^>]*?aria-current="page"/);
    });

    it("marks no link current when the pathname matches nothing", () => {
        mockPath = "/en/unknown";
        const html = render();
        expect(html.match(/aria-current="page"/g) ?? []).toHaveLength(0);
    });
});