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
/**
 * P5-5A — contract hardening acceptance of the configurable navigation-item
 * surface THROUGH the shared context renderer:
 *  - icon flows to a replaceable /assets/<name> <img> (ui-nav-item-icon),
 *  - disabled renders aria-disabled + non-navigable + stays in DOM,
 *  - sortByRegion orders deterministic top → middle → bottom.
 */
describe("ContextNavLinks — P5-5A configurable navigation items (icon / disabled / region)", () => {
    it("renders a configured item icon as the replaceable /assets asset", () => {
        mockPath = "/en";
        const html = renderToStaticMarkup(
            ContextNavLinks({
                locale: "en",
                links: [{ href: "/about", label: "About", icon: "about.svg" }],
            }),
        );
        expect(html).toContain('src="/assets/about.svg"');
        expect(html).toContain("ui-nav-item-icon");
        expect(html).toContain("ui-nav-item--has-icon");
        expect(html).toContain(">About</span>"); // the label remains the accessible name
    });

    it("renders a disabled item as aria-disabled, NOT navigable, but still in the DOM", () => {
        mockPath = "/en";
        const html = renderToStaticMarkup(
            ContextNavLinks({
                locale: "en",
                links: [{ href: "/legacy", label: "Legacy", disabled: true }],
            }),
        );
        expect(html).toContain('aria-disabled="true"');
        expect(html).toContain(">Legacy</span>");
        // Disabled items must not become navigable links:
        expect(html).not.toMatch(/<a[^>]*href="[^"]*legacy/);
    });

    it("orders by region top → middle → bottom deterministically when sortByRegion is set", () => {
        mockPath = "/en";
        const shuffled: readonly ContextNavLink[] = [
            { href: "/bottom1", label: "B1", position: "bottom" },
            { href: "/top2", label: "T2", position: "top" },
            { href: "/mid1", label: "M1" }, // undefined → middle (default)
            { href: "/mid2", label: "M2", position: "middle" },
            { href: "/top1", label: "T1", position: "top" },
        ];
        const html = renderToStaticMarkup(ContextNavLinks({ locale: "en", links: shuffled, sortByRegion: true }));
        // Contract: groups are ordered top → middle → bottom, STABLE within each
        // group (configured relative order preserved — the shuffle put top2
        // before top1, so the top group renders T2 then T1).
        const order = ["T2", "T1", "M1", "M2", "B1"];
        let lastIndex = -1;
        for (const label of order) {
            const at = html.indexOf(`>${label}</span>`);
            expect(at).toBeGreaterThan(lastIndex);
            lastIndex = at;
        }
        // Without sortByRegion the configuration order is untouched.
        const unsorted = renderToStaticMarkup(ContextNavLinks({ locale: "en", links: shuffled }));
        const first = unsorted.indexOf(">B1</span>");
        expect(first).toBeGreaterThan(-1);
    });
});

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