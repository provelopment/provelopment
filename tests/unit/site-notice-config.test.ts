/**
 * R1 — THE SITE-WIDE NOTICE AND THE SWITCHER LABEL: CONFIGURATION, COPY AND THE BUILD-TIME LOCKS
 * =============================================================================================
 *
 * THREE layers, each proved where it lives:
 *
 *   CONFIGURATION  `siteNotice` is an OPTIONAL Spoke leaf with a closed vocabulary (`shown` | `hidden`, tone
 *                  `information` | `attention`) and ONE optional replacement opt-in
 *                  (`replacesDemoNotices`, R2); absent stays absent, and a typo — or an opt-in that asks for
 *                  replacement without a notice to replace anything with — is refused at build time rather
 *                  than silently disabling a notice a visitor was meant to read.
 *   DICTIONARY     the notice copy (`title`, `body`) and the switcher's accessible name (`label`) are
 *                  OPTIONAL sections — a deployment without them is valid — but a PRESENT section must be
 *                  complete, so half a notice cannot be authored.
 *   LOCKS          a Spoke that PRESENTS the notice, or an Installation that authors a switcher, must resolve
 *                  that copy for EVERY locale it serves; the build refuses it otherwise, naming the context,
 *                  the locale and the missing field.
 */
import { describe, expect, it } from "vitest";

import { dictionarySchema, dictionaryOverrideSchema } from "@/config/i18n/dictionary";
import {
  assertSiteNoticeCopyPresent,
  assertSpokeSwitcherLabelPresent,
} from "@/config/i18n/invariants";
import { parseSiteConfig } from "@/config/loader";
import type { Dictionary } from "@/config/i18n/dictionary";
import { readFileSync } from "node:fs";
import path from "node:path";

import { syntheticDeploymentPaths } from "../support/synthetic-deployment";

/** A minimal valid configuration, so each case changes exactly ONE leaf. */
const BASE = {
  site: { url: "https://example.test", name: "Example", tagline: "T", description: "D" },
  i18n: { defaultLocale: "en", locales: [{ code: "en", label: "English" }, { code: "de", label: "Deutsch" }] },
  contact: { email: "hello@example.test" },
  socialLinks: [],
  navigation: [{ label: "Home", href: "/" }],
};

const config = (siteNotice: unknown) => ({ ...BASE, siteNotice });

describe("`siteNotice` configuration", () => {
  it("is OPTIONAL, and its absence is threaded through as absence", () => {
    expect(parseSiteConfig(BASE).siteNotice).toBeUndefined();
  });

  it("carries the authored mode and tone for the shell to resolve", () => {
    expect(parseSiteConfig(config({ mode: "shown", tone: "attention" })).siteNotice).toEqual({
      mode: "shown",
      tone: "attention",
    });
    expect(parseSiteConfig(config({ mode: "hidden" })).siteNotice).toEqual({ mode: "hidden" });
  });

  it("carries the replacement opt-in, and REFUSES it without a notice that is actually presented", () => {
    expect(parseSiteConfig(config({ mode: "shown", replacesDemoNotices: true })).siteNotice).toEqual({
      mode: "shown",
      replacesDemoNotices: true,
    });
    expect(parseSiteConfig(config({ mode: "shown", replacesDemoNotices: false })).siteNotice).toEqual({
      mode: "shown",
      replacesDemoNotices: false,
    });

    // R2 — replacement with nothing to replace the page-level notices WITH would remove a warning rather than
    // consolidate it, so the build refuses the combination instead of silently rendering the page notices as if
    // the adopter had never asked.
    expect(() => parseSiteConfig(config({ mode: "hidden", replacesDemoNotices: true }))).toThrow(
      /siteNotice\.replacesDemoNotices: "replacesDemoNotices": true requires "mode": "shown"/,
    );
    // …and the opt-in is a BOOLEAN leaf: a string is refused like any other malformed leaf. A block with the
    // opt-in but NO mode at all is refused too — `mode` is required precisely so "presented or not" is never
    // inferred from the mere presence of an opt-in.
    expect(() => parseSiteConfig(config({ mode: "shown", replacesDemoNotices: "yes" }))).toThrow(
      /siteNotice\.replacesDemoNotices/,
    );
    expect(() => parseSiteConfig(config({ replacesDemoNotices: true }))).toThrow(/siteNotice\.mode/);
  });

  it("refuses an unknown mode, an unknown tone and an unknown leaf", () => {
    expect(() => parseSiteConfig(config({ mode: "visible" }))).toThrow(/supported modes: shown, hidden/);
    expect(() => parseSiteConfig(config({ mode: "shown", tone: "warning" }))).toThrow(
      /supported tones: information, attention/,
    );
    expect(() => parseSiteConfig(config({ mode: "shown", style: "loud" }))).toThrow(
      /Unrecognized key: "style"/,
    );
  });
});

