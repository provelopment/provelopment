/**
 * THE DISPOSABLE FOUR-SPOKE INSTALLATION — ONE HUB, FOUR MEMBERS (R1 BROWSER PROOF)
 * ================================================================================
 *
 * The fixture the Hub-scoped Spoke switcher is proved with IN A REAL BROWSER. It is deliberately NEUTRAL —
 * `primary`, `docs`, `catalog`, `support` — because the subject is a PLATFORM capability, not any one
 * adopter's organization.
 *
 * ONE INSTALLATION, ONE HUB. Every Spoke this manifest declares is a member of the SAME Hub: that is the
 * membership boundary the switcher is scoped to. Nothing here expresses a relationship between
 * organizations, and no second registry exists — a Spoke is switchable because it is DECLARED HERE and its
 * destination hostname routes back to it.
 *
 * THE FOUR FACTS THE PROOF NEEDS, and where each comes from:
 *
 *   primary   ONE Site, ONE locale, NO Locations, no Layout switcher   → the exact visitor condition that
 *                                                                        hid Web-1's `www` control row
 *   docs      TWO locales and an ENABLED Layout switcher               → a Spoke that DOES have other
 *                                                                        header controls beside the switcher
 *   catalog   an ADDITIONAL hostname claim (`catalog-staging.localhost`)→ canonical → additional-claim
 *                                                                        destination
 *   support   the Installation's INSPECTION Spoke                      → inspection hostname → another Hub
 *                                                                        Spoke
 *
 * The manifest therefore declares `spokeSwitcher` with all four members in AUTHORED order, using all three
 * kinds of routable destination the platform supports.
 *
 * The tree it writes is exactly the authored form the accepted authorities resolve, so
 * `resolveSpokeDeclarations`, `readSpokeSiteConfig`, `composeInstallationSpokeHub` and
 * `installationRuntimeIndex` accept it with no test-only branch.
 *
 * NO SPOKE-SCOPED ARTWORK IS AUTHORED, AND NONE IS NEEDED: no Spoke declares `site.assets` and no navigation
 * item names a Spoke-scoped icon, so nothing addresses `/spokes/<segment>/assets/**` and the platform's own
 * committed namespace serves every page. That keeps this fixture about the SWITCHER (and keeps it out of the
 * generated-namespace write domain the browser harness owns).
 *
 * Plain ESM with JSDoc types: the browser scenario runs under plain `node`.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** The four Spokes of ONE Hub, in MANIFEST/AUTHORED order. */
export const HUB_SPOKES = [
  {
    id: "primary",
    hostname: "primary.localhost",
    siteName: "Primary Spoke Site",
    tagline: "The primary member of this Hub",
    onlyRoute: "primary-only",
    /** ONE locale, ONE Site, no Locations, no Layout switcher — the Web-1 `www` condition. */
    locales: ["en"],
    layoutSwitcher: false,
  },
  {
    id: "docs",
    hostname: "docs.localhost",
    siteName: "Docs Spoke Site",
    tagline: "The documentation member of this Hub",
    onlyRoute: "docs-only",
    /** TWO locales (a Language control) and an enabled Layout switcher: a Spoke with OTHER controls too. */
    locales: ["en", "de"],
    layoutSwitcher: true,
  },
  {
    id: "catalog",
    hostname: "catalog.localhost",
    siteName: "Catalog Spoke Site",
    tagline: "The catalog member of this Hub",
    onlyRoute: "catalog-only",
    locales: ["en"],
    layoutSwitcher: false,
    /** An ADDITIONAL hostname claim: routing only, never a second canonical origin. */
    hostAliases: ["catalog-staging.localhost"],
  },
  {
    id: "support",
    hostname: "support.localhost",
    siteName: "Support Spoke Site",
    tagline: "The support member of this Hub",
    onlyRoute: "support-only",
    locales: ["en"],
    layoutSwitcher: false,
  },
];

/**
 * THE INSTALLATION'S INSPECTION POLICY: `support` represents this Installation on the inspection hostname,
 * exactly as an operator's deployment URL would. `primary` is deliberately NOT the nominated Spoke, so a
 * proof cannot pass by assuming the first member answers.
 */
export const HUB_INSPECTION = {
  spokeId: "support",
  hostname: "inspection.localhost",
};

/**
 * THE AUTHORED HUB-SCOPED SWITCHER — ONE option per member of this Hub, in this order, covering all three
 * kinds of destination the platform accepts:
 *
 *   primary  → its own canonical origin
 *   docs     → its own canonical origin
 *   catalog  → its ADDITIONAL claim (a staging host serving the same Spoke)
 *   support  → the INSPECTION hostname the policy nominates for it
 */
export const HUB_SWITCHER = {
  options: [
    { spokeId: "primary", label: "Primary", href: "https://primary.localhost" },
    { spokeId: "docs", label: "Documentation", href: "https://docs.localhost" },
    { spokeId: "catalog", label: "Catalog", href: "https://catalog-staging.localhost" },
    { spokeId: "support", label: "Support", href: "https://inspection.localhost" },
  ],
};

/** The committed synthetic deployment: the SOURCE of this Installation's pages and dictionaries. */
function fixtureRoot(repositoryRoot) {
  return path.join(repositoryRoot, "tests", "fixtures", "synthetic-deployment");
}

