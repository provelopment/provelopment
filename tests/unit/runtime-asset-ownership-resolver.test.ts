import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { namespaceOwning } from "@/config/assets";
import type { RuntimeAssetNamespace } from "@/config/deployment-root";
import {
  createRuntimeAssetOwnershipResolver,
  type RuntimeAssetOwnershipResolver,
} from "@/config/runtime-asset-resolver";

/**
 * RUNTIME ASSET NAMESPACE OWNERSHIP, PROVED INDEPENDENTLY (FOUNDATION-MULTISITE-S3F2A2-R1)
 * =======================================================================================
 *
 * Three disposable namespace directories in the OS temp directory stand in for a platform namespace and two
 * contexts' own namespaces. They live OUTSIDE every served output root, so the rule is proved without
 * writing inside the repository's shipped assets.
 *
 * Alpha and Beta deliberately own the SAME basename with different contents: exactly the case a
 * process-wide basename cache cannot survive, and what the A/B/A/B proof below catches.
 */

const trees: string[] = [];

afterAll(() => {
  for (const tree of trees) rmSync(tree, { recursive: true, force: true });
});

function tempTree(): string {
  const root = mkdtempSync(path.join(tmpdir(), "runtime-asset-ownership-"));
  trees.push(root);
  return root;
}

function write(file: string, contents: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
}

interface Fixture {
  readonly platform: RuntimeAssetNamespace;
  readonly alpha: RuntimeAssetNamespace;
  readonly beta: RuntimeAssetNamespace;
  readonly platformDirectory: string;
  readonly alphaDirectory: string;
  readonly betaDirectory: string;
}

/** A platform namespace plus two different contexts' own namespaces, all disposable directories. */
function fixture(): Fixture {
  const root = tempTree();
  const platformDirectory = path.join(root, "platform");
  const alphaDirectory = path.join(root, "alpha");
  const betaDirectory = path.join(root, "beta");
  for (const directory of [platformDirectory, alphaDirectory, betaDirectory]) {
    mkdirSync(directory, { recursive: true });
  }
  return {
    platform: { directory: platformDirectory, urlBase: "/assets" },
    alpha: { directory: alphaDirectory, urlBase: "/alpha/assets" },
    beta: { directory: betaDirectory, urlBase: "/beta/assets" },
    platformDirectory,
    alphaDirectory,
    betaDirectory,
  };
}

function alphaResolver(probe: Fixture): RuntimeAssetOwnershipResolver {
  return createRuntimeAssetOwnershipResolver([probe.platform, probe.alpha]);
}

function betaResolver(probe: Fixture): RuntimeAssetOwnershipResolver {
  return createRuntimeAssetOwnershipResolver([probe.platform, probe.beta]);
}

describe("runtime asset ownership resolver", () => {
  it("keeps two contexts' ownership of one basename independent across A/B/A/B lookups", () => {
    const probe = fixture();
    write(path.join(probe.alphaDirectory, "logo-header.svg"), '<svg width="48" height="48"></svg>');
    write(path.join(probe.betaDirectory, "logo-header.svg"), '<svg width="96" height="96"></svg>');

    const alpha = alphaResolver(probe);
    const beta = betaResolver(probe);
    const sequence: ReadonlyArray<readonly [RuntimeAssetOwnershipResolver, string, string]> = [
      [alpha, probe.alphaDirectory, "/alpha/assets"],
      [beta, probe.betaDirectory, "/beta/assets"],
      [alpha, probe.alphaDirectory, "/alpha/assets"],
      [beta, probe.betaDirectory, "/beta/assets"],
    ];

    for (const [resolver, directory, urlBase] of sequence) {
      expect(resolver.namespaceOwning("logo-header.svg")?.directory).toBe(directory);
      expect(resolver.namespaceOwning("logo-header.svg")?.urlBase).toBe(urlBase);
      expect(resolver.runtimeAssetPath("logo-header.svg")).toBe(
        path.join(directory, "logo-header.svg"),
      );
    }
  });

  it("selects the platform namespace when both the platform and a context hold the basename", () => {
    const probe = fixture();
    write(path.join(probe.platformDirectory, "shared.svg"), "<svg></svg>");
    write(path.join(probe.alphaDirectory, "shared.svg"), "<svg></svg>");

    const alpha = alphaResolver(probe);
    expect(alpha.namespaceOwning("shared.svg")?.urlBase).toBe("/assets");
    expect(alpha.namespaceOwning("absent.svg")).toBeNull();
    expect(alpha.namespaceOwning("shared.svg")?.urlBase).toBe("/assets");
    expect(alpha.runtimeAssetPath("shared.svg")).toBe(
      path.join(probe.platformDirectory, "shared.svg"),
    );
  });

  it("cannot see a namespace its context does not declare, even when that directory holds the file", () => {
    const probe = fixture();
    write(path.join(probe.betaDirectory, "foreign.svg"), "<svg></svg>");

    const alpha = alphaResolver(probe);
    expect(alpha.namespaceOwning("foreign.svg")).toBeNull();
    expect(alpha.runtimeAssetPath("foreign.svg")).toBeUndefined();
    expect(betaResolver(probe).namespaceOwning("foreign.svg")?.urlBase).toBe("/beta/assets");
  });

  it("answers unavailable for a basename no declared namespace holds", () => {
    const probe = fixture();
    const alpha = alphaResolver(probe);
    expect(alpha.namespaceOwning("missing.svg")).toBeNull();
    expect(alpha.runtimeAssetPath("missing.svg")).toBeUndefined();
    expect(alpha.namespaceOwning("")).toBeNull();
    expect(alpha.runtimeAssetPath("")).toBeUndefined();
    expect(alpha.runtimeAssetPath(undefined)).toBeUndefined();
  });

  it("is unaffected by later mutation of the array it was created from", () => {
    const probe = fixture();
    write(path.join(probe.betaDirectory, "later.svg"), "<svg></svg>");
    const supplied: RuntimeAssetNamespace[] = [probe.platform, probe.alpha];
    const resolver = createRuntimeAssetOwnershipResolver(supplied);

    supplied.push(probe.beta);
    supplied[0] = probe.beta;

    expect(supplied).toHaveLength(3);
    expect(resolver.namespaces).toHaveLength(2);
    expect(resolver.namespaces[0].directory).toBe(probe.platformDirectory);
    expect(Object.isFrozen(resolver.namespaces)).toBe(true);
    expect(resolver.namespaceOwning("later.svg")).toBeNull();
    expect(resolver.runtimeAssetPath("later.svg")).toBeUndefined();
  });

  it("agrees with the accepted ownership primitive on the same namespace list, for every name", () => {
    const probe = fixture();
    write(path.join(probe.platformDirectory, "platform-own.svg"), "<svg></svg>");
    write(path.join(probe.alphaDirectory, "alpha-own.svg"), "<svg></svg>");
    write(path.join(probe.platformDirectory, "both-own.svg"), "<svg></svg>");
    write(path.join(probe.alphaDirectory, "both-own.svg"), "<svg></svg>");

    const supplied = [probe.platform, probe.alpha];
    const resolver = createRuntimeAssetOwnershipResolver(supplied);
    for (const name of ["platform-own.svg", "alpha-own.svg", "both-own.svg", "missing.svg", ""]) {
      expect(resolver.namespaceOwning(name)).toEqual(namespaceOwning(name, supplied));
    }
  });
});