describe("the notice and switcher DICTIONARY sections", () => {
  const baseDictionary = (): Dictionary => {
    // The synthetic deployment's OWN dictionary root, through the accepted test support accessor (a generic
    // test never spells a deployment path itself), so this suite stays valid wherever the fixture lives.
    const file = path.join(syntheticDeploymentPaths().dictionaryDirectory, "en.json");
    return JSON.parse(readFileSync(file, "utf8")) as Dictionary;
  };

  it("accepts a dictionary without either section — the capability is opt-in", () => {
    const parsed = dictionarySchema.safeParse(baseDictionary());
    expect(parsed.success).toBe(true);
  });

  it("requires BOTH notice fields when the section is present, and the switcher's label", () => {
    const withNotice = { ...baseDictionary(), siteNotice: { title: "T", body: "B" } };
    expect(dictionarySchema.safeParse(withNotice).success).toBe(true);
    expect(dictionarySchema.safeParse({ ...baseDictionary(), siteNotice: { title: "T" } }).success).toBe(
      false,
    );
    expect(
      dictionarySchema.safeParse({ ...baseDictionary(), spokeSwitcher: { label: "Sections" } }).success,
    ).toBe(true);
    expect(dictionarySchema.safeParse({ ...baseDictionary(), spokeSwitcher: {} }).success).toBe(false);
  });

  it("keeps the site+locale OVERRIDE schema aligned with the dictionary schema", () => {
    for (const override of [
      { siteNotice: { title: "T" } },
      { siteNotice: { body: "B" } },
      { spokeSwitcher: { label: "Sections" } },
    ]) {
      expect(dictionaryOverrideSchema.safeParse(override).success, JSON.stringify(override)).toBe(true);
    }
    // A leaf the dictionary does not define is still refused — the override cannot drift from the schema.
    expect(dictionaryOverrideSchema.safeParse({ siteNotice: { note: "x" } }).success).toBe(false);
  });
});

describe("the build-time copy locks", () => {
  /** Two served (Site, locale) dictionaries, keyed the way the runtime access keys them. */
  const dictionaries = (siteNotice?: unknown, spokeSwitcher?: unknown): ReadonlyMap<string, Dictionary> =>
    new Map([
      ["ww/en", { siteNotice, spokeSwitcher } as unknown as Dictionary],
      ["ww/de", {} as Dictionary],
    ]);

  it("checks NOTHING when the Spoke presents no notice and the Installation authors no switcher", () => {
    expect(() => assertSiteNoticeCopyPresent(dictionaries(), null, 'Spoke "primary"')).not.toThrow();
    expect(() => assertSpokeSwitcherLabelPresent(dictionaries(), false, 'Spoke "primary"')).not.toThrow();
  });

  it("accepts a Spoke whose presented notice resolves BOTH fields in every served locale", () => {
    const complete = new Map([
      ["ww/en", { siteNotice: { title: "T", body: "B" } } as unknown as Dictionary],
      ["ww/de", { siteNotice: { title: "Ti", body: "Bi" } } as unknown as Dictionary],
    ]);
    expect(() =>
      assertSiteNoticeCopyPresent(
        complete,
        { mode: "shown", tone: "information", replacesDemoNotices: false },
        'Spoke "primary"',
      ),
    ).not.toThrow();
  });

  it("demands the SAME copy when the notice declares replacement, over the same whole scope", () => {
    // R2 changes what a page RENDERS, never which copy a presented notice must resolve: a replacing notice is
    // still a presented notice, so the lock covers exactly the same served (Site, locale) keys.
    const complete = new Map([
      ["ww/en", { siteNotice: { title: "T", body: "B" } } as unknown as Dictionary],
      ["ww/de", { siteNotice: { title: "Ti", body: "Bi" } } as unknown as Dictionary],
    ]);
    const replacing = { mode: "shown", tone: "information", replacesDemoNotices: true } as const;
    expect(() => assertSiteNoticeCopyPresent(complete, replacing, 'Spoke "primary"')).not.toThrow();
    expect(() => assertSiteNoticeCopyPresent(dictionaries(), replacing, 'Spoke "primary"')).toThrow(
      /"ww\/en" is missing "siteNotice\.title"/,
    );
  });

  it("REFUSES a presented notice that cannot resolve its copy, naming the context, locale and field", () => {
    const partial = new Map([
      ["ww/en", { siteNotice: { title: "T", body: "B" } } as unknown as Dictionary],
      ["ww/de", { siteNotice: { title: "Ti" } } as unknown as Dictionary],
    ]);
    expect(() =>
      assertSiteNoticeCopyPresent(partial, { mode: "shown", tone: "information", replacesDemoNotices: false }, 'Spoke "primary"'),
    ).toThrow(/site-wide notice is enabled [\s\S]* in Spoke "primary"[\s\S]*"ww\/de" is missing "siteNotice.body"/);

    // A locale with NO section at all is named too — an enabled notice is never silently blank.
    expect(() =>
      assertSiteNoticeCopyPresent(dictionaries(), { mode: "shown", tone: "information", replacesDemoNotices: false }, 'Spoke "primary"'),
    ).toThrow(/"ww\/en" is missing "siteNotice.title"/);
  });

  it("REFUSES an authored switcher whose label a served locale cannot resolve", () => {
    expect(() => assertSpokeSwitcherLabelPresent(dictionaries(), true, 'Spoke "primary"')).toThrow(
      /every served locale must name it [\s\S]*"ww\/en" is missing "spokeSwitcher.label"/,
    );
    const labelled = new Map([
      ["ww/en", { spokeSwitcher: { label: "Sections" } } as unknown as Dictionary],
      ["ww/de", { spokeSwitcher: { label: "Bereiche" } } as unknown as Dictionary],
    ]);
    expect(() => assertSpokeSwitcherLabelPresent(labelled, true, 'Spoke "primary"')).not.toThrow();
  });

  it("is APPLIED by the context-bound dictionary access (the ONE binding both callers share)", () => {
    // The locks must run where the dictionaries are built for a context, so a Spoke cannot serve an enabled
    // notice without copy merely because a caller forgot to check. The wiring is a STRUCTURAL fact this
    // guard pins, exactly as the accepted booking lock is pinned.
    const access = readFileSync(path.join(process.cwd(), "src", "config", "runtime-dictionaries.ts"), "utf8");
    expect(access).toContain("assertSiteNoticeCopyPresent(");
    expect(access).toContain("assertSpokeSwitcherLabelPresent(");
    expect(access).toContain('from "./i18n/invariants"');
    expect(access).toContain("resolveSiteNotice(");
  });
});
