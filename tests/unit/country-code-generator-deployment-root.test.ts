import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  captureProductionStateManifest,
  productionStateDrift,
} from "../support/production-state-manifest";

import {
  COUNTRY_CODES_DOCUMENT,
  checkCountryCodeReference,
  countryCodeDocumentFile,
  syncCountryCodeReference,
} from "../../scripts/generate-country-code-reference.mjs";

/**
 * THE COUNTRY-CODE GENERATOR FOLLOWS THE SELECTED DEPLOYMENT (FOUNDATION-DEPLOYMENT-ISO-B3A)
 * ==========================================================================================
 *
 * `scripts/generate-country-code-reference.mjs` regenerates one marked section of a document that
 * belongs to the SELECTED DEPLOYMENT — `content/COUNTRY-CODES.md`, beside that deployment's other
 * authored content. The defect this suite guards against is the one ISO-D1 had to defer: the script
 * wrote `<repo>/content/COUNTRY-CODES.md` literally, a location the deployment-capsule migration
 * retired, so the maintained list could no longer be regenerated at all.
 *
 * Every layout is proved on a SYNTHETIC tree under the OS temp directory — never the real reference
 * deployment — and each tree carries a DECOY document in the location that layout must NOT write
 * (including the RETIRED repository-root path), so a passing test cannot come from the script having
 * written somewhere convenient. Only the LOCATION is synthetic: the generated content is the real
 * runtime authority's, read from `src/core/site-code.ts`. Nothing is left on disk afterwards.
 */
const START = "<!-- CODES:START -->";
const END = "<!-- CODES:END -->";
/** A deliberately WRONG, minimal section: any correct run replaces exactly this span. */
const PLANTED_SECTION = [START, "", "`aa` Neverland", "", END].join("\n");

/** A document in the deployment's own shape, with the WRONG section and prose that must survive. */
const plantedDocument = (eol = "\r\n"): string =>
  ["# Country codes (synthetic)", "", ...PLANTED_SECTION.split("\n"), "", "Trailing prose.", ""].join(
    eol,
  );

const trees: string[] = [];

function tempTree(prefix: string): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  trees.push(root);
  return root;
}

function writeFile(file: string, contents: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
}

/** A deployment-shaped root: the configuration the authority requires, plus its own document. */
function plantDeployment(root: string): string {
  writeFile(path.join(root, "site.config.json"), JSON.stringify({ synthetic: true }));
  const document = path.join(root, COUNTRY_CODES_DOCUMENT);
  writeFile(document, plantedDocument());
  return document;
}

afterAll(() => {
  for (const tree of trees) rmSync(tree, { recursive: true, force: true });
});

describe("the generated country-code document belongs to the SELECTED deployment", () => {
  it("is the deployment-relative document an author reads", () => {
    expect(COUNTRY_CODES_DOCUMENT).toBe(path.join("content", "COUNTRY-CODES.md"));
    expect(countryCodeDocumentFile(path.join("C:", "capsule"))).toBe(
      path.join("C:", "capsule", "content", "COUNTRY-CODES.md"),
    );
  });

  it("repository layout: checks and writes `<repo>/content/COUNTRY-CODES.md`, and nothing else", () => {
    const repo = tempTree("foundation-country-codes-repository-");
    const document = plantDeployment(repo);
    // A capsule-SHAPED decoy that is not a capsule (no `deployment/site.config.json`).
    const decoy = path.join(repo, "deployment", "content", "COUNTRY-CODES.md");
    writeFile(decoy, plantedDocument());

    const check = checkCountryCodeReference({}, repo);
    expect(check.layout).toBe("repository");
    expect(check.deploymentRoot).toBe(repo);
    expect(check.document).toBe(document);
    expect(check.stale).toBe(true);
    expect(check.codes.length).toBeGreaterThan(200);

    const synced = syncCountryCodeReference({}, repo);
    expect(synced.changed).toBe(true);
    const written = readFileSync(document, "utf8");
    expect(written).toContain("`ca` Canada");
    expect(written).toContain("Trailing prose.");
    // The document's OWN convention survives, and the write does not mix endings.
    expect(written).toContain("\r\n");
    expect(written).not.toMatch(/[^\r]\n/);
    expect(readFileSync(decoy, "utf8")).toBe(plantedDocument());

    // Idempotent, and `--check` agrees with what was written.
    expect(syncCountryCodeReference({}, repo).changed).toBe(false);
    expect(checkCountryCodeReference({}, repo).stale).toBe(false);
  });

  it("capsule layout: the capsule's document is used and the RETIRED root is never touched", () => {
    const repo = tempTree("foundation-country-codes-capsule-");
    const capsuleDocument = plantDeployment(path.join(repo, "deployment"));
    // The retired location: `<repo>/content/COUNTRY-CODES.md` (the pre-capsule path).
    const retired = path.join(repo, COUNTRY_CODES_DOCUMENT);
    writeFile(retired, plantedDocument());

    const check = checkCountryCodeReference({}, repo);
    expect(check.layout).toBe("capsule");
    expect(check.deploymentRoot).toBe(path.join(repo, "deployment"));
    expect(check.document).toBe(capsuleDocument);

    expect(syncCountryCodeReference({}, repo).changed).toBe(true);
    expect(readFileSync(capsuleDocument, "utf8")).toContain("`ca` Canada");
    expect(readFileSync(retired, "utf8")).toBe(plantedDocument());
  });

  it("override layout: the override root wins, and neither installed tree is written", () => {
    const repo = tempTree("foundation-country-codes-override-repo-");
    const override = tempTree("foundation-country-codes-override-");
    const repoDocument = plantDeployment(repo);
    const overrideDocument = plantDeployment(override);
    const decoy = path.join(repo, "deployment", "content", "COUNTRY-CODES.md");
    writeFile(decoy, plantedDocument());

    const check = checkCountryCodeReference({ FOUNDATION_DEPLOYMENT_ROOT: override }, repo);
    expect(check.layout).toBe("override");
    expect(check.deploymentRoot).toBe(override);
    expect(check.document).toBe(overrideDocument);

    expect(syncCountryCodeReference({ FOUNDATION_DEPLOYMENT_ROOT: override }, repo).changed).toBe(true);
    expect(readFileSync(overrideDocument, "utf8")).toContain("`ca` Canada");
    expect(readFileSync(repoDocument, "utf8")).toBe(plantedDocument());
    expect(readFileSync(decoy, "utf8")).toBe(plantedDocument());
  });
});

