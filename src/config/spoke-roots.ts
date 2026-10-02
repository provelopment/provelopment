/**
 * THE INSTALLATION'S SPOKE COLLECTION (FOUNDATION-MULTISITE-S3C1)
 * ==============================================================
 *
 * WHAT THIS ANSWERS, AND NOTHING ELSE
 * -----------------------------------
 *
 *     which Spokes belong to this Installation?
 *     what stable internal id addresses each one?
 *     where is each one authored?
 *
 * An Installation declares its Spokes in ONE authored manifest at its own root:
 *
 *     <InstallationRoot>/spokes.json     { "spokes": [ { "id": "...", "root": "spokes/..." } ] }
 *     <InstallationRoot>/spokes/…        the declared Spoke roots (the DEDICATED namespace)
 *
 * It deliberately authors NOTHING else — no hostname, no label, no locales, no assets, no
 * configuration facts. A Spoke's own identity data lives in that Spoke's `site.config.json`, and its
 * canonical hostname is DERIVED from that file's `site.url` in a LATER slice (S3D+); authoring it here
 * would create a second authority for one fact.
 *
 * THE NAMESPACE IS AN OWNERSHIP BOUNDARY
 * --------------------------------------
 * A declared Spoke root lives beneath `<InstallationRoot>/spokes/` — lexically AND physically. The
 * boundary is that CONTAINER, not merely the Installation root: a locator that resolves outside
 * `spokes/` (including one that leaves it through a link) is refused, so authored website material can
 * never be planted among the Installation's configuration, content or tooling. The ID stays
 * independent of the directory spelling: `spokes/foundation-web` may hold the Spoke `foundation`.
 *
 * LEGACY IS THE ABSENCE OF A MANIFEST
 * -----------------------------------
 *
 *   no `spokes.json`       LEGACY IMPLICIT: the Installation root IS the implicit Spoke root, and its
 *                          single Spoke carries the reserved `IMPLICIT_SPOKE_ID`. Nothing is authored,
 *                          nothing moves, and today's deployments are untouched.
 *   `spokes.json` present  EXPLICIT: the manifest's entries (1..*) are the Installation's Spokes.
 *   BOTH authored          REFUSED — never a precedence rule, never a silent migration.
 *   NEITHER authored       REFUSED — an Installation root must be authored one way.
 *
 * DIRECTORY PRESENCE IS INERT; A MANIFEST ENTRY IS AN ASSERTION
 * ------------------------------------------------------------
 * A directory under `spokes/` that the manifest does not reference creates nothing and changes no
 * mode: the manifest is the membership authority, exactly as capsule selection already probes a FILE
 * rather than a directory. Conversely an entry asserts that its root exists, is a directory, stays
 * INSIDE the Installation root and carries `site.config.json` — the root-level contract S3C1 needs for
 * safe root resolution, and no more. Loading that Spoke's configuration (its Sites, locales, Hubs,
 * content, dictionaries, assets) is S3D's business: S3C1 resolves AUTHORING ROOTS, not domain Spokes.
 *
 * ONE ROOT AUTHORITY, AND NOT YET WIRED IN
 * ----------------------------------------
 * The Installation root is an INPUT here — this module never calls `process.cwd()`, reads an
 * environment variable or selects a layout, so `./deployment-build.mjs` remains the ONE answer to
 * "where is the Installation?" and this is the nested answer to "what does it declare?". Nothing in
 * the application imports this module yet: today's build still expects a single root-level
 * `site.config.json`, so making an explicit Installation selectable is S3D's act (per-Spoke
 * configuration loading), not this one. Deliberately UNWIRED — proved by its tests.
 *
 * BUILD/SERVER-ONLY: it reads the filesystem, so it must never become reachable from a client chunk.
 * A `SpokeId` is an opaque identity and a root locator is separate data: the id is never a path and the
 * path is never the identity, so the two differ freely (`spokes/foundation-web` may hold the Spoke
 * `foundation`) — while the LOCATOR must still live in the dedicated `spokes/` namespace.
 */
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { IMPLICIT_SPOKE_ID, spokeCollectionIssues, type SpokeId } from "@/core/spoke";

