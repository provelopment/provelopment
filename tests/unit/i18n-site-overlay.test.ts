/**
 * FOUNDATION-S1E2 — SITE+LOCALE DICTIONARY OVERLAYS.
 *
 * The shared dictionary stays the baseline and an OPTIONAL `config/i18n/sites/<site>/<locale>.json`
 * overlays it for ONE site. These tests run the real registry against a temporary directory, so the
 * merge, the refusal rules and the isolation between sites are proved without touching real config.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { deploymentPaths } from "@/config/deployment-root";
import { loadDictionaryRegistry } from "@/config/i18n/registry";

const directories: string[] = [];

afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

/** The SHARED baseline: the SELECTED deployment's own dictionary, so the fixture is always schema-valid. */
const baseDictionary = JSON.parse(
  // ISO-H2 — asked of the deployment authority, never spelled here: in the generic project that is the
  // synthetic deployment, so this contract reads no real deployment's dictionary.
  readFileSync(path.join(deploymentPaths().dictionaryDirectory, "en.json"), "utf8"),
) as Record<string, unknown>;

/** A deployment-shaped fixture: one `en` dictionary, one `fr` dictionary, optional overlays. */
function makeDirectories(options: { overrides?: Record<string, Record<string, unknown>> }) {
  const root = mkdtempSync(path.join(tmpdir(), "foundation-i18n-"));
  directories.push(root);

  const dictionaryDirectory = path.join(root, "i18n");
  mkdirSync(dictionaryDirectory, { recursive: true });
  writeFileSync(path.join(dictionaryDirectory, "en.json"), JSON.stringify(baseDictionary));
  writeFileSync(
    path.join(dictionaryDirectory, "fr.json"),
    JSON.stringify({ ...baseDictionary, home: { tagline: "fr", description: "fr" } }),
  );

  const overrideDirectory = path.join(dictionaryDirectory, "sites");
  for (const [site, files] of Object.entries(options.overrides ?? {})) {
    mkdirSync(path.join(overrideDirectory, site), { recursive: true });
    for (const [locale, contents] of Object.entries(files)) {
      writeFileSync(path.join(overrideDirectory, site, `${locale}.json`), JSON.stringify(contents));
    }
  }

  return { dictionaryDirectory, overrideDirectory };
}

function load(options: {
  overrides?: Record<string, Record<string, unknown>>;
  sites?: readonly { code: string; locales: readonly string[] }[];
}) {
  const { dictionaryDirectory, overrideDirectory } = makeDirectories(options);
  return loadDictionaryRegistry({
    directory: dictionaryDirectory,
    overrideDirectory,
    declaredLocales: ["en", "fr"],
    defaultLocale: "en",
    sites: options.sites ?? [
      { code: "ca", locales: ["en", "fr"] },
      { code: "fr", locales: ["fr"] },
    ],
  });
}

describe("site+locale dictionary overlays", () => {
  it("serves the shared dictionary when a site has no override", () => {
    const registry = load({});
    expect(registry.get("en", "ca")).toEqual(registry.get("en"));
    expect(registry.overrides().size).toBe(0);
  });

  it("merges an override over the shared base, keeping the leaves it does not state", () => {
    const registry = load({
      overrides: { ca: { fr: { home: { tagline: "Bonjour du Canada" } } } },
    });

    const canadaFrench = registry.get("fr", "ca");
    expect(canadaFrench.home.tagline).toBe("Bonjour du Canada");
    // Untouched leaves survive the merge: the override is partial, not a replacement dictionary.
    expect(canadaFrench.home.description).toBe("fr");
    expect(canadaFrench.legal).toEqual(baseDictionary.legal);
  });

  it("lets Canada/French and France/French differ, and never crosses between sites", () => {
    const registry = load({
      overrides: {
        ca: { fr: { home: { tagline: "Bonjour du Canada" } } },
        fr: { fr: { home: { tagline: "Bonjour de France" } } },
      },
    });

    expect(registry.get("fr", "ca").home.tagline).toBe("Bonjour du Canada");
    expect(registry.get("fr", "fr").home.tagline).toBe("Bonjour de France");
    // A site with no override of its own reads the SHARED dictionary, never another site's file.
    expect(registry.get("fr", "ww").home.tagline).toBe("fr");
    expect(registry.get("fr").home.tagline).toBe("fr");
    expect([...registry.overrides().keys()].sort()).toEqual(["ca/fr", "fr/fr"]);
  });

  it("refuses an override key the dictionary does not define", () => {
    expect(() =>
      load({ overrides: { ca: { fr: { home: { tagline: "x", bogus: "y" } } } } }),
    ).toThrowError(/sites\/ca\/fr\.json[\s\S]*override schema/);
  });

  it("refuses an override for a site the deployment does not declare", () => {
    expect(() => load({ overrides: { jp: { en: { home: { tagline: "x" } } } } })).toThrowError(
      /not a configured site code/,
    );
  });

  it("refuses an override for a locale the site does not serve", () => {
    expect(() => load({ overrides: { ca: { es: { home: { tagline: "x" } } } } })).toThrowError(
      /not a locale of site "ca"/,
    );
  });

  it("refuses an override that has no shared dictionary to override", () => {
    const { dictionaryDirectory, overrideDirectory } = makeDirectories({
      overrides: { ca: { de: { home: { tagline: "x" } } } },
    });
    expect(() =>
      loadDictionaryRegistry({
        directory: dictionaryDirectory,
        overrideDirectory,
        declaredLocales: ["en", "fr"],
        defaultLocale: "en",
        sites: [{ code: "ca", locales: ["de", "en"] }],
      }),
    ).toThrowError(/no shared dictionary to override/);
  });

  it("loads no overlays at all when no override directory is given", () => {
    const root = mkdtempSync(path.join(tmpdir(), "foundation-i18n-plain-"));
    directories.push(root);
    writeFileSync(path.join(root, "en.json"), JSON.stringify(baseDictionary));

    const registry = loadDictionaryRegistry({
      directory: root,
      declaredLocales: ["en"],
      defaultLocale: "en",
    });

    expect(registry.overrides().size).toBe(0);
    expect(registry.get("en", "ca")).toEqual(registry.get("en"));
  });
});
