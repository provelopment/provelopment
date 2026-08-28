"use client";

import { usePathname, useRouter } from "next/navigation";

import { siteConfig } from "@/config";
import { replaceLocaleSegment } from "@/core/locale";

interface LanguageSwitcherProps {
  readonly locale: string;
  /** Accessible label, localized via the active locale's dictionary. */
  readonly label: string;
}

const LOCALE_COOKIE = "NEXT_LOCALE";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Locale dropdown shown in the header. Selecting a language preserves the
 * current sub-path and records the choice in a cookie so bare-`/` requests
 * negotiate to it on later visits.
 */
export function LanguageSwitcher({ locale, label }: LanguageSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();

  function handleChange(nextLocale: string) {
    if (nextLocale === locale) {
      return;
    }

    document.cookie = `${LOCALE_COOKIE}=${nextLocale}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
    router.push(replaceLocaleSegment(pathname ?? `/${locale}`, nextLocale));
  }

  return (
    <select
      aria-label={label}
      value={locale}
      onChange={(event) => handleChange(event.target.value)}
      className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
    >
      {siteConfig.locales.map((entry) => (
        <option key={entry.code} value={entry.code}>
          {entry.label}
        </option>
      ))}
    </select>
  );
}