/**
 * THE INSTALLATION'S DECLARED SPOKE ROOTS — ONE AUTHORITY (FOUNDATION-MULTISITE-S3E1C/S3F1)
 * =======================================================================================
 *
 * ONE question, answered once for every consumer that must answer it:
 *
 *     given an Installation root, which Spokes does it declare, and where is each one authored?
 *
 * An Installation declares its Spokes in ONE authored manifest at its own root:
 *
 *     <InstallationRoot>/spokes.json     { "spokes": [ { "id": "…", "root": "spokes/…" } ] }
 *     <InstallationRoot>/spokes/…        the declared Spoke roots (the DEDICATED namespace)
 *
 * LEGACY IS THE ABSENCE OF A MANIFEST
 * -----------------------------------
 *
 *   no `spokes.json`       LEGACY IMPLICIT: the Installation root IS the implicit Spoke root, and its
 *                          single Spoke carries the reserved `IMPLICIT_SPOKE_ID`.
 *   `spokes.json` present  EXPLICIT: the manifest's entries (1..*) are the Installation's Spokes.
 *   BOTH authored          REFUSED — never a precedence rule, never a silent migration.
 *   NEITHER authored       REFUSED — an Installation root must be authored one way.
 *
 * WHY THIS MODULE IS PLAIN ESM, AND WHY IT EXISTS AT ALL
 * ------------------------------------------------------
 * The TypeScript authority (`./spoke-roots.ts`) and the BUILD selection seam
 * (`./deployment-build.mjs`) must agree about which authored roots exist — a build that selected a root the
 * configuration/domain layer would refuse could serve material the platform considers invalid. TypeScript
 * cannot be executed by the plain-Node seam, so the CONTRACT lives here in ONE implementation that both
 * consume, rather than in two that drift. This is the smallest such seam: declaration parsing, the identity
 * rules (shared with the domain, `../core/spoke/spoke-id.mjs`), the locator rules, and physical root
 * containment. It composes no Spoke, builds no Hub, resolves no Site, and knows nothing about hostnames,
 * Sites, dictionaries, pages, assets or runtime namespaces.
 *
 * IDENTITY SEMANTICS ARE NOT RESTATED HERE
 * ----------------------------------------
 * Non-blank ids, the reserved implicit identity and duplicate ids come from the pure domain module, which
 * this one imports — so the configuration layer, the build seam and the domain cannot disagree about what
 * an acceptable id is.
 *
 * SERVER/BUILD ONLY: this module reads the filesystem.
 */
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

import { IMPLICIT_SPOKE_ID, spokeCollectionIssues } from "../core/spoke/spoke-id.mjs";

/** The authored manifest an Installation may carry at its own root. */
export const INSTALLATION_SPOKE_COLLECTION_FILE_NAME = "spokes.json";

/**
 * The DEDICATED NAMESPACE every explicitly declared Spoke root lives in: `<InstallationRoot>/spokes/`.
 *
 * An architectural OWNERSHIP boundary, not a suggested directory name: a manifest locator must be spelled
 * beneath it AND must resolve physically beneath it, so authored website material can never be planted
 * among the Installation's configuration, content or tooling. The id stays independent of the spelling
 * (`{ "id": "foundation", "root": "spokes/foundation-web" }` is valid), and membership comes from the
 * MANIFEST alone: a directory here that no entry names is inert.
 */
export const SPOKE_ROOTS_DIRECTORY_NAME = "spokes";

/** The authored configuration file a declared Spoke root must carry (the root-level contract). */
export const SPOKE_CONFIG_FILE_NAME = "site.config.json";

/**
 * THE MANIFEST'S STRUCTURAL CONTRACT — STRICT, and exactly the two leaves a declaration may author.
 *
 * Identity semantics (non-blank, the reserved id, uniqueness) are NOT restated here — they belong to the
 * pure domain (`../core/spoke/spoke-id.mjs`), so configuration and the domain cannot drift apart. This
 * validator does STRUCTURAL typing only, exactly as the zod schema it replaces did.
 *
 * WHY IT IS HAND-ROLLED, NOT ZOD: this seam is loaded by the platform's own Node tooling, and a
 * RELEASE must run that tooling in an installation with NO third-party packages at all
 * (`tests/integration/foundation-installation-bootstrap.test.ts` proves the self-containment). The
 * platform's runtime `zod` dependency is therefore not available to it, so the seam keeps the same
 * STRICT shape and the same message vocabulary in a few explicit checks — one implementation, no
 * package. The `{ success, data, error: { issues } }` surface is the minimal one its callers use (this
 * module's own resolver and the S3C1 acceptance suite), with `issues` shaped like a zod issue list.
 *
 * @type {{ safeParse: (raw: unknown) => { success: true, data: { spokes: { id: string, root: string }[] } } |
 *   { success: false, error: { issues: { path: (string|number)[], message: string }[] } } }}
 */
