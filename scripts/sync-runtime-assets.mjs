#!/usr/bin/env node
/**
 * RUNTIME ASSET MIRROR — the ONE deterministic relationship between the
 * authoritative SOURCE asset tree (`content/assets/**`) and the runtime delivery
 * directory (`public/assets/**`).
 *
 * WHY THIS EXISTS
 * ---------------
 * Next.js serves static files from `public/` only, so every graphic the running
 * site fetches must exist as a real file under `public/assets/`. The Foundation
 * therefore ships the artwork TWICE by necessity — but never as two independent
 * authorities:
 *
 *   <deployment>/content/assets/**  →  the SOURCE OF TRUTH: the ONE place a human adds or
 *                           replaces authored site artwork, beside the rest of the
 *                           site's content. It belongs to the SELECTED DEPLOYMENT,
 *                           so this script resolves it through the platform's
 *                           deployment seam and the tree moves with the deployment
 *                           (see "DEPLOYMENT-SCOPED SOURCE" below)
 *   public/assets/**     →  a GENERATED, byte-identical DERIVATIVE (what the browser
 *                           fetches). NEVER edit it by hand: an edit there is
 *                           overwritten by the next `assets:sync`, and `assets:check`
 *                           fails in the meantime.
 *
 * NOT VERSION-CONTROLLED (FOUNDATION-DEPLOYMENT-ISO-B3C1)
 * ------------------------------------------------------
 * The mirror is DERIVED state, so it is not tracked: `.gitignore` excludes it, and every workflow
 * installs it deterministically — `pnpm install` (postinstall), `pnpm dev` and `pnpm build` each run
 * this script, so a fresh clone needs no undocumented step. `pnpm assets:sync` re-installs on demand
 * and `pnpm assets:check` verifies without repairing. Tracking it would put a second copy of every
 * artwork byte in version control, able to disagree with the source it was derived from — the
 * ambiguity this ownership model exists to remove.
 *
 * This script is the only sanctioned writer of those derivatives. It is
 * idempotent, it reports every create/update, and `--check` fails (exit 1) when
 * the two trees drift — which is what `tests/unit/asset-taxonomy-mirror.test.ts`
 * and the `assets:check` script both assert.
 *
 * OWNERSHIP MODEL (see BRAND_ASSETS.md "Source assets vs runtime assets"):
 *   content/assets/branding/        deployment/business-specific artwork
 *   content/assets/icon-library/    reusable, non-business-specific generic icons
 *   content/assets/placeholders/    blank/generic defaults for a fresh installation
 *   content/assets/platform-marks/  royalty-free platform/social-service marks
 *
 * DEPLOYMENT-SCOPED SOURCE (FOUNDATION-DEPLOYMENT-ISO-H1)
 * ------------------------------------------------------
 * The source tree is DEPLOYMENT state, so this script spells no location of its own: it asks the
 * ONE build/deployment seam (`src/config/deployment-build.mjs`) which deployment this run serves —
 * the same answer `next.config.ts` and `vitest.config.mts` receive — and mirrors from whichever
 * root that deployment owns:
 *
 *   repository layout   <repo>/content/assets/**
 *   capsule layout      <repo>/deployment/content/assets/**
 *   override layout     <override-root>/content/assets/**
 *
 * The GENERATED mirror is NOT deployment state — Next.js serves static files from `public/` only
 * — so `public/assets/**` stays repository build output in every layout. Accordingly the
 * `MIRRORED` / `MIRRORED_DIRECTORIES` `from` paths are relative to the SELECTED DEPLOYMENT's root,
 * while the runtime target is always `<repo>/public/assets/`. This script never inspects which
 * customer or deployment it is processing: swap the deployment and the pipeline follows it.
 *
 * The seam is PLAIN ESM (`src/config/deployment-build.mjs`), so this script imports it directly and
 * Node runs both natively: `package.json` needs no TypeScript execution flag and no loader or
 * warning suppression for the asset commands (FOUNDATION-DEPLOYMENT-ISO-H1C).
 *
 * USAGE
 *   node scripts/sync-runtime-assets.mjs                  # install the runtime mirror (create, update, remove)
 *   node scripts/sync-runtime-assets.mjs --check          # verify only, exit 1 on drift/absence/unauthorized output
 *   node scripts/sync-runtime-assets.mjs --if-deployment  # install only if a deployment exists (the postinstall hook)
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// THE ONE DEPLOYMENT-SELECTION SEAM (FOUNDATION-DEPLOYMENT-ISO-H1 / H1C)
// The asset SOURCE tree is deployment-owned state, so this build-tool script asks the same
// authority `next.config.ts` and `vitest.config.mts` ask (`src/config/deployment-build.mjs`)
// instead of implementing a second deployment-root mechanism or hard-coding a location. That
// module is plain ESM with JSDoc types, so `node` loads it natively — exactly as Next and Vitest do.
import { resolveDeploymentForBuild } from "../src/config/deployment-build.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME_DIR = "public/assets";
/** The GENERATED runtime tree — repository build output, never deployment state (see above). */
const RUNTIME_ROOT = path.join(ROOT, RUNTIME_DIR);
/** The deployment-owned source tree, relative to whichever root the deployment owns. */
const SOURCE_DIRECTORY = path.join("content", "assets");

