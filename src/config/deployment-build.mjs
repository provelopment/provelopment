/**
 * THE DEPLOYMENT THE BUILD SELECTS (FOUNDATION-DEPLOYMENT-ISO-B1C)
 * ===============================================================
 *
 * Build/config-harness ONLY. `next.config.ts` and `vitest.config.mts` import this module; NO
 * application module may (the guard in `tests/architecture/deployment-root-guard.test.ts` proves it),
 * because it touches `node:fs` and would drag a filesystem import into a client chunk.
 *
 * It is deliberately the ONE place that answers "which deployment is this build for?" — and the
 * answer is then INLINED (`next.config.ts` → Next's `env`; `vitest.config.mts` → `test.env`) so that:
 *
 *   · `@/config/deployment-root` stays pure and client-safe (no `node:fs`, no `process.cwd()`);
 *   · the loader validates an already-selected configuration rather than reaching for a file;
 *   · and NO application module statically imports `<repo>/site.config.json`, so moving the
 *     deployment into a capsule (B2) cannot break module or build resolution.
 *
 * ISO-B1 resolved repository mode through a static `import` of the root config. That was a
 * compile-time dependency on the file's physical location: with the root `site.config.json` absent,
 * `tsc` failed with TS2307 and Turbopack with "Module not found". This module removes it — the root
 * config is now read HERE, at configuration time, like the capsule's.
 *
 * PLAIN ESM ON PURPOSE — ONE MODULE, THREE RUNTIMES (FOUNDATION-DEPLOYMENT-ISO-H1C)
 * ------------------------------------------------------------------------------
 * The authority is consumed by the build (`next.config.ts`), the test run (`vitest.config.mts`) and
 * the Foundation's own Node tooling (`scripts/sync-runtime-assets.mjs`), and only two of those three
 * run through a TypeScript compiler. A plain `.mjs` module is therefore the smallest stable boundary:
 *
 *   · Node executes it directly — no `--experimental-strip-types`, no loader or warning suppression;
 *   · Next and Vite import it like any other ES module (both already consume ESM);
 *   · TypeScript still sees the whole contract below, because the JSDoc types are part of the file
 *     and `tsc --noEmit` checks every call site (`next.config.ts`, `vitest.config.mts`, the guard).
 *
 * Its sibling `deployment-root.ts` stays TypeScript: that one IS compiled into application bundles and
 * is what the JSDoc `DeploymentLayout` below references — a type-only reference, erased at runtime.
 *
 * TWO AUTHORING MODES, ONE SELECTION (FOUNDATION-MULTISITE-S3F1)
 * --------------------------------------------------------------
 * An Installation is authored ONE of two ways, and this module is the ONE place that decides which:
 *
 *   legacy    `<root>/site.config.json`                the INSTALLATION ROOT is the one implicit Spoke
 *                                                      (every deployment today), and the runtime
 *                                                      resource paths are the root's own.
 *   explicit  `<root>/spokes.json`                     the root DECLARES its Spokes; each one is
 *                                                      authored beneath `spokes/` and owns its own
 *                                                      `site.config.json`, configuration, content and
 *                                                      artwork.
 *
 *   BOTH authored  REFUSED (never a precedence rule).  NEITHER authored  REFUSED.
 *
 * S3F1 ACTIVATES EXACTLY ONE SPOKE, AND INVENTS NO DEFAULT
 * -------------------------------------------------------
 * An explicit Installation whose manifest declares MORE THAN ONE Spoke is REFUSED here, loudly: the
 * running Foundation serves one Spoke's Sites through the existing single-runtime model, so running a
 * multi-Spoke Installation needs the per-request Spoke selection S3F2 owns. There is deliberately NO
 * "first Spoke", no "default Spoke" and no manifest-order rule — the activation is legitimate because
 * the CARDINALITY is one, not because something chose for us.
 *
 * WHAT THIS MODULE DOES NOT DO: it resolves DECLARED ROOTS (the same question the TypeScript authority
 * `./spoke-roots` answers for one manifest) and reads the sole Spoke's configuration so the build can
 * INLINE it. It composes no Spoke, builds no Hub, resolves no Site and validates no cross-Spoke rule —
 * `./spoke-roots`, `./spoke-config` and `./spoke-composition` stay the authorities for those, and
 * `tests/unit/spoke-installation-selection.test.ts` proves the two answers agree on a real Installation.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { runtimeSegmentForSpokeId } from "./spoke-runtime-segment.mjs";

/**
 * The layouts a build may select. Type-only reference to the client-safe authority's union.
 * @typedef {import("./deployment-root").DeploymentLayout} DeploymentLayout
 */

