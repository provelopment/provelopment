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
 * ONE build/deployment seam (`src/config/deployment-build.ts`) which deployment this run serves —
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
 * The seam is TypeScript and this script is plain ESM, so `package.json` invokes it with
 * `--experimental-strip-types` (Node ≥22.6; a no-op on Node ≥23.6, where type stripping is already
 * on by default) and the seam is imported by its explicit `.ts` path. `--disable-warning` only
 * silences the module-type notice Node prints for that import; it changes no behaviour.
 *
 * USAGE
 *   node scripts/sync-runtime-assets.mjs           # write the runtime mirror
 *   node scripts/sync-runtime-assets.mjs --check   # verify only, exit 1 on drift
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// THE ONE DEPLOYMENT-SELECTION SEAM (FOUNDATION-DEPLOYMENT-ISO-H1)
// The asset SOURCE tree is deployment-owned state, so this build-tool script asks the same
// authority `next.config.ts` and `vitest.config.mts` ask (`src/config/deployment-build.ts`)
// instead of implementing a second deployment-root mechanism or hard-coding a location. The
// explicit `.ts` specifier is what lets a plain `node` process load the TypeScript seam.
import { resolveDeploymentForBuild } from "../src/config/deployment-build.ts";

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

/** The deployment this run serves: resolved ONCE, through the seam above. */
export const ASSET_DEPLOYMENT = resolveAssetDeployment();

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

/** Deliverable artwork extensions — documentation (e.g. `README.md`) is not mirrored. */
const MIRRORED_EXTENSIONS = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);

/**
 * The full, deterministic plan of mirrored files (sorted, extension-filtered), read from the
 * SELECTED DEPLOYMENT. `deploymentRoot` is a parameter so a generic test can substitute a
 * synthetic deployment; the CLI uses the deployment the seam resolved.
 */
export function buildPlan(deploymentRoot = ASSET_DEPLOYMENT.deploymentRoot) {
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

/** Classify every planned pair: created / updated / current (+ missing sources). */
export function checkMirrors(deploymentRoot = ASSET_DEPLOYMENT.deploymentRoot) {
  const created = [];
  const updated = [];
  const current = [];
  const missingSources = [];
  for (const row of buildPlan(deploymentRoot)) {
    const source = path.join(deploymentRoot, row.from);
    const target = path.join(RUNTIME_ROOT, row.to);
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
  const allowlisted = (name) => RUNTIME_ONLY.some((entry) => entry.pattern.test(name));
  const unexpected = readdirSync(RUNTIME_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !planned.has(entry.name) && !allowlisted(entry.name))
    .map((entry) => entry.name)
    .sort();
  return { created, updated, current, missingSources, unexpected };
}

/** Copy every out-of-date source over its runtime derivative (idempotent). */
export function syncMirrors(deploymentRoot = ASSET_DEPLOYMENT.deploymentRoot) {
  const report = checkMirrors(deploymentRoot);
  mkdirSync(RUNTIME_ROOT, { recursive: true });
  for (const row of [...report.created, ...report.updated]) {
    const source = path.join(deploymentRoot, row.from);
    const target = path.join(RUNTIME_ROOT, row.to);
    const expected = sha256(readFileSync(source));
    copyFileSync(source, target);
    if (sha256(readFileSync(target)) !== expected) throw new Error(`mirror write failed: ${row.to}`);
  }
  return report;
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const checkOnly = process.argv.includes("--check");
  const report = checkOnly ? checkMirrors() : syncMirrors();
  const noun = (n) => `${n} file${n === 1 ? "" : "s"}`;
  console.log(`runtime asset mirror — ${RUNTIME_DIR} (${noun(buildPlan().length)} declared)`);
  console.log(`  source:   ${ASSET_DEPLOYMENT.sourceRoot}  (${ASSET_DEPLOYMENT.layout} deployment)`);
  console.log(`  target:   ${ASSET_DEPLOYMENT.runtimeRoot}`);
  console.log(`  ${checkOnly ? "drifted" : "updated"}: ${noun(report.updated.length)}`);
  console.log(`  absent:   ${noun(report.created.length)}`);
  console.log(`  current:  ${noun(report.current.length)}`);
  for (const row of [...report.updated, ...report.created]) {
    console.log(`    ${checkOnly ? "drift" : "write"}  ${row.from} → ${row.to}`);
  }

  const failures = [];
  if (report.missingSources.length > 0) {
    failures.push(
      `declared source asset(s) are missing:\n${report.missingSources.map((row) => `    ${row.from}`).join("\n")}`,
    );
  }
  if (report.unexpected.length > 0) {
    failures.push(
      `undeclared runtime-only file(s) in ${RUNTIME_DIR}/ — mirror them from a source, or declare them in RUNTIME_ONLY with a reason:\n` +
        report.unexpected.map((name) => `    ${name}`).join("\n"),
    );
  }
  if (checkOnly && (report.created.length > 0 || report.updated.length > 0)) {
    failures.push("runtime assets are not byte-identical to their sources — run `pnpm assets:sync`.");
  }
  if (failures.length > 0) {
    console.error(`\nRUNTIME ASSET MIRROR CHECK FAILED\n${failures.join("\n")}`);
    process.exit(1);
  }
  console.log("\nruntime asset mirror OK — every runtime file is byte-identical to its source.");
}