/**
 * WHERE THIS RUN READS ITS SOURCE ASSETS FROM (FOUNDATION-DEPLOYMENT-ISO-H1)
 * -------------------------------------------------------------------------
 * One answer, asked of the seam — never guessed here:
 *
 *   repository  the seam finds no capsule at `<repo>/deployment/`  →  <repo>/content/assets/**
 *   capsule     `<repo>/deployment/site.config.json` exists        →  <repo>/deployment/content/assets/**
 *   override    `FOUNDATION_DEPLOYMENT_ROOT` is set (dev/test)     →  <override-root>/content/assets/**
 *
 * `runtimeRoot` is deliberately NOT a deployment location: Next.js serves static files from
 * `public/` only, so the generated mirror stays `<repository>/public/assets/**` in every layout.
 * Exported and parameterised so a generic test can prove all three layouts on synthetic trees.
 *
 * @param {Record<string, string | undefined>} [environment] the process environment the build reads
 *   (the same shape `resolveDeploymentForBuild` consumes), so a test can pass a synthetic one
 * @param {string} [repositoryRoot] the repository the deployment is resolved inside
 */
export function resolveAssetDeployment(environment = process.env, repositoryRoot = ROOT) {
  const { layout, root } = resolveDeploymentForBuild(environment, repositoryRoot);
  return {
    layout,
    /** The root the `MIRRORED` / `MIRRORED_DIRECTORIES` `from` paths are relative to. */
    deploymentRoot: root,
    sourceRoot: path.join(root, SOURCE_DIRECTORY),
    runtimeRoot: path.join(repositoryRoot, RUNTIME_DIR),
  };
}

/**
 * Is there a deployment to install for at all?
 *
 * The explicit asset commands and `pnpm dev`/`pnpm build` require one: a missing configuration is a
 * LOUD failure there, because a build must never silently serve a different deployment. `pnpm install`
 * is the one caller that must not assume it — a checkout with no deployment installed (the physical
 * separation B4 will make real, and any stripped-down clone today) still has to be installable — so
 * the postinstall hook asks THIS question first and reports "nothing to install" instead of failing.
 *
 * @param {Record<string, string | undefined>} [environment] the environment the seam reads
 * @param {string} [repositoryRoot] the repository the deployment is resolved inside
 * @returns {boolean} whether a deployment is resolvable here
 */
export function deploymentAvailable(environment = process.env, repositoryRoot = ROOT) {
  try {
    resolveAssetDeployment(environment, repositoryRoot);
    return true;
  } catch {
    // The seam's own message is the diagnostic a BUILD needs; here it only answers this question.
    return false;
  }
}

/** The deployment this run serves, resolved through the seam. Never cached across calls. */
function selectedDeploymentRoot() {
  return resolveAssetDeployment().deploymentRoot;
}

/**
 * Every mirrored source → runtime filename pair. `from` is relative to the SELECTED DEPLOYMENT's
 * root (`resolveAssetDeployment().deploymentRoot` — repository, capsule or override); `to` is a
 * filename inside the repository's `public/assets/`.
 */
