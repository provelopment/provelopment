import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  BROWSER_SCOPES,
  DEFAULT_BROWSER_SCOPE,
  SCENARIO_SUFFIX,
  browserScopePlan,
  deploymentBrowserDirectory,
  deploymentScenarioFiles,
  describeBrowserScope,
  parseBrowserScope,
} from "../browser/scope.mjs";

/**
 * ONE HARNESS, TWO OWNERS, ONE SELECTION POLICY (FOUNDATION-DEPLOYMENT-ISO-B3A)
 * ===========================================================================
 *
 * The browser matrix used to be all-or-nothing: one command ran the Foundation's generic scenarios
 * AND whichever deployment was installed. Ownership therefore has to be stated somewhere, and this
 * suite holds it to the contract the harness and its commands rely on:
 *
 *   · a scope names an OWNER, and the two owners' families are DISJOINT (their intersection is
 *     empty) while their union is exactly `all`;
 *   · an unknown, absent or malformed scope is REFUSED — a validation surface must never silently
 *     run more, or less, than it was told;
 *   · ownership is FILESYSTEM-DRIVEN: a deployment's scenarios are the `*.scenario.mjs` files in the
 *     SELECTED deployment's own `tests/browser/**`, so nothing here names `deployment/`, nothing
 *     enumerates scenarios, and adding a deployment edits no list;
 *   · there is ONE harness and ONE discovery mechanism — the generic family lives INSIDE
 *     `tests/browser/matrix.mjs` (it is not a discoverable file) and the deployment family is
 *     discovered by that same harness.
 *
 * The assertions are invariants rather than enumerations on purpose: they stay true as scenarios are
 * added, and they fail if a second runner, a duplicated policy or a second discovery mechanism
 * appears.
 */
const ROOT = process.cwd();
const harness = readFileSync(path.join(ROOT, "tests", "browser", "matrix.mjs"), "utf8");

function manifest(): { scripts: Record<string, string> } {
  return JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
}

describe("a browser scope names an owner, and the owners are disjoint", () => {
  it("accepts exactly the three scopes, and defaults to the conservative superset", () => {
    expect(BROWSER_SCOPES).toEqual(["foundation", "deployment", "all"]);
    expect(DEFAULT_BROWSER_SCOPE).toBe("all");
  });

  it("parses an explicit scope in both spellings, and defaults when none is given", () => {
    expect(parseBrowserScope([])).toBe("all");
    expect(parseBrowserScope(["--scope", "foundation"])).toBe("foundation");
    expect(parseBrowserScope(["--scope", "deployment"])).toBe("deployment");
    expect(parseBrowserScope(["--scope=deployment"])).toBe("deployment");
    expect(parseBrowserScope(["--scope", "all"])).toBe("all");
  });

  it("refuses an unknown scope, a missing value and an unknown option", () => {
    expect(() => parseBrowserScope(["--scope", "nonsense"])).toThrow(/unknown browser scope/);
    expect(() => parseBrowserScope(["--scope"])).toThrow(/unknown browser scope/);
    expect(() => parseBrowserScope(["--scope", "foundation", "--scope", "everything"])).toThrow(
      /unknown browser scope/,
    );
    expect(() => parseBrowserScope(["--scpoe", "deployment"])).toThrow(/unknown option/);
    expect(() => browserScopePlan("everything")).toThrow(/unknown browser scope/);
  });

  it("plans families whose intersection is empty and whose union is everything", () => {
    const foundation = browserScopePlan("foundation");
    const deployment = browserScopePlan("deployment");
    const all = browserScopePlan("all");

    expect(foundation).toEqual({ foundation: true, deployment: false });
    expect(deployment).toEqual({ foundation: false, deployment: true });
    expect(all).toEqual({ foundation: true, deployment: true });

    for (const family of ["foundation", "deployment"] as const) {
      // Intersection is empty: no scope can run another owner's family…
      expect(foundation[family] && deployment[family]).toBe(false);
      // …and the union is complete: `all` is exactly the two owners together.
      expect(all[family]).toBe(foundation[family] || deployment[family]);
    }
    expect(describeBrowserScope("all")).toBe("foundation + deployment");
    expect(describeBrowserScope("foundation")).toBe("foundation only");
    expect(describeBrowserScope("deployment")).toBe("deployment only");
  });
});