/**
 * How an Installation is authored: a legacy implicit Spoke, or an explicit declared collection.
 * @typedef {"legacy" | "explicit"} InstallationAuthoringMode
 */

/**
 * ONE declared Spoke, at SELECTION level: its identity, where it is authored, and the runtime token
 * its own namespace is built from. No configuration, no Sites, no Hubs — those are later stages' facts.
 * @typedef {object} DeclaredSpoke
 * @property {string} id the manifest's authored identity
 * @property {string} relativeRoot the authored root, POSIX-relative to the Installation root
 * @property {string} root the resolved absolute root
 * @property {string} segment `runtimeSegmentForSpokeId(id)` — the Spoke's runtime namespace token
 */

/**
 * The deployment a build resolved.
 * @typedef {object} ResolvedDeployment
 * @property {DeploymentLayout} layout the layout the build selected
 * @property {InstallationAuthoringMode} mode how the Installation is authored
 * @property {string} root the directory that owns the INSTALLATION: the capsule, the override root, or the repository
 * @property {string} resourceRoot the directory that owns the DEPLOYMENT'S RESOURCES: the root itself in
 *   legacy mode, the sole Spoke's root in explicit mode. Dictionaries, authored pages and artwork
 *   sources are resolved from here, while installation lifecycle records stay at `root`.
 * @property {string} siteConfigFile the configuration file the build inlined
 * @property {string} config the deployment's raw configuration TEXT, ready to inline into the build
 * @property {DeclaredSpoke|null} spoke the SOLE declared Spoke in explicit mode; `null` in legacy mode
 */

/** The environment names the build inlines for runtime code (`./deployment-root`). */
export const DEPLOYMENT_LAYOUT_ENV = "FOUNDATION_DEPLOYMENT_LAYOUT";
export const DEPLOYMENT_CONFIG_ENV = "FOUNDATION_DEPLOYMENT_CONFIG";
export const DEPLOYMENT_ROOT_ENV = "FOUNDATION_DEPLOYMENT_ROOT";
/**
 * S3F1 — the AUTHORING MODE the build resolved (`legacy` | `explicit`), the sole Spoke's root (relative
 * to the Installation root) and its runtime segment. The runtime authority reads these three so a
 * Spoke's resources can be served without any application module resolving a manifest.
 */
export const DEPLOYMENT_MODE_ENV = "FOUNDATION_DEPLOYMENT_MODE";
export const DEPLOYMENT_SPOKE_ROOT_ENV = "FOUNDATION_DEPLOYMENT_SPOKE_ROOT";
export const DEPLOYMENT_SPOKE_SEGMENT_ENV = "FOUNDATION_DEPLOYMENT_SPOKE_SEGMENT";

/** The authored configuration file a deployment root — and a declared Spoke root — must carry. */
export const DEPLOYMENT_CONFIG_FILE_NAME = "site.config.json";

/** The manifest an Installation carries when it DECLARES its Spokes (the explicit authoring form). */
export const INSTALLATION_SPOKE_COLLECTION_FILE_NAME = "spokes.json";

/**
 * The capsule directory the selector probes: `<repositoryRoot>/deployment`.
 *
 * Exported because the spelling belongs HERE and nowhere else: a caller that needs to know where a
 * deployment's capsule WOULD live (a test guard protecting it from writes, for instance) asks this
 * module rather than composing `…/deployment` for itself. ISO-B3C2A fixes the set of modules that may
 * name the capsule directory; this keeps that set at two.
 *
 * @param {string} [repositoryRoot] the repository the capsule would live in
 * @returns {string} the absolute capsule directory
 */
export function capsuleDirectory(repositoryRoot = process.cwd()) {
  return path.join(repositoryRoot, "deployment");
}

