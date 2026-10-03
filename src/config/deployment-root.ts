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
 * `deployment/tests/unit/asset-taxonomy-mirror.test.ts`). It is exposed here so that even the one platform path
 * is spelled in one place, but it is never part of a deployment agent's write boundary.
 */
// NOTE (ISO-B1C) — there is deliberately NO `import … from "../../site.config.json"` here. The build
// selects the deployment and INLINES its configuration (`src/config/deployment-build.mjs` ←
// `next.config.ts` / `vitest.config.mts`), so no application module depends on a file's physical
// location and B2 can move `site.config.json` into a capsule without a module-resolution change.
//
// FOUNDATION-B4A / B4A-A2 — this authority also resolves WHERE the INSTALLATION's own operational record lives (see
// `operationalStateFile`). The file's NAME belongs to that lifecycle contract; the import below is of its
// inner MODEL module, whose own imports are type-only, so this module stays CLIENT-SAFE (see the note
// above) — importing the contract's barrel would pull the release contract and the transitions into a
// client chunk.
import { INSTALLATION_OPERATIONAL_STATE_FILE_NAME } from "@/core/foundation-installation/model";

// S3E1C — the Spoke runtime NAMESPACE is spelled ONCE, by the module that owns the runtime segment, so
// the URL base the browser fetches and the generated directory the mirror installs into cannot drift.
// The import is a PURE dependency (`./spoke-runtime-segment.mjs` has no `node:fs` and no `process.cwd()`),
// so this authority stays CLIENT-SAFE (see the module note above).
import { spokeRuntimeAssetUrlBase, spokeRuntimeAssetNamespacePath } from "./spoke-runtime-segment.mjs";

/** Which layout the deployment root resolved to. */
export type DeploymentLayout = "capsule" | "repository" | "override";

/** How the INSTALLATION is authored: a legacy implicit Spoke, or an explicit declared collection. */
export type InstallationAuthoringMode = "legacy" | "explicit";

/**
 * ONE generated runtime asset namespace (FOUNDATION-MULTISITE-S3E1C).
 *
 * The runtime ownership model, frozen: Foundation/platform assets are served from `/assets/**`, and a
 * Spoke's OWN (replaceable) artwork from `/spokes/<runtime-segment>/assets/**`. Both are GENERATED
 * output under `public/`, never deployment source, and they are never nested inside one another — which
 * is what makes one Spoke's artwork unable to collide with another's, or with a platform asset.
 */
export interface RuntimeAssetNamespace {
  /** The absolute GENERATED directory the namespace's files live in. */
  readonly directory: string;
  /** The same-origin URL base those files are served from (`/assets`, `/spokes/<segment>/assets`). */
  readonly urlBase: string;
}

export interface DeploymentRoot {
  readonly layout: DeploymentLayout;
  /** How the Installation is authored (`legacy` | `explicit`) — S3F1's one-Spoke activation. */
  readonly mode: InstallationAuthoringMode;
  /** The absolute directory a deployment owns (its capsule, the repository root, or the override). */
  readonly root: string;
  /**
   * The directory that owns the deployment's RESOURCES (dictionaries, authored pages, artwork sources).
   *
   * In legacy mode this IS `root`. In explicit mode it is the SOLE declared Spoke's root, because the
   * Installation's authored website material lives in that Spoke — while the Installation's own
   * lifecycle records (`operationalStateFile`) stay at `root`.
   */
  readonly resourceRoot: string;
  /** `<resourceRoot>/content` — the ONE spelling of the authored content tree (B3 narrows its owner). */
  readonly contentRoot: string;
  readonly siteConfigFile: string;
  readonly dictionaryDirectory: string;
  /** The OPTIONAL `sites/<site>/<locale>.json` dictionary overlays (`@/config/i18n/registry`). */
  readonly dictionaryOverrideDirectory: string;
  readonly markdownPagesRoot: string;
  readonly jsonPagesRoot: string;
  /** The deployment's own artwork SOURCES (the `content/assets` tree; B3 narrows this to branding). */
  readonly assetSourceRoot: string;
  /**
   * The INSTALLATION's OWN durable operational record (FOUNDATION-B4A / B4A-A2): what is live, how healthy
   * it is, and how it got here. It is installation-owned state rather than authored content — see
   * `@/core/foundation-installation`, which owns its name, schema and semantics, while this authority owns
   * the only place it may live. It stays at `root` in EVERY mode, so moving a Spoke never moves a record.
   */
  readonly operationalStateFile: string;
  /** Next.js' static-file root — GENERATED output, never deployment source (see the module note). */
  readonly publicAssetsDirectory: string;
  /**
   * The GENERATED runtime namespaces, in RESOLUTION ORDER: the platform namespace first, then (in
   * explicit mode) the sole Spoke's own. A name that exists in more than one namespace therefore
   * resolves to the PLATFORM file — a Spoke may not shadow a platform asset (A2) — while a Spoke's own
   * replaceable artwork is found in its own namespace and nowhere else.
   */
  readonly runtimeAssetNamespaces: readonly RuntimeAssetNamespace[];
}

