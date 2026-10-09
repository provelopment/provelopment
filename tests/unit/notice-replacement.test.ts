/**
 * R2 — ONE INTRODUCTORY NOTICE PER PAGE: THE REPLACEMENT OPT-IN, WHERE IT ACTS
 * ===========================================================================
 *
 * THE CAPABILITY. A Spoke whose presented site-wide notice declares `siteNotice.replacesDemoNotices: true`
 * renders that banner as the ONE introductory demonstration notice on a page. The two pages that used to add
 * a second one of their own — the contact page (beside a demonstration contact form) and the Connect page —
 * then add none.
 *
 * HOW IT IS PROVED. Every page assertion renders the page the way the route renders it: ONE explicit context
 * → `spokeServerComposition` → `pageForContext` → HTML. The BANNER is not part of a page's own markup — the
 * shell composes it — so its presence is proved where it lives: the pure resolver's answer for that same
 * context, plus the shell composition's own shape (ONE `<SiteNotice>`, keyed on that resolved notice), which
 * this capability does not touch. A full-document render is deliberately NOT used: the shell's client
 * surfaces require the app router, and a test that mounts them would be proving Next.js rather than this rule.
 *
 * WHAT IT PINS, each case because it fails differently:
 *
 *   1. NO notice at all      the contact and Connect notices render exactly as before, and NO banner band
 *                            appears — a Spoke that presents no notice cannot have replaced anything.
 *   2. An ordinary notice    both page notices STILL render beside the banner: the opt-in is explicit, so an
 *                            installation that does not declare it is untouched.
 *   3. The opt-in declared   both page notices are gone, the banner band is still rendered EXACTLY ONCE, and
 *                            no empty card or spacing artefact survives where a notice was.
 *   4. The refused config    `replacesDemoNotices` without a presented notice is refused by the schema (proved
 *                            in `site-notice-config.test.ts`), and the copy lock still demands the banner copy
 *                            for EVERY served (Site, locale) — which is what makes the declaration safe.
 *   5. Operational feedback  the contact form's own submission feedback is NOT an introductory notice: the
 *                            opt-in cannot reach it, and the form still reports a submission that was not
 *                            delivered.
 *   6. Everything else       the page's own content, its heading, routing, navigation and accessibility are
 *                            untouched — the same page renders the same way with and without the opt-in,
 *                            except for the one notice the adopter declared redundant.
 *   7. The scope             the decision belongs to the SPOKE — one notice, one answer, applied to every Site
 *                            and Locale that Spoke serves — never to one Site or one locale.
 *
 * Fixtures are DISPOSABLE copies of the accepted synthetic deployment: nothing here reads or writes whatever
 * real deployment happens to be installed, and every copy is removed after the file's tests finish.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it } from "vitest";

import {
  pageForContext,
  spokeServerComposition,
} from "@/app/[[...segments]]/server-composition";
import {
  installationRuntimeIndex,
  runtimeContextForSpoke,
  type SpokeRuntimeContext,
} from "@/config/installation-runtime";
import { resolveSiteNotice, type ResolvedSiteNotice } from "@/core/notice";
// PART2
/** The accepted synthetic fixture — the SHAPE every disposable copy keeps. */
const FIXTURES = path.join(process.cwd(), "tests", "fixtures", "synthetic-deployment");

/** The fixture's OWN notice copy — read, never restated, so no wording is an expectation. */
const FIXTURE_DICTIONARY = JSON.parse(
  readFileSync(path.join(FIXTURES, "config", "i18n", "en.json"), "utf8"),
) as {
  readonly contact: { readonly demoNotice: string };
  readonly connect: { readonly demoNotice: string };
};
const CONTACT_NOTICE = FIXTURE_DICTIONARY.contact.demoNotice;
const CONNECT_NOTICE = FIXTURE_DICTIONARY.connect.demoNotice;

/** The banner wording each served locale's dictionary is given when a notice is presented. */
const NOTICE_COPY = { title: "A notice title", body: "A notice body sentence." } as const;

/**
 * The card each page-level notice renders in. Suppression must remove the WHOLE card: a notice hidden inside a
 * surviving wrapper would leave an empty highlighted box, which is the artefact these assertions forbid.
 */
const CONTACT_NOTICE_CARD = "mt-4 rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground";
const CONNECT_NOTICE_CARD = "mt-8 rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground";

const trees: string[] = [];

afterAll(() => {
  for (const tree of trees) rmSync(tree, { recursive: true, force: true });
});

function write(file: string, contents: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
}

