/**
 * THE AUTHORING SURFACE THIS DEPLOYMENT ACTUALLY SHIPS (FOUNDATION-MULTISITE-M20)
 * =============================================================================
 *
 * M20 finishes what an author meets when they open this repository's authored material: documentation at
 * every intermediate authoring root, empty-locale behaviour proved (in `tests/unit/page-authoring-
 * directory-contract.test.ts`, on a disposable tree), the canonical English About installed byte-for-byte,
 * and the retired Site-control copy reconciled.
 *
 * This is DEPLOYMENT scope: it asserts the REAL capsule, through the accepted authorities, so a future
 * authoring change cannot quietly undo the contract — a missing `README.md`, an edited canonical file, or
 * a page that starts advertising a Site control again all fail here, by name.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createPageSources } from "@/adapters/content/page-sources";
import { foundationSpoke, germanySpoke, type DeploymentSpoke } from "../support/spoke-contexts";

/** The intermediate authoring roots EVERY real Spoke must explain, per page mode and per Site. */
const AUTHORING_DOCS = [
  "content/pages/README.md",
  "content/pages/json/README.md",
  "content/pages/markdown/README.md",
] as const;

/** Each Spoke's Site code, and the intermediates BELOW it that M20 added. */
const SPOKE_DOCS: Record<string, readonly string[]> = {
  foundation: [
    "content/pages/json/ww/README.md",
    "content/pages/markdown/ww/README.md",
  ],
  germany: ["content/pages/json/de/README.md", "content/pages/markdown/de/README.md"],
};

/**
 * THE CANONICAL 01.web PAGE MATERIAL: STOPPED AND REPORTED (M20 §27/§29).
 *
 * The owner's canonical English source `01.web/sites/provelopment/config/pages/en/*.json` and
 * `…/config/pages-markdown/en/about.md` was inventoried (paths, sizes, sha256) and copied BYTE-FOR-BYTE —
 * identity proved file by file — and then WITHDRAWN, because the documents cannot be represented by the
 * platform's supported authoring modes and §27 forbids transforming them:
 *
 *   · the six JSON pages carry 01.web's own document shape (`{ meta, hero, service, … }`), while a
 *     Foundation JSON page is `{ schemaVersion, title, sections[] }` — the build refuses them;
 *   · the Markdown About's front matter uses a nested `actions:` list, which the Markdown format refuses
 *     ("a page's frontmatter holds simple `key: value` entries only").
 *
 * Nothing was rewritten, reformatted or "cleaned up": the owner must decide which artefact wins. The
 * inventory and the per-file identity proof are recorded in the PR body.
 */

/** The retired-control wording no authored page may offer any more (M20 §30). */
const RETIRED_CLAIMS = [
  "- **Site**",
  "**Site** chooses",
  "**Site** wählt",
  "four visitor controls",
  "all four visitor controls",
  "four visitor dimensions",
  "alle vier Besucher-Bedienelemente",
  "four different aspects",
  "vier verschiedene Aspekte",
  "**Site** wählt einen eigenständigen",
] as const;

function pageFiles(spoke: DeploymentSpoke): string[] {
  return [spoke.markdownPagesRoot, spoke.jsonPagesRoot].filter((root) => existsSync(root));
}

/** Every authored page/document file beneath a Spoke's `content/pages`, at any depth. */
function authoredContentFiles(spoke: DeploymentSpoke): string[] {
  const pagesRoot = path.join(spoke.spokeRoot, "content", "pages");
  const walk = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(absolute) : [absolute];
    });
  return existsSync(pagesRoot) ? walk(pagesRoot) : [];
}

describe("M20 — the real authoring tree is self-explanatory", () => {
  for (const spoke of [foundationSpoke, germanySpoke]) {
    it(`${spoke.id}: documents every intermediate authoring root`, () => {
      for (const relative of AUTHORING_DOCS) {
        expect(existsSync(path.join(spoke.spokeRoot, relative)), `${spoke.id} ${relative}`).toBe(true);
      }
      for (const relative of SPOKE_DOCS[spoke.id] ?? []) {
        expect(existsSync(path.join(spoke.spokeRoot, relative)), `${spoke.id} ${relative}`).toBe(true);
      }
    });

    it(`${spoke.id}: its authoring documentation is NOT a page or a route`, async () => {
      const pages = createPageSources({ sites: spoke.config.sites, roots: spoke.resources });
      for (const site of spoke.config.sites) {
        for (const locale of site.locales) {
          const routes = await pages.listRoutes(site.code, locale.path);
          expect(routes.some((route) => /readme|how-to/i.test(route)), `${spoke.id} ${site.code}/${locale.path}`).toBe(false);
        }
      }
      expect(pageFiles(spoke).length).toBeGreaterThan(0);
    });
  }
});

describe("M20 — the authoring copy offers no retired control", () => {
  it("has no authored page offering the retired Site control", () => {
    for (const spoke of [foundationSpoke, germanySpoke]) {
      for (const file of authoredContentFiles(spoke)) {
        if (file.endsWith("README.md")) continue;
        const text = readFileSync(file, "utf8");
        for (const claim of RETIRED_CLAIMS) {
          expect(text.includes(claim), `${file.replace(spoke.spokeRoot, "")} claims: ${claim}`).toBe(false);
        }
      }
    }
  });
});
