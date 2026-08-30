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
 * localized `labels[locale]` where configured, else the canonical English
 * name (`label ?? name ?? id`), with the English name appended in brackets
 * when the two differ.
 *
 *   en toronto → `Toronto`;          fr montreal → `Montréal (Montreal)`
 *   ja tokyo → `東京 (Tokyo)`;        ko seoul → `서울 (Seoul)`
 *   zh shanghai → `上海 (Shanghai)`;  en montreal → `Montreal`
 */
export function regionDisplayName(locale: string, region: OperationalRegion): string {
  const english = region.label ?? region.name ?? region.id;
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