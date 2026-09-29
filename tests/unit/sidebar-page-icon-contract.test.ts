import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { siteConfig } from "@/config";
import { deploymentPaths } from "@/config/deployment-root";
import {
  DEFAULT_SIDEBAR_ITEM_ICON_CLOSED,
  DEFAULT_SIDEBAR_ITEM_ICON_OPEN,
  getSiteNavLinks,
  withSidebarNavIcons,
} from "@/components/site/nav-links";
import { NavItem } from "@/components/ui/nav-item";

/**
 * SIDEBAR PAGE-ICON CONTRACT (owner ruling, 2026-09).
 *
 *  1. every sidebar PAGE icon renders at EXACTLY 16x16 — desktop AND tablet,
 *     expanded AND collapsed (one shared sizing contract, no breakpoint split);
 *  2. the icons come from the reusable ICON LIBRARY that was acquired for the
 *     template — the shipped default is a semantically appropriate generic icon,
 *     not a dot/plus placeholder, whenever a matching icon exists;
 *  3. the precedence is explicit: deployment-configured icon → icon library →
 *     blank/generic placeholder fallback;
 *  4. expanded = 16x16 icon + page name; collapsed = 16x16 icon ONLY, with the
 *     page name still discoverable (sr-only accessible name + native tooltip);
 *  5. the MOBILE navigation is untouched — it never uses these icons.
 */

const ROOT = process.cwd();
const runtime = (file: string) => path.join(deploymentPaths().publicAssetsDirectory, file);
// ISO-H2 — the SOURCE side of every assertion comes from the deployment authority, never from a path
// this test spells: the deployment's artwork is deployment-owned, so it is asked for (the synthetic
// deployment in the generic project, the real capsule in the deployment project).
const source = (...segments: string[]) => path.join(deploymentPaths().assetSourceRoot, ...segments);
const read = (...segments: string[]) => readFileSync(path.join(ROOT, ...segments), "utf8");
const globalsRaw = read("src", "app", "globals.css");

/**
 * UI1-A2 — THE BOOT GUARD. Every collapsed-state rule is guarded with
 * `:where(html:not([data-ui-sidebar-preference="open"]))`, the zero-specificity prefix that lets the
 * pre-paint bridge present the canonical CLOSED rail as the visitor's OPEN one for the boot interval (see
 * `@/components/ui/sidebar-contract` and the block comment in `globals.css`). The prefix carries no
 * specificity and no declarations, so the assertions below are about exactly the same rules and values they
 * always were: the guard is stripped here, once, and asserted separately further down.
 */
const SIDEBAR_BOOT_GUARD = ':where(html:not([data-ui-sidebar-preference="open"])) ';
const globals = globalsRaw.split(SIDEBAR_BOOT_GUARD).join("");

// ISO-H2 — the canonical page → icon-library mapping this suite used to assert (Home/About/Resources/
// Testimonials/Portfolio/Blog/Connect/Offerings against the shipped icon library) describes what THIS
// deployment installs, so it moved with the asset install: see
// `deployment/tests/unit/asset-install.test.ts`. The generic contract below is about the RULE — every
// CONFIGURED page's icon is a real icon-library file — and it therefore follows whichever deployment
// the run selected (the synthetic deployment in the generic project).