describe("deployment-owned scenarios are discovered, never enumerated", () => {
  it("selects exactly the scenario files of the ONE convention, deterministically ordered", () => {
    expect(SCENARIO_SUFFIX).toBe(".scenario.mjs");
    expect(
      deploymentScenarioFiles([
        "b.scenario.mjs",
        "cdp.mjs",
        "matrix.mjs",
        "a.scenario.mjs",
        "README.md",
        "scope.mjs",
      ]),
    ).toEqual(["a.scenario.mjs", "b.scenario.mjs"]);
  });

  it("derives the deployment's own surface from the root the authority SELECTED", () => {
    // Capsule, repository and override roots all answer the same way, so no layout is special: the
    // tree is appended in the ROOT's own convention, and the harness therefore spells no platform
    // path and no `deployment/` of its own.
    expect(deploymentBrowserDirectory("C:\\capsule")).toBe("C:\\capsule\\tests\\browser");
    expect(deploymentBrowserDirectory("/tmp/acme")).toBe("/tmp/acme/tests/browser");
    expect(deploymentBrowserDirectory("/tmp/acme/")).toBe("/tmp/acme/tests/browser");
  });

  it("keeps each owner's scenarios in ITS OWN tree — one harness, one owner each (M16)", () => {
    // The DEPLOYMENT family is discovered from the SELECTED DEPLOYMENT's own browser directory, so a
    // Foundation-owned scenario in the harness's directory can never be executed by a `deployment`-scoped run:
    // the two families are discovered from two different roots.
    const harness = readFileSync(path.join(ROOT, "tests", "browser", "matrix.mjs"), "utf8");
    expect(harness).toContain("deploymentBrowserDirectory(deployment.root)");
    expect(harness).toContain("discoverFoundationScenarios");
    // …and the Foundation family is discovered from the harness directory, never from a deployment's.
    expect(harness).toContain("await readdir(HERE)");
    // The Foundation-owned scenarios that exist are exactly the harness directory's own `*.scenario.mjs`
    // files, and the deployment discovery never points at that directory.
    const foundationOwned = deploymentScenarioFiles(readdirSync(path.join(ROOT, "tests", "browser")));
    expect(foundationOwned.length).toBeGreaterThan(0);
    expect(harness).not.toContain("deploymentScenarioFiles(readdirSync(HERE))");
  });
});

describe("the harness keeps ONE runner and ONE discovery policy", () => {
  it("gates each family by the plan, and discovers the deployment tree exactly once", () => {
    expect(harness).toContain("if (scopePlan.deployment) {");
    expect(harness).toContain("if (scopePlan.foundation) {");
    expect(harness).toContain("browserScopePlan(scope)");
    expect(harness).toContain("parseBrowserScope()");
    expect(harness.match(/await discoverDeploymentScenarios\(\);/g) ?? []).toHaveLength(1);
    expect(harness).toContain("deploymentBrowserDirectory(deployment.root)");
    // The installed deployment comes from the ONE authority, not from a second capsule rule here.
    expect(harness).toContain("resolveDeploymentForBuild(process.env, ROOT)");
    expect(harness).not.toContain("DEPLOYMENT_CAPSULE_ROOT");
  });

  it("exposes the scope as commands over that ONE harness — never a second runner", () => {
    const scripts = manifest().scripts;
    expect(scripts["test:browser"]).toBe("node tests/browser/matrix.mjs");
    expect(scripts["test:browser:foundation"]).toBe("node tests/browser/matrix.mjs --scope foundation");
    expect(scripts["test:browser:deployment"]).toBe("node tests/browser/matrix.mjs --scope deployment");
    for (const name of ["test:browser", "test:browser:foundation", "test:browser:deployment"]) {
      expect(scripts[name], name).not.toMatch(/--experimental-strip-types|--loader/);
    }
  });

  it("exposes each Vitest project through the ONE existing configuration", () => {
    const scripts = manifest().scripts;
    expect(scripts["test"]).toBe("vitest run");
    expect(scripts["test:foundation"]).toBe("vitest run --project foundation");
    expect(scripts["test:deployment"]).toBe("vitest run --project deployment");
  });
});
