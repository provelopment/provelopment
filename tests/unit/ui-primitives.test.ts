import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * NOTE: `renderToStaticMarkup` renders Server components + static JSX directly.
 * The CLIENT primitives (Drawer, NavGroup collapsible, Sidebar) call React
 * hooks (`useState`/`useEffect`), which have no context under
 * `renderToStaticMarkup`. Per D1 we add NO browser/testing dependency, so this
 * suite provides minimal STATELESS hook stubs: `useState` evaluates a lazy
 * initializer like React does and returns `[initial, noop]` so markup captures
 * the deterministic INITIAL state; `useEffect` is a no-op. The BEHAVIORAL
 * matrix (real keyboard/focus/Escape/scroll/reduced-motion) remains the
 * MANDATORY UI-10 browser gate.
 */
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const value = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [value, () => undefined];
    },
    useEffect: () => undefined,
  };
});

import {
  AppShell,
  BottomNavigation,
  Drawer,
  NavBadge,
  NavCta,
  NavGroup,
  NavItem,
  Navigation,
  OverlayNavigation,
  Sidebar,
} from "@/components/ui";

/** Small JSX-free node helper for the repo's `.test.ts` component convention. */
const el = (
  type: "header" | "p" | "footer" | "a" | "aside" | "span" | "nav",
  props: Record<string, unknown> | null,
  ...children: ReactNode[]
) => createElement(type, props, ...children);

const header = (text: string) => el("header", null, text);
const footer = (text: string) => el("footer", null, text);
const para = (text: string) => el("p", null, text);
const anchor = (href: string, text: string) => el("a", { href }, text);
const span = (text: string) => el("span", null, text);

/**
 * UI-03 — Shared UI Primitives structural accessibility & markup tests.
 *
 * Per the approved D1 refinement, this suite verifies what is PROVABLE WITHOUT
 * a browser (landmark roles, ARIA attributes, open/closed rendering,
 * aria-expanded/aria-controls/aria-current, deterministic initial states).
 * The BEHAVIORAL accessibility matrix (keyboard navigation, focus trap, focus
 * return, Escape, scroll locking, responsive interaction, reduced motion) is a
 * MANDATORY UI-10 browser-validation gate — UI-03 implements the underlying
 * behavior, but does not fake browser verification here.
 */

describe("UI-03 — AppShell (composition frame)", () => {
  it("renders the semantic landmarks with a deterministic main id", () => {
    const html = renderToStaticMarkup(
      AppShell({
        header: header("head"),
        main: para("body"),
        footer: footer("foot"),
        mainId: "main-content",
      }),
    );
    expect(html).toContain("<header>head</header>");
    expect(html).toContain('<main id="main-content"><p>body</p></main>');
    expect(html).toContain("<footer>foot</footer>");
  });

  it("omits the nav/aside slots when not supplied", () => {
    const html = renderToStaticMarkup(
      AppShell({ header: header("h"), main: para("m"), footer: footer("f"), mainId: "main" }),
    );
    expect(html).not.toContain("<nav");
    expect(html).not.toContain("<aside");
  });

  it("renders the optional navigation and secondary-panel slots when supplied", () => {
    const html = renderToStaticMarkup(
      AppShell({
        header: header("h"),
        main: para("m"),
        footer: footer("f"),
        mainId: "main",
        navigation: anchor("/en", "Scan"),
        navigationLabel: "Navigate",
        secondaryPanel: para("context"),
      }),
    );
    expect(html).toContain('<nav aria-label="Navigate">');
    expect(html).toContain("<aside><p>context</p></aside>");
  });
});

