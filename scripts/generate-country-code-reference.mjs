#!/usr/bin/env node
/**
 * REGENERATES THE MACHINE-CHECKABLE COUNTRY-CODE SECTION (FOUNDATION-S1E3B, ISO-B3A)
 * ==================================================================================
 *
 * The document is `content/COUNTRY-CODES.md` — a DEPLOYMENT-owned generated document: the ONE
 * maintained list of recognized site codes an owner reads before naming a page folder. It lives
 * beside the rest of that deployment's authored content, so this script never spells its location:
 * it asks the SAME authority the build and the tests ask (`src/config/deployment-build.mjs`) which
 * deployment this run serves, and writes inside whichever root that deployment owns:
 *
 *   repository  no capsule at `<repo>/deployment/`          →  <repo>/content/COUNTRY-CODES.md
 *   capsule     `<repo>/deployment/site.config.json` exists →  <repo>/deployment/content/COUNTRY-CODES.md
 *   override    `FOUNDATION_DEPLOYMENT_ROOT` is set         →  <override-root>/content/COUNTRY-CODES.md
 *
 * The GENERATOR is Foundation tooling and stays here; only its OUTPUT is deployment-owned — the same
 * source/target distinction the asset pipeline draws (`scripts/sync-runtime-assets.mjs`).
 *
 * Run it after changing `COUNTRY_SITE_CODES` (`src/core/site-code.ts`):
 *
 *   node scripts/generate-country-code-reference.mjs            # write the generated section
 *   node scripts/generate-country-code-reference.mjs --check    # verify only, exit 1 on drift
 *
 * The script only guarantees that the code column is EXACTLY the recognized set, with names taken
 * from Node's ICU data — no hand-typed list can drift. The deployment's own suite
 * (`<deployment>/tests/unit/country-code-reference.test.ts`) fails when the document and the runtime
 * disagree, so a forgotten run is caught by the normal gate rather than by a reader.
 *
 * The authority is PLAIN ESM, so `node` loads it natively: `package.json` needs no TypeScript
 * execution flag and no loader or warning suppression for the country-code commands
 * (FOUNDATION-DEPLOYMENT-ISO-H1C / ISO-B3A).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// THE ONE DEPLOYMENT-SELECTION SEAM (FOUNDATION-DEPLOYMENT-ISO-B3A)
// The document is deployment state, so its location comes from the shared authority rather than from
// a second resolver, a capsule sniff or a hard-coded `deployment/` path.
import {
  installationSpokes,
  resolveDeploymentForBuild,
} from "../src/config/deployment-build.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** The recognized codes are DEFINED by this runtime authority; the document is derived from it. */
const SOURCE = path.join(ROOT, "src", "core", "site-code.ts");
/** Deployment-relative: joined to whichever deployment root the authority selected. */
export const COUNTRY_CODES_DOCUMENT = path.join("content", "COUNTRY-CODES.md");
const START = "<!-- CODES:START -->";
const END = "<!-- CODES:END -->";
const COLUMNS = 3;

/**
 * The generated document inside a SELECTED deployment.
 *
 * S3F1 — the document is DEPLOYMENT-authored material, so it belongs to the deployment's RESOURCE ROOT
 * (`deployment-build.mjs` publishes it: the Installation root in legacy mode, the sole Spoke's root in
 * explicit mode) rather than to the Installation root, whose own locations are lifecycle records.
 *
 * @param {string} deploymentRoot the RESOURCE root the authority resolved
 * @returns {string} the document's absolute path
 */
export function countryCodeDocumentFile(deploymentRoot) {
  return path.join(deploymentRoot, COUNTRY_CODES_DOCUMENT);
}

/**
 * EVERY authored location this deployment keeps the reference in (FOUNDATION-MULTISITE-M18).
 *
 * A ONE-resource-root deployment — the legacy Installation, or an explicit manifest declaring exactly one
 * Spoke — authors exactly ONE document, exactly as before. A MULTI-Spoke Installation authors ONE PER
 * DECLARED SPOKE: `content/` belongs to the Spoke that owns it (the accepted S3F1 resource model), so
 * checking "the deployment" means checking each Spoke's own copy rather than inventing an
 * installation-wide document that no Spoke authors and no default Spoke may supply.
 *
 * @param {Record<string, string | undefined>} [environment] the environment the run reads
 * @param {string} [repositoryRoot] the repository the deployment is resolved inside
 * @returns {{ spokeId: string | null, document: string }[]}
 */
export function countryCodeTargets(environment = process.env, repositoryRoot = ROOT) {
  const deployment = resolveDeploymentForBuild(environment, repositoryRoot);
  if (deployment.mode !== "multi") {
    return [{ spokeId: null, document: countryCodeDocumentFile(deployment.resourceRoot) }];
  }
  return installationSpokes(deployment.root).spokes.map((spoke) => ({
    spokeId: spoke.id,
    document: countryCodeDocumentFile(spoke.root),
  }));
}

/** Every recognized country code, in authority order (parsed from the ONE runtime source). */
export function countryCodes() {
  const source = readFileSync(SOURCE, "utf8");
  const block = source.split("export const COUNTRY_SITE_CODES")[1].split("];")[0];
  return [...block.matchAll(/"([a-z]{2})"/g)].map((match) => match[1]);
}