describe("sidebar page icons — the configured source is the icon LIBRARY", () => {
  it("maps every CONFIGURED sidebar page to a generic icon-library asset", () => {
    // FS1 — the generic template configures one nav item; the invariant is that
    // EVERY configured item's icons are real icon-library files (never a
    // brand-specific or inline graphic), so an adopter adding pages inherits the
    // same guarantee.
    for (const item of siteConfig.navigation) {
      for (const icon of [item.iconOpen, item.iconClosed]) {
        if (icon === undefined || icon === "") continue;
        expect(icon, `${item.href} icon must come from the icon library`).toMatch(
          /^icon-[a-z0-9-]+\.svg$/,
        );
        expect(existsSync(runtime(icon)), `${icon} must ship`).toBe(true);
        expect(existsSync(source("icon-library", "icons", icon)), `${icon} source`).toBe(true);
      }
    }
  });

  it("resolves each mapped icon to BOTH the runtime copy and its icon-library source", () => {
    // ISO-H2 — the canonical page set and its icons belong to the installed deployment and are asserted
    // by its own acceptance suite (`deployment/tests/unit/asset-install.test.ts`). The rule that holds
    // for ANY deployment — a configured page icon exists at runtime and in the icon library — is proved
    // by the test above, against the selected deployment.
  });

  it("never falls back to the dot/plus placeholder while a semantic icon exists", () => {
    const used = siteConfig.navigation.flatMap((item) => [item.iconOpen, item.iconClosed]);
    expect(used).not.toContain(DEFAULT_SIDEBAR_ITEM_ICON_OPEN);
    expect(used).not.toContain(DEFAULT_SIDEBAR_ITEM_ICON_CLOSED);
    for (const icon of used) expect(icon).toMatch(/^icon-[a-z0-9-]+\.svg$/);
  });

  it("keeps the shipped placeholder fallback available for unmapped page types", () => {
    // Precedence step 3: no configured icon and no recognized semantic icon →
    // the blank/generic placeholder pair, still served from the runtime mirror.
    const links = withSidebarNavIcons([{ href: "/custom-page", label: "Custom", key: "nav:0" }]);
    expect(links[0].openIcon).toBe(DEFAULT_SIDEBAR_ITEM_ICON_OPEN);
    expect(links[0].closedIcon).toBe(DEFAULT_SIDEBAR_ITEM_ICON_CLOSED);
    for (const file of [DEFAULT_SIDEBAR_ITEM_ICON_OPEN, DEFAULT_SIDEBAR_ITEM_ICON_CLOSED]) {
      expect(existsSync(runtime(file)), `${file} runtime`).toBe(true);
    }
    // ISO-H2 — that the placeholder SOURCES exist (and are what the runtime file mirrors) is asserted
    // by the deployment's own acceptance suite, which is the subject that owns the asset install.
  });

describe("sidebar page icons — 16x16 on desktop AND tablet, in both states", () => {
  const navIconRule = /\.ui-shell-sidebar \.ui-nav-item-icon\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
  const baseRule = /\.ui-nav-item-icon\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";

  it("declares ONE page-icon size token (1rem = 16px) with no breakpoint override", () => {
    expect(globals).toMatch(/--ui-sidebar-nav-icon-size:\s*1rem/);
    expect(globals).not.toMatch(/--ui-sidebar-nav-icon-size:\s*2rem/);
    expect(globals).not.toMatch(
      new RegExp("@media \\(min-width: 1024px\\)[^}]*--ui-sidebar-nav-icon-size"),
    );
  });

  it("binds width and height to that token, with the aspect ratio and box protected", () => {
    expect(navIconRule).toMatch(/width:\s*var\(--ui-sidebar-nav-icon-size\)/);
    expect(navIconRule).toMatch(/height:\s*var\(--ui-sidebar-nav-icon-size\)/);
    expect(navIconRule).toMatch(/max-width:\s*none/);
    expect(baseRule).toMatch(/object-fit:\s*contain/);
    // Flexbox can neither stretch nor shrink the icon box.
    expect(baseRule).toMatch(/flex:\s*none/);
    expect(baseRule).toMatch(/flex-shrink:\s*0/);
  });

  it("collapse changes the rail, never the icon size", () => {
    // The collapsed-state rules address WIDTH/padding of the rail and the
    // open/closed swap — none of them resizes `.ui-nav-item-icon`.
    const collapsedBlocks = [...globals.matchAll(/\.ui-sidebar-rail\[data-collapsed="true"\][^{]*\{([^}]*)\}/g)]
      .map((match) => match[1])
      .join(" ");
    expect(collapsedBlocks).not.toMatch(/ui-nav-item-icon[^{]*\{[^}]*width/);
    // The collapsed rail's own symmetric geometry token (owner ruling, 2026-09).
    expect(globals).toMatch(
      /--ui-sidebar-rail-collapsed:\s*calc\(\s*var\(--ui-sidebar-control-icon-size\)\s*\+\s*var\(--ui-sidebar-rail-collapsed-pad\)\s*\*\s*2\s*\)/,
    );
    expect(globals).toMatch(/--ui-sidebar-rail-collapsed-pad:\s*0\.375rem/);
  });

  it("guards EVERY collapsed-state rule with the boot bridge's zero-specificity prefix (UI1-A2)", () => {
    // Comments are not rules: strip them so only real selectors are judged.
    const withoutComments = globalsRaw.replace(/\/\*[\s\S]*?\*\//g, "");
    const collapsedSelectorLines = withoutComments
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes('[data-collapsed="true"]'));
    // The set of collapsed-state rules is non-empty, and each one carries the guard — a rule added later
    // without it would be applied even while the pre-paint bridge presents the OPEN rail, which is exactly
    // the kind of drift this row exists to catch.
    expect(collapsedSelectorLines.length).toBeGreaterThan(0);
    for (const line of collapsedSelectorLines) {
      expect(line.startsWith(SIDEBAR_BOOT_GUARD.trim()), line).toBe(true);
    }
    // …and the guard never owns declarations of its own: it is always followed by a real selector.
    expect(globalsRaw).toContain(SIDEBAR_BOOT_GUARD);
    expect(withoutComments).not.toMatch(/:where\(html:not\(\[data-ui-sidebar-preference="open"\]\)\)\s*\{/);
  });
});

describe("sidebar open/close CONTROL — 24x24 on desktop AND tablet, distinct from page icons", () => {
  const toggleIconRule = /\.ui-sidebar-toggle-icon\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
  const toggleRule = /\.ui-shell-sidebar \.ui-sidebar-toggle\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
  const collapsedToggleRule =
    /\.ui-sidebar-rail\[data-collapsed="true"\] \.ui-sidebar-toggle\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";

  it("declares the control size ONCE at 1.5rem (24px) with NO breakpoint override", () => {
    // OWNER RULING (2026-09 closure pass): the show/hide control is 24x24 on
    // desktop and tablet. It is NOT a page icon (16px) and it is NOT the rail's
    // width basis — three separate contracts.
    expect(globals).toMatch(/--ui-sidebar-control-icon-size:\s*1\.5rem/);
    expect(globals).not.toMatch(/--ui-sidebar-control-icon-size:\s*(2rem|4rem)/);
    expect(globals).not.toMatch(
      new RegExp("@media \\(min-width: 1024px\\)[^}]*--ui-sidebar-control-icon-size"),
    );
    expect(toggleIconRule).toMatch(/width:\s*var\(--ui-sidebar-control-icon-size\)/);
    expect(toggleIconRule).toMatch(/height:\s*var\(--ui-sidebar-control-icon-size\)/);
    expect(toggleIconRule).toMatch(/max-width:\s*none/);
  });

  it("exposes the two sizes as INDEPENDENT tokens (16px page icon vs 24px control)", () => {
    expect(globals).toMatch(/--ui-sidebar-nav-icon-size:\s*1rem/);
    expect(globals).toMatch(/--ui-sidebar-control-icon-size:\s*1\.5rem/);
    // Neither rule borrows the other's token.
    expect(toggleIconRule).not.toMatch(/var\(--ui-sidebar-nav-icon-size\)/);
    const navIconRule = /\.ui-shell-sidebar \.ui-nav-item-icon\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
    expect(navIconRule).not.toMatch(/var\(--ui-sidebar-control-icon-size\)/);
  });

  it("keeps the EXPANDED control's ~5px inset; the COLLAPSED control is centred", () => {
    // One shared inset value, derived from the Tailwind spacing scale
    // (0.25rem x 1.25 = 5px) — never a per-preset magic number.
    expect(globals).toMatch(/--ui-shell-control-inset:\s*calc\(var\(--spacing\) \* 1\.25\)/);

    // EXPANDED (owner ruling, 2026-09): unchanged — left-aligned with the shared
    // inset, re-anchored against the rail's own inline padding.
    expect(toggleRule).toMatch(/justify-content:\s*flex-start/);
    expect(toggleRule).toMatch(/var\(--ui-shell-control-inset\)/);
    expect(toggleRule).toMatch(/margin-inline-start:\s*calc\(/);
    expect(toggleRule).toMatch(/var\(--ui-sidebar-rail-inline\)/);

    // COLLAPSED (owner ruling, 2026-09): the open control is CENTRED on the rail's
    // axis with no inset, no re-anchoring and no compensating negative margin.
    expect(collapsedToggleRule).toMatch(/justify-content:\s*center/);
    expect(collapsedToggleRule).toMatch(/margin-inline:\s*0/);
    expect(collapsedToggleRule).toMatch(/padding-inline:\s*0/);
    expect(collapsedToggleRule).not.toMatch(/var\(--ui-shell-control-inset\)/);
    expect(collapsedToggleRule).not.toMatch(/margin-inline-start:\s*calc\(/);
    // …and the collapsed page-icon column shares that same axis.
    expect(globals).toMatch(
      /\.ui-sidebar-rail\[data-collapsed="true"\] li > a[\s\S]{0,120}?justify-content:\s*center/,
    );
  });

  it("gives the shell-top CTA the SAME shared inset (one value, all presets)", () => {
    const ctaRule = /\.ui-shell-cta\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
    expect(ctaRule).toMatch(/padding-inline-start:\s*var\(--ui-shell-control-inset\)/);
  });
});

describe("sidebar page icons — expanded vs collapsed behaviour", () => {
  const links = withSidebarNavIcons(getSiteNavLinks("en"));
  const rendered = links.map((link) => renderToStaticMarkup(createElement(NavItem, { item: link })));

  it("every sidebar item renders its 16x16 page icon pair plus the page name", () => {
    for (const [index, html] of rendered.entries()) {
      const link = links[index];
      expect(html).toContain(`/assets/${link.openIcon}`);
      expect(html).toContain(`/assets/${link.closedIcon}`);
      expect(html).toContain("ui-nav-item-icon-open");
      expect(html).toContain("ui-nav-item-icon-closed");
      expect(html).toContain("ui-nav-item-label");
      // Decorative icon, authoritative text label.
      expect(html).toContain('alt=""');
      expect(html).toContain('aria-hidden="true"');
    }
  });

  it("keeps the page name discoverable as a native tooltip on each icon-bearing item", () => {
    for (const [index, html] of rendered.entries()) {
      expect(html).toContain(`title="${links[index].label}"`);
      // The name is in the DOM exactly ONCE — no second visible text label.
      expect((html.match(/ui-nav-item-label/g) ?? []).length).toBe(1);
    }
  });

  it("collapsed labels stay sr-only (accessible name retained), never display:none", () => {
    expect(globals).toMatch(/\.ui-sidebar-rail\[data-collapsed="true"\]\s*li\.ui-nav-item--has-icon\s*\.ui-nav-item-label/);
    expect(globals).not.toMatch(/\.ui-nav-item-label[^{]*\{[^}]*display:\s*none/);
    // The sr-only technique, applied to the collapsed label block.
    const collapsedLabelBlock =
      /\.ui-sidebar-rail\[data-collapsed="true"\]\s*li\.ui-nav-item--has-icon\s*\.ui-nav-item-label[^{]*\{([^}]*)\}/.exec(
        globals,
      )?.[1] ?? "";
    expect(collapsedLabelBlock).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(collapsedLabelBlock).toMatch(/position:\s*absolute/);
  });

  it("mobile navigation behaviour is unchanged (no page icons, control sizing untouched)", () => {
    const mobileNav = read("src", "components", "shell", "shell-mobile-nav.tsx");
    expect(mobileNav).toContain('className="ui-mobile-nav-icon h-8 w-8 shrink-0"');
    expect(mobileNav).toContain("DEFAULT_SIDEBAR_OPEN_ICON");
    expect(mobileNav).toContain("DEFAULT_SIDEBAR_CLOSE_ICON");
    // The 16px page-icon token is scoped to the sidebar surface only.
    expect(globals).not.toMatch(/\.ui-mobile-nav-icon[^{]*\{[^}]*--ui-sidebar-nav-icon-size/);
  });
});


  it("does not leak sidebar icons into the header, bottom bar or mobile navigation", () => {
    // The configured items carry NO legacy single `icon` leaf, so the surfaces
    // that use `getSiteNavLinks` directly (header top-nav, bottom bar, mobile)
    // stay icon-free: `withSidebarNavIcons` is applied ONLY to the aside slot.
    for (const item of siteConfig.navigation) expect(item.icon).toBeUndefined();
    const layout = read("src", "app", "[...segments]", "layout.tsx");
    expect(layout).toContain("links={withSidebarNavIcons(navLinks)}");
    expect((layout.match(/withSidebarNavIcons\(/g) ?? []).length).toBe(1);
    // Mobile navigation renders its own control icons and never the page pair.
    const mobileNav = read("src", "components", "shell", "shell-mobile-nav.tsx");
    expect(mobileNav).not.toMatch(/openIcon|closedIcon/);
    const bottomNav = read("src", "components", "ui", "bottom-navigation.tsx");
    expect(bottomNav).not.toMatch(/openIcon|closedIcon|ui-nav-item-icon/);
  });
});

/**
 * UI1-A3 — THE DISCLOSURE CONTROL'S CONTENT IS A STATE PAIR, SELECTED BY THE SAME SEAM AS EVERYTHING ELSE.
 *
 * A statically generated document cannot know the visitor's browser-local preference, so the control (like
 * the rail it sits in, and like the P6-3B page icons) declares BOTH states' content and the stylesheet
 * presents exactly one. These rows are the durable contract of that seam: the pair exists, in the same shape
 * as the page-icon pair, guarded by the same zero-specificity boot prefix, and the inactive LABEL is
 * genuinely removed (`display: none`) rather than visually hidden, so it cannot join the control's
 * accessible name. The behavioural half — what is actually on screen, per painted frame — belongs to the
 * browser gate (`tests/browser/matrix.mjs`, `tests/browser/production-continuity.mjs`).
 */
describe("sidebar disclosure CONTROL — state-paired content (UI1-A3)", () => {
  /**
   * Every rule of the stylesheet as `{ selectors, declarations }`, comments stripped. Reading a rule's
   * DECLARATIONS (rather than pattern-matching a selector anywhere in the file) is what lets these rows tell
   * the grouped base rule from a guarded descendant one: `.ui-sidebar-toggle-icon-closed` appears both as a
   * base selector and as the tail of a collapsed selector, and only one of those is the base rule.
   */
  const rules = (() => {
    const source = globalsRaw.replace(/\/\*[\s\S]*?\*\//g, "");
    const found: { selectors: string[]; declarations: string }[] = [];
    for (const match of source.matchAll(/\{([^{}]*)\}/g)) {
      const declarations = match[1];
      if (!declarations.includes(":")) continue;
      const opened = source.lastIndexOf("{", match.index - 1);
      const closed = source.lastIndexOf("}", match.index - 1);
      const selectorText = source.slice(Math.max(opened, closed) + 1, match.index);
      // An at-rule prelude (`@media …`) is not a selector list; the rules INSIDE it are read normally,
      // because a selector is taken back only to the nearest `{`.
      if (selectorText.includes("@")) continue;
      found.push({
        selectors: selectorText
          .split(",")
          .map((selector) => selector.trim().replace(/\s+/g, " "))
          .filter(Boolean),
        declarations,
      });
    }
    return found;
  })();
  /** Every declaration written for one EXACT selector (a `,`-grouped rule included), in file order. */
  const declarationsFor = (selector: string) =>
    rules
      .filter((entry) => entry.selectors.includes(selector))
      .map((entry) => entry.declarations)
      .join("\n");
  /** A COLLAPSED-state selector: the one shared rail state, carrying the shared boot guard. */
  const collapsed = (selector: string) =>
    `${SIDEBAR_BOOT_GUARD.trim()} .ui-sidebar-rail[data-collapsed="true"] ${selector}`;

  it("declares BOTH states in the markup, each with its semantic hook, exactly once", () => {
    const sidebarSource = read("src", "components", "ui", "sidebar.tsx");
    for (const hook of [
      "ui-sidebar-toggle-icon ui-sidebar-toggle-icon-open",
      "ui-sidebar-toggle-icon ui-sidebar-toggle-icon-closed",
      "ui-sidebar-toggle-label ui-sidebar-toggle-label-open",
      "ui-sidebar-toggle-label ui-sidebar-toggle-label-closed",
    ]) {
      expect(sidebarSource.split(hook).length - 1, `${hook} declared once`).toBe(1);
    }
    // The OPEN state's variant is declared FIRST, exactly as the page-icon pair declares `-open` first.
    expect(sidebarSource.indexOf("ui-sidebar-toggle-icon-open")).toBeLessThan(
      sidebarSource.indexOf("ui-sidebar-toggle-icon-closed"),
    );
    expect(sidebarSource.indexOf("ui-sidebar-toggle-label-open")).toBeLessThan(
      sidebarSource.indexOf("ui-sidebar-toggle-label-closed"),
    );
  });

  it("presents exactly one variant per state through the shared rail state", () => {
    // BASE (the OPEN rail, and the boot presentation the pre-paint bridge creates): the CLOSED variant is
    // removed, so the OPEN variant is the one on screen. These two rules are `,`-grouped.
    expect(declarationsFor(".ui-sidebar-toggle-icon-closed")).toMatch(/display:\s*none/);
    expect(declarationsFor(".ui-sidebar-toggle-label-closed")).toMatch(/display:\s*none/);
    // COLLAPSED: the OPEN variant is removed and the CLOSED variant is presented — the mirror of the
    // page-icon pair's rules (same shape, same values, same guard), so the two can never drift. Every one of
    // these is a GUARDED collapsed selector: without the guard the pair would ignore the visitor's stored OPEN
    // preference for the whole boot interval, and the flicker would simply move back into the control.
    expect(declarationsFor(collapsed(".ui-sidebar-toggle-icon-open"))).toMatch(/display:\s*none/);
    expect(declarationsFor(collapsed(".ui-sidebar-toggle-label-open"))).toMatch(/display:\s*none/);
    expect(declarationsFor(collapsed(".ui-sidebar-toggle-icon-closed"))).toMatch(/display:\s*inline-block/);
    // `display: inline` (not sr-only): the collapsed label is the control's NAME for assistive tech, and the
    // rail's own sr-only rule (the nav labels) only applies to text that is actually rendered.
    expect(declarationsFor(collapsed(".ui-sidebar-toggle-label-closed"))).toMatch(/display:\s*inline/);
    // …and there is no UNGUARDED collapsed variant of the pair, which would win over the boot presentation.
    for (const selector of [
      ".ui-sidebar-rail[data-collapsed=\"true\"] .ui-sidebar-toggle-icon-open",
      ".ui-sidebar-rail[data-collapsed=\"true\"] .ui-sidebar-toggle-label-open",
      ".ui-sidebar-rail[data-collapsed=\"true\"] .ui-sidebar-toggle-icon-closed",
      ".ui-sidebar-rail[data-collapsed=\"true\"] .ui-sidebar-toggle-label-closed",
    ]) {
      expect(declarationsFor(selector), selector).toBe("");
    }
  });

  it("removes the inactive LABEL from the accessible name (display, never merely visually hidden)", () => {
    // A sr-only label would still be announced; `display: none` cannot be. The presented variant is the
    // control's name, and the icon-only case keeps using the button's own `aria-label`.
    const sidebarSource = read("src", "components", "ui", "sidebar.tsx");
    expect(sidebarSource).toMatch(/aria-label=\{active\.labelled\}/);
  });

  it("keeps the pair decorative: no variant adds accessible content of its own", () => {
    // `DisclosureIcon` → `AssetIcon` renders `alt="" aria-hidden="true"`, so neither icon announces.
    const assetIcon = read("src", "components", "ui", "asset-icon.tsx");
    expect(assetIcon).toMatch(/alt=""/);
    expect(assetIcon).toMatch(/aria-hidden="true"/);
    const disclosureIcon = read("src", "components", "ui", "disclosure-icon.tsx");
    expect(disclosureIcon).toMatch(/<AssetIcon/);
  });
});