interface FixtureOptions {
  /** The authored `siteNotice` block — omitted entirely for a Spoke that presents no notice. */
  readonly siteNotice?: unknown;
  /** Give every served locale the banner's wording in its dictionary. */
  readonly noticeCopy?: boolean;
  /** Author a `/connect` method inventory, so the Connect page carries more than its heading. */
  readonly connectMethods?: boolean;
}

/** ONE disposable Installation whose only Spoke carries the requested notice configuration. */
function fixture(options: FixtureOptions = {}): string {
  const root = mkdtempSync(path.join(tmpdir(), "r2-notice-"));
  trees.push(root);
  const spokeRoot = path.join(root, "spokes", "foundation");
  cpSync(FIXTURES, spokeRoot, { recursive: true });

  write(
    path.join(root, "spokes.json"),
    `${JSON.stringify({ spokes: [{ id: "foundation", root: "spokes/foundation" }] }, null, 2)}\n`,
  );

  const config = JSON.parse(readFileSync(path.join(spokeRoot, "site.config.json"), "utf8"));
  if (options.siteNotice !== undefined) config.siteNotice = options.siteNotice;
  if (options.connectMethods) {
    config.connect = {
      methods: [
        { id: "message", label: "Message us", href: "/contact", demoOnly: true },
        { id: "email", label: "Email us", href: "mailto:hello@example.test" },
      ],
    };
  }
  write(path.join(spokeRoot, "site.config.json"), `${JSON.stringify(config, null, 2)}\n`);

  // The banner's wording is required for EVERY served (Site, locale) of a Spoke that presents it — the fixture
  // serves `ww/en`, `ww/de` and `ca/en`, and the latter resolves the locale's own dictionary.
  for (const locale of ["en", "de"]) {
    const file = path.join(spokeRoot, "config", "i18n", `${locale}.json`);
    const dictionary = JSON.parse(readFileSync(file, "utf8"));
    if (options.noticeCopy) dictionary.siteNotice = { ...NOTICE_COPY };
    write(file, `${JSON.stringify(dictionary, null, 2)}\n`);
  }

  // The two URLs with specialised chrome are ordinary authored pages, so the fixture authors them. A page
  // carries its own frontmatter `title`, exactly like every other authored Markdown page.
  for (const [slug, heading] of [
    ["contact", "Contact"],
    ["connect", "Connect"],
  ] as const) {
    write(
      path.join(spokeRoot, "content", "pages", "markdown", "ww", "en", `${slug}.md`),
      `---\ntitle: ${heading}\n---\n\nAuthored page body for ${slug}.\n`,
    );
  }
  // …and the SECOND locale the Spoke serves gets a page too, so the whole served scope can be exercised.
  write(
    path.join(spokeRoot, "content", "pages", "markdown", "ww", "de", "about.md"),
    "---\ntitle: About (Deutsch)\n---\n\nEin synthetischer Seiteninhalt.\n",
  );

  return root;
}

/** The ONE Spoke of a fixture Installation, through the accepted runtime authority. */
function contextOf(installationRoot: string): SpokeRuntimeContext {
  const context = runtimeContextForSpoke(installationRuntimeIndex(installationRoot), "foundation");
  if (context === null) throw new Error("the fixture Installation must describe its Spoke");
  return context;
}

/** The SERVED page of ONE URL, exactly as the route composes it (the shell's own chrome excluded). */
async function page(root: string, segments: readonly string[]): Promise<string> {
  const composition = spokeServerComposition(contextOf(root));
  const composed = (await pageForContext(composition, segments)) as ReactElement;
  return renderToStaticMarkup(composed);
}

/**
 * The ONE banner THIS Spoke presents, resolved by the same pure rule the shell uses — and therefore the same
 * answer the shell composes from: `null` when the Spoke presents none.
 */
function presentedNotice(root: string): ResolvedSiteNotice | null {
  return resolveSiteNotice(spokeServerComposition(contextOf(root)).siteConfig.siteNotice);
}
// PART3
describe("CASE 1 — a Spoke that presents NO notice keeps both introductory notices", () => {
  it("renders the contact and Connect notices, and presents no banner at all", async () => {
    const root = fixture();
    expect(presentedNotice(root), "no notice is presented, so nothing can have replaced one").toBeNull();

    const contact = await page(root, ["ww", "en", "contact"]);
    expect(contact, "the contact notice").toContain(CONTACT_NOTICE);
    expect(contact, "in its own card").toContain(CONTACT_NOTICE_CARD);

    const connect = await page(root, ["ww", "en", "connect"]);
    expect(connect, "the Connect notice").toContain(CONNECT_NOTICE);
    expect(connect, "in its own card").toContain(CONNECT_NOTICE_CARD);
  });
});

