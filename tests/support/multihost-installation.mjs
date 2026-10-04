/**
 * THE DISPOSABLE TWO-SPOKE INSTALLATION (FOUNDATION-MULTISITE-M16/M17 PROOF)
 * =========================================================================
 *
 * The test-owned Installation the multi-host proof runs: TWO Spokes that answer for two EXACT hostnames and
 * deliberately expose the SAME logical public coordinates with DIFFERENT facts.
 *
 *   Spoke "alpha"   alpha.localhost   /ww/en/about   Alpha name, Alpha words, Alpha page, Alpha asset
 *   Spoke "beta"    beta.localhost    /ww/en/about   Beta  name, Beta  words, Beta  page, Beta  asset
 *
 * WHAT MAKES THIS A REAL INSTALLATION, NOT A STUB
 * ----------------------------------------------
 * The tree it writes is exactly the authored form the accepted authorities resolve:
 *
 *   <root>/spokes.json                            the manifest the Installation declares its Spokes in
 *   <root>/spokes/<dir>/site.config.json          each Spoke's own configuration (origin, Sites, nav)
 *   <root>/spokes/<dir>/config/i18n/en.json       its own dictionary
 *   <root>/spokes/<dir>/content/pages/**          its own authored pages (one SHARED route, one OWN route)
 *   <root>/spokes/<dir>/content/assets/**         its own artwork sources (role files + its own mark)
 *
 * so `resolveSpokeDeclarations`, `readSpokeSiteConfig`, `composeInstallationSpokeHub` and
 * `installationRuntimeIndex` all accept it with no test-only branch, and the application renders it through
 * the ordinary request path.
 *
 * GENERATED RUNTIME NAMESPACES ARE NOT WRITTEN HERE. A Spoke's own artwork is SERVED from
 * `public/spokes/<segment>/assets/**`; this module only REPORTS which files that namespace needs
 * (`runtimeNamespaceFiles`), because where generated output may be written is the browser harness's write
 * domain (`tests/browser/scratch.mjs`), not a fixture builder's.
 *
 * The fixture's dictionaries, pages and role artwork are READ from the committed synthetic deployment
 * (`tests/fixtures/synthetic-deployment/**`), so this Installation is a legitimate one and stays in step with
 * the schema rather than restating it.
 *
 * Plain ESM with JSDoc types: the browser scenario runs under plain `node`, and Vitest can import the SAME
 * builder for the focused multi-Spoke unit proofs.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
/**
 * THE INSTALLATION'S EXPLICIT INSPECTION POLICY (FOUNDATION-MULTISITE-M20)
 *
 * A hosting platform publishes deployment/branch URLs for the build it is running, and an operator uses
 * them to check that the deployment actually renders. This Installation therefore NOMINATES one Spoke to
 * represent it on such a hostname — `alpha` here, deliberately NOT the real Installation's `foundation`,
 * so a proof cannot pass by relying on a hard-coded id.
 *
 * The hostnames are Vercel-shaped, and the scenario exports them to the build through the platform's own
 * variables (`VERCEL_URL`, `VERCEL_BRANCH_URL`) — the real mechanism, not a test-only switch.
 */
export const MULTIHOST_INSPECTION = {
  spokeId: "alpha",
  /** The platform's unique-deployment URL for this build (`VERCEL_URL`). */
  hostname: "foundation-multihost-4f2c9d1a-provelopment.vercel.app",
  /** The platform's branch URL, which always points at the branch's latest deployment. */
  branchHostname: "foundation-multihost-git-main-provelopment.vercel.app",
};



