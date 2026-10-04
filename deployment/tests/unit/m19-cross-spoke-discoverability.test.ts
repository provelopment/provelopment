/**
 * THE TWO PUBLIC SPOKES ARE DISCOVERABLE FROM EACH OTHER (FOUNDATION-MULTISITE-M19)
 * =================================================================================
 *
 * The M19 human checkpoint found a REAL defect, and it is a NAVIGATION/DISCOVERABILITY one: a visitor
 * on the Foundation website had no way to find the Germany website without typing its address by hand.
 * Technical isolation was CORRECT — M18 deliberately retired the cross-Spoke Site selector, because a
 * Spoke is an independent public website and never "another Site" of the same one. Those are different
 * concepts, and the correction is the ordinary one a website uses for a sibling website:
 *
 *     AUTHORED RECIPROCAL FOOTER LINKS between two independent public origins.
 *
 * What is asserted, and why it must be asserted against the REAL deployment:
 *
 *   §3/§4  each Spoke's `footerNavigation` names the OTHER Spoke's PUBLIC ROOT — never a forced locale
 *          path, because the target website performs its OWN root/locale completion;
 *   §5     the visitor-facing label comes from the EXISTING dictionary mechanism
 *          (`dictionary.navigation.items[href]`), read from the Spoke's OWN dictionary root (M18 §21):
 *          "Germany"/"Deutschland" on Foundation, "Global" on Germany;
 *   §6     the link is an EXTERNAL absolute URL: it renders through the shared `NavItem` contract
 *          (`target="_blank"` + `rel="noreferrer"`) and carries no `~spoke`, no private selection
 *          header, no rewrite and no client Spoke state;
 *   §2     discoverability is NOT the retired Site selector: no Site control renders at all, and the
 *          cross-Spoke origin is never one of a control's options;
 *   §7     the sitemap invariant survives untouched: each Spoke's sitemap publishes ONLY its own origin
 *          and its own pages. Footer navigation was never a sitemap source and does not become one just
 *          because it now names a sister website.
 *
 * It runs on the REAL deployment through the accepted authorities (`./support/spoke-contexts`), exactly
 * like every other deployment-scope proof.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The chrome composes client controls, so the ONE client transport's URL reader is mocked exactly as the
// deployment's other render-scope proofs do (`r1c-reference-sites.test.ts`).
let mockPath = "/ww/en";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ push: () => {} }),
}));

import { createPageSources } from "@/adapters/content/page-sources";
import { createDirectionLinkResolver } from "@/adapters/maps";
import { sitemapForContext } from "@/app/sitemap-context";
import { SiteFooter } from "@/components/site/site-footer";
import { createRuntimeAssetOwnershipResolver } from "@/config/runtime-asset-resolver";
import { dictionaryAccessForRuntimeContext } from "@/config/runtime-dictionaries";
import { germanySpoke, foundationSpoke, type DeploymentSpoke } from "../support/spoke-contexts";

const FOUNDATION_ORIGIN = "https://foundation-template.provelopment.com";
const GERMANY_ORIGIN = "https://foundation-template-germany.provelopment.com";
/** The Foundation website's link to the Germany website — the TARGET's public root, verbatim. */
const FOUNDATION_TO_GERMANY = `${GERMANY_ORIGIN}/`;
/** The Germany website's link back to the Foundation website — the TARGET's public root, verbatim. */
const GERMANY_TO_FOUNDATION = `${FOUNDATION_ORIGIN}/`;

/** One authored cross-Spoke link, per Spoke: the href it publishes and the label each locale shows. */
const CROSS_SPOKE = [
  {
    spoke: foundationSpoke,
    other: "Germany",
    otherId: "germany",
    href: FOUNDATION_TO_GERMANY,
    otherOrigin: GERMANY_ORIGIN,
    labels: { en: "Germany", de: "Deutschland" },
  },
  {
    spoke: germanySpoke,
    other: "Foundation",
    otherId: "foundation",
    href: GERMANY_TO_FOUNDATION,
    otherOrigin: FOUNDATION_ORIGIN,
    labels: { en: "Global", de: "Global" },
  },
] as const;