export const installationSpokeCollectionSchema = {
  safeParse(raw) {
    /** @type {{ path: (string|number)[], message: string }[]} */
    const issues = [];
    const unrecognized = (value, allowed, at) => {
      for (const key of Object.keys(value)) {
        if (!allowed.includes(key)) issues.push({ path: at, message: `Unrecognized key: "${key}"` });
      }
    };

    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return {
        success: false,
        error: { issues: [{ path: [], message: "Invalid input: expected object" }] },
      };
    }

    unrecognized(raw, ["spokes"], []);
    if (!Array.isArray(raw.spokes)) {
      issues.push({ path: ["spokes"], message: "Invalid input: expected array" });
      return { success: false, error: { issues } };
    }

    /** @type {{ id: string, root: string }[]} */
    const declared = [];
    raw.spokes.forEach((entry, index) => {
      const at = ["spokes", index];
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        issues.push({ path: at, message: "Invalid input: expected object" });
        return;
      }
      unrecognized(entry, ["id", "root"], at);
      const idIsString = typeof entry.id === "string";
      const rootIsString = typeof entry.root === "string";
      if (!idIsString) issues.push({ path: [...at, "id"], message: "Invalid input: expected string" });
      if (!rootIsString) issues.push({ path: [...at, "root"], message: "Invalid input: expected string" });
      if (idIsString && rootIsString) declared.push({ id: entry.id, root: entry.root });
    });

    return issues.length > 0
      ? { success: false, error: { issues } }
      : { success: true, data: { spokes: declared } };
  },
};

function renderIssues(issues) {
  return issues.map((issue) => `  - ${issue}`).join("\n");
}

/**
 * The lexical rules for an authored locator: relative, POSIX-style, free of `..`, and located BENEATH the
 * dedicated `spokes/` namespace — which is an ownership boundary, so the container itself is not a Spoke
 * root and a misspelled namespace is not a namespace.
 *
 * @param {string} locator the authored locator
 * @param {string} where the message's subject
 * @returns {string|null} the issue, or `null` when the locator is acceptable
 */
function locatorIssue(locator, where) {
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
      `${where}: root "${locator}" must name a Spoke root INSIDE ` +
      `"${SPOKE_ROOTS_DIRECTORY_NAME}/" — the namespace itself is not a Spoke root`
    );
  }
  return null;
}

/** Is `target` inside `root` (both already REAL/resolved) — the ONE containment rule. */
function isInside(root, target) {
  const relative = path.relative(root, target);
  return !(relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative));
}

/**
 * The Spokes ONE Installation root declares, or a descriptive, build-time-loud failure.
 *
 * `installationRoot` is an INPUT: this function never discovers a root of its own (no `process.cwd()`, no
 * environment, no layout) — the Installation is already selected by the ONE build authority.
 *
 * @param {string} installationRoot the Installation root to describe
 * @returns {{ mode: "legacy"|"explicit", installationRoot: string, manifestFile: string|null,
 *   declarations: { id: string, locator: string|null, root: string }[] }}
 */
export function resolveSpokeDeclarations(installationRoot) {
  const root = path.resolve(installationRoot);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(
      `FOUNDATION-MULTISITE-S3C1: the Installation root "${root}" is not an existing directory.`,
    );
  }

  const manifestFile = path.join(root, INSTALLATION_SPOKE_COLLECTION_FILE_NAME);
  const configFile = path.join(root, SPOKE_CONFIG_FILE_NAME);
  const hasManifest = existsSync(manifestFile);
  const hasConfig = existsSync(configFile);

  if (hasManifest && hasConfig) {
    throw new Error(
      `FOUNDATION-MULTISITE-S3C1: the Installation root "${root}" is authored SIMULTANEOUSLY in both ` +
        `forms: it carries "${SPOKE_CONFIG_FILE_NAME}" (legacy implicit Spokes) and ` +
        `"${INSTALLATION_SPOKE_COLLECTION_FILE_NAME}" (an explicit Spoke collection). An Installation ` +
        `is authored one way or the other: move the website material into its declared Spoke root and ` +
        `remove "${SPOKE_CONFIG_FILE_NAME}", or remove ` +
        `"${INSTALLATION_SPOKE_COLLECTION_FILE_NAME}". No precedence rule exists and nothing is migrated.`,
    );
  }

  if (!hasManifest && !hasConfig) {
    throw new Error(
      `FOUNDATION-MULTISITE-S3C1: the Installation root "${root}" is authored NEITHER way: it carries ` +
        `neither "${SPOKE_CONFIG_FILE_NAME}" (legacy implicit Spokes) nor ` +
        `"${INSTALLATION_SPOKE_COLLECTION_FILE_NAME}" (an explicit Spoke collection). A build must ` +
        "resolve exactly one deployment; nothing falls back silently.",
    );
  }

  if (!hasManifest) {
    return {
      mode: "legacy",
      installationRoot: root,
      manifestFile: null,
      declarations: [{ id: IMPLICIT_SPOKE_ID, locator: null, root }],
    };
  }

  return resolveExplicitSpokeDeclarations(root, manifestFile);
}

