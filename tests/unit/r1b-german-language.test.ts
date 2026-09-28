import { describe, expect, it, vi } from "vitest";

// DEPLOYMENT SCOPE (B2): asserts the SHIPPED reference deployment; moves to deployment/tests/**.
vi.unmock("@/config");
import { renderToStaticMarkup } from "react-dom/server";

import PageRoute, { generateMetadata } from "@/app/[...segments]/page";
import { createPageSources } from "@/adapters/content/page-sources";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { dictionarySchema } from "@/config/i18n/dictionary";
import { siteDescriptionForLocale } from "@/config/site-metadata";
import { HOME_CONTENT_SLUG } from "@/core/page-content";

/**
 * FOUNDATION-R1B1A — ONE REAL SECOND LANGUAGE (German / `de` on the `ww` site)
 * ==========================================================================
 *
 * German is added the way the platform intends a language to be added: by CONFIGURATION and
 * CONTENT alone (`i18n.locales`, `config/i18n/de.json`, the German page files under
 * `content/pages/<mode>/ww/de/`). This file
 * proves the consequences that configuration is supposed to have:
 *
 *  - `ww` serves `en` + `de`, and English is still the default locale;
 *  - `ww/de` is canonical `de` — the Worldwide site invents no country (`de-DE` would be wrong);
 *  - German Home and About are REAL German sources, not English answers for a German URL;
 *  - the German Home document has the SAME structure (section types, order, destinations,
 *    variants, ratios, surfaces) as the English canonical page — the translation translated the
 *    copy and redesigned nothing;
 *  - both German pages keep the one-h1 contract and their authored heading shape;
 *  - the locale root's metadata speaks German (`i18n.locales[].description`) while a page's own
 *    summary still speaks for the page, and hreflang alternates stay inside the `ww` site.
 *
 * The browser-visible half of the same story (the Language selector appearing on its own, its
 * exact choices, switching in both directions, Layout persistence, German text expansion) is
 * proved in the `reference-content` browser scenario, against the SHIPPED configuration.
 */
const SITE = "ww";
const GERMAN = "de";
const ENGLISH = "en";
const GERMAN_HOME_TITLE = "Eine Website, die Ihnen gehört.";
const GERMAN_ABOUT_TITLE = "Über diese Foundation-Website";
const REPOSITORY_URL = "https://github.com/provelopment/provelopment-foundation";

const pages = () => createPageSources({ sites: siteConfig.sites });
const params = (...segments: string[]) => ({ params: Promise.resolve({ segments }) });
const site = siteConfig.sites.find((candidate) => candidate.code === SITE);

describe("the `ww` site serves a real second language", () => {
  it("serves exactly `en` and `de`, and keeps English as the default locale", () => {
    expect(site?.locales.map((locale) => locale.path)).toEqual([ENGLISH, GERMAN]);
    expect(site?.defaultLocale).toBe(ENGLISH);
    expect(siteConfig.defaultLocale).toBe(ENGLISH);
  });

  it("makes `ww/de` canonical `de`, never a country variant", () => {
    // The Worldwide site makes no country assumption (`@/core/site-locale`): `ww/de` is German,
    // not `de-DE`, and `ww/en` is untouched by this increment.
    expect(site?.locales.find((locale) => locale.path === GERMAN)?.canonical).toBe("de");
    expect(site?.locales.find((locale) => locale.path === ENGLISH)?.canonical).toBe("en");
  });

  it("describes the German choices exactly as a visitor sees them", () => {
    // The Language selector lists the configured locales by their native `label` (an
    // `englishLabel` would add a bracketed English name; German deliberately has none), so the
    // visible vocabulary is English | Deutsch — never a fictitious third language.
    expect(siteConfig.locales.map((locale) => locale.label)).toEqual(["English", "Deutsch"]);
    expect(
      siteConfig.locales.find((locale) => locale.code === GERMAN)?.englishLabel,
    ).toBeUndefined();
    expect(siteConfig.locales).toHaveLength(2);
  });
});