/** The build-time names the build resolves and inlines (`next.config.ts`). */
const LAYOUT_ENV = "FOUNDATION_DEPLOYMENT_LAYOUT";
const CONFIG_ENV = "FOUNDATION_DEPLOYMENT_CONFIG";
const ROOT_ENV = "FOUNDATION_DEPLOYMENT_ROOT";
/** S3F1 — the authoring mode, the sole Spoke's root (relative) and its runtime segment. */
const MODE_ENV = "FOUNDATION_DEPLOYMENT_MODE";
const SPOKE_ROOT_ENV = "FOUNDATION_DEPLOYMENT_SPOKE_ROOT";
const SPOKE_SEGMENT_ENV = "FOUNDATION_DEPLOYMENT_SPOKE_SEGMENT";

/**
 * The authored configuration FILE NAME a deployment root carries (FOUNDATION-MULTISITE-S3C1).
 *
 * Exported so that the spelling lives in ONE place: this authority's `siteConfigFile`, and the
 * Installation's Spoke-resolution module (`./spoke-roots`, which asserts that a declared Spoke root
 * carries this same surface) both consume it rather than restating it.
 */
export const DEPLOYMENT_CONFIG_FILE_NAME = "site.config.json";

/**
 * The AUTHORED resource trees a deployment root owns, RELATIVE to that root (FOUNDATION-MULTISITE-S3E1A).
 *
 * ONE spelling authority for every authored resource location: `deploymentPaths()` composes its own
 * absolute locations from THIS map, and a Spoke-aware consumer composes the very same relative trees
 * beneath a Spoke root it was HANDED (`./spoke-resources`). Neither restates a segment, so the legacy
 * active deployment and a declared Spoke cannot drift apart.
 *
 * These are AUTHORED locations only: they carry no runtime URL meaning, no runtime emission decision and
 * no publication decision — a directory's existence has never meant a page, a dictionary or an asset is
 * published.
 */
export const DEPLOYMENT_RESOURCE_PATHS = Object.freeze({
  /** The user-visible interface strings, one file per declared locale. */
  dictionary: "config/i18n",
  /** The OPTIONAL site+locale overrides BESIDE the shared dictionaries. */
  dictionaryOverrides: "config/i18n/sites",
  /** The Markdown authoring root. */
  markdownPages: "content/pages/markdown",
  /** The declarative JSON authoring root. */
  jsonPages: "content/pages/json",
  /** The authored artwork sources the runtime asset mirror is generated from. */
  assetSources: "content/assets",
});

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
 * How the SELECTED Installation is authored, as the BUILD resolved it.
 *
 * Pure and client-safe (the value is inlined by the build), and deliberately NOT a discovery: an
 * unset value means the legacy form — the behaviour of every deployment that exists today — while
 * `explicit` states that the Installation declares its Spokes and the runtime must read the sole
 * Spoke's resources. The RULES that make an Installation runnable (exactly one Spoke, no default
 * Spoke) live in the build authority (`./deployment-build.mjs`), never here.
 */
export function deploymentMode(): InstallationAuthoringMode {
  return process.env[MODE_ENV] === "explicit" ? "explicit" : "legacy";
}

/**
 * The raw deployment configuration. Pure and client-safe: the build selected ONE deployment and
 * INLINED its configuration (`next.config.ts` → Next's `env`; `vitest.config.mts` → `test.env`), so
 * this reads an already-selected value and never a file. A missing value means the build seam did not
 * run — a loud failure, never a silent fallback to some other deployment.
 *
 * The value is validated ONCE by `parseSiteConfig` in `./loader`.
 */