/**
 * The dedicated namespace every explicitly declared Spoke root must live in.
 *
 * The SAME architectural boundary the TypeScript authority owns (`./spoke-roots`'s
 * `SPOKE_ROOTS_DIRECTORY_NAME`): restated here ONLY because a plain-ESM module cannot import a
 * TypeScript one, and the two must agree — a manifest this seam accepts and the authority refuses (or
 * the other way around) would let the build serve material the composition layer rejects.
 * `tests/unit/spoke-installation-selection.test.ts` proves the agreement on real manifests.
 */
export const SPOKE_ROOTS_DIRECTORY_NAME = "spokes";

/** Is `target` inside `root`, lexically (both absolute)? The ONE containment rule this seam needs. */
function isInside(root, target) {
  const relative = path.relative(root, target);
  return !(relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative));
}

/**
 * The lexical contract ONE authored Spoke locator must satisfy, or the reason it does not: root
 * relative, POSIX, free of `..`, and located BENEATH the dedicated `spokes/` namespace. The same rules
 * S3C1 enforces, restated so this seam cannot select a root the authority would refuse.
 *
 * @param {string} locator the authored root
 * @param {string} where the message's subject
 * @returns {string|null} the issue, or `null` when the locator is acceptable
 */
function spokeLocatorIssue(locator, where) {
  if (locator.trim() === "") return `${where}: root must not be empty`;
  if (path.isAbsolute(locator) || locator.startsWith("/") || /^[A-Za-z]:/.test(locator)) {
    return `${where}: root "${locator}" must be root-relative, not absolute`;
  }
  if (locator.includes("\\")) {
    return `${where}: root "${locator}" must use POSIX "/" separators`;
  }
  const segments = locator.split("/");
  if (segments.includes("..")) {
    return `${where}: root "${locator}" must not contain a ".." segment`;
  }
  if (segments[0] !== SPOKE_ROOTS_DIRECTORY_NAME) {
    return (
      `${where}: root "${locator}" must live beneath the dedicated ` +
      `"${SPOKE_ROOTS_DIRECTORY_NAME}/" namespace`
    );
  }
  if (segments.slice(1).every((segment) => segment === "")) {
    return (
      `${where}: root "${locator}" must name a Spoke root INSIDE "${SPOKE_ROOTS_DIRECTORY_NAME}/"`
    );
  }
  return null;
}

/**
 * The Spokes ONE Installation root declares, WITHOUT deciding how many the RUNTIME may activate.
 *
 *   no `spokes.json`       legacy   → the root is the one implicit Spoke; nothing is declared here
 *   `spokes.json` present  explicit → its entries, resolved and lexically validated (1..*)
 *   BOTH / NEITHER         REFUSED, loudly — an Installation is authored exactly one way
 *
 * SELECTION-level questions only: identity, location, and the runtime segment each identity owns. It
 * reads no Spoke configuration, composes no Spoke and enforces no cardinality:
 * `resolveDeploymentForBuild` applies S3F1's "exactly one" rule, so plan-building tooling (which must
 * describe N Spokes) can ask this question without being refused.
 *
 * @param {string} installationRoot the Installation root to describe
 * @returns {{ mode: InstallationAuthoringMode, manifestFile: string|null, spokes: DeclaredSpoke[] }}
 */
export function installationSpokes(installationRoot) {
  const resolved = path.resolve(installationRoot);
  const manifestFile = path.join(resolved, INSTALLATION_SPOKE_COLLECTION_FILE_NAME);
  const configFile = path.join(resolved, DEPLOYMENT_CONFIG_FILE_NAME);
  const hasManifest = existsSync(manifestFile);
  const hasConfig = existsSync(configFile);

  if (hasManifest && hasConfig) {
    throw new Error(
      `FOUNDATION-MULTISITE-S3F1: the Installation root "${resolved}" is authored SIMULTANEOUSLY in ` +
        `both forms: it carries "${DEPLOYMENT_CONFIG_FILE_NAME}" (a legacy implicit Spoke) and ` +
        `"${INSTALLATION_SPOKE_COLLECTION_FILE_NAME}" (an explicit Spoke collection). An Installation ` +
        "is authored one way or the other; no precedence rule exists and nothing is migrated implicitly.",
    );
  }

  if (!hasManifest && !hasConfig) {
    throw new Error(
      `FOUNDATION-DEPLOYMENT-ISO-B1C: the deployment root "${resolved}" has no ` +
        `${DEPLOYMENT_CONFIG_FILE_NAME} and no ${INSTALLATION_SPOKE_COLLECTION_FILE_NAME}. A build ` +
        "must resolve exactly one deployment; nothing falls back silently.",
    );
  }

  if (!hasManifest) return { mode: "legacy", manifestFile: null, spokes: [] };

  return resolveExplicitSpokeDeclarations(resolved, manifestFile);
}

