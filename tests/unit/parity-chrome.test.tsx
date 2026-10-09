/**
 * R1 — THE PARITY-CHROME SURFACES, PROVED RENDERED (WEB-1 owner requirements 1–6)
 * ==============================================================================
 *
 * The browser matrix proves the geometry (wrap, overflow, heading alignment); THIS suite proves the markup
 * contract that geometry depends on, so a regression is caught in milliseconds:
 *
 *   SpokeSwitcher   every authored option renders, in AUTHORED order, the current Spoke is marked, the
 *                   accessible name is the localized one, and selecting the current Spoke is a NO-OP;
 *   SiteNotice      a semantic, non-interactive `<aside role="note">` carrying the locale's wording and the
 *                   resolved tone — and the ONE pure rule that decides whether any notice exists at all;
 *   footer          every grid item can SHRINK (`min-w-0`) and every section heading uses the ONE shared
 *                   contract — the two generic layout defects this release fixes;
 *   menu bar        the retired "More" control is not composed anywhere.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FOOTER_HEADING_BOX_CLASS, FOOTER_HEADING_CLASS } from "@/components/site/footer-link-class";
import { SiteNotice } from "@/components/site/site-notice";
import { SpokeSwitcher, switcherDestinationFor } from "@/components/site/spoke-switcher";
import { resolveSiteNotice } from "@/core/notice";

const OPTIONS = [
  { spokeId: "primary", label: "Primary", href: "https://primary.example.test" },
  { spokeId: "docs", label: "Documentation", href: "https://docs.example.test" },
] as const;

const source = (relative: string): string => readFileSync(path.join(process.cwd(), relative), "utf8");

describe("SpokeSwitcher — the cross-Spoke control", () => {
  it("renders every authored option, in AUTHORED order, with the current Spoke marked", () => {
    const html = renderToStaticMarkup(
      <SpokeSwitcher current="primary" label="Site section" options={OPTIONS} />,
    );
    expect(html).toContain('data-switcher="spoke"');
    expect(html).toContain('aria-label="Site section"');
    const labels = [...html.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((match) => match[1]);
    expect(labels).toEqual(["Primary", "Documentation"]);
    // The current Spoke is the SELECTED one — the marked option is the request's own Spoke, not "the first".
    expect(html).toMatch(/value="primary"[^>]*selected|selected[^>]*value="primary"/);
  });

  it("marks whichever Spoke this page belongs to", () => {
    const html = renderToStaticMarkup(
      <SpokeSwitcher current="docs" label="Site section" options={OPTIONS} />,
    );
    expect(html).toMatch(/value="docs"[^>]*selected|selected[^>]*value="docs"/);
    expect(html).not.toMatch(/value="primary"[^>]*selected|selected[^>]*value="primary"/);
  });

  it("is a NO-OP for the current Spoke, ignores an unknown value, and travels otherwise", () => {
    expect(switcherDestinationFor("primary", OPTIONS, "primary")).toBeNull();
    expect(switcherDestinationFor("primary", OPTIONS, "nobody")).toBeNull();
    expect(switcherDestinationFor("primary", OPTIONS, "docs")).toBe("https://docs.example.test");
  });
});

describe("SiteNotice — the generic site-wide notice", () => {
  it("renders ONE semantic, non-interactive note with the locale's wording and the resolved tone", () => {
    const notice = resolveSiteNotice({ mode: "shown", tone: "attention" });
    expect(notice).not.toBeNull();
    const html = renderToStaticMarkup(
      <SiteNotice notice={notice!} copy={{ title: "A title", body: "A body sentence." }} />,
    );
    expect(html).toContain('role="note"');
    expect(html).toContain('data-ui-site-notice="true"');
    expect(html).toContain('data-ui-site-notice-tone="attention"');
    expect(html).toContain("A title");
    expect(html).toContain("A body sentence.");
    // SEMANTICS: a note is never a heading, never an alert and never interactive — the page's own heading
    // hierarchy must not be disturbed, and nothing here is focusable.
    expect(html).not.toMatch(/<h[1-6]/);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toMatch(/<a |<button|tabindex/i);
    // NARROW-WIDTH SAFETY: both text nodes wrap rather than overflow their container.
    expect(html.match(/break-words/g) ?? []).toHaveLength(2);
  });

  it("is absent — no markup, no wrapper — unless the Spoke presents it", () => {
    expect(resolveSiteNotice(undefined)).toBeNull();
    expect(resolveSiteNotice({})).toBeNull();
    expect(resolveSiteNotice({ mode: "hidden" })).toBeNull();
    expect(resolveSiteNotice({ mode: "shown" })).toEqual({
      mode: "shown",
      tone: "information",
      replacesDemoNotices: false,
    });
    expect(resolveSiteNotice({ mode: "shown", tone: "attention" })).toEqual({
      mode: "shown",
      tone: "attention",
      replacesDemoNotices: false,
    });
    // R2 — the replacement opt-in is resolved WITH the notice, by the SAME pure rule the shell and the page
    // chrome both ask, so neither can disagree about it; and a HIDDEN notice remains no notice at all, whatever
    // it declares (the configuration schema refuses that combination in the first place).
    expect(resolveSiteNotice({ mode: "shown", replacesDemoNotices: true })).toEqual({
      mode: "shown",
      tone: "information",
      replacesDemoNotices: true,
    });
    expect(resolveSiteNotice({ mode: "hidden", replacesDemoNotices: true })).toBeNull();
  });
});

describe("the footer's generic layout contract (the two defects this release fixes)", () => {
  it("gives EVERY footer grid item the ability to shrink, so a long token cannot overrun a column", () => {
    const footer = source("src/components/site/site-footer.tsx");
    // Each grid item — the Connect column, the authored footer group, the primary navigation column and the
    // legal column — can shrink below its min-content width; `break-words` (inherited from the grid) is what
    // then breaks the token instead of the layout.
    expect(footer.match(/className="min-w-0"/g) ?? []).toHaveLength(4);
    expect(footer).toContain("break-words gap-8");
    // The Contact column carries it too (BusinessInfo's own root element).
    expect(source("src/components/site/business-info.tsx")).toContain('className="min-w-0"');
  });

  it("uses ONE heading contract for every footer section heading", () => {
    for (const file of [
      "src/components/site/site-footer.tsx",
      "src/components/site/business-info.tsx",
      "src/components/site/context-connect-heading.tsx",
    ]) {
      const text = source(file);
      expect(text, file).toContain("FOOTER_HEADING_CLASS");
      expect(text, file).toContain("FOOTER_HEADING_BOX_CLASS");
      // The typography is never restated inline: one spelling, or the headings drift apart again.
      expect(text, file).not.toContain(
        '"text-sm font-semibold uppercase tracking-wide text-muted-foreground"',
      );
    }
    // The box IS the shared ≥44px floor, so a LINKED heading keeps its interaction target while aligning with
    // the unlinked ones beside it.
    expect(FOOTER_HEADING_BOX_CLASS).toContain("min-h-11");
    expect(FOOTER_HEADING_CLASS).toContain("uppercase");
  });

  it("composes no 'More' overflow control anywhere in the shell", () => {
    for (const file of [
      "src/components/shell/shell-bottom-bar.tsx",
      "src/components/shell/shell-engine.tsx",
      "src/app/[[...segments]]/server-composition.tsx",
    ]) {
      const text = source(file);
      expect(text, file).not.toContain("shell-bottom-more");
      expect(text, file).not.toContain("moreLabel");
    }
  });
});