/** The two Spokes the Installation declares, in MANIFEST ORDER. */
export const MULTIHOST_SPOKES = [
  {
    id: "alpha",
    directory: "spokes/alpha",
    hostname: "alpha.localhost",
    siteName: "Alpha Spoke Site",
    tagline: "Alpha owns this hostname",
    /** The ONE dictionary wording that differs, rendered in the navigation of EVERY page. */
    navigationLabels: { "/": "Alpha Home", "/about": "Alpha About" },
    aboutTitle: "Alpha About (multihost proof)",
    aboutBody: "Alpha wrote this paragraph for the shared public pathname.",
    onlyRoute: "alpha-only",
    onlyTitle: "Alpha Only Route",
  },
  {
    id: "beta",
    directory: "spokes/beta",
    hostname: "beta.localhost",
    siteName: "Beta Spoke Site",
    tagline: "Beta owns this hostname",
    navigationLabels: { "/": "Beta Home", "/about": "Beta About" },
    aboutTitle: "Beta About (multihost proof)",
    aboutBody: "Beta wrote a different paragraph for the same public pathname.",
    onlyRoute: "beta-only",
    onlyTitle: "Beta Only Route",
  },
];

/** The runtime segment of a Spoke id: these ids are ASCII, so the authority's encoding is the id itself. */
function segmentOf(id) {
  return id;
}

/** The committed synthetic deployment: the SOURCE of this Installation's dictionaries and artwork. */
function fixtureRoot(repositoryRoot) {
  return path.join(repositoryRoot, "tests", "fixtures", "synthetic-deployment");
}

/** A Spoke's own configuration, authored as the schema expects it. */
function spokeConfig(repositoryRoot, spoke) {
  const source = JSON.parse(
    readFileSync(path.join(fixtureRoot(repositoryRoot), "site.config.json"), "utf8"),
  );

  return {
    ...source,
    site: {
      ...source.site,
      url: `https://${spoke.hostname}`,
      name: spoke.siteName,
      tagline: spoke.tagline,
      assets: {
        favicon: `https://${spoke.hostname}/spokes/${segmentOf(spoke.id)}/assets/favicon.svg`,
      },
    },
    i18n: { defaultLocale: "en", locales: [{ code: "en", label: "English", englishLabel: "English" }] },
    sites: [{ code: "ww", label: "Global" }],
    defaultSite: "ww",
    // ONE shared route and ONE route this Spoke alone authors: the sitemap inventory therefore differs by
    // CONTENT (not merely by origin), and the shared route proves the same public pathname can be two pages.
      navigation: [
      { label: "Home", href: "/", iconOpen: "icon-home.svg", iconClosed: "icon-home.svg" },
      { label: "About", href: "/about", iconOpen: "icon-about.svg", iconClosed: "icon-about.svg" },
      // This Spoke's OWN mark, addressed by basename exactly as the runtime role artwork is: the rendered
      // page therefore names a PER-HOST Spoke asset URL (`/spokes/<segment>/assets/<id>-spoke.svg`).
      {
        label: "Spoke",
        href: `/${spoke.onlyRoute}`,
        iconOpen: `${spoke.id}-spoke.svg`,
        iconClosed: `${spoke.id}-spoke.svg`,
      },
    ],
    business: { regions: {} },
    socialLinks: [],
    features: {
      analytics: { provider: "none" },
      maps: { provider: "none" },
      booking: { provider: "none" },
      contact: { provider: "stub" },
    },
  };
}

/**
 * A Spoke's dictionary: the fixture's own, with the wording THIS Spoke differs in.
 */
function spokeDictionary(repositoryRoot, spoke) {
  const source = JSON.parse(
    readFileSync(path.join(fixtureRoot(repositoryRoot), "config", "i18n", "en.json"), "utf8"),
  );

  return {
    ...source,
    home: { ...source.home, tagline: spoke.tagline },
    navigation: {
      ...source.navigation,
      items: { "/": spoke.navigationLabels["/"], "/about": spoke.navigationLabels["/about"] },
    },
  };
}

/** A Markdown page: the accepted authoring form, one file per route. */
function page(title, body) {
  return `---\ntitle: ${title}\ndescription: ${body}\n---\n\n${body}\n`;
}

