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

/**
 * P0-5 — link-semantics convergence: the rendered LINK contract is the shared
 * `NavItem` primitive (internal Next Link, external new-tab + rel=noreferrer,
 * `aria-current="page"`, and the badge chip). ContextNavLinks keeps only the
 * URL/region-aware context — resolution, active computation, list composition.
 */
describe("ContextNavLinks — P0-5 shared link path", () => {
    it("renders the demo badge through the shared nav-item-badge chip (not a second badge implementation)", () => {
        mockPath = "/en";
        const html = renderToStaticMarkup(
            ContextNavLinks({
                locale: "en",
                links: [{ href: "/contact", label: "Message Us", demoOnly: true }],
                demoBadgeLabel: "Demo",
            }),
        );
        // Label preserved and the single badge chip is the shared NavItem badge:
        expect(html).toContain("Message Us");
        expect(html.match(/class="nav-item-badge"/g) ?? []).toHaveLength(1);
        expect(html).not.toMatch(/rounded bg-accent|inline-flex items-center gap-1\.5/);
    });

    it("the active internal item's li carries the shared aria-current-page marker (NavItem path)", () => {
        mockPath = "/en/about";
        const html = render();
        // Only NavItem emits the `aria-current-page` marker on the item wrapper.
        expect(html.match(/<li class="aria-current-page">/g) ?? []).toHaveLength(1);
        expect(html).toContain('href="/en/about"');
    });

    it("every rendered item is an li>a pair via NavItem (no direct a/Link in the consumer)", () => {
        mockPath = "/en";
        const html = render();
        // Three configured links → three <li> wrappers, each containing exactly one anchor.
        expect(html.match(/<li/g) ?? []).toHaveLength(3);
        expect(html.match(/<a /g) ?? []).toHaveLength(3);
    });
});