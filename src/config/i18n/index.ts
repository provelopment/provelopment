import type { Locale } from "@/core/locale";

import { currentBuildRuntimeContext } from "../installation-runtime";
import { dictionaryAccessForRuntimeContext } from "../runtime-dictionaries";
import type { Dictionary } from "./dictionary";

/**
 * THE PRODUCTION DICTIONARY BINDING (FOUNDATION-MULTISITE-S3F2A2-D2)
 * ==================================================================
 *
 *     currentBuildRuntimeContext()                  the accepted ONE-Spoke compatibility seam (S3F1):
 *                 │                                 legacy → the implicit Spoke; explicit → the SOLE
 *                 ▼                                 declared Spoke; 2+ declared Spokes are refused
 *     dictionaryAccessForRuntimeContext(context)    the proven context-bound capability (S3F2A2-D1)
 *                 │
 *                 ▼
 *     compatibilityDictionaryAccess                  ONE immutable access, built ONCE at module load
 *                 │
 *                 ▼
 *     getDictionary(locale, siteCode?)               the unchanged public API
 *
 * WHAT CHANGED, AND WHAT DELIBERATELY DID NOT. The registry used to be composed HERE, from the
 * deployment-root authority and the module-global configuration (`deploymentPaths()`, `siteConfig`,
 * `loadDictionaryRegistry`). It is now composed by the context-bound capability from the SAME directory —
 * the deployment's dictionary root and the sole Spoke's root are both `<resourceRoot>/config/i18n`, from
 * the ONE `DEPLOYMENT_RESOURCE_PATHS` constant — and from the SAME resolved configuration, so single-Spoke
 * production answers exactly as before while this module stops resolving paths, importing a global
 * configuration or naming a registry loader.
 *
 * Every dictionary rule stays where it was: schema validation, declared-locale validation, the
 * language-base fallback, the default locale, the site+locale overrides and their refusal cases, and the
 * missing-dictionary failures all live in `./registry`, reached through `../spoke-dictionaries`. The F1
 * booking-label lock is applied INSIDE that capability, so constructing the access below applies it at
 * module load (build time) exactly as the previous explicit call did: ONE invariant, ONE diagnostic.
 *
 * SERVER-ONLY: the access reads dictionaries from the filesystem, so `@/config/i18n` must never be
 * imported by a client component.
 */
const compatibilityDictionaryAccess = dictionaryAccessForRuntimeContext(currentBuildRuntimeContext());

// F1 — the booking-label invariant ITSELF lives in `./invariants` (S3F2A2-D1): it is a pure rule that this
// module and the SpokeRuntimeContext-bound runtime dictionary access apply IDENTICALLY, and sharing it
// keeps the runtime access from importing a module whose body loads a process-global registry. It is
// re-exported here, so the established public/testing surface —
// `import { assertBookingLabelPresent } from "@/config/i18n"` — is unchanged.
export { assertBookingLabelPresent } from "./invariants";

/**
 * Returns the EFFECTIVE dictionary for a locale and, when given, the ACTIVE SITE: the shared dictionary
 * for that locale with that site's override applied (`@/config/i18n/registry`, reached through the build
 * context's dictionary access).
 *
 * S1E2 — the site is the second argument because only the caller knows which site's page tree it is
 * speaking for. A caller that passes no site gets the SHARED dictionary, which is the correct answer for
 * a site-less surface — and never another site's wording.
 *
 * Falls back to the default locale's dictionary only when the requested locale is not configured. Every
 * configured locale is guaranteed (at registry load) to have a validated dictionary.
 */
export function getDictionary(locale: Locale, siteCode?: string): Dictionary {
  return compatibilityDictionaryAccess.get(locale, siteCode);
}

/**
 * Phase T — typed access to an OPTIONAL chrome section. The F1-style lock
 * (`assertDictionarySectionPresent`) guarantees the section exists at build
 * time whenever its feature is enabled; this helper converts that invariant
 * into a typed non-optional value and makes a missing section a loud internal
 * error instead of a silent `undefined`.
 */
export function requireDictionarySection<T extends keyof Dictionary>(
  dictionary: Dictionary,
  section: T,
): NonNullable<Dictionary[T]> {
  const value = dictionary[section];
  if (!value) {
    throw new Error(
      `Dictionary section "${section}" is missing; the feature lock should have caught this at build time.`,
    );
  }
  return value as NonNullable<Dictionary[T]>;
}
