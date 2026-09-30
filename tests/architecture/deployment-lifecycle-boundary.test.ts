import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { deploymentPaths } from "@/config/deployment-root";
import { DEPLOYMENT_OPERATIONAL_STATE_FILE_NAME } from "@/core/deployment-lifecycle";

/**
 * THE LIFECYCLE CONTRACT'S ARCHITECTURAL BOUNDARY (FOUNDATION-B4A)
 * ===============================================================
 *
 * B4A defines a model and NOTHING that performs a lifecycle operation. That is a claim about the source, so
 * it is asserted against the source: the domain stays pure and deterministic, the ports stay contracts, no
 * adapter implements them yet, and the record's location is owned by ONE authority.
 *
 * These are the promises that keep the future mechanics honest — an installer that reached for a clock, a
 * promoter that read the environment, or a second place that decided where the record lives would each make
 * the model unprovable in exactly the way this suite exists to prevent.
 */
const ROOT = process.cwd();
const LIFECYCLE_DIRECTORY = path.join(ROOT, "src", "core", "deployment-lifecycle");
const PORTS = path.join(ROOT, "src", "application", "deployment-lifecycle-ports.ts");
const PATH_AUTHORITY = path.join(ROOT, "src", "config", "deployment-root.ts");

/** Every `.ts`/`.tsx` file beneath a directory. */
function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) found.push(full);
  }
  return found;
}

/** The import specifiers of a source file, in order. */
function importsOf(file: string): string[] {
  const pattern = /(?:from\s+|import\s+|require\()\s*["']([^"']+)["']/g;
  return [...readFileSync(file, "utf8").matchAll(pattern)].map((match) => match[1]);
}

/** A file's CODE, with comments removed: prose about a lifecycle is not a lifecycle. */
function codeLines(file: string): string[] {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ""))
    .filter((line) => line.trim().length > 0);
}

describe("the lifecycle domain is pure, framework-free and deterministic", () => {
  const files = sourceFiles(LIFECYCLE_DIRECTORY);

  it("is the contract's own module set, and nothing else", () => {
    expect(files.map((file) => path.basename(file)).sort()).toEqual(
      ["failures.ts", "index.ts", "model.ts", "release-reference.ts", "state.ts", "transitions.ts"].sort(),
    );
  });

  it("imports nothing outside itself except the release contract's authorities", () => {
    for (const file of files) {
      for (const specifier of importsOf(file)) {
        expect(
          specifier.startsWith("./") || specifier.startsWith("../../../scripts/release/"),
          `${path.basename(file)} imports "${specifier}"`,
        ).toBe(true);
      }
    }
  });

  it("never reads a clock, the environment or a timer", () => {
    for (const file of files) {
      const code = codeLines(file).join("\n");
      for (const forbidden of ["Date.now(", "new Date()", "process.env", "process.cwd(", "setTimeout", "setInterval"]) {
        expect(code.includes(forbidden), `${path.basename(file)} must not use ${forbidden}`).toBe(false);
      }
    }
  });

  it("performs no filesystem, process or network effect", () => {
    for (const file of files) {
      const code = codeLines(file).join("\n");
      for (const forbidden of ["readFileSync", "writeFileSync", "mkdirSync", "rmSync", "execFileSync", "fetch(", "child_process"]) {
        expect(code.includes(forbidden), `${path.basename(file)} must not use ${forbidden}`).toBe(false);
      }
    }
  });
});

describe("the ports are contracts, and nothing implements them yet", () => {
  it("declares types only — no runtime value, no behaviour", () => {
    const code = codeLines(PORTS).join("\n");

    expect(code).toMatch(/export interface DeploymentClock/);
    expect(code).toMatch(/export interface DeploymentOperationalStateStore/);
    expect(code).toMatch(/export interface FoundationReleaseReader/);
    for (const runtime of ["export const", "export function", "export class", "export default"]) {
      expect(code.includes(runtime), `the ports must declare no runtime code (${runtime})`).toBe(false);
    }
  });

  it("is implemented by NO adapter yet, because B4B–B4G own the mechanics", () => {
    const adapters = sourceFiles(path.join(ROOT, "src", "adapters"));
    const importers = adapters.filter((file) =>
      importsOf(file).some((specifier) => specifier.includes("deployment-lifecycle")),
    );

    expect(importers.map((file) => path.relative(ROOT, file))).toEqual([]);
  });
});

describe("the deployment owns WHERE the record lives, the contract owns what it is", () => {
  it("resolves the record inside the deployment root, under the contract's own file name", () => {
    const paths = deploymentPaths();

    expect(paths.operationalStateFile).toBe(`${paths.root}/${DEPLOYMENT_OPERATIONAL_STATE_FILE_NAME}`);
  });

  it("spells the file name ONCE in application source — the contract, not a second literal", () => {
    const spellers = sourceFiles(path.join(ROOT, "src"))
      .filter((file) => codeLines(file).some((line) => line.includes(`"${DEPLOYMENT_OPERATIONAL_STATE_FILE_NAME}"`)))
      .map((file) => path.relative(ROOT, file).split(path.sep).join("/"))
      .sort();

    expect(spellers).toEqual(["src/core/deployment-lifecycle/model.ts"]);
    // …and the path authority resolves it THROUGH that constant rather than repeating the name.
    expect(readFileSync(PATH_AUTHORITY, "utf8")).toContain("DEPLOYMENT_OPERATIONAL_STATE_FILE_NAME");
  });
});