/** A Spoke's own configuration, authored as the schema expects it. */
function spokeConfig(repositoryRoot, spoke) {
  const source = JSON.parse(
    readFileSync(path.join(fixtureRoot(repositoryRoot), "site.config.json"), "utf8"),
  );

  return {
    site: {
      url: `https://${spoke.hostname}`,
      name: spoke.siteName,
      tagline: spoke.tagline,
      description: `${spoke.siteName} — a member of one Hub, declared in one Installation.`,
    },
    i18n: {
      defaultLocale: "en",
      locales: spoke.locales.map((code) =>
        code === "en" ? { code, label: "English", englishLabel: "English" } : { code, label: "Deutsch", englishLabel: "German" },
      ),
    },
    sites: [{ code: "ww", label: "Global" }],
    defaultSite: "ww",
    contact: { email: `hello@${spoke.hostname}` },
    socialLinks: [],
    navigation: [
      { label: "Home", href: "/" },
      { label: "About", href: "/about" },
    ],
    business: { regions: {} },
    ...(spoke.layoutSwitcher ? { ui: { layoutSwitcher: { enabled: true, default: "sidebar" } } } : {}),
    features: {
      analytics: { provider: source.features?.analytics?.provider ?? "none" },
      maps: { provider: "none" },
      booking: { provider: "none" },
      contact: source.features?.contact ?? { provider: "stub" },
    },
  };
}

/**
 * A Spoke's dictionary: the fixture's own English wording, plus the switchover copy the platform requires.
 *
 * `spokeSwitcher.label` is REQUIRED for every locale of every Spoke once the Installation authors a switcher
 * (the build's own lock refuses a build without it), so every locale this fixture declares carries it.
 */
function spokeDictionary(repositoryRoot, spoke, locale) {
  const source = JSON.parse(
    readFileSync(path.join(fixtureRoot(repositoryRoot), "config", "i18n", `${locale}.json`), "utf8"),
  );

  return {
    ...source,
    home: { ...source.home, tagline: spoke.tagline },
    navigation: {
      ...source.navigation,
      items: { ...source.navigation.items, ["/"]: `${spoke.id} home`, ["/about"]: `${spoke.id} about` },
    },
    // ONE control, four authored members: the accessible name the header resolves from THIS locale.
    spokeSwitcher: { label: locale === "de" ? "Bereiche dieses Hubs" : "Sections of this Hub" },
  };
}

/** A Spoke's own README, so its content tree is authored the way the accepted contract expects. */
function spokeReadme(spoke) {
  return [
    `# ${spoke.siteName}`,
    "",
    `A member of ONE Hub, declared in one Installation as Spoke \`${spoke.id}\`.`,
    `It answers for \`https://${spoke.hostname}\`, and for nothing else.`,
    `Its own authored route inside this Spoke is \`/${spoke.onlyRoute}\`.`,
    "",
  ].join("\n");
}

/**
 * THE DISPOSABLE INSTALLATION, in the caller's own OS-temp domain.
 *
 * @param {string} repositoryRoot the repository root (the committed fixture is READ from it)
 * @returns {{ root: string, spokes: typeof HUB_SPOKES, inspection: typeof HUB_INSPECTION }}
 */
export function materializeFourSpokeInstallation(repositoryRoot) {
  const root = mkdtempSync(path.join(tmpdir(), "foundation-four-spoke-"));
  const fixture = fixtureRoot(repositoryRoot);

  for (const spoke of HUB_SPOKES) {
    const spokeRoot = path.join(root, "spokes", spoke.id);
    mkdirSync(path.join(spokeRoot, "config", "i18n"), { recursive: true });
    mkdirSync(path.join(spokeRoot, "content", "pages"), { recursive: true });

    writeFileSync(
      path.join(spokeRoot, "site.config.json"),
      `${JSON.stringify(spokeConfig(repositoryRoot, spoke), null, 2)}\n`,
    );
    for (const locale of spoke.locales) {
      writeFileSync(
        path.join(spokeRoot, "config", "i18n", `${locale}.json`),
        `${JSON.stringify(spokeDictionary(repositoryRoot, spoke, locale), null, 2)}\n`,
      );
    }
    writeFileSync(path.join(spokeRoot, "content", "README.md"), spokeReadme(spoke));

    // THE SHARED PUBLIC COORDINATES, copied from the committed fixture: every Spoke answers the SAME
    // pathnames with ITS OWN content, which is what makes a switcher destination observable.
    cpSync(path.join(fixture, "content", "pages"), path.join(spokeRoot, "content", "pages"), {
      recursive: true,
    });
  }

  writeFileSync(
    path.join(root, "spokes.json"),
    `${JSON.stringify(
      {
        spokes: HUB_SPOKES.map((spoke) => ({
          id: spoke.id,
          root: `spokes/${spoke.id}`,
          ...(spoke.hostAliases === undefined ? {} : { hostAliases: [...spoke.hostAliases] }),
        })),
        inspectionSpoke: HUB_INSPECTION.spokeId,
        inspectionHosts: [HUB_INSPECTION.hostname],
        spokeSwitcher: HUB_SWITCHER,
      },
      null,
      2,
    )}\n`,
  );

  return { root, spokes: HUB_SPOKES, inspection: HUB_INSPECTION };
}
