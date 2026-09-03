import type { OperationalRegion } from "./region";

/**
 * Phase M refinement — PRESENTATION-ONLY display labels.
 *
 * Localized display names are decoration over the authoritative, language-
 * neutral region ids / IANA identifiers. None of these helpers influence the
 * region authority model, the hours/DST engine, or any routing decision.
 *
 * The canonical English names (`locale.englishLabel`, `region.label`/`name`)
 * and localized names (`region.labels[locale]`) are EXPLICIT configuration —
 * nothing here infers a name from country, timezone, or browser.
 *
 * Framework-free and pure so the server header, client switchers, and tests
 * share exactly one presentation rule.
 */

/**
 * Whether the timezone human-name came from the platform ICU table. Upper-case
 * letters are allowed; the lookup itself is delegated to `Intl`.
 */

/** Deterministic reference instant for timezone-name lookup. */
export const TZ_REFERENCE_DATE: Date = new Date(Date.UTC(2026, 0, 15, 12));

/**
 * Native (English) presentation: appends the English name in brackets when the
 * two differ; returns the native name alone when they are identical or when no
 * English name is configured.
 *
 *   `Français (French)`, `English`, `日本語 (Japanese)`
 */
export function displayNameWithEnglish(
  nativeLabel: string,
  englishLabel?: string | null,
): string {
  if (!englishLabel) return nativeLabel;
  if (nativeLabel.trim() === englishLabel.trim()) return nativeLabel;
  return `${nativeLabel} (${englishLabel})`;
}

/**
 * The region's display name for the given locale:
 *
 * 1. When English is selected (`en`):
 *    - The English name is displayed first.
 *    - If the location's most common language is English (`defaultLocale === "en"`),
 *      no brackets are added (e.g. `London`, `Los Angeles`, `New York`, `Sydney`, `Toronto`).
 *    - If the location's most common language is non-English (`defaultLocale !== "en"`),
 *      the local language name is appended in brackets when distinct from English
 *      (e.g. `Tokyo (東京)`, `Seoul (서울)`, `Shanghai (上海)`, `Moscow (Москва)`).
 *      If identical (e.g. `Berlin`, `Paris`, `Madrid`, `Jakarta`), brackets are omitted.
 *
 * 2. When a non-English language is selected:
 *    - The city name in the selected language is displayed first.
 *    - The canonical English name is appended in brackets when distinct
 *      (e.g. `서울 (Seoul)`, `東京 (Tokyo)`, `Londres (London)`).
 *      If identical, brackets are omitted.
 */
export function regionDisplayName(locale: string, region: OperationalRegion): string {
  const english = region.label ?? region.name ?? region.id;

  if (locale === "en") {
    const localLanguage = region.defaultLocale ?? "en";
    if (localLanguage === "en") {
      return english;
    }
    const nativeName = region.labels?.[localLanguage];
    if (nativeName && nativeName.trim() !== english.trim()) {
      return `${english} (${nativeName})`;
    }
    return english;
  }

  const localized = region.labels?.[locale] ?? english;
  return displayNameWithEnglish(localized, english);
}

/**
 * The human-readable name of an IANA timezone for a locale, via the platform
 * `Intl.DateTimeFormat` `timeZoneName: "long"` table (no translation data).
 * Falls back to the IANA identifier itself when the platform cannot resolve
 * a name. The reference instant is injectable so tests are deterministic;
 * winter is picked so the standard-time name is stable (never the DST name).
 */
export function timezoneNameForLocale(
  locale: string,
  iana: string,
  at: Date = TZ_REFERENCE_DATE,
): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone: iana,
      timeZoneName: "long",
    }).formatToParts(at);
    const name = parts.find((part) => part.type === "timeZoneName")?.value;
    if (name && name.trim().length > 0) return name;
  } catch {
    // Unknown/invalid zone for this ICU build → keep the authoritative id.
  }
  return iana;
}

/**
 * Concise timezone display for the Business Hours heading:
 *
 *   `<localized name> (<English name>) — <IANA id>`
 *
 * The English parenthetical is omitted when the localized and English names
 * are identical (never `Eastern Standard Time (Eastern Standard Time)`). The
 * IANA identifier is ALWAYS present — the region remains the sole authority.
 */
export function timezoneDisplayLabel(
  locale: string,
  iana: string,
  at: Date = TZ_REFERENCE_DATE,
): string {
  const localized = timezoneNameForLocale(locale, iana, at);
  const english = timezoneNameForLocale("en", iana, at);
  const core =
    localized.trim() === english.trim()
      ? localized
      : `${localized} (${english})`;
  return `${core} — ${iana}`;
}