import { DEPLOYMENT_CONFIG_FILE_NAME } from "./deployment-root";

/** The authored manifest an Installation may carry at its own root. */
export const INSTALLATION_SPOKE_COLLECTION_FILE_NAME = "spokes.json";

/**
 * The DEDICATED NAMESPACE every explicitly declared Spoke root lives in: `<InstallationRoot>/spokes/`.
 *
 * This is an architectural OWNERSHIP boundary, not a suggested directory name. A manifest locator must
 * be spelled beneath it (`spokes/…`) AND must resolve physically beneath it, so authored website
 * material can never be planted among the Installation's configuration, content or tooling.
 *
 * The id stays independent of the spelling (`{ "id": "foundation", "root": "spokes/foundation-web" }`
 * is valid), and membership still comes from the MANIFEST alone: a directory here that no entry names
 * is inert, and `spokes/` without `spokes.json` leaves the Installation in legacy mode.
 */
export const SPOKE_ROOTS_DIRECTORY_NAME = "spokes";

/**
 * ONE authored Spoke declaration. STRICT, and exactly these two leaves: membership and location.
 *
 * Identity semantics (non-blank, the reserved id, uniqueness) are NOT restated here — they belong to
 * the pure domain (`@/core/spoke`'s `spokeCollectionIssues`), exactly as Hub-membership semantics do
 * in S3B, so configuration and the domain cannot drift apart. This schema does STRUCTURAL typing only.
 */
const spokeDeclarationSchema = z.object({ id: z.string(), root: z.string() }).strict();

/** The manifest's structural contract: a strict object holding a Spokes array. */
export const installationSpokeCollectionSchema = z
  .object({ spokes: z.array(spokeDeclarationSchema) })
  .strict();

export type InstallationSpokeCollectionFile = z.infer<typeof installationSpokeCollectionSchema>;

/**
 * ONE resolved Spoke root: the authored identity and the ABSOLUTE directory it is authored in.
 *
 * Not a `Spoke` and not a domain descriptor — it carries no configuration, no locales, no hostname
 * and no Hubs, because none of those have been read yet.
 */
export interface SpokeRootDescriptor {
  readonly id: SpokeId;
  /** The resolved absolute directory, proven to be inside the Installation root. */
  readonly root: string;
}

/** How an Installation declares its Spokes: `legacy` (none declared) or `explicit` (a manifest). */
export type SpokeCollectionMode = "legacy" | "explicit";

/** The Installation's declared Spoke roots — 1..* descriptors, in authored manifest order. */
export interface InstallationSpokeRoots {
  readonly mode: SpokeCollectionMode;
  /** The resolved absolute Installation root this answer was made from. */
  readonly installationRoot: string;
  /** `<installationRoot>/spokes.json` when explicit; `null` in legacy mode. */
  readonly manifestFile: string | null;
  /** In authored manifest order; legacy mode yields exactly one, carrying `IMPLICIT_SPOKE_ID`. */
  readonly descriptors: readonly SpokeRootDescriptor[];
}

function renderIssues(issues: readonly string[]): string {
  return issues.map((issue) => `  - ${issue}`).join("\n");
}

/**
 * The lexical rules for an authored locator: relative, POSIX-style, free of `..`, and located BENEATH
 * the dedicated `spokes/` namespace — which is an ownership boundary, so the container itself is not a
 * Spoke root and a misspelled namespace is not a namespace.
 */
function locatorIssue(locator: string, where: string): string | null {
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
function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return !(relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative));
}

/**
 * Resolves the Spokes an Installation declares, or throws a descriptive, build-time-loud error.
 *
 * `installationRoot` is an INPUT: this function never discovers a root of its own (no `process.cwd()`,
 * no environment, no layout) — the Installation is already selected by the ONE build authority.
 */
