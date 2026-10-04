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
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createPageSources } from "@/adapters/content/page-sources";
import { hostRoutingForInstallation } from "@/config/spoke-host-routing.mjs";
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
 * THE CANONICAL ENGLISH ABOUT, INSTALLED BYTE-FOR-BYTE (M20 Part A §14/§15).
 *
 * `deployment/spokes/foundation/content/pages/markdown/ww/en/about.md` IS the owner's canonical
 * `01.web/sites/provelopment/config/pages-markdown/en/about.md`: this many bytes, this digest. The file was
 * COPIED, never authored — no reformatting, no re-flowing, no metadata removed — and its `actions:`
 * frontmatter parses because the Markdown authoring mode gained that one optional key.
 *
 * THE CANONICAL JSON PAGES REMAIN A REPORTED CONFLICT (M20 Part A §10).
 *
 * The six canonical `config/pages/en/*.json` documents are COMPOSED, SITE-SCOPED composition declarations
 * rather than page documents: their contract is Provelopment's own presentation components plus a
 * four-namespace destination vocabulary (`route:` `foundation:` `repo:` `site:`) resolved against a registry
 * of OTHER first-party sites, and their envelope deliberately carries a metadata title that is not the
 * page's h1. This platform has no such vocabulary and no site-scoped component seam, so no faithful
 * projection exists — and §10 forbids approximating one. They are therefore NOT installed; the full
 * classification and the owner's decision are recorded in the PR body.
 */
const CANONICAL_ABOUT = {
  relativePath: "content/pages/markdown/ww/en/about.md",
  bytes: 2815,
  sha256: "a3c9917b4f15cc2fd921ca7152dc134d2c685973ff28ae6ff75003aa3ff2d759",
} as const;

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

describe("M20 — the canonical English About, and no retired-control copy", () => {
  it("holds the canonical English About byte-for-byte", () => {
    // The owner's canonical `01.web/sites/provelopment/config/pages-markdown/en/about.md`, installed
    // unchanged: these two numbers ARE the identity proof (they were recorded from the source).
    const absolute = path.join(foundationSpoke.spokeRoot, CANONICAL_ABOUT.relativePath);
    const bytes = readFileSync(absolute);
    expect(bytes.length).toBe(CANONICAL_ABOUT.bytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(CANONICAL_ABOUT.sha256);
  });

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

describe("M20 — this Installation's inspection policy (Part B)", () => {
  it("names `foundation`, and the platform's own hostnames select it", () => {
    const capsule = path.join(process.cwd(), "deployment");
    const manifest = JSON.parse(readFileSync(path.join(capsule, "spokes.json"), "utf8")) as {
      spokes: { id: string }[];
      inspectionSpoke?: string;
    };

    // The declaration keeps its authored order, and the policy is stated BESIDE it — never derived from it.
    expect(manifest.spokes.map((spoke) => spoke.id)).toEqual(["foundation", "germany"]);
    expect(manifest.inspectionSpoke).toBe("foundation");

    // The BUILD's own description is what the request boundary consumes: on the two URLs the owner
    // reported, the nominated Spoke represents this Installation.
    const before = { url: process.env["VERCEL_URL"], branch: process.env["VERCEL_BRANCH_URL"] };
    process.env["VERCEL_URL"] = "provelopment-foundation-raoo2g20f-provelopment.vercel.app";
    process.env["VERCEL_BRANCH_URL"] = "provelopment-foundation-git-main-provelopment.vercel.app";
    try {
      const routing = hostRoutingForInstallation(capsule);
      expect(routing.mode).toBe("multi");
      expect(routing.inspection).toEqual({
        spokeId: "foundation",
        hostnames: [
          "provelopment-foundation-raoo2g20f-provelopment.vercel.app",
          "provelopment-foundation-git-main-provelopment.vercel.app",
        ],
      });
    } finally {
      if (before.url === undefined) delete process.env["VERCEL_URL"];
      else process.env["VERCEL_URL"] = before.url;
      if (before.branch === undefined) delete process.env["VERCEL_BRANCH_URL"];
      else process.env["VERCEL_BRANCH_URL"] = before.branch;
    }
  });
});
