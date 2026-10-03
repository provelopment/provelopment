/**
 * ONE SPOKE'S DICTIONARY REGISTRY (FOUNDATION-MULTISITE-S3E1B)
 * ==========================================================
 *
 *     SpokeResourcePaths                     the ALREADY-RESOLVED SiteConfig of the SAME Spoke
 *     (S3E1A: dictionaryRoot,                     (S3D1A: its locales, its default locale,
 *      dictionaryOverrideRoot)                    its resolved Sites)
 *             └──────────────────┬──────────────────────────┘
 *                     loadSpokeDictionaryRegistry(...)
 *                                ↓
 *                       DictionaryRegistry        ← the ONE registry type the runtime binding uses
 *
 * THE ONLY NEW FACT is WHICH ROOT SUPPLIES THE DICTIONARIES. `./i18n/registry` stays the single
 * loader, so every dictionary rule — declared-locale validation, the language-base fallback, the
 * default locale, the site+locale overrides and their refusal cases, the missing-dictionary errors —
 * is decided there, once, for the ACTIVE deployment and for a supplied Spoke alike. Nothing is
 * restated here.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ----------------------------------
 * It reads no `site.config.json` (the caller hands in the config `parseSiteConfig` already
 * resolved), resolves no Site, merges no Hubs, creates no directory and no default file, and
 * remembers nothing between calls: no `Map<SpokeId, …>`, no cache, no "current" or "active" Spoke.
 * A caller that has chosen a Spoke gets THAT Spoke's registry, from that Spoke's own roots — which
 * is why two Spokes may both hold `config/i18n/en.json` and `config/i18n/sites/ww/en.json` without
 * colliding, and why a value authored in one can never appear in the other.
 *
 * UNWIRED (S3E1B). `@/config/i18n` remains the running application's ACTIVE binding, and nothing in
 * `src/app/**`, `src/proxy.ts` or the current build imports this module: choosing which Spoke a
 * request or a build reads is S3F's work. This helper only answers for a Spoke already chosen.
 */
import { loadDictionaryRegistry, type DictionaryRegistry } from "./i18n/registry";
import type { SiteConfig } from "./site-config";
import type { SpokeResourcePaths } from "./spoke-resources";

/**
 * The dictionary registry of ONE Spoke: its shared dictionaries, its site+locale overrides and its
 * fallback, all read from that Spoke's own roots and validated against that Spoke's own resolved
 * configuration.
 *
 * A missing or empty dictionary tree keeps the loader's accepted semantics exactly (an empty
 * `sites/` folder overrides nothing; a declared locale without a dictionary is a loud failure).
 */
export function loadSpokeDictionaryRegistry(
  paths: SpokeResourcePaths,
  config: SiteConfig,
): DictionaryRegistry {
  return loadDictionaryRegistry({
    directory: paths.dictionaryRoot,
    overrideDirectory: paths.dictionaryOverrideRoot,
    declaredLocales: config.locales.map((locale) => locale.code),
    defaultLocale: config.defaultLocale,
    sites: config.sites.map((site) => ({
      code: site.code,
      locales: site.locales.map((locale) => locale.path),
    })),
  });
}
