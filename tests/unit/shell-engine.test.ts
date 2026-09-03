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
      }),
    );
    expect(html).toContain("<header>Brand</header>");
    expect(html).toContain('<main id="main" class="flex-1"><p>Body</p></main>');
    expect(html).toContain("<footer>Foot</footer>");
  });

  it("applies the flex-column wrapper with opt-in density + content-width classes", () => {
    const resolved = resolveUiConfig({ density: "compact", content: { width: "wide" } });
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header, main, footer, mainId: "main" }),
    );
    expect(html).toContain("flex flex-col flex-1 ui-density-compact max-w-screen-2xl");
  });

  it("emits NO density/content class for the Foundation defaults (zero-visual-delta)", () => {
    const resolved = resolveUiConfig({});
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header, main, footer, mainId: "main" }),
    );
    expect(html).toContain('class="flex flex-col flex-1"');
  });

  it("renders NO CTA by default (cta.enabled=false — Foundation never invents one)", () => {
    const resolved = resolveUiConfig({});
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header, main, footer, mainId: "main", ctaLabel: "Book", ctaHref: "/book" }),
    );
    expect(html).not.toContain("nav-item-cta");
  });

  it("renders the CTA when resolved.cta.enabled AND label+href are supplied", () => {
    const resolved = resolveUiConfig({ cta: { enabled: true, action: "book", label: "Book", style: "standard" } });
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header, main, footer, mainId: "main", ctaLabel: "Book", ctaHref: "/book" }),
    );
    expect(html).toContain("nav-item-cta");
    expect(html).toContain("/book");
  });

  it("keeps the footer/content ordering stable (header, main, footer)", () => {
    const resolved = resolveUiConfig({});
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header, main, footer, mainId: "main" }),
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
    expect(html).toContain('aria-controls="m-panel"');
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