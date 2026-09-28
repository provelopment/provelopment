/**
 * THE OWNERSHIP SCOPES OF THE ONE BROWSER HARNESS (FOUNDATION-DEPLOYMENT-ISO-B3A)
 * ==============================================================================
 *
 * The browser matrix has ONE harness and TWO owners. This module is the whole of the selection
 * policy between them — the one place that knows which scenario family a scope runs, so no runner,
 * no scenario and no package command has to.
 *
 *   foundation   the GENERIC scenarios that prove platform behaviour. They live INSIDE the harness
 *                (`tests/browser/matrix.mjs`) and run against a disposable copy of the synthetic
 *                deployment, so they never depend on — or mutate — a real deployment.
 *   deployment   the SELECTED deployment's own acceptance scenarios. They live in that deployment's
 *                OWN tree (`<deployment root>/tests/browser/*.scenario.mjs`) and are discovered,
 *                never listed: a deployment that ships none discovers none, and a repository with
 *                no deployment at all has no deployment scope to run.
 *   all          both families (the default, and the conservative superset `pnpm test:browser` runs).
 *
 * Ownership is therefore FILESYSTEM-DRIVEN: a scenario's owner is the tree it lives in, so adding a
 * deployment never edits a list, and no scenario is ever selected by filename guessing.
 *
 * Deliberately PLAIN ESM with JSDoc types, like the deployment authority it sits beside
 * (`src/config/deployment-build.mjs`): `node` loads it directly, and Vitest can import the same
 * module to prove the ownership contract without starting a browser.
 */

/** Every scope the harness accepts. A scope names an OWNER, never a test-name pattern. */
export const BROWSER_SCOPES = ["foundation", "deployment", "all"];

/** The scope a run uses when none is asked for: the conservative superset. */
export const DEFAULT_BROWSER_SCOPE = "all";

/** The one file convention a deployment-owned scenario is discovered by. */
export const SCENARIO_SUFFIX = ".scenario.mjs";

/**
 * Where a deployment's own browser surface lives, RELATIVE to the root the deployment authority
 * selected — the same shape for the repository, capsule and override layouts, so discovery follows
 * the deployment instead of naming `deployment/` anywhere.
 */
export const DEPLOYMENT_BROWSER_SUBDIRECTORY = ["tests", "browser"];

/**
 * The scenario families one scope runs.
 *
 * @param {string} scope one of {@link BROWSER_SCOPES}
 * @returns {{ foundation: boolean, deployment: boolean }}
 */
export function browserScopePlan(scope) {
  if (!BROWSER_SCOPES.includes(scope)) throw scopeError(scope);
  return {
    foundation: scope === "foundation" || scope === "all",
    deployment: scope === "deployment" || scope === "all",
  };
}

/** The harness's one usage line, quoted in every failure so an unknown scope is self-explanatory. */
export function browserScopeUsage() {
  return `--scope ${BROWSER_SCOPES.join("|")} (default: ${DEFAULT_BROWSER_SCOPE})`;
}

/**
 * The scope a command line asked for, validated LOUDLY.
 *
 * An unknown or valueless scope is refused rather than silently falling back to the superset: a
 * validation surface that quietly runs more (or less) than it was told would make every later
 * change-scoped decision meaningless.
 *
 * @param {readonly string[]} [argv] the arguments after the script name
 * @returns {string} one of {@link BROWSER_SCOPES}
 */
export function parseBrowserScope(argv = process.argv.slice(2)) {
  let scope = DEFAULT_BROWSER_SCOPE;
  let asked = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--scope") {
      scope = argv[index + 1];
      asked = true;
      index += 1;
    } else if (argument.startsWith("--scope=")) {
      scope = argument.slice("--scope=".length);
      asked = true;
    } else if (argument.startsWith("--")) {
      throw new Error(`unknown option "${argument}" — usage: ${browserScopeUsage()}`);
    }
  }
  if (asked && (typeof scope !== "string" || !BROWSER_SCOPES.includes(scope))) {
    throw scopeError(scope);
  }
  return scope;
}

/** What a scope excludes, for the run's own report line. */
export function describeBrowserScope(scope) {
  const { foundation, deployment } = browserScopePlan(scope);
  if (foundation && deployment) return "foundation + deployment";
  return foundation ? "foundation only" : "deployment only";
}

/**
 * The deployment-owned browser directory for a SELECTED deployment root.
 *
 * @param {string} deploymentRoot the root `src/config/deployment-build.mjs` resolved
 * @returns {string} the root's own browser-test directory
 */
export function deploymentBrowserDirectory(deploymentRoot) {
  return joinPath(deploymentRoot, DEPLOYMENT_BROWSER_SUBDIRECTORY);
}

/**
 * The scenarios a directory listing holds, in a deterministic order.
 *
 * @param {readonly string[]} entries the names a directory listing returned
 * @returns {string[]} only the deployment-owned scenario files
 */
export function deploymentScenarioFiles(entries) {
  return entries.filter((entry) => entry.endsWith(SCENARIO_SUFFIX)).sort();
}

/** Join path segments without importing `node:path` (this module stays dependency-free). */
function joinPath(root, segments) {
  const separator = root.includes("\\") ? "\\" : "/";
  return [root.replace(/[\\/]+$/, ""), ...segments].join(separator);
}

/** The one refusal message for an absent or unknown scope. */
function scopeError(scope) {
  return new Error(
    `unknown browser scope ${scope === undefined ? "(missing)" : `"${scope}"`} — usage: ${browserScopeUsage()}`,
  );
}
