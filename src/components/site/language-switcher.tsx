"use client";

import { usePathname, useRouter } from "next/navigation";

import { siteConfig } from "@/config";
import { displayNameWithEnglish } from "@/core/display-labels";
import { bindingsForSite, regionalPath, resolveLocaleDestination } from "@/core/regional-pages";
import { pathContextOr, siteLocalePath, sitePath, sitePrefixPath, siteSetOf } from "@/core/site";

interface LanguageSwitcherProps {
  readonly locale: string;
  /** Accessible label, localized via the active locale's dictionary. */
  readonly label: string;
}

const LOCALE_COOKIE = "NEXT_LOCALE";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Records the negotiated locale in a cookie (module-scope helper). */
function writeLocaleCookie(nextLocale: string): void {
  document.cookie = `${LOCALE_COOKIE}=${nextLocale}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}

/**
 * Language dropdown shown in the header.
 *
 * S1 — A LANGUAGE SWITCH STAYS INSIDE THE CURRENT SITE. The site is read from the URL
 * (authoritative, exactly like the region), so:
 *
 *  - the options are THAT site's locales, never every locale of the deployment: a visitor of
 *    the Canada site is offered English (Canada) and French (Canada), not France French;
 *  - the destination keeps the site, replaces the locale and preserves the page — the URL is
 *    built from the site's own locale path, so a language switch can never leave its site;
 *  - a locale the site does not serve is not offered (never a dead link, never a silent site
 *    change);
 *  - in a REGIONAL context the same region is preserved when the target locale is bound to
 *    it, and the deterministic regional fallback is used otherwise (landing → first
 *    configured page) — still inside the same site.
 *
 * The site's own fallback policy decides what answers when the target locale has no copy of
 * the page: that is a locale fallback WITHIN the site, which the page-source contract
 * permits. A cross-site lookup is never performed to satisfy a language request.
 */
export function LanguageSwitcher({ locale, label }: LanguageSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();

  const context = pathContextOr(
    siteSetOf(siteConfig.sites, siteConfig.defaultSite),
    siteConfig.pageBindings,
    pathname ?? `/${locale}`,
    locale,
  );
  const site = context.site;
  const sitePrefix = sitePrefixPath(site);
  const entries = bindingsForSite(siteConfig.pageBindings, site.id);

  function handleChange(nextLocale: string) {
    if (nextLocale === locale || !site.locales.includes(nextLocale)) {
      return;
    }

    writeLocaleCookie(nextLocale);

    if (context.region) {
      const destination = resolveLocaleDestination(
        entries,
        nextLocale,
        context.region,
        context.routePath === "" ? null : context.routePath,
      );
      if (destination) {
        router.push(
          regionalPath(nextLocale, destination.region, destination.slug, sitePrefix),
        );
      }
      return;
    }

    // Same route path, same site, new locale — any fallback happens INSIDE this site.
    router.push(sitePath(site, nextLocale, context.routePath) ?? siteLocalePath(site, nextLocale));
  }

  const defaultLocale = site.defaultLocale;
  const sortedLocales = [...site.locales].sort((a, b) => {
    if (a === defaultLocale) return -1;
    if (b === defaultLocale) return 1;
    const entryA = siteConfig.locales.find((entry) => entry.code === a);
    const entryB = siteConfig.locales.find((entry) => entry.code === b);
    const nameA = entryA?.englishLabel ?? entryA?.label ?? a;
    const nameB = entryB?.englishLabel ?? entryB?.label ?? b;
    return nameA.localeCompare(nameB, "en", { sensitivity: "base" });
  });

  return (
    <select
      aria-label={label}
      data-selector="language"
      value={locale}
      onChange={(event) => handleChange(event.target.value)}
      className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
    >
      {sortedLocales.map((code) => {
        const entry = siteConfig.locales.find((localeEntry) => localeEntry.code === code);
        return (
          <option key={code} value={code}>
            {displayNameWithEnglish(entry?.label ?? code, entry?.englishLabel)}
          </option>
        );
      })}
    </select>
  );
}