/**
 * Every Spoke an EXPLICIT manifest declares, resolved and lexically validated — or a loud, itemised
 * failure naming each unacceptable entry.
 *
 * @param {string} root the resolved Installation root
 * @param {string} manifestFile the manifest's absolute path
 * @returns {{ mode: InstallationAuthoringMode, manifestFile: string, spokes: DeclaredSpoke[] }}
 */
function resolveExplicitSpokeDeclarations(root, manifestFile) {
  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(readFileSync(manifestFile, "utf8"));
  } catch (error) {
    throw new Error(
      `FOUNDATION-MULTISITE-S3F1: "${manifestFile}" is not valid JSON: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const container = /** @type {{ spokes?: unknown }} */ (raw);
  if (container === null || typeof container !== "object" || !Array.isArray(container.spokes)) {
    throw new Error(
      `FOUNDATION-MULTISITE-S3F1: "${manifestFile}" must be an object holding a "spokes" array.`,
    );
  }

  /** @type {string[]} */
  const issues = [];
  /** @type {DeclaredSpoke[]} */
  const spokes = [];
  /** @type {Map<string, string>} */
  const rootOwners = new Map();

  container.spokes.forEach((entry, index) => {
    const where = `Spoke #${index + 1}`;
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      issues.push(`${where} is not an object`);
      return;
    }
    const declaration = /** @type {{ id?: unknown, root?: unknown }} */ (entry);
    const unknown = Object.keys(declaration).filter((key) => key !== "id" && key !== "root");
    if (unknown.length > 0) {
      issues.push(`${where} carries unknown field(s): ${unknown.join(", ")}`);
      return;
    }

    const id = declaration.id;
    if (typeof id !== "string" || id.trim() === "") {
      issues.push(`${where} has no non-blank string "id"`);
      return;
    }
    const locator = declaration.root;
    if (typeof locator !== "string") {
      issues.push(`${where} ("${id}") has no string "root"`);
      return;
    }

    const lexical = spokeLocatorIssue(locator, `${where} ("${id}")`);
    if (lexical !== null) {
      issues.push(lexical);
      return;
    }

    const absolute = path.resolve(root, locator);
    if (!isInside(root, absolute)) {
      issues.push(`${where} ("${id}"): root "${locator}" resolves outside the Installation root`);
      return;
    }
    if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
      issues.push(`${where} ("${id}"): root "${locator}" is not an existing directory`);
      return;
    }
    if (!existsSync(path.join(absolute, DEPLOYMENT_CONFIG_FILE_NAME))) {
      issues.push(`${where} ("${id}"): root "${locator}" carries no ${DEPLOYMENT_CONFIG_FILE_NAME}`);
      return;
    }
    const owner = rootOwners.get(absolute);
    if (owner !== undefined) {
      issues.push(
        `${where} ("${id}"): root "${locator}" resolves to the same directory as "${owner}" — ` +
          "two Spokes cannot share one authored root",
      );
      return;
    }
    rootOwners.set(absolute, id);

    spokes.push({ id, relativeRoot: locator, root: absolute, segment: runtimeSegmentForSpokeId(id) });
  });

  if (issues.length > 0) {
    throw new Error(
      `Invalid Installation Spoke collection (${manifestFile}):\n` +
        `${issues.map((issue) => `  - ${issue}`).join("\n")}`,
    );
  }

  if (spokes.length === 0) {
    throw new Error(
      `FOUNDATION-MULTISITE-S3F1: "${manifestFile}" declares NO Spoke. An explicit Spoke collection ` +
        'needs at least one Spoke; "no collection" is the LEGACY form, not an empty explicit one.',
    );
  }

  return { mode: "explicit", manifestFile, spokes };
}