describe("the generator consumes the ONE seam, and no second resolver exists", () => {
  const script = readFileSync(
    path.join(process.cwd(), "scripts", "generate-country-code-reference.mjs"),
    "utf8",
  );
  /** CODE lines only: the header legitimately names the layouts and the seam in prose. */
  const code = script.split(/\r?\n/).filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line));

  it("imports the shared authority as PLAIN ESM and spells no deployment location of its own", () => {
    expect(code.some((line) => /from\s+["'][^"']*deployment-build\.mjs["']/.test(line))).toBe(true);
    for (const line of code) {
      expect(line, `must not resolve the deployment itself: ${line}`).not.toMatch(
        /FOUNDATION_DEPLOYMENT_ROOT|site\.config\.json/,
      );
      expect(line, `must not anchor the document to the repository: ${line}`).not.toMatch(
        /join\(\s*ROOT\s*,\s*["']content["']/,
      );
    }
  });

  it("is exposed as ONE plain-node command pair, so no loader flag is needed", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(manifest.scripts["country-codes:sync"]).toBe(
      "node scripts/generate-country-code-reference.mjs",
    );
    expect(manifest.scripts["country-codes:check"]).toBe(
      "node scripts/generate-country-code-reference.mjs --check",
    );
    for (const name of ["country-codes:sync", "country-codes:check"]) {
      expect(manifest.scripts[name]).not.toMatch(
        /--experimental-strip-types|--disable-warning|--loader/,
      );
    }
  });

describe("the sanctioned write boundary is ONE document, and `--check` never writes (ISO-B3C2B)", () => {
  /** The repository's generator, invoked exactly as `package.json` invokes it. */
  const SCRIPT = path.join(process.cwd(), "scripts", "generate-country-code-reference.mjs");

  /** A deployment-shaped tree with decoys on EVERY protected authored surface, plus its document. */
  function plantFullDeployment(root: string): string {
    const document = plantDeployment(root);
    writeFile(path.join(root, "config", "i18n", "en.json"), '{ "decoy": true }\n');
    writeFile(path.join(root, "content", "pages", "markdown", "ww", "en", "home.md"), "# Decoy\n");
    writeFile(path.join(root, "content", "assets", "logo.svg"), "<svg/>\n");
    return document;
  }

  it("sync changes that ONE document and nothing else in the selected deployment", () => {
    const root = tempTree("foundation-country-codes-boundary-");
    const document = plantFullDeployment(root);

    const before = captureProductionStateManifest(root);
    expect(syncCountryCodeReference({}, root).changed).toBe(true);
    const after = captureProductionStateManifest(root);

    // The whole protected surface is manifested before and after: the ONLY path that may differ is the
    // document the generator owns. A configuration, dictionary, page or artwork write fails here.
    expect(productionStateDrift(before, after)).toEqual(["content/COUNTRY-CODES.md (modified)"]);
    expect(readFileSync(document, "utf8")).toContain("`ca` Canada");
  });

  it("`--check` reports drift, exits 1, and leaves every byte AND timestamp alone", () => {
    const root = tempTree("foundation-country-codes-check-stale-");
    const document = plantFullDeployment(root);

    const before = captureProductionStateManifest(root);
    const stamp = statSync(document).mtimeMs;
    let status: number | undefined;
    let stderr = "";
    try {
      execFileSync(process.execPath, [SCRIPT, "--check"], {
        cwd: process.cwd(),
        env: { ...process.env, FOUNDATION_DEPLOYMENT_ROOT: root },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      const failure = error as { status?: number; stderr?: string };
      status = failure.status;
      stderr = failure.stderr ?? "";
    }

    expect(status, "a stale generated section must fail the check").toBe(1);
    expect(stderr).toContain("COUNTRY-CODE REFERENCE CHECK FAILED");
    expect(productionStateDrift(before, captureProductionStateManifest(root))).toEqual([]);
    expect(readFileSync(document, "utf8")).toBe(plantedDocument());
    expect(statSync(document).mtimeMs).toBe(stamp);
  });

  it("`--check` on a current document exits 0 and still writes nothing", () => {
    const root = tempTree("foundation-country-codes-check-clean-");
    plantFullDeployment(root);
    // Bring the document up to date first: `sync` is the mode that MAY write.
    syncCountryCodeReference({}, root);

    const before = captureProductionStateManifest(root);
    const stamp = statSync(path.join(root, COUNTRY_CODES_DOCUMENT)).mtimeMs;
    execFileSync(process.execPath, [SCRIPT, "--check"], {
      cwd: process.cwd(),
      env: { ...process.env, FOUNDATION_DEPLOYMENT_ROOT: root },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(productionStateDrift(before, captureProductionStateManifest(root))).toEqual([]);
    expect(statSync(path.join(root, COUNTRY_CODES_DOCUMENT)).mtimeMs).toBe(stamp);
  });
});

});