describe("UI-03 — NavItem (server-safe, data-driven)", () => {
  it("renders a serializable link with no callback props", () => {
    const html = renderToStaticMarkup(NavItem({ item: { label: "About", href: "/en/about" } }));
    expect(html).toContain('<li><a href="/en/about"');
    expect(html).toContain("About");
  });

  it("marks the active item with aria-current=page", () => {
    const html = renderToStaticMarkup(NavItem({ item: { label: "Home", href: "/en", active: true } }));
    expect(html).toContain('aria-current="page"');
  });

  it("renders external links with new-tab + rel=noreferrer", () => {
    const html = renderToStaticMarkup(
      NavItem({ item: { label: "Demo", href: "https://example.com", external: true } }),
    );
    expect(html).toContain('rel="noreferrer"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("https://example.com");
  });

  it("renders the badge chip when supplied", () => {
    const html = renderToStaticMarkup(NavItem({ item: { label: "Blog", href: "/en/blog", badge: "NEW" } }));
    expect(html).toContain(">NEW</span>");
  });

  it("the non-active link uses no aria-current (no invented state)", () => {
    const html = renderToStaticMarkup(NavItem({ item: { label: "About", href: "/en/about" } }));
    expect(html).not.toContain("aria-current");
  });
});

describe("UI-03 — Navigation (landmark list)", () => {
  it("renders a labelled nav landmark over a list of items", () => {
    const html = renderToStaticMarkup(
      Navigation({
        label: "Primary",
        items: [
          { label: "Home", href: "/en", active: true },
          { label: "About", href: "/en/about" },
        ],
      }),
    );
    expect(html).toContain('<nav aria-label="Primary">');
    expect(html).toContain("<ul>");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("/en/about");
  });
});

describe("UI-03 — NavGroup", () => {
  it("static group renders a heading + items", () => {
    const html = renderToStaticMarkup(
      NavGroup({ label: "Services", items: [{ label: "Consulting", href: "/en/consulting" }] }),
    );
    expect(html).toContain("<h3>Services</h3>");
    expect(html).toContain("/en/consulting");
  });

  it("collapsible group (closed) renders a disclosure button, aria-expanded=false, and NO list (no tab-order residue)", () => {
    const html = renderToStaticMarkup(
      NavGroup({ collapsible: true, label: "More", items: [{ label: "Vault", href: "/en/vault" }], defaultOpen: false }),
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("aria-controls=");
    expect(html).not.toContain("<ul");
    expect(html).not.toContain("/en/vault");
  });

  it("collapsible group (open) renders aria-expanded=true and the list", () => {
    const html = renderToStaticMarkup(
      NavGroup({ collapsible: true, label: "More", items: [{ label: "Vault", href: "/en/vault" }], defaultOpen: true }),
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("/en/vault");
  });
});

describe("UI-03 — NavCta / NavBadge", () => {
  it("NavCta applies the cta variant to a NavItem", () => {
    const html = renderToStaticMarkup(NavCta({ item: { label: "Book", href: "/en/book" } }));
    expect(html).toContain("/en/book");
    expect(html).toContain("nav-item-cta");
  });

  it("NavBadge renders a chip span", () => {
    const html = renderToStaticMarkup(NavBadge({ label: "NEW" }));
    expect(html).toContain(">NEW</span>");
  });
});

describe("UI-03 — BottomNavigation", () => {
  it("renders a nav landmark with items and active state", () => {
    const html = renderToStaticMarkup(
      BottomNavigation({
        label: "Bottom",
        items: [{ label: "Home", href: "/en", active: true }, { label: "CV", href: "/en/cv" }],
      }),
    );
    expect(html).toContain('<nav aria-label="Bottom">');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("/en/cv");
  });
});

describe("UI-03 — Drawer / OverlayNavigation (deterministic SSR states + dialog semantics)", () => {
  it("Drawer closed renders NOTHING (no hidden focusable content)", () => {
    const html = renderToStaticMarkup(
      Drawer({ open: false, onClose: () => undefined, labelledBy: "t", id: "d", children: anchor("/en", "x") }),
    );
    expect(html).toBe("");
  });

  it("Drawer open renders role=dialog + aria-modal + aria-labelledby", () => {
    const html = renderToStaticMarkup(
      Drawer({ open: true, labelledBy: "trigger-id", id: "d", onClose: () => undefined, children: anchor("/en", "x") }),
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="trigger-id"');
    expect(html).toContain("/en");
  });

  it("OverlayNavigation closed renders nothing; open composes the dialog semantics", () => {
    const closed = renderToStaticMarkup(
      OverlayNavigation({ open: false, labelledBy: "t", id: "o", onClose: () => undefined, children: para("m") }),
    );
    expect(closed).toBe("");

    const open = renderToStaticMarkup(
      OverlayNavigation({ open: true, labelledBy: "t", id: "o", onClose: () => undefined, children: para("m") }),
    );
    expect(open).toContain('role="dialog"');
    expect(open).toContain('aria-modal="true"');
    expect(open).toContain("<p>m</p>");
  });
});

describe("UI-03 — Sidebar", () => {
  it("non-collapsible renders a nav landmark with the rail content", () => {
    const html = renderToStaticMarkup(Sidebar({ label: "Rail", children: anchor("/en", "a") }));
    expect(html).toContain('<nav aria-label="Rail"');
    expect(html).toContain("/en");
    expect(html).not.toContain('type="button"');
  });

  it("collapsible closed renders the toggle with aria-expanded=false + aria-controls", () => {
    const html = renderToStaticMarkup(
      Sidebar({ label: "Rail", collapsible: true, collapsed: true, toggleLabel: "Open", children: span("rail") }),
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("aria-controls=");
    expect(html).toContain("Open");
  });

  it("collapsible open renders the toggle with aria-expanded=true", () => {
    const html = renderToStaticMarkup(Sidebar({ label: "Rail", collapsible: true, children: span("rail") }));
    expect(html).toContain('aria-expanded="true"');
  });
});