/**
 * Resolves the deployment this build serves.
 *
 *   override    `FOUNDATION_DEPLOYMENT_ROOT` is set (dev/test) → that directory owns it
 *   capsule     `<repo>/deployment/` is authored (either form) → the capsule owns it
 *   repository  otherwise → `<repo>` itself, the CURRENT layout
 *
 * …and then, inside whichever root was selected, the AUTHORING MODE decides what the runtime reads:
 *
 *   legacy      the root's own `site.config.json` and its own resource trees
 *   explicit    the SOLE declared Spoke's `site.config.json` and its resource trees, while the
 *               INSTALLATION root keeps its own lifecycle records
 *
 * An explicit Installation declaring 2+ Spokes is REFUSED: S3F1 activates exactly one, and there is no
 * default, no first and no manifest-order rule. A missing configuration is a LOUD failure — the build
 * must never silently fall back to a different deployment than the one selected.
 *
 * @param {Record<string, string | undefined>} [environment] the environment the build reads
 * @param {string} [repositoryRoot] the repository the deployment is resolved inside
 * @returns {ResolvedDeployment}
 */
export function resolveDeploymentForBuild(environment = process.env, repositoryRoot = process.cwd()) {
  const override = environment[DEPLOYMENT_ROOT_ENV]?.trim();
  const capsuleRoot = capsuleDirectory(repositoryRoot);
  const capsuleAuthored =
    existsSync(path.join(capsuleRoot, DEPLOYMENT_CONFIG_FILE_NAME)) ||
    existsSync(path.join(capsuleRoot, INSTALLATION_SPOKE_COLLECTION_FILE_NAME));

  /** @type {DeploymentLayout} */
  const layout =
    override !== undefined && override !== ""
      ? "override"
      : capsuleAuthored
        ? "capsule"
        : "repository";

  const root =
    layout === "override"
      ? path.isAbsolute(override)
        ? override
        : path.resolve(repositoryRoot, override)
      : layout === "capsule"
        ? capsuleRoot
        : repositoryRoot;

  const authoring = installationSpokes(root);

  if (authoring.mode === "legacy") {
    const siteConfigFile = path.join(root, DEPLOYMENT_CONFIG_FILE_NAME);
    return {
      layout,
      mode: "legacy",
      root,
      resourceRoot: root,
      siteConfigFile,
      config: readFileSync(siteConfigFile, "utf8"),
      spoke: null,
    };
  }

  const declared = authoring.spokes;
  if (declared.length !== 1) {
    throw new Error(
      `FOUNDATION-MULTISITE-S3F1: the explicit Installation at "${root}" declares ` +
        `${declared.length} Spokes (${declared.map((spoke) => `"${spoke.id}"`).join(", ")}). This ` +
        "Foundation serves EXACTLY ONE Spoke, so a multi-Spoke Installation is refused rather than " +
        "guessed at: there is no default Spoke and no manifest-order rule, and selecting a Spoke per " +
        "request (hostname dispatch) is S3F2's work. Reduce the manifest to one Spoke to run it.",
    );
  }

  const [spoke] = declared;
  const siteConfigFile = path.join(spoke.root, DEPLOYMENT_CONFIG_FILE_NAME);
  return {
    layout,
    mode: "explicit",
    root,
    resourceRoot: spoke.root,
    siteConfigFile,
    config: readFileSync(siteConfigFile, "utf8"),
    spoke,
  };
}

/**
 * The `env`/`test.env` pairs that carry the selected deployment into the build and its tests.
 *
 * The runtime authority (`./deployment-root`) reads these and nothing else, so a Spoke's resources are
 * served without any application module resolving a manifest: the build resolved it ONCE, here.
 *
 * The mode keys are ALWAYS published (empty for a legacy Installation), so a test process that switches
 * between a synthetic legacy deployment and an explicit one cannot inherit a stale answer.
 *
 * @param {ResolvedDeployment} resolved the resolved deployment
 * @returns {Record<string, string>}
 */
export function deploymentEnvironment(resolved) {
  return {
    [DEPLOYMENT_LAYOUT_ENV]: resolved.layout,
    [DEPLOYMENT_MODE_ENV]: resolved.mode,
    [DEPLOYMENT_CONFIG_ENV]: resolved.config,
    [DEPLOYMENT_SPOKE_ROOT_ENV]: resolved.spoke?.relativeRoot ?? "",
    [DEPLOYMENT_SPOKE_SEGMENT_ENV]: resolved.spoke?.segment ?? "",
  };
}
