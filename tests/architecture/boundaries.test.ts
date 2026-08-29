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

const componentsDirectory = path.join(process.cwd(), "src", "components");
const layoutPath = path.join(process.cwd(), "src", "app", "[locale]", "layout.tsx");

function readSource(relativeDirectory: string, file: string): string {
  return readFileSync(path.join(relativeDirectory, file), "utf8");
}

describe("locale-aware business resolution (Phase G)", () => {
  const siteComponentsDirectory = path.join(componentsDirectory, "site");

  it("footer and structured data resolve through the same shared mechanism", () => {
    // Regression guard: if the visible footer reads the resolved location and
    // structured data reads the global one (or vice versa) the two diverge. Both
    // consumers must route through the shared core resolvers so their data can
    // never drift apart.
    const businessInfo = readSource(siteComponentsDirectory, "business-info.tsx");
    const structuredData = readSource(siteComponentsDirectory, "structured-data.tsx");

    // Both visible footer and structured data route through the shared combined
    // resolver so their per-locale data can never drift apart.
    expect(businessInfo).toContain("resolveBusinessForLocale");
    expect(structuredData).toContain("resolveBusinessForLocale");

    // The root [locale] layout passes the active locale into structured data.
    const layout = readFileSync(layoutPath, "utf8");
    expect(layout).toContain("<StructuredData locale={locale} />");
  });

  it("resolver lives in core and introduces no hard-coded locale mapping", () => {
    const coreBusiness = readSource(path.join(process.cwd(), "src", "core"), "business.ts");

    // Resolution must be data-driven (lookup by a config-supplied map key), never
    // locale-specific conditional branches. Guard the semantics of the resolver:
    // overrides are resolved via lookup against `location.locales[locale]`, not
    // literal comparisons against locale codes.
    expect(coreBusiness).toContain("location.locales?.[locale]");
    expect(coreBusiness).not.toMatch(/locale\s*===/); // no `locale === "…"` branch exists
  });
});

describe("provider integration boundaries (Phase H)", () => {
  const siteComponentsDirectory = path.join(componentsDirectory, "site");
  const adaptersDirectory = path.join(process.cwd(), "src", "adapters");

  it("the business component contains no provider-specific URL construction", () => {
    // The visible footer only renders a resolved direction action — it must
    // never know that Google Maps (or any provider) exists.
    const businessInfo = readSource(siteComponentsDirectory, "business-info.tsx");
    expect(businessInfo).not.toContain("google.com");
    expect(businessInfo).toContain("direction.kind === \"link\"");
  });

  it("provider deep-link URLs live only inside their adapter", () => {
    const mapsAdapter = readSource(path.join(adaptersDirectory, "maps"), "google-maps.ts");
    expect(mapsAdapter).toContain("google.com/maps");

    for (const file of listTypeScriptFiles(path.join(process.cwd(), "src"))) {
      if (file.startsWith(path.join(adaptersDirectory, "maps"))) continue;
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("google.com/maps");
    }
  });

  it("the analytics provider dependency stays inside its adapter", () => {
    const analyticsAdapterDirectory = path.join(adaptersDirectory, "analytics");

    for (const file of listTypeScriptFiles(path.join(process.cwd(), "src"))) {
      if (file.startsWith(analyticsAdapterDirectory)) continue;
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/@vercel\/analytics/);
      expect(source, file).not.toMatch(/vercel-analytics/);
    }
  });

  it("the layout renders composed integrations without provider selection", () => {
    // Provider selection belongs to the adapter factories; the layout must only
    // render the already-composed integration.
    const layout = readFileSync(layoutPath, "utf8");
    expect(layout).toContain("createAnalyticsProvider");
    expect(layout).toContain("createDirectionLinkResolver");
    expect(layout).not.toMatch(/\.provider/);
  });

  it("components contain no provider-specific conditionals", () => {
    for (const file of listTypeScriptFiles(componentsDirectory)) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/provider\s*===/);
      expect(source, file).not.toMatch(/===\s*"(vercel|google|external-url)"/);
    }
  });

  it("booking is composed at the app boundary, not inside a component", () => {
    const homePage = readAppFile(path.join("[locale]", "page.tsx"));
    expect(homePage).toContain("createBookingActionResolver");

    const bookingAction = readSource(siteComponentsDirectory, "booking-action.tsx");
    expect(bookingAction).not.toMatch(/provider\s*===/);
    expect(bookingAction).not.toMatch(/===\s*"external-url"/);
  });

  it("adapters own the provider switching and no single giant factory file exists", () => {
    // Each integration has its own factory that SELECTS adapters; provider
    // behaviour lives in per-provider files.
    for (const integration of ["maps", "booking"]) {
      const adapterDirectory = path.join(adaptersDirectory, integration);
      const files = readdirSync(adapterDirectory).filter((name) => /\.[jt]sx?$/.test(name));
      // index (factory) + none + at least one provider adapter
      expect(files, integration).toContain("none.ts");
      expect(files, integration).toContain("index.ts");
    }
  });
});

describe("adapter factory boundary (Phase I)", () => {
  // Capability integration directories governed by the provider boundary rule:
  // concrete provider modules may be imported ONLY by their directory factory
  // (index) or by tests — never by arbitrary application/UI/domain source.
  // `adapters/content/**` is the pre-existing content repository and is
  // explicitly EXCLUDED from this rule.
  const integrationDirectories = ["maps", "booking", "analytics", "contact-inquiry"];
  const adaptersDirectory = path.join(process.cwd(), "src", "adapters");

  it("concrete provider modules are importable only by their factory index (never bypassed)", () => {
    const concreteByDomain = new Map<string, string[]>();

    for (const domain of integrationDirectories) {
      const directory = path.join(adaptersDirectory, domain);
      const concrete = readdirSync(directory)
        .filter((name) => /\.[jt]sx?$/.test(name))
        .filter((name) => !name.startsWith("index"))
        .map((name) => path.basename(name, path.extname(name)));
      expect(concrete.length, `${domain} must expose concrete provider modules`).toBeGreaterThan(0);
      concreteByDomain.set(domain, concrete);
    }

    const violations: string[] = [];

    for (const file of listTypeScriptFiles(path.join(process.cwd(), "src"))) {
      // The pre-existing content-repository adapter is out of scope for this rule.
      if (file.startsWith(path.join(adaptersDirectory, "content"))) continue;

      for (const specifier of extractImportSpecifiers(file)) {
        for (const domain of integrationDirectories) {
          const domainDirectory = path.join(adaptersDirectory, domain);
          // The domain's own factory (index) is the one sanctioned importer.
          const isDomainIndex = file.startsWith(path.join(domainDirectory, "index."));
          const concrete = concreteByDomain.get(domain)!;

          const aliasPrefix = `@/adapters/${domain}/`;
          // Resolve which concrete module (if any) this specifier reaches.
          let resolvedBase: string | undefined;
          if (specifier.startsWith(aliasPrefix)) {
            const remainder = specifier.slice(aliasPrefix.length);
            resolvedBase = remainder.split(".")[0].split("/")[0];
          } else if (file.startsWith(domainDirectory)) {
            // A relative import only targets a concrete module of this domain
            // when the importer lives inside the domain's own directory.
            const relative = specifier.startsWith("../") ? specifier.slice(3) : specifier;
            if (relative.startsWith("./")) {
              resolvedBase = relative.slice(2).split(".")[0];
            }
          }

          if (resolvedBase && concrete.includes(resolvedBase) && !isDomainIndex) {
            violations.push(
              `${path.relative(process.cwd(), file)} imports "${specifier}" (${domain}/${resolvedBase}) outside the factory`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
