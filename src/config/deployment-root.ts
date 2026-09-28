/**
 * THE DEPLOYMENT ROOT (FOUNDATION-DEPLOYMENT-ISO-B1)
 * =================================================
 *
 * ONE authority for every DEPLOYMENT-OWNED filesystem location. Foundation core never spells those
 * locations itself: a deployment's configuration, dictionaries, authored pages and artwork sources
 * are resolved here — and every consumer asks this module instead of building a path of its own
 * (`tests/architecture/deployment-root-guard.test.ts` keeps it that way).
 *
 * WHY ONE MODULE (and not a helper per consumer)
 * ---------------------------------------------
 * The audit (ISO-A1) found the same root-relative assumption written in four places
 * (`src/config/loader.ts`, `src/config/i18n/index.ts`,
 * `src/adapters/content/authoring-source-discovery.ts`, `src/config/assets.ts`). Spreading the rule
 * further would only move the coupling, so the rule lives here.
 *
 * CLIENT-SAFE BY CONSTRUCTION — the constraint that shapes this module
 * ------------------------------------------------------------------
 * `siteConfig` is imported by CLIENT components (`context-nav-links`, `language-switcher`,
 * `location-switcher`, `context-connect-heading`, `error`), so this module's module-load code must
 * contain NO `node:fs` and NO `process.cwd()`: a filesystem import in a client chunk makes Turbopack
 * refuse to build the app endpoint, and `process.cwd()` does not exist in a browser. Therefore:
 *
 *   · `deploymentLayout()` / `readDeploymentConfig()` are pure — they read BUILD-TIME values the
 *     build itself resolved and inlined (`next.config.ts` → Next's `env`, inlined into BOTH bundles).
 *     The repository layout needs nothing at all: it keeps the bundled `site.config.json` import,
 *     exactly as before.
 *   · `deploymentPaths()` is SERVER-ONLY: it computes absolute paths (and may therefore use
 *     `process.cwd()`), and only server modules call it — the i18n registry, authoring discovery and
 *     asset screening. A client module must never call it.
 *
 * THREE LAYOUTS, RESOLVED ONCE PER BUILD
 * --------------------------------------
 *   `capsule`     a real deployment capsule at `<repo>/deployment/` — the accepted long-term source
 *                 write boundary for one deployment (its `site.config.json`, `config/i18n/`,
 *                 `content/pages/` and asset sources).
 *   `repository`  the CURRENT layout, where those locations sit at the repository root. This is the
 *                 transitional compatibility stage: the reference deployment has not moved yet (B2),
 *                 so today's resolution is exactly what it was.
 *   `override`    `FOUNDATION_DEPLOYMENT_ROOT` — the DEV/TEST BUILD-TIME escape hatch that lets a
 *                 generic test point a dev server at a synthetic deployment (see
 *                 `tests/support/synthetic-deployment.ts`). Never a production mechanism.
 *
 * WHAT IS *NOT* HERE
 * ------------------
 * `public/assets/**` is NOT a deployment-owned location: Next.js serves static files from `public/`
 * only, so it is GENERATED build output (`pnpm assets:sync`, byte-verified by
 * `tests/unit/asset-taxonomy-mirror.test.ts`). It is exposed here so that even the one platform path
 * is spelled in one place, but it is never part of a deployment agent's write boundary.
 */
// The REPOSITORY-layout config is BUNDLED, not read at runtime: it is the shipped deployment's own
// configuration, and keeping it an import is what guarantees the file is present in a production
// build — and it is what makes `siteConfig` usable from client components without a filesystem.
import bundledRepositorySiteConfig from "../../site.config.json";

/** Which layout the deployment root resolved to. */
export type DeploymentLayout = "capsule" | "repository" | "override";

export interface DeploymentRoot {
  readonly layout: DeploymentLayout;
  /** The absolute directory a deployment owns (its capsule, the repository root, or the override). */
  readonly root: string;
  readonly siteConfigFile: string;
  readonly dictionaryDirectory: string;
  /** The OPTIONAL `sites/<site>/<locale>.json` dictionary overlays (`@/config/i18n/registry`). */
  readonly dictionaryOverrideDirectory: string;
  readonly markdownPagesRoot: string;
  readonly jsonPagesRoot: string;
  /** The deployment's own artwork SOURCES (the `content/assets` tree; B3 narrows this to branding). */
  readonly assetSourceRoot: string;
  /** Next.js' static-file root — GENERATED output, never deployment source (see the module note). */
  readonly publicAssetsDirectory: string;
}

/** The build-time names the build resolves and inlines (`next.config.ts`). */
const LAYOUT_ENV = "FOUNDATION_DEPLOYMENT_LAYOUT";
const CONFIG_ENV = "FOUNDATION_DEPLOYMENT_CONFIG";
const ROOT_ENV = "FOUNDATION_DEPLOYMENT_ROOT";

/**
 * The layout this BUILD resolved. Pure: the value is a build-time string, inlined by Next into both
 * bundles, so it is safe to read at module load from client code. An unset value means the
 * repository layout — the behaviour of every deployment today.
 */
export function deploymentLayout(): DeploymentLayout {
  const layout = process.env[LAYOUT_ENV];
  return layout === "capsule" || layout === "override" ? layout : "repository";
}

/**
 * The raw deployment configuration. Pure and client-safe:
 *
 *   · the build inlined the capsule's/override's config (`next.config.ts`) → parse it;
 *   · otherwise the bundled repository config (unchanged behaviour, no filesystem at all).
 *
 * The value is validated ONCE by `parseSiteConfig` in `./loader`.
 */
export function readDeploymentConfig(): unknown {
  const inlined = process.env[CONFIG_ENV];
  if (inlined !== undefined && inlined !== "") return JSON.parse(inlined) as unknown;
  return bundledRepositorySiteConfig;
}

/**
 * The ABSOLUTE deployment-owned paths. SERVER-ONLY (see the module note): this is the only place in
 * `src/**` that anchors on `process.cwd()`. The result is cached — the answer cannot change within
 * one process — so server callers may keep using it at module load, exactly as before.
 */
let cachedPaths: DeploymentRoot | null = null;

export function deploymentPaths(): DeploymentRoot {
  if (cachedPaths !== null) return cachedPaths;

  const repositoryRoot = process.cwd();
  const layout = deploymentLayout();
  const override = process.env[ROOT_ENV]?.trim();
  const root =
    layout === "override" && override !== undefined && override !== ""
      ? override
      : layout === "capsule"
        ? `${repositoryRoot}/deployment`
        : repositoryRoot;

  cachedPaths = {
    layout,
    root,
    siteConfigFile: `${root}/site.config.json`,
    dictionaryDirectory: `${root}/config/i18n`,
    dictionaryOverrideDirectory: `${root}/config/i18n/sites`,
    markdownPagesRoot: `${root}/content/pages/markdown`,
    jsonPagesRoot: `${root}/content/pages/json`,
    assetSourceRoot: `${root}/content/assets`,
    // Platform path: Next.js serves static files from `public/` only (see the module note).
    publicAssetsDirectory: `${repositoryRoot}/public/assets`,
  };
  return cachedPaths;
}