describe("CASE 2 — an ordinary notice, WITHOUT the opt-in, changes nothing", () => {
  it("keeps every page-level notice beside the ONE banner", async () => {
    const root = fixture({
      siteNotice: { mode: "shown", tone: "information" },
      noticeCopy: true,
      connectMethods: true,
    });
    // ONE band, one tone, and NO replacement: the same answer the shell composes the banner from.
    expect(presentedNotice(root)).toEqual({
      mode: "shown",
      tone: "information",
      replacesDemoNotices: false,
    });

    const contact = await page(root, ["ww", "en", "contact"]);
    expect(contact, "the contact notice is untouched").toContain(CONTACT_NOTICE);

    const connect = await page(root, ["ww", "en", "connect"]);
    expect(connect, "the Connect notice is untouched").toContain(CONNECT_NOTICE);
    expect(connect, "the configured methods keep their destinations").toContain('href="/contact"');
    expect(connect, "…including an external one").toContain("mailto:hello@example.test");
  });

  it("treats an explicit `false` exactly as absence", async () => {
    const root = fixture({ siteNotice: { mode: "shown", replacesDemoNotices: false }, noticeCopy: true });
    expect(presentedNotice(root)?.replacesDemoNotices).toBe(false);
    expect(await page(root, ["ww", "en", "contact"])).toContain(CONTACT_NOTICE);
    expect(await page(root, ["ww", "en", "connect"])).toContain(CONNECT_NOTICE);
  });
});

describe("CASE 3 — the opt-in declared: ONE notice per page, and no empty card", () => {
  const optedIn = () =>
    fixture({
      siteNotice: { mode: "shown", replacesDemoNotices: true },
      noticeCopy: true,
      connectMethods: true,
    });

  it("drops the second card on Contact and on Connect while the banner itself is still presented", async () => {
    const root = optedIn();
    // The banner is presented — exactly as the shell composes it — so the page presents ONE notice, not zero.
    expect(presentedNotice(root)).toEqual({
      mode: "shown",
      tone: "information",
      replacesDemoNotices: true,
    });

    const contact = await page(root, ["ww", "en", "contact"]);
    expect(contact, "no second introductory notice").not.toContain(CONTACT_NOTICE);
    expect(contact, "and no empty card left in its place").not.toContain(CONTACT_NOTICE_CARD);

    const connect = await page(root, ["ww", "en", "connect"]);
    expect(connect, "no second introductory notice").not.toContain(CONNECT_NOTICE);
    expect(connect, "and no empty card left in its place").not.toContain(CONNECT_NOTICE_CARD);
  });

  it("leaves EVERY other surface of those pages byte-identical", async () => {
    // The strongest form of "nothing else moved": render the same page with and without the opt-in, remove the
    // notice card from the WITHOUT document, and require the two to be identical.
    const plain = fixture({ siteNotice: { mode: "shown" }, noticeCopy: true, connectMethods: true });
    const replacing = optedIn();
    const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const strip = (html: string) =>
      html
        .replace(new RegExp(`<p class="${escapeRe(CONTACT_NOTICE_CARD)}">[\\s\\S]*?</p>`, "g"), "")
        .replace(new RegExp(`<p class="${escapeRe(CONNECT_NOTICE_CARD)}">[\\s\\S]*?</p>`, "g"), "");

    for (const route of [
      ["ww", "en", "contact"],
      ["ww", "en", "connect"],
    ] as const) {
      const before = await page(plain, route);
      const after = await page(replacing, route);
      expect(before, `${route.join("/")} must actually carry the notice`).toContain(
        route[2] === "contact" ? CONTACT_NOTICE : CONNECT_NOTICE,
      );
      expect(strip(before), `${route.join("/")} differs by more than the notice`).toBe(after);
    }
  });
});
// PART4
describe("CASE 4 — the declaration is checked before it can silence anything", () => {
  it("refuses to compose a Spoke whose presented notice cannot resolve its wording", () => {
    // The replacement changes what a PAGE renders; it never changes which copy a PRESENTED notice must resolve.
    // With no banner wording in any served locale, the build refuses before a single page is composed.
    const root = fixture({ siteNotice: { mode: "shown", replacesDemoNotices: true } });
    expect(() => spokeServerComposition(contextOf(root))).toThrow(
      /site-wide notice is enabled [\s\S]*"ww\/en" is missing "siteNotice\.title"/,
    );
  });

  it("refuses an opt-in that has no presented notice to replace anything WITH", () => {
    // `mode: "hidden"` beside the opt-in is an impossible request — replacement would remove the page-level
    // notices and put nothing in their place — so the CONFIGURATION is refused, at its own path.
    expect(() =>
      spokeServerComposition(
        contextOf(fixture({ siteNotice: { mode: "hidden", replacesDemoNotices: true }, noticeCopy: true })),
      ),
    ).toThrow(/siteNotice\.replacesDemoNotices/);
  });
});