export function readDeploymentConfig(): unknown {
  const inlined = process.env[CONFIG_ENV];
  if (inlined === undefined || inlined === "") {
    throw new Error(
      "FOUNDATION-DEPLOYMENT-ISO-B1C: no deployment configuration was inlined into this build. " +
        "The build must resolve the deployment (next.config.ts) or the test run must " +
        "(vitest.config.mts) — both use src/config/deployment-build.mjs.",
    );
  }
  return JSON.parse(inlined) as unknown;
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
  const mode = deploymentMode();
  const override = process.env[ROOT_ENV]?.trim();
  const root =
    layout === "override" && override !== undefined && override !== ""
      ? override
      : layout === "capsule"
        ? `${repositoryRoot}/deployment`
        : repositoryRoot;

  // S3F1 — WHERE THIS INSTALLATION'S RESOURCES ARE. In legacy mode the Installation root IS the
  // resource root. In explicit mode the build resolved the SOLE declared Spoke, so its root (published
  // RELATIVE to the Installation root, like every other deployment-owned location) owns the
  // configuration, dictionaries, authored pages and artwork sources — while the Installation keeps its
  // own lifecycle records below.
  const spokeRelativeRoot = process.env[SPOKE_ROOT_ENV]?.trim() ?? "";
  if (mode === "explicit" && spokeRelativeRoot === "") {
    throw new Error(
      "FOUNDATION-MULTISITE-S3F1: this build selected an EXPLICIT Installation, but no Spoke root was " +
        "resolved into it. The build authority (`src/config/deployment-build.mjs`) must publish the " +
        "sole Spoke's root; nothing is guessed here.",
    );
  }
  const resourceRoot = mode === "explicit" ? `${root}/${spokeRelativeRoot}` : root;

  // …and the RUNTIME NAMESPACES those resources' artwork is INSTALLED into (S3E1C). The platform
  // namespace is always present and always `/assets/**`; an explicit Installation adds the sole Spoke's
  // own namespace, derived from the runtime SEGMENT the build resolved — never from a directory name.
  const segment = process.env[SPOKE_SEGMENT_ENV]?.trim() ?? "";
  if (mode === "explicit" && segment === "") {
    throw new Error(
      "FOUNDATION-MULTISITE-S3F1: this build selected an EXPLICIT Installation, but no runtime segment " +
        "was resolved for its Spoke. The build authority publishes it (`runtimeSegmentForSpokeId`); " +
        "nothing is derived from a directory name here.",
    );
  }
  const publicAssetsDirectory = `${repositoryRoot}/public/assets`;
  const runtimeAssetNamespaces: readonly RuntimeAssetNamespace[] =
    mode === "explicit"
      ? [
          // Platform first: a Spoke may not shadow a platform-owned asset (A2).
          { directory: publicAssetsDirectory, urlBase: "/assets" },
          {
            directory: `${repositoryRoot}/public/${spokeRuntimeAssetNamespacePath(segment)}`,
            urlBase: spokeRuntimeAssetUrlBase(segment),
          },
        ]
      : [{ directory: publicAssetsDirectory, urlBase: "/assets" }];

  cachedPaths = {
    layout,
    mode,
    root,
    resourceRoot,
    contentRoot: `${resourceRoot}/content`,
    siteConfigFile: `${resourceRoot}/${DEPLOYMENT_CONFIG_FILE_NAME}`,
    dictionaryDirectory: `${resourceRoot}/${DEPLOYMENT_RESOURCE_PATHS.dictionary}`,
    dictionaryOverrideDirectory: `${resourceRoot}/${DEPLOYMENT_RESOURCE_PATHS.dictionaryOverrides}`,
    markdownPagesRoot: `${resourceRoot}/${DEPLOYMENT_RESOURCE_PATHS.markdownPages}`,
    jsonPagesRoot: `${resourceRoot}/${DEPLOYMENT_RESOURCE_PATHS.jsonPages}`,
    assetSourceRoot: `${resourceRoot}/${DEPLOYMENT_RESOURCE_PATHS.assetSources}`,
    // The INSTALLATION's own operational record (FOUNDATION-B4A / B4A-A2). Its NAME is the lifecycle
    // contract's (`@/core/foundation-installation`); this authority owns only WHERE it lives — which is
    // the INSTALLATION root in every mode, so moving website material into a Spoke never moves a record.
    // The inner model module is imported rather than the barrel because this file is CLIENT-SAFE (see the
    // module note): the barrel would pull the release contract and the transitions into a client chunk, while the
    // model module's imports are type-only.
    operationalStateFile: `${root}/${INSTALLATION_OPERATIONAL_STATE_FILE_NAME}`,
    // Platform path: Next.js serves static files from `public/` only (see the module note).
    publicAssetsDirectory,
    runtimeAssetNamespaces,
  };
  return cachedPaths;
}