/**
 * Every Spoke an EXPLICIT manifest declares, resolved and validated — or an itemised failure naming each
 * unacceptable entry. The manifest is an ASSERTION about the Installation: every entry must be true.
 *
 * @param {string} root the resolved Installation root
 * @param {string} manifestFile the manifest's absolute path
 * @returns {{ mode: "explicit", installationRoot: string, manifestFile: string,
 *   declarations: { id: string, locator: string, root: string }[] }}
 */
function resolveExplicitSpokeDeclarations(root, manifestFile) {
  const invalid = (issues) =>
    new Error(`Invalid Installation Spoke collection (${manifestFile}):\n${renderIssues(issues)}`);

  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(readFileSync(manifestFile, "utf8"));
  } catch (error) {
    throw new Error(
      `FOUNDATION-MULTISITE-S3C1: "${manifestFile}" is not valid JSON: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const parsed = installationSpokeCollectionSchema.safeParse(raw);
  if (!parsed.success) {
    throw invalid(
      parsed.error.issues.map((issue) => {
        const where = issue.path.join(".") || "(root)";
        return `${where}: ${issue.message}`;
      }),
    );
  }

  const declarations = parsed.data.spokes;
  // IDENTITY semantics come from the pure domain — never restated here.
  const issues = [...spokeCollectionIssues(declarations.map((entry) => entry.id))];

  const realRoot = realpathSync(root);
  /** @type {Map<string, { index: number, locator: string }>} */
  const seen = new Map();
  /** @type {{ id: string, locator: string, root: string }[]} */
  const declared = [];

  declarations.forEach((entry, index) => {
    const where = `Spoke #${index + 1} ("${entry.id}")`;
    const lexical = locatorIssue(entry.root, where);
    if (lexical !== null) {
      issues.push(lexical);
      return;
    }

    const resolved = path.resolve(root, entry.root);
    if (!existsSync(resolved)) {
      issues.push(`${where}: root "${entry.root}" does not exist`);
      return;
    }
    if (!statSync(resolved).isDirectory()) {
      issues.push(`${where}: root "${entry.root}" is not a directory`);
      return;
    }

    // PHYSICAL containment, in TWO steps: the Installation root must not be escaped at all, and the
    // boundary that actually owns Spoke roots is the DEDICATED CONTAINER — so the container itself may
    // not be a link out, and a link inside `spokes/` may not reach material elsewhere in the
    // Installation.
    const realResolved = realpathSync(resolved);
    if (!isInside(realRoot, realResolved)) {
      issues.push(
        `${where}: root "${entry.root}" resolves outside the Installation root — a Spoke root must ` +
          "be authored inside it",
      );
      return;
    }
    const realContainer = realpathSync(path.join(root, SPOKE_ROOTS_DIRECTORY_NAME));
    if (!isInside(realContainer, realResolved)) {
      issues.push(
        `${where}: root "${entry.root}" resolves outside the dedicated ` +
          `"${SPOKE_ROOTS_DIRECTORY_NAME}/" namespace`,
      );
      return;
    }
    if (!existsSync(path.join(resolved, SPOKE_CONFIG_FILE_NAME))) {
      issues.push(`${where}: root "${entry.root}" carries no "${SPOKE_CONFIG_FILE_NAME}"`);
      return;
    }

    const previous = seen.get(realResolved);
    if (previous !== undefined) {
      issues.push(
        `${where}: root "${entry.root}" resolves to the same directory as Spoke #${previous.index} ` +
          `("${previous.locator}") — two Spokes cannot share one authored root`,
      );
      return;
    }
    seen.set(realResolved, { index: index + 1, locator: entry.root });

    declared.push({ id: entry.id, locator: entry.root, root: resolved });
  });

  if (issues.length > 0) throw invalid(issues);

  return { mode: "explicit", installationRoot: root, manifestFile, declarations: declared };
}
