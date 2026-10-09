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
 *   <root>/spokes/<dir>/content/assets/**          its own artwork sources (role files, its own brand artwork)
 *
 * so `resolveSpokeDeclarations`, `readSpokeSiteConfig`, `composeInstallationSpokeHub` and
 * `installationRuntimeIndex` all accept it with no test-only branch, and the application renders it through
 * the ordinary request path.
 *
 * GENERATED RUNTIME NAMESPACES ARE NOT WRITTEN HERE. A Spoke's own artwork is SERVED from
 * `public/spokes/<segment>/assets/**`; this module only REPORTS which files that namespace needs — and it
 * reports them by asking the CANONICAL asset plan (`buildPlan`, `scripts/sync-runtime-assets.mjs`), never by
 * enumerating directories of its own (FOUNDATION-MULTISITE-M16/M17) — because where generated output may be
 * written is the browser harness's write domain (`tests/browser/scratch.mjs`), not a fixture builder's.
 *
 * WHY THAT MATTERS. The plan is the ONE authority for what a namespace owns, and the build-time catalog the
 * runtime reads is derived from that same plan, so "what is generated" and "what the runtime believes exists"
 * cannot disagree. A fixture that enumerated artwork itself could install a file the plan never declared —
 * invisible to an inventoried namespace, and therefore a broken image that no gate explains.
 *
 * THIS SPOKE'S OWN ARTWORK LIVES WHERE THE CONTRACT ACCEPTS IT: `content/assets/branding/<id>-spoke.svg` is a
 * SPOKE-OWNED source directory (`SPOKE_DIRECTORIES`), so the canonical plan mirrors it into that Spoke's own
 * namespace, in the catalog, like every other replaceable brand file. A custom filename dropped into
 * `content/assets/placeholders/**` is NOT part of the supported role inventory and would be installed by
 * nothing.
 *
 * The fixture's dictionaries, pages and role artwork are READ from the committed synthetic deployment
 * (`tests/fixtures/synthetic-deployment/**`), so this Installation is a legitimate one and stays in step with
 * the schema rather than restating it.
 *
 * Plain ESM with JSDoc types: the browser scenario runs under plain `node`, and Vitest can import the SAME
 * builder for the focused multi-Spoke unit proofs.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// THE ONE ASSET AUTHORITY. This fixture describes an Installation; it does not decide what that Installation's
// artwork is. Both questions below are answered by the canonical plan and the catalog derived from it
// (`scripts/sync-runtime-assets.mjs`), so a fixture can never disagree with the installer the platform ships.
import { buildPlan, buildRuntimeAssetCatalog, runtimeNamespaces } from "../../scripts/sync-runtime-assets.mjs";
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

  // This Spoke's OWN mark: the one artwork file no other Spoke ships. It is authored in the SUPPORTED
  // Spoke-owned location (`content/assets/branding/**`, see `SPOKE_DIRECTORIES`), so the canonical asset plan
  // installs it into THIS Spoke's own namespace — and into the build-time catalog the runtime reads. A custom
  // filename written into `placeholders/**` would be a file the role inventory does not know and the plan does
  // not install (FOUNDATION-MULTISITE-M16/M17).
  write(
    `content/assets/branding/${spoke.id}-spoke.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><title>${spoke.siteName}</title><circle cx="12" cy="12" r="9" /></svg>\n`,
  );
}

/**
 * The GENERATED files ONE Spoke's OWN namespace needs, as `{ from, to }` pairs to install beneath
 * `public/spokes/<segment>/assets/**` — READ FROM THE CANONICAL PLAN, never enumerated here.
 *
 * The plan (`buildPlan`) is the ONE authority for which authored source becomes which runtime basename in
 * which namespace: a Spoke's replaceable role artwork and its `branding/` belong to the SPOKE, while the shared
 * icon library and the platform marks are installed once into the platform namespace. This function therefore
 * reports only `spoke:<id>` rows — platform-owned artwork is never copied into a Spoke namespace, and no file
 * can be installed that the plan (and so the build-time catalog) does not declare.
 *
 * @param {string} installationRoot the Installation root the plan is asked about
 * @param {string} spokeId the Spoke whose namespace is being materialised
 * @returns {{ from: string, to: string, note: string }[]} absolute source, runtime basename and the plan's reason
 */