export const MIRRORED = [
  // ── Identity roles: NEUTRAL placeholders are the template's shipped default ─
  // The generic template ships no brand of its own: the identity roles resolve to
  // `content/assets/placeholders/**`, so a fresh clone renders a neutral, un-branded
  // site that an adopter replaces. Replace these files in place, or point the role
  // at your own absolute URL in `site.assets` (see BRAND_ASSETS.md).
  //
  // The header and footer logo ROLES share ONE source: both runtime basenames must
  // exist because the roles are addressed by basename (`site.assets.logo` /
  // `site.assets.logoFooter`).
  { from: "content/assets/placeholders/favicon.svg", to: "favicon.svg", note: "favicon role — neutral default" },
  { from: "content/assets/placeholders/logo-header.svg", to: "logo-header.svg", note: "header logo role — neutral default" },
  { from: "content/assets/placeholders/logo-header.svg", to: "logo-footer.svg", note: "footer logo role — same source as the header" },

  // ── Placeholders: the BLANK/GENERIC defaults a fresh install renders ─────
  { from: "content/assets/placeholders/header-graphic.svg", to: "header-graphic.svg", note: "decorative header band — blank default" },
  { from: "content/assets/placeholders/footer-graphic.svg", to: "footer-graphic.svg", note: "decorative footer layer — blank default" },
  { from: "content/assets/placeholders/sidebar-open.svg", to: "sidebar-open.svg", note: "sidebar show control icon" },
  { from: "content/assets/placeholders/sidebar-close.svg", to: "sidebar-close.svg", note: "sidebar hide control icon" },
  { from: "content/assets/placeholders/sidebar-default-icon-open.svg", to: "sidebar-default-icon-open.svg", note: "nav-item icon fallback (expanded)" },
  { from: "content/assets/placeholders/sidebar-default-icon-closed.svg", to: "sidebar-default-icon-closed.svg", note: "nav-item icon fallback (collapsed)" },
];

/** Whole directory → directory mirrors (source basename preserved). */
export const MIRRORED_DIRECTORIES = [
  { from: "content/assets/icon-library/icons", to: RUNTIME_DIR, note: "generic icon library" },
  { from: "content/assets/platform-marks", to: RUNTIME_DIR, note: "platform/social marks" },
];

/**
 * Runtime files with NO in-repository source. Each entry must be an explicit,
 * justified exception: an undeclared runtime-only file is a manifest error,
 * which is what keeps a second, uncontrolled asset library from appearing under
 * `public/assets/`.
 *
 * EMPTY BY DESIGN (2026-09 closure pass): the ten `banner-*.png` files used to be
 * the only entries here. Persistent branded artwork must have an authoritative
 * source beneath `content/assets/`, so the banner family now lives in
 * `content/assets/branding/banners/` and is mirrored deterministically like every
 * other runtime graphic. A genuinely runtime-ONLY (generated, source-less) asset
 * may still be declared here with its reason — but nothing is kept here merely
 * because it already was.
 */
export const RUNTIME_ONLY = [];

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

/**
 * One planned mirror row.
 * @typedef {object} MirrorRow
 * @property {string} from the source path, relative to the SELECTED DEPLOYMENT's root
 * @property {string} to the runtime filename the mirror installs
 * @property {string} note why this file is mirrored
 */

/** Deliverable artwork extensions — documentation (e.g. `README.md`) is not mirrored. */
const MIRRORED_EXTENSIONS = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);

/**
 * The full, deterministic plan of mirrored files (sorted, extension-filtered), read from the
 * SELECTED DEPLOYMENT. `deploymentRoot` is a parameter so a generic test can substitute a
 * synthetic deployment; the CLI uses the deployment the seam resolved.
 */
export function buildPlan(deploymentRoot = selectedDeploymentRoot()) {
  const rows = [];
  for (const { from, to, note } of MIRRORED) rows.push({ from, to, note });
  for (const { from, note } of MIRRORED_DIRECTORIES) {
    const names = readdirSync(path.join(deploymentRoot, from), { withFileTypes: true })
      .filter((entry) => entry.isFile() && MIRRORED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => entry.name)
      .sort();
    for (const name of names) rows.push({ from: `${from}/${name}`, to: name, note });
  }
  return rows;
}

/**
 * Every entry under the runtime tree, RELATIVE to it — files and directories alike, deepest last.
 *
 * The plan installs FLAT filenames into the runtime directory, so any directory at all (and any file
 * the plan does not declare) is unauthorized output. That is what stops a second, uncontrolled asset
 * library from appearing under `public/assets/`, and what makes a STALE file — a source that was
 * removed — detectable instead of permanent.
 *
 * An absent runtime tree is not an error: it is the state a fresh checkout starts in, and
 * `syncMirrors` is what bootstraps it.
 *
 * @param {string} runtimeRoot the generated runtime tree
 * @returns {string[]} relative paths; a directory ends with `/`
 */
