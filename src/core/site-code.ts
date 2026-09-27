/**
 * THE SITE-CODE CONTRACT (FOUNDATION-S1)
 * =====================================
 *
 * A SITE is identified by a two-letter code, and this module is the ONE authority for which
 * codes exist. A site is normally a COUNTRY — `ca`, `fr`, `ch`, `id`, `jp` — and Foundation
 * additionally reserves `ww` for a WORLDWIDE / GLOBAL site, which is deliberately not a country
 * and may not be presented as one.
 *
 * WHY A CLOSED SET. The site code is simultaneously a content directory name, a URL segment and
 * (later, optionally) a hostname mapping key, so it must be predictable and machine-checkable:
 * arbitrary prose (`canada`, `main`, `my-office`) is refused, and the reference list below is the
 * single place the accepted codes are declared — never restated in a schema, a route or a
 * component.
 *
 * CASE. Directories and URLs are LOWERCASE (`ca`, `ww`); a configuration may write `CA` and is
 * normalised here, so `CA` and `ca` can never mean two different sites. (Locale path keys follow
 * the same rule — see `@/core/locale`.)
 *
 * Framework-neutral: pure data + types only. No React, Next.js, filesystem or configuration.
 */

/** The reserved code for a Worldwide / Global site: not a country. */
export const WORLDWIDE_SITE_CODE = "ww";

/**
 * The recognized ISO 3166-1 alpha-2 country codes (lowercase), Foundation's maintained reference
 * list. A code that is not here is refused: typos and invented codes fail loudly at build time
 * rather than publishing a site nobody can find.
 */
export const COUNTRY_SITE_CODES: readonly string[] = [
  "ad", "ae", "af", "ag", "ai", "al", "am", "ao", "aq", "ar", "as", "at", "au", "aw", "ax", "az",
  "ba", "bb", "bd", "be", "bf", "bg", "bh", "bi", "bj", "bl", "bm", "bn", "bo", "bq", "br", "bs",
  "bt", "bv", "bw", "by", "bz", "ca", "cc", "cd", "cf", "cg", "ch", "ci", "ck", "cl", "cm", "cn",
  "co", "cr", "cu", "cv", "cw", "cx", "cy", "cz", "de", "dj", "dk", "dm", "do", "dz", "ec", "ee",
  "eg", "eh", "er", "es", "et", "fi", "fj", "fk", "fm", "fo", "fr", "ga", "gb", "gd", "ge", "gf",
  "gg", "gh", "gi", "gl", "gm", "gn", "gp", "gq", "gr", "gs", "gt", "gu", "gw", "gy", "hk", "hm",
  "hn", "hr", "ht", "hu", "id", "ie", "il", "im", "in", "io", "iq", "ir", "is", "it", "je", "jm",
  "jo", "jp", "ke", "kg", "kh", "ki", "km", "kn", "kp", "kr", "kw", "ky", "kz", "la", "lb", "lc",
  "li", "lk", "lr", "ls", "lt", "lu", "lv", "ly", "ma", "mc", "md", "me", "mf", "mg", "mh", "mk",
  "ml", "mm", "mn", "mo", "mp", "mq", "mr", "ms", "mt", "mu", "mv", "mw", "mx", "my", "mz", "na",
  "nc", "ne", "nf", "ng", "ni", "nl", "no", "np", "nr", "nu", "nz", "om", "pa", "pe", "pf", "pg",
  "ph", "pk", "pl", "pm", "pn", "pr", "ps", "pt", "pw", "py", "qa", "re", "ro", "rs", "ru", "rw",
  "sa", "sb", "sc", "sd", "se", "sg", "sh", "si", "sj", "sk", "sl", "sm", "sn", "so", "sr", "ss",
  "st", "sv", "sx", "sy", "sz", "tc", "td", "tf", "tg", "th", "tj", "tk", "tl", "tm", "tn", "to",
  "tr", "tt", "tv", "tw", "tz", "ua", "ug", "um", "us", "uy", "uz", "va", "vc", "ve", "vg", "vi",
  "vn", "vu", "wf", "ws", "ye", "yt", "za", "zm", "zw",
];

/** Every site code Foundation accepts: the country codes plus the reserved `ww`. */
export const SITE_CODES: readonly string[] = [...COUNTRY_SITE_CODES, WORLDWIDE_SITE_CODE];

const SITE_CODE_SET = new Set(SITE_CODES);

/** Normalises any configuration spelling to the canonical lowercase path form. */
export function normalizeSiteCode(value: string): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** True when `value` is a recognized site code (`ca`, `fr`, `ww`, …), case-insensitively. */
export function isSiteCode(value: string): boolean {
  return SITE_CODE_SET.has(normalizeSiteCode(value));
}

/** True when the code names the Worldwide / Global site (never an ordinary country). */
export function isWorldwideSiteCode(value: string): boolean {
  return normalizeSiteCode(value) === WORLDWIDE_SITE_CODE;
}

/** The default display label for a site code: the country code, or `Worldwide` for `ww`. */
export function defaultSiteLabel(code: string): string {
  const normalized = normalizeSiteCode(code);
  return isWorldwideSiteCode(normalized) ? "Worldwide" : normalized.toUpperCase();
}
