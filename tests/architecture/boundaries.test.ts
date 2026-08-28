import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcDirectory = path.join(process.cwd(), "src");

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return listTypeScriptFiles(entryPath);
    }

    return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

function extractImportSpecifiers(filePath: string): string[] {
  const source = readFileSync(filePath, "utf8");
  const importPattern = /(?:from\s+|import\s+|require\()\s*["']([^"']+)["']/g;

  return [...source.matchAll(importPattern)].map((match) => match[1]);
}

function assertNoImportsFrom(
  directory: string,
  forbiddenPrefixes: readonly string[],
): void {
  const files = listTypeScriptFiles(directory);

  expect(files.length).toBeGreaterThan(0);

  for (const file of files) {
    for (const specifier of extractImportSpecifiers(file)) {
      const violation = forbiddenPrefixes.find(
        (prefix) => specifier === prefix || specifier.startsWith(prefix),
      );

      expect(violation, `${file} imports "${specifier}"`).toBeUndefined();
    }
  }
}

describe("architectural boundaries", () => {
  it("core does not import frameworks or outer layers", () => {
    assertNoImportsFrom(path.join(srcDirectory, "core"), [
      "react",
      "react-dom",
      "next",
      "@/application",
      "@/adapters",
      "@/components",
      "@/app",
      "@/config",
    ]);
  });

  it("application does not import concrete adapters or framework code", () => {
    assertNoImportsFrom(path.join(srcDirectory, "application"), [
      "@/adapters",
      "@/components",
      "@/app",
      "react",
      "react-dom",
      "next",
    ]);
  });
});

const APP_DIRECTORY = path.join(process.cwd(), "src", "app");

function readAppFile(relativePath: string): string {
  return readFileSync(path.join(APP_DIRECTORY, relativePath), "utf8");
}

describe("error UX boundaries (Phase E)", () => {
  it("error.tsx and global-error.tsx are Client Components as App Router requires", () => {
    for (const file of [
      path.join("[locale]", "error.tsx"),
      path.join("[locale]", "global-error.tsx"),
    ]) {
      const source = readAppFile(file);
      expect(source).toContain('"use client"');
    }
  });

  it("error boundaries never surface debugging information to users", () => {
    // Hard acceptance: error UI must never render error.message, stacks,
    // internal paths, environment details, or console output.
    const forbidden = [
      "error.message",
      ".stack",
      "process.env",
      "console.",
      "window.location",
    ];
    for (const file of [
      path.join("[locale]", "error.tsx"),
      path.join("[locale]", "global-error.tsx"),
    ]) {
      const source = readAppFile(file);
      for (const leak of forbidden) {
        expect(source.includes(leak), `${file} must not expose "${leak}"`).toBe(false);
      }
    }
  });

  it("known missing routes stay on the 404 (not-found) path, not a generic error", () => {
    // The catch-all must call next/navigation notFound() so an unknown
    // in-locale route renders the localized 404 rather than throwing.
    const catchAll = readAppFile(path.join("[locale]", "[...rest]", "page.tsx"));
    expect(catchAll).toMatch(/from\s+["']next\/navigation["']/);
    expect(catchAll).toMatch(/\bnotFound\(\)\s*;/);

    // not-found preserves locale via the root-params contract rather than
    // hard-coding or falling back to an error page.
    const notFound = readAppFile(path.join("[locale]", "not-found.tsx"));
    expect(notFound).toMatch(/from\s+["']next\/root-params["']/);
    expect(notFound).toContain("locale()");
  });
});
