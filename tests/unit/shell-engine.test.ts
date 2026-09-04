import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * NOTE: the Shell Engine (server) renders without hooks. `ShellMobileNav`
 * (client) uses useState/useEffect, which have no context under
 * `renderToStaticMarkup`; per D1 we add no browser/testing dependency, so this
 * suite provides minimal STATELESS hook stubs (evaluating lazy initializers)
 * so markup captures the deterministic INITIAL state. The behavioral matrix
 * (keyboard/focus/Escape/scroll/reduced-motion) is the mandatory UI-10 gate.
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
    useRef: () => ({ current: null }),
  };
});

import { ShellEngine, ShellMobileNav } from "@/components/shell";
import { resolveUiConfig } from "@/core/ui";

const el = (
  type: "header" | "footer" | "p" | "nav",
  props: Record<string, unknown> | null,
  ...children: ReactNode[]
) => createElement(type, props, ...children);

const header = el("header", null, "Brand");
const footer = el("footer", null, "Foot");
const main = el("p", null, "Body");

/** JSX-free single nav-item node. */
const items = createElement(
  "ul",
  null,
  createElement("li", null, createElement("a", { href: "/en" }, "Home")),
);

describe("ShellEngine (server) — frame & decision-driven composition", () => {
  const base = { locale: "en", pageBindings: [] };
  it("renders the AppShell frame with the deterministic main id and content slots", () => {
    const resolved = resolveUiConfig({});
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved,
        header,
        main,
        footer,
        mainId: "main",
        mainClassName: "flex-1",
        ...base,
      }),
    );
    expect(html).toContain("<header>Brand</header>");
    expect(html).toContain('<main id="main" class="flex-1"><p>Body</p></main>');
    expect(html).toContain("<footer>Foot</footer>");
  });

  it("applies the flex-column wrapper with opt-in density + content-width classes", () => {
    const resolved = resolveUiConfig({ density: "compact", content: { width: "wide" } });
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header, main, footer, mainId: "main", ...base }),
    );
    expect(html).toContain("flex flex-col flex-1 ui-density-compact max-w-screen-2xl");
  });

  it("emits NO density/content class for the defaults (default demo leaves emit nothing)", () => {
    const resolved = resolveUiConfig({ navigation: { desktop: "top", tablet: "top-compact", mobile: "drawer" } });
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header, main, footer, mainId: "main", ...base }),
    );
    expect(html).toContain('class="flex flex-col flex-1"');
  });

  it("renders NO CTA by default (cta.enabled=false — Foundation never invents one)", () => {
    const resolved = resolveUiConfig({});
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header, main, footer, mainId: "main", ctaLabel: "Book", ctaHref: "/book", ...base }),
    );
    expect(html).not.toContain("nav-item-cta");
  });

  it("renders the CTA in the header slot when resolved.cta.enabled AND label+href are supplied", () => {
    const resolved = resolveUiConfig({
      navigation: { desktop: "top", tablet: "top-compact", mobile: "drawer" },
      cta: { enabled: true, action: "book", label: "Book", style: "standard" },
    });
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header, main, footer, mainId: "main", ctaLabel: "Book", ctaHref: "/book", ...base }),
    );
    expect(html).toContain("nav-item-cta");
    expect(html).toContain("/book");
  });

  it("keeps the footer/content ordering stable (header, main, footer)", () => {
    const resolved = resolveUiConfig({});
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header, main, footer, mainId: "main", ...base }),
    );
    expect(html.indexOf("<header>"))
      .toBeLessThan(html.indexOf('<main id="main"'));
    expect(html.indexOf('<main id="main"'))
      .toBeLessThan(html.indexOf("<footer>"));
  });
});

describe("ShellMobileNav (client) — deterministic SSR states + dialog semantics", () => {
  it("renders the trigger (below the breakpoint) + a CLOSED drawer (nothing else rendered)", () => {
    const html = renderToStaticMarkup(
      ShellMobileNav({ pattern: "drawer", triggerLabel: "Menu", id: "m", children: items }),
    );
    expect(html).toContain("md:hidden");
    expect(html).toContain('aria-expanded="false"');
    // B1: the trigger owns the deterministic id; aria-controls targets the
    // `${id}-panel` id that exists only once the dialog is open.
    expect(html).toContain('id="m"');
    expect(html).toContain('aria-controls="m-panel"');
    expect(html).not.toContain('id="m-panel"');
    // Closed drawer renders no dialog markup:
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("/en");
  });

  it("composes the overlay primitive for the overlay pattern (closed by default)", () => {
    const html = renderToStaticMarkup(
      ShellMobileNav({ pattern: "overlay", triggerLabel: "Menu", id: "o", children: items }),
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="dialog"'); // closed SSR — deterministic
  });
});