describe("§3/§4 — each Spoke authors the OTHER Spoke's public root", () => {
  for (const { spoke, other, href } of CROSS_SPOKE) {
    it(`${spoke.id} -> ${other}: exactly one authored footer link, at that website's own root`, () => {
      const items = spoke.config.footerNavigation?.items ?? [];
      expect(items).toHaveLength(1);
      expect(items[0]?.href).toBe(href);
    });

    it(`${spoke.id} -> ${other}: the link never forces a target locale or an internal path`, () => {
      const authored = (spoke.config.footerNavigation?.items ?? [])[0]?.href ?? "";
      // The TARGET website performs its own root/locale completion, so the authored href is its ROOT.
      expect(new URL(authored).pathname).toBe("/");
      // No internal prefix, no source-Spoke path and no foreign Site-relative path may be constructed.
      expect(authored).not.toContain("~spoke");
      expect(authored).not.toMatch(/\/(ww|de)\//);
      expect(authored.endsWith("/")).toBe(true);
    });
  }
});

describe("§2 — discoverability is authored navigation, NOT a Site inventory", () => {
  for (const { spoke, otherOrigin } of CROSS_SPOKE) {
    it(`${spoke.id}: declares ONE Site, and the other Spoke is not part of it`, () => {
      expect(spoke.config.sites.map((site) => site.code)).toEqual([spoke.config.defaultSite.code]);
      expect(spoke.config.sites).toHaveLength(1);

      const serialised = JSON.stringify(spoke.config);
      // The other Spoke's origin appears EXACTLY ONCE — as the authored footer link, never as a Site
      // url, a page binding, a resource root or any other inventory entry.
      expect(serialised.split(otherOrigin).length - 1).toBe(1);
      // Configuration never names a Spoke's filesystem tree: only public origins.
      expect(serialised).not.toContain("spokes/");
    });
  }
/**
 * §6 — THE LINK RENDERS AS AN ORDINARY EXTERNAL LINK.
 *
 * The footer group is composed into the REAL `SiteFooter` of each Spoke, with that Spoke's OWN
 * configuration, dictionary root, asset answer and page composition (M13/M14 inputs) — so the proof is
 * about the composition the public website actually renders, not about a component in isolation.
 */
async function footerHtml(spoke: DeploymentSpoke, locale: string): Promise<string> {
  mockPath = `/${spoke.config.defaultSite.code}/${locale}`;
  return renderToStaticMarkup(
    await SiteFooter({
      siteConfig: spoke.config,
      dictionaryAccess: dictionaryAccessForRuntimeContext(spoke.context),
      assets: createRuntimeAssetOwnershipResolver(spoke.context.runtimeAssetNamespaces),
      routes: createPageSources({ sites: spoke.config.sites, roots: spoke.resources }),
      locale,
      siteId: spoke.config.defaultSite.code,
      directionLinkResolver: createDirectionLinkResolver(spoke.config.mapsFeature),
    }),
  );
}

const escapeHref = (href: string) => href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("§6 — the cross-Spoke link renders as an ordinary external link", () => {
  for (const { spoke, href, labels } of CROSS_SPOKE) {
    for (const locale of ["en", "de"] as const) {
      it(`${spoke.id} /${locale}: publishes the target's public origin as a new-tab link labelled "${labels[locale]}"`, async () => {
        const html = await footerHtml(spoke, locale);
        const anchor = new RegExp(`<a[^>]*href="${escapeHref(href)}"[^>]*>([\\s\\S]*?)</a>`).exec(html);
        expect(anchor, `an anchor to ${href} is rendered`).not.toBeNull();
        const [full, inner] = anchor ?? ["", ""];
        // ORDINARY EXTERNAL SEMANTICS — the shared NavItem contract, no JavaScript Spoke switching.
        expect(full).toContain('target="_blank"');
        expect(full).toMatch(/rel="[^"]*noreferrer/);
        // An external destination is never the "current page".
        expect(full).not.toContain("aria-current");
        // The visitor-facing label is the localized one, and never a raw configuration key.
        expect(inner).toContain(labels[locale]);
        expect(inner).not.toContain("navigation.items");
        // No internal prefix, no private selection mechanism, ever visible.
        expect(html).not.toContain("~spoke");
        // EXACTLY ONCE: a footer/secondary link, never repeated as a header or control destination.
        expect(html.split(href).length - 1).toBe(1);
      });
    }
  }
});

describe("§2 — no Site control returns, and no control offers the other Spoke", () => {
  for (const { spoke, href, other } of CROSS_SPOKE) {
    for (const locale of ["en", "de"] as const) {
      it(`${spoke.id} /${locale}: renders no Site selector and no cross-Spoke option`, async () => {
        const html = await footerHtml(spoke, locale);
        expect(html).not.toContain('data-selector="site"');
        expect(html).not.toContain('aria-label="Site"');
        // The cross-Spoke website is never a <select> option of ANY control: it is an ordinary anchor.
        const options = [...html.matchAll(/<option[^>]*>([\s\S]*?)<\/option>/g)]
          .map((match) => match[1])
          .join(" ");
        expect(options).not.toContain(href);
        expect(options).not.toContain(other);
      });
    }
  }
});

});

// ---------- RENDER PROOF ----------
