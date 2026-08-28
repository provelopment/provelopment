import { describe, expect, it } from "vitest";

import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";

const repository = createFileSystemPageContentRepository({
  defaultLocale: "en",
});

/** Expected contact page titles per locale (French legitimately equals English). */
const contactTitles: Record<string, string> = {
  es: "Contacto",
  fr: "Contact",
  de: "Kontakt",
  ja: "お問い合わせ",
  zh: "联系我们",
  ko: "문의",
  id: "Kontak",
};

describe("contact page localization", () => {
  it("serves the localized contact page when the locale file exists", async () => {
    for (const [locale, expectedTitle] of Object.entries(contactTitles)) {
      const content = await repository.findBySlug("contact", locale);
      expect(content).not.toBeNull();
      // The locale-specific file wins over the English fallback.
      expect(content?.locale).toBe(locale);
      expect(content?.title).toBe(expectedTitle);
    }
  });

  it("falls back to the default-locale contact page when no translation exists", async () => {
    const content = await repository.findBySlug("contact", "pt");
    expect(content?.locale).toBe("en");
    expect(content?.title).toBe("Contact");
  });

  it("still serves fully-localized pages (about, resources) per locale", async () => {
    const aboutTitles: Record<string, string> = {
      es: "Acerca de",
      fr: "À propos",
      de: "Über uns",
      ja: "概要",
      zh: "关于",
      ko: "소개",
      id: "Tentang",
    };
    const resourceTitles: Record<string, string> = {
      es: "Recursos",
      fr: "Ressources",
      de: "Ressourcen",
      ja: "リソース",
      zh: "资源",
      ko: "리소스",
      id: "Sumber daya",
    };

    for (const [locale, expectedTitle] of Object.entries(aboutTitles)) {
      const about = await repository.findBySlug("about", locale);
      expect(about?.locale).toBe(locale);
      expect(about?.title).toBe(expectedTitle);
    }
    for (const [locale, expectedTitle] of Object.entries(resourceTitles)) {
      const resources = await repository.findBySlug("resources", locale);
      expect(resources?.locale).toBe(locale);
      expect(resources?.title).toBe(expectedTitle);
    }
  });
});