describe("the German UI dictionary is a complete, validated dictionary", () => {
  const german = getDictionary(GERMAN);

  it("satisfies the complete dictionary schema", () => {
    const parsed = dictionarySchema.safeParse(german);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("translates the shared UI vocabulary the live German surface shows", () => {
    expect(german.language.label).toBe("Sprache");
    expect(german.layout).toEqual({
      label: "Layout",
      sidebar: "Seitenleiste",
      menuBar: "Menüleiste",
    });
    expect(german.navigation.showSidebar).toBe("Navigation einblenden");
    expect(german.navigation.hideSidebar).toBe("Navigation ausblenden");
    expect(german.navigation.primaryLabel).toBe("Hauptnavigation");
    expect(german.a11y.skipToContent).toBe("Zum Inhalt springen");
    expect(german.notFound.title).toBe("Seite nicht gefunden");
    // The agreed human-facing labels: the neutral Location choice is "All locations", and the
    // reserved `ww` Site carries the agreed label "Global" (the Site selector's own vocabulary).
    expect(german.location.unspecified).toBe("Alle Standorte");
  });

  it("translates the configured navigation destinations without changing a URL", () => {
    expect(german.navigation.items["/"]).toBe("Startseite");
    expect(german.navigation.items["/about"]).toBe("Über uns");
    // The dictionary is keyed by HREF: adding a language never invents a German slug.
    expect(Object.keys(german.navigation.items).sort()).toEqual(
      siteConfig.navigation.map((item) => item.href).sort(),
    );
  });

  it("leaves the English dictionary alone", () => {
    expect(getDictionary(ENGLISH).language.label).toBe("Language");
    expect(getDictionary(ENGLISH).navigation.items["/about"]).toBe("About");
  });
});

describe("the German pages are real German sources, not English answers", () => {
  it("resolves the authored German Home document at the reserved home slug", async () => {
    const home = await pages().resolve(SITE, HOME_CONTENT_SLUG, GERMAN);
    expect(home?.kind).toBe("json");
    expect(home?.title).toBe(GERMAN_HOME_TITLE);
    // The German URL is answered by the GERMAN source — no fallback to English.
    expect(home?.locale).toBe(GERMAN);
    expect(home?.fallback).toBe(false);
  });

  it("resolves the authored German About page", async () => {
    const about = await pages().resolve(SITE, "about", GERMAN);
    expect(about?.kind).toBe("markdown");
    expect(about?.title).toBe(GERMAN_ABOUT_TITLE);
    expect(about?.locale).toBe(GERMAN);
    expect(about?.fallback).toBe(false);
    // …and its own summary is the German one, so `/ww/de/about` advertises German metadata.
    const english = await pages().resolve(SITE, "about", ENGLISH);
    expect(about?.description).toBeTruthy();
    expect(about?.description).not.toBe(english?.description);
  });

  it("publishes the same route under the German locale", async () => {
    const routePaths = await pages().listRoutes(SITE, GERMAN);
    expect(routePaths.some((routePath) => routePath.replace(/^\//, "") === "about")).toBe(true);
    // The home page's real URL is the locale root: the reserved slug is a CONTENT route that the
    // route/sitemap layer translates into the root URL (never `/<site>/<locale>/home`).
    expect(routePaths).toContain(HOME_CONTENT_SLUG);
  });
});

describe("the German Home keeps the English page's structure", () => {
  /** The STRUCTURAL tokens of a document: what must not change when copy is translated. */
  const shape = (document: { readonly sections: readonly Record<string, unknown>[] }) =>
    document.sections.map((section) => {
      const actions = (section.actions ?? []) as readonly Record<string, unknown>[];
      const items = (section.items ?? []) as readonly Record<string, unknown>[];
      return {
        type: section.type,
        surface: section.surface ?? null,
        ratio: section.ratio ?? null,
        actionCount: actions.length,
        itemCount: items.length,
        itemActionCount: items.filter((item) => item.action !== undefined).length,
      };
    });

  it("declares the same sections, in the same order, with the same shape", async () => {
    const german = await pages().resolve(SITE, HOME_CONTENT_SLUG, GERMAN);
    const english = await pages().resolve(SITE, HOME_CONTENT_SLUG, ENGLISH);
    const germanDocument = german?.kind === "json" ? german.document : null;
    const englishDocument = english?.kind === "json" ? english.document : null;

    expect(germanDocument?.sections.map((section) => section.type)).toEqual([
      "hero",
      "columns",
      "callout",
      "cards",
      "prose",
      "prose",
    ]);
    expect(shape(germanDocument!)).toEqual(shape(englishDocument!));
  });

  it("keeps its own internal destination and the external repository link", async () => {
    // The German page states the SITE-SCOPED destination it means (`/ww/de/about`), because `de`
    // is both a locale key and the Germany site's code — a `route` target would resolve to
    // `/de/about`, which now names the Germany site. The external destination is untouched.
    const home = await pages().resolve(SITE, HOME_CONTENT_SLUG, GERMAN);
    const document = home?.kind === "json" ? home.document : null;
    const hero = document?.sections[0] as Record<string, unknown> | undefined;
    const actions = (hero?.actions ?? []) as readonly Record<string, unknown>[];

    expect(actions[0]?.href).toBe("/ww/de/about");
    expect(actions[1]?.href).toBe(REPOSITORY_URL);
    expect(actions[1]?.variant).toBe("secondary");
  });
});

describe("the served German pages", () => {
  it("renders German Home at `/ww/de`: one h1 and the German sections it declares", async () => {
    const html = renderToStaticMarkup(await PageRoute(params(SITE, GERMAN)));

    expect(html.match(/<h1\b/g) ?? []).toHaveLength(1);
    expect(html).toContain(GERMAN_HOME_TITLE);
    expect(html).toContain("Zwei Arten, Seiten zu erstellen");
    expect(html).toContain("Ihre Website gehört Ihnen");
    // The authored action states its own site (`/ww/de/about`): `de` is both a locale key and the
    // Germany site's code, so the site-scoped form is the unambiguous one. The external link is
    // untouched.
    expect(html).toContain('href="/ww/de/about"');
    expect(html).toContain(REPOSITORY_URL);
    // The authored home page replaces the starter homepage, exactly as it does in English.
    expect(html).not.toContain("home-hero");
  });

  it("renders German About at `/ww/de/about`: one h1 and German `#` sections as h2", async () => {
    const html = renderToStaticMarkup(await PageRoute(params(SITE, GERMAN, "about")));

    expect(html.match(/<h1\b/g) ?? []).toHaveLength(1);
    expect(html).toContain(GERMAN_ABOUT_TITLE);
    expect(html).toContain("Was diese Website zeigt");
    expect(html).toContain("Zwei Arten, Seiten zu erstellen");
    // A translated `# Heading` still renders RELATIVE to the page title: an h2, never an h1.
    expect(html).toContain("<h2");
    expect(html).toContain('id="eine-website-unter-ihrer-kontrolle"');
    expect(html).toContain("https://foundation.provelopment.com/");
    expect(html).toContain(REPOSITORY_URL);
  });
});

describe("German locale metadata", () => {
  it("speaks German at the locale root, where the site's own words stand alone", async () => {
    const metadata = await generateMetadata(params(SITE, GERMAN));

    expect(metadata.description).toBe(siteDescriptionForLocale(siteConfig, GERMAN));
    // …and it is genuinely German, not the deployment's English sentence.
    expect(metadata.description).not.toBe(siteConfig.description);
    // The route returns the SITE-RELATIVE destination; `metadataBase` resolves it to the absolute
    // URL the page serves (`…/ww/de`), which the browser scenario asserts on the rendered tag.
    expect(metadata.alternates?.canonical).toBe("/ww/de");
    expect(metadata.openGraph?.locale).toBe(GERMAN);
    expect(metadata.openGraph?.alternateLocale).toEqual([ENGLISH]);
    // hreflang alternates stay INSIDE the `ww` site: both languages plus x-default.
    expect(metadata.alternates?.languages).toMatchObject({
      en: `${siteConfig.url}/ww/en`,
      de: `${siteConfig.url}/ww/de`,
      "x-default": `${siteConfig.url}/ww/en`,
    });
  });

  it("leaves the English locale root exactly as the owner accepted it", async () => {
    const metadata = await generateMetadata(params(SITE, ENGLISH));

    expect(metadata.description).toBe(siteConfig.description);
    expect(metadata.alternates?.canonical).toBe("/ww/en");
    expect(metadata.openGraph?.locale).toBe(ENGLISH);
  });

  it("lets the German About page's own summary speak for it, with German alternates", async () => {
    const metadata = await generateMetadata(params(SITE, GERMAN, "about"));
    const about = await pages().resolve(SITE, "about", GERMAN);

    expect(metadata.title).toBe(GERMAN_ABOUT_TITLE);
    expect(metadata.description).toBe(about?.description);
    expect(metadata.alternates?.canonical).toBe(`${siteConfig.url}/ww/de/about`);
    expect(metadata.alternates?.languages).toMatchObject({
      en: `${siteConfig.url}/ww/en/about`,
      de: `${siteConfig.url}/ww/de/about`,
      "x-default": `${siteConfig.url}/ww/en/about`,
    });
  });
});



