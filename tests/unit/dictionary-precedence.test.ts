import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { dictionarySchema } from "@/config/i18n/dictionary";
import { loadDictionaryRegistry } from "@/config/i18n/registry";

/**
 * THE FINAL DICTIONARY PRECEDENCE (FOUNDATION-S1E3A)
 * =================================================
 *
 *   shared base (exact shared locale → else its LANGUAGE BASE)
 *     → site language-base override   `config/i18n/sites/<site>/<lang>.json`
 *     → site exact-locale override    `config/i18n/sites/<site>/<key>.json`   (wins)
 *     → the merged result must satisfy the COMPLETE dictionary schema
 *
 * The point of the language-base step is authoring economy: `config/i18n/fr.json` serves
 * `fr`, `fr-ca` and `fr-fr` alike, so choosing the explicit spelling never means copying a
 * dictionary. These tests run the real registry against a temporary directory, so nothing here
 * touches the shipped configuration.
 */
const directories: string[] = [];

afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

/** The shared baseline: the deployment's own dictionary, so every fixture is schema-valid. */
const template = JSON.parse(
  readFileSync(path.join(process.cwd(), "config", "i18n", "en.json"), "utf8"),
) as Record<string, unknown>;

function withTagline(tagline: string): Record<string, unknown> {
  return { ...template, home: { tagline, description: `${tagline} description` } };
}

function makeRoot(prefix: string): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  directories.push(root);
  return root;
}

/**
 * A deployment with a FRENCH language base (and optionally an exact `fr-ca` dictionary), plus
 * optional site overrides for the `ca` site.
 */
function load(options: { exact?: boolean; siteLanguage?: string; siteExact?: string } = {}) {
  const root = makeRoot("foundation-dict-");
  const i18n = path.join(root, "i18n");
  mkdirSync(i18n, { recursive: true });
  writeFileSync(path.join(i18n, "fr.json"), JSON.stringify(withTagline("fr-base")));
  if (options.exact) {
    writeFileSync(path.join(i18n, "fr-ca.json"), JSON.stringify(withTagline("fr-ca-exact")));
  }

  if (options.siteLanguage !== undefined || options.siteExact !== undefined) {
    mkdirSync(path.join(i18n, "sites", "ca"), { recursive: true });
    if (options.siteLanguage !== undefined) {
      writeFileSync(
        path.join(i18n, "sites", "ca", "fr.json"),
        JSON.stringify({ home: { tagline: options.siteLanguage } }),
      );
    }
    if (options.siteExact !== undefined) {
      writeFileSync(
        path.join(i18n, "sites", "ca", "fr-ca.json"),
        JSON.stringify({ home: { tagline: options.siteExact } }),
      );
    }
  }

  return loadDictionaryRegistry({
    directory: i18n,
    overrideDirectory: path.join(i18n, "sites"),
    // `fr-ca` is a DECLARED locale with no exact dictionary of its own: the language base
    // answers for it, which is exactly the fallback this contract adds.
    declaredLocales: ["fr", "fr-ca"],
    defaultLocale: "fr",
    sites: [
      { code: "ca", locales: ["fr", "fr-ca"] },
      { code: "tf", locales: ["fr"] },
    ],
  });
}

describe("the shared language base serves an explicit locale", () => {
  it("answers `fr-ca` from `fr.json` when no exact dictionary exists", () => {
    const registry = load();
    expect(registry.get("fr").home.tagline).toBe("fr-base");
    expect(registry.get("fr-ca").home.tagline).toBe("fr-base");
    expect(registry.overrides().size).toBe(0);
  });

  it("lets an exact shared dictionary refine its own key only", () => {
    const registry = load({ exact: true });
    expect(registry.get("fr-ca").home.tagline).toBe("fr-ca-exact");
    expect(registry.get("fr").home.tagline).toBe("fr-base");
  });
});

describe("site overrides refine the site's own locales", () => {
  it("lets a site language override reach every locale of that language", () => {
    const registry = load({ siteLanguage: "ca-fr" });
    expect(registry.get("fr", "ca").home.tagline).toBe("ca-fr");
    // …including the explicit spelling, which shares the language.
    expect(registry.get("fr-ca", "ca").home.tagline).toBe("ca-fr");
    // …and it never reaches another site, or the shared dictionary.
    expect(registry.get("fr", "tf").home.tagline).toBe("fr-base");
    expect(registry.get("fr").home.tagline).toBe("fr-base");
  });

  it("lets an exact site override WIN over the site language override", () => {
    const registry = load({ siteLanguage: "ca-fr", siteExact: "ca-fr-ca" });
    expect(registry.get("fr", "ca").home.tagline).toBe("ca-fr");
    expect(registry.get("fr-ca", "ca").home.tagline).toBe("ca-fr-ca");
  });

  it("stacks the exact SHARED dictionary and the site overrides in the documented order", () => {
    const registry = load({ exact: true, siteLanguage: "ca-fr", siteExact: "ca-fr-ca" });
    expect(registry.get("fr-ca", "ca").home.tagline).toBe("ca-fr-ca");
    // The site override states only the tagline; everything else is the shared base.
    expect(registry.get("fr-ca", "ca").home.description).toBe("fr-ca-exact description");
  });

  it("leaves the effective dictionary COMPLETE and schema-valid", () => {
    const registry = load({ siteLanguage: "ca-fr", siteExact: "ca-fr-ca" });
    const effective = registry.get("fr-ca", "ca");
    expect(dictionarySchema.safeParse(effective).success).toBe(true);
    expect(effective.legal).toEqual(template.legal);
  });
});

describe("the overrides the contract refuses", () => {
  it("refuses an unknown key in an exact site override", () => {
    const i18n = path.join(makeRoot("foundation-dict-bad-"), "i18n");
    mkdirSync(path.join(i18n, "sites", "ca"), { recursive: true });
    writeFileSync(path.join(i18n, "fr.json"), JSON.stringify(withTagline("fr-base")));
    writeFileSync(
      path.join(i18n, "sites", "ca", "fr-ca.json"),
      JSON.stringify({ home: { tagline: "x", bogus: "y" } }),
    );

    expect(() =>
      loadDictionaryRegistry({
        directory: i18n,
        overrideDirectory: path.join(i18n, "sites"),
        declaredLocales: ["fr", "fr-ca"],
        defaultLocale: "fr",
        sites: [{ code: "ca", locales: ["fr-ca", "fr"] }],
      }),
    ).toThrowError(/sites\/ca\/fr-ca\.json[\s\S]*override schema/);
  });

  it("refuses an override for a locale the site neither serves nor derives", () => {
    const i18n = path.join(makeRoot("foundation-dict-unserved-"), "i18n");
    mkdirSync(path.join(i18n, "sites", "tf"), { recursive: true });
    writeFileSync(path.join(i18n, "fr.json"), JSON.stringify(withTagline("fr-base")));
    writeFileSync(
      path.join(i18n, "sites", "tf", "fr-ca.json"),
      JSON.stringify({ home: { tagline: "x" } }),
    );

    expect(() =>
      loadDictionaryRegistry({
        directory: i18n,
        overrideDirectory: path.join(i18n, "sites"),
        declaredLocales: ["fr", "fr-ca"],
        defaultLocale: "fr",
        // `tf` serves only `fr`, so an override for `fr-ca` is not its business.
        sites: [{ code: "tf", locales: ["fr"] }],
      }),
    ).toThrowError(/not a locale of site "tf"/);
  });
});
