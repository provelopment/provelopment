"use client";

import { usePathname, useRouter } from "next/navigation";

import { displayNameWithEnglish } from "@/core/display-labels";
import { bindingsForSite, regionalPath, resolveLocaleDestination } from "@/core/regional-pages";
import { pathContextOr, siteLocalePath, sitePath, sitePrefixPath, siteSupportsLocalePath } from "@/core/site";
import { useClientRouting } from "./client-routing-context";

interface LanguageSwitcherProps {
  /**
   * The current document's locale PATH KEY (`en`, `fr-ca`) — the value the URL names and the
   * key the dictionary is looked up by.
   */
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
  // M14 — the routing facts arrive from the SERVER's projection for the CURRENT Spoke: this site, this
  // site's locales, this site's bindings. No configuration is read here and no Spoke can be selected.
  const routing = useClientRouting();

  const context = pathContextOr(
    routing.siteSet,
    routing.pageBindings,
    pathname ?? "/",
    locale,
  );
  const site = context.site;
  const sitePrefix = sitePrefixPath(site);
  const entries = bindingsForSite(routing.pageBindings, site.code);
  const current = context.localePath;

  function handleChange(nextLocale: string) {
    // A language switch stays INSIDE this site: a locale the site does not serve is never
    // offered, and a stale DOM value cannot reach it either.
    if (nextLocale === current || !siteSupportsLocalePath(site, nextLocale)) {
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
  /**
   * The CONTEXT's display label for a locale PATH KEY (`en`, `fr-ca`): projected by the server through the
   * ONE display-name rule (S1/M14), with the path key itself as the last resort — the same fallback this
   * selector always had for a key the registry does not name.
   */
  const registryLabel = (localePath: string): string =>
    routing.localeLabels[localePath] ?? localePath;
  const sortedLocales = [...site.locales].sort((a, b) => {
    if (a.path === defaultLocale) return -1;
    if (b.path === defaultLocale) return 1;
    return registryLabel(a.path).localeCompare(registryLabel(b.path), "en", { sensitivity: "base" });
  });

  return (
    <select
      aria-label={label}
      data-selector="language"
      value={current}
      onChange={(event) => handleChange(event.target.value)}
      className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
    >
      {sortedLocales.map(({ path: localePath, label: siteLabel }) => (
        <option key={localePath} value={localePath}>
          {siteLabel === undefined ? registryLabel(localePath) : displayNameWithEnglish(siteLabel)}
        </option>
      ))}
    </select>
  );
}