/**
 * The marked section the runtime authority determines — deterministic: same source, same bytes.
 *
 * @param {readonly string[]} [codes] the codes to render (defaults to the runtime authority's set)
 * @returns {string} the exact section text, including its markers
 */
export function countryCodeSection(codes = countryCodes()) {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const cells = codes.map((code) => `\`${code}\` ${names.of(code.toUpperCase()) ?? code}`);
  const perColumn = Math.ceil(cells.length / COLUMNS);
  const lines = [];
  for (let row = 0; row < perColumn; row += 1) {
    const line = [];
    for (let column = 0; column < COLUMNS; column += 1) {
      const cell = cells[row + column * perColumn];
      if (cell !== undefined) line.push(cell);
    }
    lines.push(line.join(" · "));
  }
  return [START, "", ...lines, "", END].join("\n");
}

/**
 * Reports WHERE this run would write, and whether the selected deployment's document is current.
 *
 * Reads the deployment's document and NEVER writes it, so `--check` and the tests can prove the
 * generated content without touching it. A missing deployment is the authority's own loud failure.
 * The comparison is byte-exact within the document's OWN line-ending convention: the marker section
 * must already be exactly what this script would write.
 *
 * @param {Record<string, string | undefined>} [environment] the environment the run reads
 * @param {string} [repositoryRoot] the repository the deployment is resolved inside
 * @returns {{ layout: string, deploymentRoot: string, document: string, codes: string[], current: string, expected: string, stale: boolean }}
 */
export function checkCountryCodeReference(environment = process.env, repositoryRoot = ROOT) {
  const deployment = resolveDeploymentForBuild(environment, repositoryRoot);
  const codes = countryCodes();
  // ONE target for a one-resource-root deployment; ONE PER DECLARED SPOKE for a multi-Spoke Installation,
  // because each Spoke authors its own `content/` tree and therefore its OWN copy of this document (M18).
  const targets = countryCodeTargets(environment, repositoryRoot).map((target) => {
    const text = readFileSync(target.document, "utf8");
    const from = text.indexOf(START);
    const to = text.indexOf(END);
    if (from === -1 || to === -1 || to < from) {
      throw new Error(
        `the country-code document carries no ${START} … ${END} section to regenerate: ${target.document}`,
      );
    }
    const current = text.slice(from, to + END.length);
    // The document's OWN line-ending convention is preserved. The generated text is joined with "\n",
    // so comparing raw bytes against a CRLF document would report drift that does not exist — and
    // writing the LF text into a CRLF document would leave the file with MIXED endings.
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const expected = countryCodeSection(codes).split("\n").join(eol);
    return { ...target, current, expected, stale: current !== expected };
  });

  const [first] = targets;
  return {
    layout: deployment.layout,
    mode: deployment.mode,
    // The RESOURCE root the FIRST document lives in (identical to the Installation root in legacy mode).
    deploymentRoot: deployment.resourceRoot ?? deployment.root,
    document: first.document,
    codes,
    current: first.current,
    expected: first.expected,
    // The deployment is current only when EVERY authored copy of the reference is.
    stale: targets.some((target) => target.stale),
    targets,
  };
}

/**
 * Writes the generated section when — and only when — the selected deployment's document differs from
 * what the runtime authority determines. Idempotent, and it never writes to a retired location.
 *
 * @param {Record<string, string | undefined>} [environment] the environment the run reads
 * @param {string} [repositoryRoot] the repository the deployment is resolved inside
 * @returns {{ layout: string, deploymentRoot: string, document: string, codes: string[], changed: boolean }}
 */
export function syncCountryCodeReference(environment = process.env, repositoryRoot = ROOT) {
  const report = checkCountryCodeReference(environment, repositoryRoot);
  const changedDocuments = [];
  for (const target of report.targets) {
    if (!target.stale) continue;
    const document = readFileSync(target.document, "utf8");
    writeFileSync(target.document, document.replace(target.current, target.expected), "utf8");
    changedDocuments.push(target.document);
  }
  return { ...report, changed: changedDocuments.length > 0, changedDocuments };
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const checkOnly = process.argv.includes("--check");
  const report = checkOnly ? checkCountryCodeReference() : syncCountryCodeReference();
  // The SELECTED targets are REPORTED, so a run can never be assumed to have touched the right
  // deployment: a wrong root is visible in the output instead of having to be inferred.
  console.log(
    `country-code reference — ${report.codes.length} recognized codes (${report.layout}/${report.mode} deployment)`,
  );
  console.log(`  deployment: ${report.deploymentRoot}`);
  for (const target of report.targets) {
    console.log(
      `  document:   ${target.document}${
        target.spokeId === null ? "" : `  (Spoke "${target.spokeId}")`
      }`,
    );
  }
  if (checkOnly) {
    if (report.stale) {
      const stale = report.targets.filter((target) => target.stale).map((target) => `    ${target.document}`);
      console.error(
        "\nCOUNTRY-CODE REFERENCE CHECK FAILED\n" +
          `  the document(s) below do not match the runtime authority (src/core/site-code.ts):\n${stale.join("\n")}\n` +
          "  Run `pnpm country-codes:sync` and commit the result.",
      );
      process.exit(1);
    }
    console.log("\ncountry-code reference OK — every authored document matches the runtime authority.");
  } else {
    console.log(report.changed ? "  updated the generated section" : "  already current");
  }
}