function runtimeEntries(runtimeRoot) {
  if (!existsSync(runtimeRoot)) return [];
  const found = [];
  const walk = (directory, prefix) => {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        found.push(`${relative}/`);
        walk(path.join(directory, entry.name), relative);
      } else {
        // Anything that is not a directory (including a symbolic link) is treated as a file.
        found.push(relative);
      }
    }
  };
  walk(runtimeRoot, "");
  return found;
}

/**
 * Classify every planned pair: created / updated / current (+ missing sources), and list every runtime
 * entry the plan does NOT account for.
 *
 * `runtimeRoot` is a parameter for the same reason `deploymentRoot` is: a generic test proves this
 * generated-output lifecycle on disposable trees under the OS temp directory and must never touch the
 * repository's real `public/assets/**`. Every command uses the defaults.
 *
 * @param {string} [deploymentRoot] the selected deployment's root
 * @param {string} [runtimeRoot] the generated runtime tree
 * @returns {{ created: MirrorRow[], updated: MirrorRow[], current: MirrorRow[], missingSources: MirrorRow[], unexpected: string[] }}
 */
export function checkMirrors(deploymentRoot = selectedDeploymentRoot(), runtimeRoot = RUNTIME_ROOT) {
  const created = [];
  const updated = [];
  const current = [];
  const missingSources = [];
  for (const row of buildPlan(deploymentRoot)) {
    const source = path.join(deploymentRoot, row.from);
    const target = path.join(runtimeRoot, row.to);
    if (!existsSync(source)) {
      missingSources.push(row);
      continue;
    }
    const sourceHash = sha256(readFileSync(source));
    if (!existsSync(target)) created.push(row);
    else if (sha256(readFileSync(target)) !== sourceHash) updated.push(row);
    else current.push(row);
  }
  const planned = new Set(buildPlan(deploymentRoot).map((row) => row.to));
  const allowlisted = (name) =>
    RUNTIME_ONLY.some((entry) => entry.pattern.test(name) || entry.pattern.test(path.basename(name)));
  // A directory is legitimate only while something the plan installs lives inside it.
  const directoryExpected = (relative) =>
    [...planned].some((target) => target.startsWith(relative));
  const unexpected = runtimeEntries(runtimeRoot).filter((relative) =>
    relative.endsWith("/")
      ? !directoryExpected(relative)
      : !planned.has(relative) && !allowlisted(relative),
  );
  return { created, updated, current, missingSources, unexpected };
}

/**
 * Make the runtime mirror EQUAL the plan: create, update, and REMOVE unauthorized output (idempotent).
 *
 * Removal is the half that keeps a generated tree honest. A source that no longer exists, or a file
 * someone placed directly in `public/assets/`, must not survive merely because it is already on disk —
 * the PLAN decides what is legitimate, never "what was already there". Only paths discovered INSIDE
 * `runtimeRoot` are ever removed, only empty directories are unlinked (never a recursive delete), and
 * nothing is removed recursively from a path this function did not list itself.
 *
 * @param {string} [deploymentRoot] the selected deployment's root
 * @param {string} [runtimeRoot] the generated runtime tree
 * @returns {{ created: MirrorRow[], updated: MirrorRow[], current: MirrorRow[], missingSources: MirrorRow[], unexpected: string[], removed: string[] }}
 */