export function resolveInstallationSpokeRoots(installationRoot: string): InstallationSpokeRoots {
  const root = path.resolve(installationRoot);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(
      `FOUNDATION-MULTISITE-S3C1: the Installation root "${root}" is not an existing directory.`,
    );
  }

  const manifestFile = path.join(root, INSTALLATION_SPOKE_COLLECTION_FILE_NAME);
  const legacyConfigFile = path.join(root, DEPLOYMENT_CONFIG_FILE_NAME);
  const hasManifest = existsSync(manifestFile);
  const hasLegacyConfig = existsSync(legacyConfigFile);

  if (hasManifest && hasLegacyConfig) {
    throw new Error(
      `FOUNDATION-MULTISITE-S3C1: the Installation root "${root}" is authored SIMULTANEOUSLY in both ` +
        `forms: it carries "${DEPLOYMENT_CONFIG_FILE_NAME}" (legacy implicit Spokes) and ` +
        `"${INSTALLATION_SPOKE_COLLECTION_FILE_NAME}" (an explicit Spoke collection). An Installation ` +
        `is authored one way or the other: move the website material into its declared Spoke root and ` +
        `remove "${DEPLOYMENT_CONFIG_FILE_NAME}", or remove ` +
        `"${INSTALLATION_SPOKE_COLLECTION_FILE_NAME}". No precedence rule exists and nothing is migrated.`,
    );
  }

  if (!hasManifest && !hasLegacyConfig) {
    throw new Error(
      `FOUNDATION-MULTISITE-S3C1: the Installation root "${root}" is authored NEITHER way: it carries ` +
        `neither "${DEPLOYMENT_CONFIG_FILE_NAME}" (legacy implicit Spokes) nor ` +
        `"${INSTALLATION_SPOKE_COLLECTION_FILE_NAME}" (an explicit Spoke collection).`,
    );
  }

  if (!hasManifest) {
    return {
      mode: "legacy",
      installationRoot: root,
      manifestFile: null,
      descriptors: [{ id: IMPLICIT_SPOKE_ID, root }],
    };
  }

  return resolveExplicitSpokes(root, manifestFile);
}

function resolveExplicitSpokes(root: string, manifestFile: string): InstallationSpokeRoots {
  const invalid = (issues: readonly string[]): Error =>
    new Error(`Invalid Installation Spoke collection (${manifestFile}):\n${renderIssues(issues)}`);

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(manifestFile, "utf8")) as unknown;
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
  const issues: string[] = [...spokeCollectionIssues(declarations.map((entry) => entry.id))];

  const realInstallationRoot = realpathSync(root);
  const seen = new Map<string, { index: number; locator: string }>();
  const descriptors: SpokeRootDescriptor[] = [];

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
    if (!isInside(realInstallationRoot, realResolved)) {
      issues.push(
        `${where}: root "${entry.root}" resolves outside the Installation root — a Spoke root must ` +
          "be authored inside it",
      );
      return;
    }
    const realSpokeContainer = realpathSync(path.join(root, SPOKE_ROOTS_DIRECTORY_NAME));
    if (!isInside(realSpokeContainer, realResolved)) {
      issues.push(
        `${where}: root "${entry.root}" resolves outside the dedicated ` +
          `"${SPOKE_ROOTS_DIRECTORY_NAME}/" namespace`,
      );
      return;
    }
    if (!existsSync(path.join(resolved, DEPLOYMENT_CONFIG_FILE_NAME))) {
      issues.push(`${where}: root "${entry.root}" carries no "${DEPLOYMENT_CONFIG_FILE_NAME}"`);
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

    descriptors.push({ id: entry.id, root: resolved });
  });

  if (issues.length > 0) throw invalid(issues);

  return { mode: "explicit", installationRoot: root, manifestFile, descriptors };
}
