/**
 * THE RETIRED FOUNDATION-ROOT DEPLOYMENT LOCATIONS (FOUNDATION-DEPLOYMENT-ISO-B3C2A)
 * =================================================================================
 *
 * The combined Foundation repository is a PLATFORM repository that CARRIES a reference deployment in
 * its capsule (`deployment/**`). The deployment-owned locations a build derives from a selected root
 * — `site.config.json`, `config/i18n/**` and `content/**` — must therefore NOT also exist at this
 * repository's root. A second copy is exactly the "two locations, two authorities" defect this
 * contract forbids: whichever copy a reader found first would decide what the site says.
 *
 * WHAT THIS RULE IS NOT
 * --------------------
 * It is NOT a statement that repository-root deployment layout is unsupported. A standalone SPOKE
 * repository — one deployment, no platform capsule — legitimately keeps those locations at its own
 * root, and the build keeps selecting that layout for it (`resolveDeploymentForBuild`'s
 * `repository` case, proved on a standalone temporary repository in
 * `tests/architecture/deployment-root-guard.test.ts`). The prohibition is about THIS repository's
 * ownership shape and is derived from the paths a repository may track — never from repository
 * identity: there is no "if this is the Foundation repository then…" branch in the selector, and
 * none may be added.
 *
 * WHY PATHS AND NOT DIRECTORIES
 * ----------------------------
 * Git does not track empty directories, so filesystem presence alone can never be the contract
 * (ISO-C1 paid for that lesson). The rule is reasoned over TRACKED PATHS — which is also what makes
 * it durable: it does not list the historical filenames, it rejects ARBITRARY descendant paths,
 * including ones nobody has authored yet.
 *
 * Matching is case-insensitive on purpose: the filesystems Node/Next support here are
 * case-insensitive, so a prospective root `Content/` IS the retired `content/` location.
 */

/**
 * The retired root deployment locations, as repository-relative paths. They are exactly the
 * deployment-owned locations `@/config/deployment-root` derives for a selected root, which is why
 * `config/i18n` (the dictionary directory) is named rather than all of `config/`.
 */
export const RETIRED_ROOT_DEPLOYMENT_LOCATIONS = ["site.config.json", "config/i18n", "content"] as const;

/** The repository-relative spelling of a path, whatever separators and prefix it arrived with. */
function normalise(relativePath: string): string {
  return relativePath
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .toLowerCase();
}

/**
 * True when `relativePath` is a retired root deployment location — the location itself or ANY
 * descendant of it. Root-anchored lookalikes are not: `content-notes.md`, `src/config/i18n/…` and
 * the capsule's own `deployment/content/…` all stay legal, because the rule is about where THIS
 * repository's deployment state lives, not about the word.
 */
export function isRetiredRootDeploymentPath(relativePath: string): boolean {
  const path = normalise(relativePath);
  if (path.length === 0) return false;

  return RETIRED_ROOT_DEPLOYMENT_LOCATIONS.some((location) => {
    const retired = location.toLowerCase();
    return path === retired || path.startsWith(`${retired}/`);
  });
}

/**
 * The tracked paths that violate the retired-root rule, in their ORIGINAL spelling so a failure
 * names what to remove. An empty result is the architectural requirement.
 */
export function retiredRootDeploymentViolations(trackedPaths: readonly string[]): string[] {
  return trackedPaths.filter((trackedPath) => isRetiredRootDeploymentPath(trackedPath));
}