export function syncMirrors(deploymentRoot = selectedDeploymentRoot(), runtimeRoot = RUNTIME_ROOT) {
  // Bootstrap FIRST: an absent mirror is the fresh-checkout state, not an error — and the plan is
  // what decides the tree, so there is nothing to preserve from a previous install.
  mkdirSync(runtimeRoot, { recursive: true });
  const report = checkMirrors(deploymentRoot, runtimeRoot);

  const root = path.resolve(runtimeRoot);
  /** A path inside the runtime tree, or a refusal — this function's own write boundary. */
  const inside = (relative) => {
    const full = path.resolve(root, relative);
    if (full !== root && !full.startsWith(root + path.sep)) {
      throw new Error(`refusing to touch a path outside the runtime tree: ${relative}`);
    }
    return full;
  };

  for (const row of [...report.created, ...report.updated]) {
    const source = path.join(deploymentRoot, row.from);
    const target = inside(row.to);
    const expected = sha256(readFileSync(source));
    copyFileSync(source, target);
    if (sha256(readFileSync(target)) !== expected) throw new Error(`mirror write failed: ${row.to}`);
  }

  const removed = [];
  const depth = (relative) => relative.split("/").filter((part) => part !== "").length;
  for (const relative of report.unexpected.filter((entry) => !entry.endsWith("/"))) {
    rmSync(inside(relative), { force: true });
    removed.push(relative);
  }
  // Deepest first, so a directory that only held unauthorized material goes once it is empty.
  const directories = report.unexpected
    .filter((entry) => entry.endsWith("/"))
    .sort((a, b) => depth(b) - depth(a));
  for (const relative of directories) {
    const full = inside(relative);
    if (existsSync(full) && readdirSync(full).length === 0) {
      rmdirSync(full);
      removed.push(relative);
    }
  }
  return { ...report, removed: removed.sort() };
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const checkOnly = process.argv.includes("--check");
  const optional = process.argv.includes("--if-deployment");
  // The ONE tolerant caller: `pnpm install` must succeed in a checkout that has no deployment yet
  // (a stripped-down clone, or a Foundation repository after the B4 separation). Every other caller
  // keeps the seam's loud failure — a build must never silently serve a different deployment.
  if (optional && !deploymentAvailable()) {
    console.log(
      "runtime asset mirror — no deployment is installed in this repository, so there is no mirror to install.",
    );
    process.exit(0);
  }
  const deployment = resolveAssetDeployment();
  const report = checkOnly ? checkMirrors() : syncMirrors();
  const noun = (n) => `${n} file${n === 1 ? "" : "s"}`;
  console.log(`runtime asset mirror — ${RUNTIME_DIR} (${noun(buildPlan().length)} declared)`);
  console.log(`  source:   ${deployment.sourceRoot}  (${deployment.layout} deployment)`);
  console.log(`  target:   ${deployment.runtimeRoot}`);
  console.log(`  ${checkOnly ? "drifted" : "updated"}: ${noun(report.updated.length)}`);
  console.log(`  absent:   ${noun(report.created.length)}`);
  console.log(`  current:  ${noun(report.current.length)}`);
  if (!checkOnly) console.log(`  removed:  ${noun(report.removed.length)}`);
  for (const row of [...report.updated, ...report.created]) {
    console.log(`    ${checkOnly ? "drift" : "write"}  ${row.from} → ${row.to}`);
  }
  if (!checkOnly) for (const relative of report.removed) console.log(`    remove ${relative}`);

  const failures = [];
  if (report.missingSources.length > 0) {
    failures.push(
      `declared source asset(s) are missing:\n${report.missingSources.map((row) => `    ${row.from}`).join("\n")}`,
    );
  }
  // In CHECK mode unauthorized output is a failure: nothing may be accepted merely because it exists.
  // In SYNC mode it is an action already taken — reported above as `remove …` — because the plan, not
  // the previous contents of the tree, decides what is legitimate.
  if (checkOnly && report.unexpected.length > 0) {
    failures.push(
      `unauthorized runtime file(s) in ${RUNTIME_DIR}/ — the plan does not declare them, so nobody derived them. Mirror them from a source, or declare them in RUNTIME_ONLY with a reason:\n` +
        report.unexpected.map((name) => `    ${name}`).join("\n"),
    );
  }
  if (checkOnly && (report.created.length > 0 || report.updated.length > 0)) {
    failures.push(
      report.created.length === buildPlan().length
        ? `the runtime mirror is NOT INSTALLED in ${RUNTIME_DIR}/ — run \`pnpm assets:sync\` (or \`pnpm install\`, which installs it).`
        : "runtime assets are not byte-identical to their sources — run `pnpm assets:sync`.",
    );
  }
  if (failures.length > 0) {
    console.error(
      `\n${checkOnly ? "RUNTIME ASSET MIRROR CHECK FAILED" : "RUNTIME ASSET MIRROR INSTALL FAILED"}\n${failures.join("\n")}`,
    );
    process.exit(1);
  }
  console.log(
    "\nruntime asset mirror OK — every runtime file is byte-identical to its source, and nothing else is present.",
  );
}