/** Writes one Spoke's authored tree beneath the Installation root. */
function writeSpoke(root, repositoryRoot, spoke) {
  const spokeRoot = path.join(root, ...spoke.directory.split("/"));
  const write = (relative, contents) => {
    const target = path.join(spokeRoot, ...relative.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents, "utf8");
  };

  write("site.config.json", `${JSON.stringify(spokeConfig(repositoryRoot, spoke), null, 2)}\n`);
  write("config/i18n/en.json", `${JSON.stringify(spokeDictionary(repositoryRoot, spoke), null, 2)}\n`);

  // The SHARED public coordinates every Spoke exposes — with THIS Spoke's own content.
  write("content/pages/markdown/ww/en/about.md", page(spoke.aboutTitle, spoke.aboutBody));
  // …and a route only THIS Spoke authors, so the two inventories genuinely differ.
  write(
    `content/pages/markdown/ww/en/${spoke.onlyRoute}.md`,
    page(spoke.onlyTitle, `${spoke.siteName} authors ${spoke.onlyRoute} and no other Spoke does.`),
  );

  // The authored artwork SOURCES (role files + the platform-owned trees), copied from the fixture so this is
  // an Installation the accepted authorities — and the asset installer — accept unchanged.
  cpSync(
    path.join(fixtureRoot(repositoryRoot), "content", "assets"),
    path.join(spokeRoot, "content", "assets"),
    { recursive: true },
  );

  // This Spoke's OWN mark: the one artwork file no other Spoke ships.
  write(
    `content/assets/placeholders/${spoke.id}-spoke.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><title>${spoke.siteName}</title><circle cx="12" cy="12" r="9" /></svg>\n`,
  );
}

/** The source directories a Spoke's own generated namespace is materialised from. */
const NAMESPACE_SOURCE_DIRECTORIES = ["placeholders", "icon-library/icons", "platform-marks"];

/**
 * The GENERATED namespace files ONE Spoke needs, as `{ from, to }` pairs beneath
 * `public/spokes/<segment>/assets/**`: the role artwork, the icons its navigation configures, and its own mark.
 */
export function runtimeNamespaceFiles(spokeRoot, spokeId) {
  const assets = path.join(spokeRoot, "content", "assets");
  const files = [];

  for (const directory of NAMESPACE_SOURCE_DIRECTORIES) {
    const from = path.join(assets, ...directory.split("/"));
    if (!existsSync(from)) continue;
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      if (entry.isFile()) files.push({ from: path.join(from, entry.name), to: entry.name });
    }
  }

  const mark = path.join(assets, "placeholders", `${spokeId}-spoke.svg`);
  if (existsSync(mark)) files.push({ from: mark, to: `${spokeId}-spoke.svg` });
  return files;
}

/**
 * Materialises the two-Spoke Installation into a fresh temporary directory.
 *
 * @param {{ repositoryRoot: string }} options
 * @returns {{
 *   root: string,
 *   manifestFile: string,
 *   inspection: { spokeId: string, hostname: string, branchHostname: string },
 *   spokes: { id: string, segment: string, hostname: string, canonicalOrigin: string, directory: string,
 *             root: string, onlyRoute: string, siteName: string, mark: string }[],
 *   cleanup: () => void,
 * }}
 */
export function materializeMultihostInstallation({ repositoryRoot }) {
  const root = mkdtempSync(path.join(tmpdir(), "foundation-multihost-"));

  writeFileSync(
    path.join(root, "spokes.json"),
    `${JSON.stringify(
      {
        spokes: MULTIHOST_SPOKES.map((spoke) => ({ id: spoke.id, root: spoke.directory })),
        // The Installation's EXPLICIT inspection policy: on a hosting platform's own deployment/branch
        // URL, `alpha` represents this Installation (M20 §29 — an explicit nomination, never a fallback).
        inspectionSpoke: MULTIHOST_INSPECTION.spokeId,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  for (const spoke of MULTIHOST_SPOKES) writeSpoke(root, repositoryRoot, spoke);

  return {
    root,
    manifestFile: path.join(root, "spokes.json"),
    inspection: { ...MULTIHOST_INSPECTION },
    spokes: MULTIHOST_SPOKES.map((spoke) => ({
      id: spoke.id,
      segment: segmentOf(spoke.id),
      hostname: spoke.hostname,
      canonicalOrigin: `https://${spoke.hostname}`,
      directory: spoke.directory,
      root: path.join(root, ...spoke.directory.split("/")),
      onlyRoute: spoke.onlyRoute,
      siteName: spoke.siteName,
      mark: `${spoke.id}-spoke.svg`,
    })),
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
