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