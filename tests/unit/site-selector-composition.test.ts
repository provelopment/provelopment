/**
 * FOUNDATION-S1E2 — THE SITE SELECTOR'S COMPOSITION AND PRESENCE RULES.
 *
 * The header renders the Site control ONLY when the deployment serves more than one site, exactly
 * as the Language control follows the configured locale count: a single-site deployment's chrome is
 * unchanged. The control identifies itself as `site` and uses the dictionary's own label, so it can
 * never be confused with Language, Location or Layout.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/ww/en",
  useRouter: () => ({ push: () => {} }),
}));

import { SiteHeader } from "@/components/site/site-header";
import { getDictionary } from "@/config/i18n";
import { resolveUiConfig } from "@/core/ui";

const resolved = resolveUiConfig({});

const OPTIONS = [
  { code: "ca", label: "Canada", href: "/ca/en" },
  { code: "ww", label: "Worldwide", href: "/ww/en" },
];

function render(props: Parameters<typeof SiteHeader>[0]): string {
  return renderToStaticMarkup(SiteHeader(props));
}

describe("Site selector presence and composition", () => {
  it("renders NO Site selector when the deployment serves a single site", () => {
    const html = render({ locale: "en", resolved });
    expect(html).not.toContain('data-selector="site"');
    expect(html).not.toContain("Worldwide");
  });

  it("renders every configured site's label when several sites exist", () => {
    const html = render({ locale: "en", resolved, siteId: "ca", siteSwitch: OPTIONS });

    expect(html).toContain('data-selector="site"');
    expect(html).toContain(`aria-label="${getDictionary("en").site.label}"`);
    expect(html).toContain("Canada");
    expect(html).toContain("Worldwide");
  });

  it("is a control of its own — not the Language, Location or Layout selector", () => {
    const html = render({ locale: "en", resolved, siteId: "ca", siteSwitch: OPTIONS });

    // Exactly one site control…
    expect(html.match(/data-selector="site"/g)).toHaveLength(1);
    // …and the selectors that need a second locale / a configured region render none here.
    expect(html).not.toContain('data-selector="language"');
    expect(html).not.toContain('data-selector="location"');
  });

  it("keeps the site label out of the language vocabulary", () => {
    const dictionary = getDictionary("en");
    expect(dictionary.site.label).not.toBe(dictionary.language.label);
    expect(dictionary.site.label).not.toBe(dictionary.location.label);
  });
});