export function spokeNamespacePlan(installationRoot, spokeId) {
  const namespace = `spoke:${spokeId}`;
  return buildPlan(installationRoot)
    .filter((row) => row.namespace === namespace)
    .map((row) => {
      const from = path.join(installationRoot, ...row.from.split("/"));
      if (!existsSync(from)) {
        throw new Error(
          `the canonical asset plan installs "${row.to}" into the "${namespace}" namespace from "${row.from}", ` +
            "but this Installation does not author that source. An Installation must ship every source its " +
            "plan mirrors; a plan row with no source is an installation defect, never a namespace the test " +
            "may invent (FOUNDATION-MULTISITE-M16/M17).",
        );
      }
      return { from, to: row.to, note: row.note };
    });
}

/**
 * THE MIRROR/CATALOG AGREEMENT, ASKED OF THE INSTALLATION ITSELF (FOUNDATION-MULTISITE-M16/M17).
 *
 * A namespace that carries a build-time inventory answers ownership from IMMUTABLE DATA — the key's presence
 * IS existence — so a file materialised into such a namespace but absent from its inventory is invisible to
 * the runtime: a broken image, or a 500 while composing the shell. Mirror and catalog must therefore describe
 * the SAME Installation and the SAME files, and this function refuses the run when they do not, naming the
 * canonical preparation instead of leaving the failure to a broken page.
 *
 * A namespace the catalog does not publish is the accepted COMPATIBILITY case — the resolver falls back to the
 * filesystem, which is what a repository whose generated state belongs to a different Installation exercises —
 * so there is nothing to disagree with, and this reports `inventoried: false`.
 *
 * @param {string} installationRoot the Installation root
 * @param {string} spokeId the Spoke whose namespace is about to be materialised
 * @returns {{ urlBase: string, files: string[], inventoried: boolean, missing: string[] }}
 */
export function assertSpokeNamespaceAgreesWithCatalog(installationRoot, spokeId) {
  const namespace = runtimeNamespaces(installationRoot).find((entry) => entry.key === `spoke:${spokeId}`);
  if (namespace === undefined) {
    throw new Error(
      `the Installation at "${installationRoot}" declares no generated namespace for Spoke "${spokeId}".`,
    );
  }

  const files = spokeNamespacePlan(installationRoot, spokeId).map((row) => row.to);
  const inventory = buildRuntimeAssetCatalog(installationRoot).namespaces[namespace.urlBase];
  if (inventory === undefined) return { urlBase: namespace.urlBase, files, inventoried: false, missing: [] };

  const missing = files.filter((name) => !Object.prototype.hasOwnProperty.call(inventory, name));
  if (missing.length > 0) {
    throw new Error(
      "the generated asset MIRROR and the build-time CATALOG do not describe the same Installation: " +
        `"${namespace.urlBase}" is published without ${missing.join(", ")}, yet the canonical plan installs ` +
        "them. Prepare the generated state for THIS Installation before the browser run " +
        `(FOUNDATION_DEPLOYMENT_LAYOUT=override FOUNDATION_DEPLOYMENT_ROOT="${installationRoot}" pnpm assets:sync), ` +
        "so the mirror and the catalog are derived from the same plan. Never hand-copy artwork into a generated " +
        "namespace: an inventoried namespace cannot see a file the catalog does not list " +
        "(FOUNDATION-MULTISITE-M16/M17).",
    );
  }
  return { urlBase: namespace.urlBase, files, inventoried: true, missing: [] };
}

/**
 * Every namespace THIS Installation declares, with the inventory the build published for each URL base — the
 * read-only view a suite needs to assert the ownership contract (which namespace owns which file) without
 * restating the plan.
 *
 * @param {string} installationRoot the Installation root
 * @returns {{ namespaces: { key: string, urlBase: string, inventory: string[] | null }[] }}
 */
export function installationAssetContract(installationRoot) {
  const catalog = buildRuntimeAssetCatalog(installationRoot).namespaces;
  return {
    namespaces: runtimeNamespaces(installationRoot).map((namespace) => ({
      key: namespace.key,
      urlBase: namespace.urlBase,
      inventory: Object.prototype.hasOwnProperty.call(catalog, namespace.urlBase)
        ? Object.keys(catalog[namespace.urlBase]).sort()
        : null,
    })),
  };
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
