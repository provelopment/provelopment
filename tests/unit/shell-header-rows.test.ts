import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

/*
 * NAV1B — THE HEADER'S TWO SEMANTIC ROWS, AS MARKUP.
 *
 * The reported defect was that the header had ONE wrapping row, so a control's position depended on
 * the width of the controls beside it: the sidebar disclosure travelled between header lines (and
 * grew with the header's typography), and the contextual dropdowns changed rows with the viewport.
 * The contract these assertions pin is ownership, not styling: the TOP row owns the identity and
 * the navigation-MODE selector (anchored right), the SECOND row owns every other contextual
 * control, and neither assignment changes at a breakpoint.
 *
 * The static-render idiom matches the shell suites: the client controls beside the header call hooks
 * with no context under `renderToStaticMarkup`, so they are stubbed (no browser dependency). The
 * GEOMETRY those rows produce is proven in the browser matrix.
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined }),
  usePathname: () => "/en",
}));

import { SiteHeader } from "@/components/site/site-header";
import { resolveUiConfig, type UiConfigInput } from "@/core/ui";

/** The header module itself, for the ownership contracts that are structural (guarded rows). */
const HEADER_SOURCE = readFileSync(
  path.join(process.cwd(), "src", "components", "site", "site-header.tsx"),
  "utf8",
);

const headerHtml = (ui: UiConfigInput) =>
  renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolveUiConfig(ui) }));

/** The switcher enabled → the visitor has MORE than one effective presentation to choose from. */
const switcherOn = headerHtml({ layoutSwitcher: { enabled: true } });
/** The switcher absent → exactly ONE effective option, so no selector may render. */
const switcherOff = headerHtml({});

/** The opening tag of the element carrying `marker` (its own class/attribute contract). */
function openTag(html: string, marker: string): string {
  const at = html.indexOf(marker);
  expect(at, `expected an element carrying ${marker}`).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
}

/** Document order: does `first` appear before `second`? */
function precedes(html: string, first: string, second: string): boolean {
  const a = html.indexOf(first);
  const b = html.indexOf(second);
  return a > -1 && b > -1 && a < b;
}

describe("NAV1B — the second row owns every OTHER header control", () => {
  it("places the contextual selectors below the top row, in one wrapping row", () => {
    // The row exists for a deployment that configures contextual controls, it comes AFTER the top
    // row, and the shared Stack primitive owns its flow (a flex-wrap row).
    expect(precedes(switcherOn, "ui-site-header-top", "ui-site-header-context")).toBe(true);
    const contextTag = openTag(switcherOn, "ui-site-header-context");
    expect(contextTag).toContain("flex-wrap");
    expect(contextTag).toContain("items-center");
    // The navigation-mode selector belongs to the TOP row: it precedes the control row, and the
    // control row never carries it.
    expect(precedes(switcherOn, "data-ui-layout-switcher", "ui-site-header-context")).toBe(true);
  });

  it("renders the secondary row only when it has a control to place in it", () => {
    // The row is guarded by ONE derived condition, so a deployment with no site/location/language
    // control and no header navigation reserves no empty row. (Its GEOMETRY, when the controls do
    // exist, is proven in the browser matrix.)
    expect(HEADER_SOURCE).toContain("{hasSecondaryControls ? (");
    expect(HEADER_SOURCE).toContain("const hasSecondaryControls =");
    expect(HEADER_SOURCE).toContain(
      "hasHeaderNav || siteSelectorPresent || hasLocations || languageSelectorPresent;",
    );
  });
});

describe("NAV1B — the header composes no navigation of its own", () => {
  it("never composes the mobile disclosure (the shell owns it at the sidebar boundary)", () => {
    for (const html of [switcherOn, switcherOff]) {
      expect(html).not.toContain("shell-mobile-nav");
      expect(html).not.toContain("ui-shell-sidebar-disclosure");
      expect(html).not.toContain("ui-shell-mobile-nav-trigger");
    }
  });

  it("composes no ≥md top navigation for the shipped layouts (menu-bar closes its top menu)", () => {
    // NAV1B — neither shipped layout presents a ≥md header navigation: the sidebar layout puts its
    // navigation in the rail, and the menu-bar layout in the sticky bottom bar at every width.
    expect(switcherOn).not.toContain('data-ui-shell-part="top-nav"');
    expect(switcherOn).not.toContain('aria-label="Primary navigation"');
  });

  it("still composes a ≥md top navigation for a CUSTOM header-slot composition that presents one", () => {
    // The header navigation was not deleted, only moved OUT of the top row: a custom composition
    // that presents it (no switcher involved) still renders it — in the SECOND row, with its own
    // width gate — so the capability itself is unchanged.
    const html = headerHtml({ navigation: { desktop: "top", tablet: "top-compact" } });
    expect(html).toContain('aria-label="Primary navigation"');
    expect(precedes(html, "ui-site-header-context", 'aria-label="Primary navigation"')).toBe(true);
    // …and it is still never the mobile disclosure.
    expect(html).not.toContain("shell-mobile-nav");
  });
});

describe("NAV1B — the header's top row owns the identity and the navigation-MODE selector", () => {
  it("keeps the mode selector in the TOP row, right-anchored, and out of the control row", () => {
    expect(openTag(switcherOn, "ui-site-header-top")).toContain(
      "grid grid-cols-[minmax(0,1fr)_auto]",
    );
    // Both occupants of the top row precede the control row, and the selector is anchored at the
    // right edge of the padded content (an auto second track, `justify-self-end`).
    expect(precedes(switcherOn, "ui-site-header-identity", "ui-site-header-context")).toBe(true);
    expect(precedes(switcherOn, "ui-site-header-mode", "ui-site-header-context")).toBe(true);
    expect(openTag(switcherOn, "ui-site-header-mode")).toContain("justify-self-end");
    // The mode row wraps the ONE control, and both stay in the top region (before the control row).
    expect(precedes(switcherOn, "ui-site-header-mode", "data-ui-layout-switcher")).toBe(true);
    expect(precedes(switcherOn, "data-ui-layout-switcher", "ui-site-header-context")).toBe(true);
  });

  it("renders the selector ONLY when more than one presentation is actually available", () => {
    // NAV1B — the switcher's own `enabled` semantics already express this: disabled means the site
    // presents exactly ONE effective option, so there is nothing to select and no control renders.
    expect(switcherOff).not.toContain("data-ui-layout-switcher");
    expect(switcherOff).not.toContain("ui-site-header-mode");
    // The identity is still the top row's only occupant.
    expect(switcherOff).toContain("ui-site-header-top");
    expect(switcherOff).toContain("ui-site-header-identity");
  });

  it("lets the identity yield without ever moving the selector", () => {
    // The identity column can shrink to any width (`minmax(0,1fr)`) and its text may break inside
    // it (`break-words`), so a long identity wraps BELOW the selector's line inside its own column
    // instead of pushing the selector into the control row or over the title.
    expect(openTag(switcherOn, "ui-site-header-top")).toContain("items-start");
    expect(openTag(switcherOn, "ui-site-header-identity")).toContain("min-w-0");
    expect(openTag(switcherOn, "ui-site-header-identity")).toContain("break-words");
  });
});
