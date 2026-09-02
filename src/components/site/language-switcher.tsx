"use client";

import { usePathname, useRouter } from "next/navigation";

import { siteConfig } from "@/config";
import { displayNameWithEnglish } from "@/core/display-labels";
import { replaceLocaleSegment } from "@/core/locale";
import {
  parseRegionalPath,
  regionalPath,
  resolveLocaleDestination,
} from "@/core/regional-pages";

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
 * Locale and location are independent dimensions:
 *  - on a REGIONAL page, switching language preserves the current region; if
 *    the target locale lacks the exact (page) combination, the deterministic
 *    fallback is used (landing → first configured page); locales with no
 *    destination for the current region are simply not offered (never a dead
 *    link, never a silent region change);
 *  - on a non-regional page, every locale is offered and the current sub-path
 *    is preserved.
 *
 * The choice is recorded in a cookie so bare-`/` requests negotiate to it.
 */
export function LanguageSwitcher({ locale, label }: LanguageSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();

  const parsed = parseRegionalPath(siteConfig.pageBindings, pathname ?? `/${locale}`);
  const currentRegion = parsed.region;

  function handleChange(nextLocale: string) {
    if (nextLocale === locale) {
      return;
    }

    writeLocaleCookie(nextLocale);

    if (currentRegion) {
      const destination = resolveLocaleDestination(
        siteConfig.pageBindings,
        nextLocale,
        currentRegion,
        parsed.slug,
      );
      if (destination) {
        router.push(regionalPath(nextLocale, destination.region, destination.slug));
      }
      return;
    }

    router.push(replaceLocaleSegment(pathname ?? `/${locale}`, nextLocale));
  }

  const offeredLocales = currentRegion
    ? siteConfig.locales.filter((entry) =>
        resolveLocaleDestination(
          siteConfig.pageBindings,
          entry.code,
          currentRegion,
          parsed.slug,
        ) !== null,
      )
    : siteConfig.locales;

  return (
    <select
      aria-label={label}
      data-selector="language"
      value={locale}
      onChange={(event) => handleChange(event.target.value)}
      className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
    >
      {offeredLocales.map((entry) => (
        <option key={entry.code} value={entry.code}>
          {displayNameWithEnglish(entry.label, entry.englishLabel)}
        </option>
      ))}
    </select>
  );
}