describe("CASE 5 — operational feedback is NOT an introductory notice", () => {
  it("keeps the form's own feedback wired, and the live region that announces it", async () => {
    // The form's feedback is keyed on the SUBMISSION's outcome, inside the form component, which the opt-in
    // never touches: the capability is about the two introduction cards and nothing else.
    const form = readFileSync(path.join(process.cwd(), "src", "components", "site", "contact-form.tsx"), "utf8");
    expect(form, "the unconfiguredDemo feedback is still wired").toContain(
      'state.status === "unconfiguredDemo" ? dict.demoNotice : null',
    );
    expect(form, "and the replacement opt-in cannot reach it").not.toContain("replacesDemoNotices");

    const root = fixture({ siteNotice: { mode: "shown", replacesDemoNotices: true }, noticeCopy: true });
    const contact = await page(root, ["ww", "en", "contact"]);
    expect(contact, "the form's live region").toContain('aria-live="polite"');
    expect(contact, "the form itself").toContain("<form");
    expect(contact, "and its submit control").toContain('type="submit"');
  });
});

describe("CASE 6 — the opt-in touches nothing else", () => {
  it("keeps each page's authored body and its ONE heading", async () => {
    const root = fixture({
      siteNotice: { mode: "shown", replacesDemoNotices: true },
      noticeCopy: true,
      connectMethods: true,
    });
    for (const route of [
      ["ww", "en", "contact"],
      ["ww", "en", "connect"],
    ] as const) {
      const html = await page(root, route);
      const where = route.join("/");
      expect(html, `${where} keeps its authored body`).toContain(`Authored page body for ${route[2]}.`);
      expect((html.match(/<h1[\s>]/g) ?? []).length, `${where} has exactly ONE page heading`).toBe(1);
    }
  });

  it("leaves the shell's OWN banner composition exactly where it was", () => {
    // The banner is not page content: the shell composes it, ONCE, on every page. A replacing Spoke therefore
    // presents ONE notice rather than none, because this capability never touches that composition — pinned
    // here as a structural fact, while the markup itself is proved by the shell's own render suite.
    const shell = readFileSync(
      path.join(process.cwd(), "src", "app", "[[...segments]]", "server-composition.tsx"),
      "utf8",
    );
    expect((shell.match(/<SiteNotice /g) ?? []).length, "ONE banner composition").toBe(1);
    expect((shell.match(/resolveSiteNotice\(/g) ?? []).length, "ONE notice resolution").toBe(1);
    expect(shell, "keyed on the RESOLVED notice").toContain("siteNotice === null");
    expect(shell, "the opt-in decides page content, never the banner").not.toContain("replacesDemoNotices");
  });
});

describe("CASE 7 — the decision is the SPOKE's, applied to every Site and Locale it serves", () => {
  it("answers ONCE, and every served coordinate keeps the banner available", async () => {
    const root = fixture({
      siteNotice: { mode: "shown", replacesDemoNotices: true },
      noticeCopy: true,
      connectMethods: true,
    });
    const composition = spokeServerComposition(contextOf(root));
    expect(composition.siteConfig.sites.length, "this Spoke serves more than one Site").toBeGreaterThan(1);

    // ONE answer for the whole Spoke: every page of every Site and locale reads the SAME resolved notice, so no
    // Site and no locale can be a special case.
    expect(presentedNotice(root)).toEqual({
      mode: "shown",
      tone: "information",
      replacesDemoNotices: true,
    });
    for (const site of composition.siteConfig.sites) {
      for (const locale of site.locales) {
        expect(
          composition.dictionaries.get(locale.path, site.code),
          `${site.code}/${locale.path} resolves its dictionary`,
        ).toBeDefined();
      }
    }

    // …and on a page of each served (Site, locale), no page-level notice survives to repeat the banner.
    for (const segments of [
      ["ww", "en", "contact"],
      ["ww", "en", "connect"],
      ["ww", "de", "about"],
      ["ca", "en", "about"],
    ] as const) {
      const html = await page(root, segments);
      const where = segments.join("/");
      expect(html, `${where} repeats no contact notice`).not.toContain(CONTACT_NOTICE);
      expect(html, `${where} repeats no Connect notice`).not.toContain(CONNECT_NOTICE);
    }
  });
});
