// tests/browser/multihost.scenario.mjs
// THE MULTI-HOST SPOKE RUNTIME PROOF (FOUNDATION-MULTISITE-M16/M17).
//
// ONE disposable Installation declaring TWO Spokes (`tests/support/multihost-installation.mjs`) is served by
// its OWN dev server, and every request below travels the REAL public path:
//
//   HTTP request → src/proxy.ts → exact hostname dispatch → internal rewrite /~spoke/<segment>/… →
//   the runtime segment selects ONE explicit SpokeRuntimeContext → the existing M13/M14 renderer
//
// Nothing is bypassed: no request calls the composition directly, no request sets an internal header, and the
// public pathname is never the internal one. The two Spokes deliberately expose the SAME logical coordinates
// (`/ww/en/about`) with DIFFERENT facts, so "same URL, different content" is proved rather than assumed.
//
// OWNERSHIP. This is a FOUNDATION contract (a platform capability, not one deployment's copy), so it lives in
// the harness's own directory and runs in the foundation scope. It writes only where the harness owns writes:
// OS temp (its Installation) and the GENERATED Spoke namespaces it materialises and then removes.
import { request as httpRequest } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";

import { materializeMultihostInstallation, runtimeNamespaceFiles, MULTIHOST_SPOKES } from "../support/multihost-installation.mjs";
// The FOUNDATION's CDP client, reused (never re-implemented): the harness passes the browser BINARY, exactly
// as it does to a deployment-owned scenario, and each scenario owns the client it opens and closes.
import { Cdp } from "./cdp.mjs";

/** The scenario's id, used as the report's `presentation` label. */
export const id = "multihost";

/** The ports this scenario tries, so a busy port is a retry rather than a failure. */
const PORT_OFFSETS = [21, 22, 23];

/**
 * ONE request with an EXPLICIT `Host` header — the boundary's whole input.
 *
 * A browser sends exactly this header; sending it deliberately is what makes "which Spoke answers?" a
 * measurable fact rather than an artifact of the URL. The `Host` value carries the port, exactly as a browser
 * would spell it, so the accepted normalization (lowercase, port stripped) is exercised too.
 */
function requestWithHost(port, host, pathname) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      { host: "127.0.0.1", port, path: pathname, method: "GET", headers: { host } },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
            bytes: Buffer.concat(chunks),
          }),
        );
      },
    );
    request.on("error", reject);
    request.end();
  });
}

/** The deliberately distinct facts of one rendered page, as the proof compares them. */
function fingerprint(body) {
  const facts = {
    siteName: /Alpha Spoke Site|Beta Spoke Site/.exec(body)?.[0] ?? "",
    wording: /Alpha About|Beta About/.exec(body)?.[0] ?? "",
    content: /Alpha wrote this paragraph|Beta wrote a different paragraph/.exec(body)?.[0] ?? "",
    origin: /https:\/\/(alpha|beta)\.localhost/.exec(body)?.[0] ?? "",
    asset: /\/spokes\/(alpha|beta)\/assets\//.exec(body)?.[0] ?? "",
  };
  return JSON.stringify(facts);
}

/** The generated namespace files ONE Spoke needs, written through the harness's own guarded writers. */
async function materializeNamespace(harness, spoke) {
  const directory = path.join(harness.repositoryRoot, "public", "spokes", spoke.segment, "assets");
  await harness.mkdir(directory, { recursive: true });
  for (const { from, to } of runtimeNamespaceFiles(spoke.root, spoke.id)) {
    harness.cpSync(from, path.join(directory, to), { recursive: false });
  }
}

/**
 * EVERY URL-BEARING VALUE IN ONE DOCUMENT: `href`, `src` and URL-valued `content` attributes.
 *
 * This is the OBSERVABLE surface requirement 11 names — navigation, canonical, `hreflang`, OpenGraph, client
 * URLs and asset URLs. Next's OWN React-Server-Components payload also carries the framework's internal
 * segment tree (`pagePath: "~spoke/[segment]/…"`), which is a router implementation detail rather than a URL
 * a visitor can be sent to; the assertions below therefore read every URL, and the browser proof reads the
 * address bar and the visible text.
 */
function urlsInDocument(html) {
  const urls = [];
  for (const match of html.matchAll(/(?:href|src|content)="([^"]*)"/g)) urls.push(match[1]);
  return urls;
}

/** True when ANY URL in the document contains this text (the internal prefix must never be one). */
function anyUrlContains(html, text) {
  return urlsInDocument(html).some((url) => url.includes(text));
}

function factsFor(spoke, fixture) {
  return {
    segment: spoke.segment,
    name: fixture.siteName,
    wording: fixture.navigationLabels["/about"],
    content: fixture.aboutBody,
    origin: spoke.canonicalOrigin,
    mark: spoke.mark,
  };
}

/**
 * THE SAME PUBLIC PATHNAME, TWO SPOKES: A/B/A/B, then the refusals and the per-host surfaces.
 *
 * Every request carries the hostname the claim is made for, and every assertion reads the RENDERED document
 * (or the served file), never an internal API.
 */
async function runHostProof(harness, rows, port, installation) {
  const [alpha, beta] = installation.spokes;
  const alphaFacts = factsFor(alpha, MULTIHOST_SPOKES[0]);
  const betaFacts = factsFor(beta, MULTIHOST_SPOKES[1]);
  const hostOf = (spoke) => `${spoke.hostname}:${port}`;
  const get = (host, pathname) => requestWithHost(port, host, pathname);

  const first = await get(hostOf(alpha), "/ww/en/about");
  const second = await get(hostOf(beta), "/ww/en/about");
  const third = await get(hostOf(alpha), "/ww/en/about");
  const fourth = await get(hostOf(beta), "/ww/en/about");

  harness.check(rows, "alpha /ww/en/about is served (200)", first.status === 200, `status=${first.status}`);
  harness.check(rows, "beta /ww/en/about is served (200)", second.status === 200, `status=${second.status}`);

  const alphaChecks = [
    ["names the Alpha site", first.body.includes(alphaFacts.name)],
    ["carries Alpha dictionary wording", first.body.includes(alphaFacts.wording)],
    ["carries Alpha page content", first.body.includes(alphaFacts.content)],
    ["canonicalizes to the Alpha origin", first.body.includes(alphaFacts.origin)],
    ["never names the Beta origin", !first.body.includes(betaFacts.origin)],
    ["names its OWN Spoke asset namespace", first.body.includes(`/spokes/${alpha.segment}/assets/`)],
    ["never names the Beta Spoke asset namespace", !first.body.includes(`/spokes/${beta.segment}/assets/`)],
    ["leaks no internal prefix into ANY URL", !anyUrlContains(first.body, "~spoke")],
  ];
  for (const [name, ok] of alphaChecks) harness.check(rows, `alpha: ${name}`, ok, "");

  const betaChecks = [
    ["names the Beta site", second.body.includes(betaFacts.name)],
    ["carries Beta dictionary wording", second.body.includes(betaFacts.wording)],
    ["carries Beta page content", second.body.includes(betaFacts.content)],
    ["canonicalizes to the Beta origin", second.body.includes(betaFacts.origin)],
    ["never names the Alpha origin", !second.body.includes(alphaFacts.origin)],
    ["names its OWN Spoke asset namespace", second.body.includes(`/spokes/${beta.segment}/assets/`)],
    ["never names the Alpha Spoke asset namespace", !second.body.includes(`/spokes/${alpha.segment}/assets/`)],
    ["leaks no internal prefix into ANY URL", !anyUrlContains(second.body, "~spoke")],
  ];
  for (const [name, ok] of betaChecks) harness.check(rows, `beta: ${name}`, ok, "");

  harness.check(
    rows,
    "A/B/A/B: Alpha is stable on the second request",
    fingerprint(first.body) === fingerprint(third.body),
    `first=${fingerprint(first.body)} third=${fingerprint(third.body)}`,
  );
  harness.check(
    rows,
    "A/B/A/B: Beta is stable on the second request",
    fingerprint(second.body) === fingerprint(fourth.body),
    `first=${fingerprint(second.body)} fourth=${fingerprint(fourth.body)}`,
  );
  harness.check(
    rows,
    "A/B/A/B: the two Spokes are NOT the same page",
    fingerprint(first.body) !== fingerprint(second.body),
    "the same public pathname must resolve to different contexts",
  );

  // ── the internal namespace is rewrite-only ───────────────────────────────────────────────────────────
  const direct = await get(hostOf(alpha), `/~spoke/${alpha.segment}/ww/en/about`);
  const directBeta = await get(hostOf(beta), `/~spoke/${beta.segment}/ww/en/about`);
  const crossInternal = await get(hostOf(alpha), `/~spoke/${beta.segment}/ww/en/about`);
  harness.check(rows, "a DIRECT /~spoke request on its own host is refused", direct.status === 404, `status=${direct.status}`);
  harness.check(rows, "a DIRECT /~spoke request on Beta is refused", directBeta.status === 404, `status=${directBeta.status}`);
  harness.check(rows, "a DIRECT cross-Spoke /~spoke request is refused", crossInternal.status === 404, `status=${crossInternal.status}`);
  harness.check(
    rows,
    "the refusal is not a redirect to any Spoke",
    (direct.headers.location ?? "") === "",
    `location=${direct.headers.location ?? "(none)"}`,
  );

  // ── a Spoke's own artwork is HOST-BOUND, while platform artwork is shared ────────────────────────────
  const ownOnAlpha = await get(hostOf(alpha), `/spokes/${alpha.segment}/assets/${alpha.mark}`);
  const otherOnAlpha = await get(hostOf(alpha), `/spokes/${beta.segment}/assets/${beta.mark}`);
  const ownOnBeta = await get(hostOf(beta), `/spokes/${beta.segment}/assets/${beta.mark}`);
  const otherOnBeta = await get(hostOf(beta), `/spokes/${alpha.segment}/assets/${alpha.mark}`);
  const platformOnAlpha = await get(hostOf(alpha), "/assets/icon-home.svg");
  const platformOnBeta = await get(hostOf(beta), "/assets/icon-home.svg");

  harness.check(rows, "Alpha host serves its OWN Spoke asset (200)", ownOnAlpha.status === 200, `status=${ownOnAlpha.status}`);
  harness.check(rows, "Alpha host REFUSES Beta's Spoke asset", otherOnAlpha.status === 404, `status=${otherOnAlpha.status}`);
  harness.check(rows, "Beta host serves its OWN Spoke asset (200)", ownOnBeta.status === 200, `status=${ownOnBeta.status}`);
  harness.check(rows, "Beta host REFUSES Alpha's Spoke asset", otherOnBeta.status === 404, `status=${otherOnBeta.status}`);
  harness.check(
    rows,
    "the shared platform asset is available on BOTH hosts",
    platformOnAlpha.status === 200 && platformOnBeta.status === 200,
    `alpha=${platformOnAlpha.status} beta=${platformOnBeta.status}`,
  );
}

/**
 * PER-HOST METADATA SURFACES: the sitemap, `robots.txt` and the OpenGraph image of the SAME public
 * pathname, each answered by the Spoke its own host selected.
 */
async function runSurfaceProof(harness, rows, port, installation) {
  const [alpha, beta] = installation.spokes;
  const alphaFacts = factsFor(alpha, MULTIHOST_SPOKES[0]);
  const betaFacts = factsFor(beta, MULTIHOST_SPOKES[1]);
  const hostOf = (spoke) => `${spoke.hostname}:${port}`;
  const get = (host, pathname) => requestWithHost(port, host, pathname);

  const alphaSitemap = await get(hostOf(alpha), "/sitemap.xml");
  const betaSitemap = await get(hostOf(beta), "/sitemap.xml");
  const alphaRobots = await get(hostOf(alpha), "/robots.txt");
  const betaRobots = await get(hostOf(beta), "/robots.txt");

  harness.check(
    rows,
    "Alpha sitemap uses the Alpha origin",
    alphaSitemap.body.includes(`${alphaFacts.origin}/ww/en`),
    alphaSitemap.body.slice(0, 160),
  );
  harness.check(
    rows,
    "Alpha sitemap carries Alpha's OWN authored route",
    alphaSitemap.body.includes(`${alphaFacts.origin}/ww/en/${alpha.onlyRoute}`),
    "",
  );
  harness.check(rows, "Alpha sitemap contains no Beta URL", !alphaSitemap.body.includes(beta.hostname), "");
  harness.check(
    rows,
    "Beta sitemap uses the Beta origin",
    betaSitemap.body.includes(`${betaFacts.origin}/ww/en`),
    betaSitemap.body.slice(0, 160),
  );
  harness.check(
    rows,
    "Beta sitemap carries Beta's OWN authored route",
    betaSitemap.body.includes(`${betaFacts.origin}/ww/en/${beta.onlyRoute}`),
    "",
  );
  harness.check(rows, "Beta sitemap contains no Alpha URL", !betaSitemap.body.includes(alpha.hostname), "");
  harness.check(
    rows,
    "Alpha robots advertises the Alpha sitemap",
    alphaRobots.body.includes(`${alphaFacts.origin}/sitemap.xml`),
    alphaRobots.body.trim(),
  );
  harness.check(
    rows,
    "Beta robots advertises the Beta sitemap",
    betaRobots.body.includes(`${betaFacts.origin}/sitemap.xml`),
    betaRobots.body.trim(),
  );

  for (const spoke of installation.spokes) {
    const image = await get(hostOf(spoke), "/ww/en/opengraph-image");
    const type = String(image.headers["content-type"] ?? "");
    harness.check(
      rows,
      `${spoke.id}: /ww/en/opengraph-image is an image (200 + image/png)`,
      image.status === 200 && type.startsWith("image/png"),
      `status=${image.status} type=${type || "(none)"}`,
    );
  }
}

/** The accepted hostname semantics, exercised against the RUNNING dispatch: exact, normalized, fail-closed. */
async function runHostnameProof(harness, rows, port, installation) {
  const [alpha, beta] = installation.spokes;
  const facts = factsFor(alpha, MULTIHOST_SPOKES[0]);
  const get = (host, pathname) => requestWithHost(port, host, pathname);

  const upper = await get("Alpha.LocalHost", "/ww/en/about");
  harness.check(
    rows,
    "a differently-CASED host resolves to its claim",
    upper.status === 200 && upper.body.includes(facts.name),
    `status=${upper.status}`,
  );

  const trailingStop = await get("alpha.localhost.", "/ww/en/about");
  harness.check(
    rows,
    "the DNS-root spelling of the same host resolves",
    trailingStop.status === 200 && trailingStop.body.includes(facts.name),
    `status=${trailingStop.status}`,
  );

  const suffix = await get("sub.alpha.localhost", "/ww/en/about");
  harness.check(rows, "a SUBDOMAIN no Spoke claimed does NOT resolve", suffix.status === 404, `status=${suffix.status}`);

  const betaSuffix = await get(`${beta.hostname}.attacker.example`, "/ww/en/about");
  harness.check(rows, "a claimed host as a SUFFIX of another host resolves nothing", betaSuffix.status === 404, `status=${betaSuffix.status}`);

  const unknown = await get("unknown.localhost", "/ww/en/about");
  const leaked = unknown.body.includes(facts.name) || unknown.body.includes(MULTIHOST_SPOKES[1].siteName);
  harness.check(rows, "an UNCLAIMED hostname fails closed (404)", unknown.status === 404, `status=${unknown.status}`);
  harness.check(rows, "the unclaimed hostname is answered by NO Spoke's content", !leaked, "");
  harness.check(
    rows,
    "the unclaimed hostname is not redirected to a default Spoke",
    (unknown.headers.location ?? "") === "",
    `location=${unknown.headers.location ?? "(none)"}`,
  );

  const unknownRoot = await get("unknown.localhost", "/");
  harness.check(rows, "even an unclaimed host's ROOT is refused (no default Spoke)", unknownRoot.status === 404, `status=${unknownRoot.status}`);
}


/** Waits until the dev server answers ANYTHING (a dev server compiles on the first request). */
async function waitForAnyResponse(port, timeoutMs = 240000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      await requestWithHost(port, `127.0.0.1:${port}`, "/");
      return true;
    } catch {
      await sleep(500);
    }
  }
  return false;
}

/** Starts the dev server for THIS Installation, trying the next port when one is already taken. */
async function startServer(harness, installation) {
  let last = null;
  for (const offset of PORT_OFFSETS) {
    const port = harness.basePort + offset;
    const server = harness.startDevServer(port, { deploymentRoot: installation.root });
    if (await waitForAnyResponse(port)) return { server, port };
    last = server;
    await harness.stopServer(server);
  }
  throw new Error(`no port answered among ${PORT_OFFSETS.map((o) => harness.basePort + o).join(", ")} — last log: ${last ? last.log().slice(-400) : "(none)"}`);
}

/**
 * THE BROWSER-VISIBLE FACT: a real browser reaches each host and STAYS on the public pathname.
 *
 * `alpha.localhost` and `beta.localhost` are loopback names a browser resolves itself, so the navigation
 * exercises the same dispatch the HTTP proof does — and adds the one fact only a browser can report: the
 * address bar. It must read `/ww/en/about` and never the internal namespace.
 */
async function runBrowserProof(harness, rows, chrome, port, installation) {
  const cdp = await Cdp.connect(chrome);
  try {
    for (const spoke of installation.spokes) {
      const fixture = MULTIHOST_SPOKES.find((candidate) => candidate.id === spoke.id);
      const url = `http://${spoke.hostname}:${port}/ww/en/about`;
      let observed = null;

      await cdp.navigate(url);
      const end = Date.now() + 60000;
      while (Date.now() < end) {
        observed = await cdp.evaluate(
          `(() => ({ path: location.pathname, host: location.host, text: document.body ? document.body.textContent || "" : "", html: document.documentElement ? document.documentElement.outerHTML : "" }))()`,
        );
        if (observed && observed.text.includes(fixture.aboutBody)) break;
        await sleep(400);
      }

      harness.check(
        rows,
        `${spoke.id}: a BROWSER keeps the public pathname`,
        observed !== null && observed.path === "/ww/en/about",
        `path=${observed ? observed.path : "(no observation)"}`,
      );
      harness.check(
        rows,
        `${spoke.id}: the browser's document is THIS Spoke's`,
        observed !== null && observed.text.includes(fixture.siteName) && observed.text.includes(fixture.aboutBody),
        observed ? observed.text.slice(0, 120) : "(no observation)",
      );
      harness.check(
        rows,
        `${spoke.id}: the browser's document leaks no internal prefix into any URL`,
        observed !== null && !/\b(?:href|src)="[^"]*~spoke/.test(observed.html ?? ""),
        "",
      );
    }
  } finally {
    await cdp.close();
  }
}

/** Removes exactly the namespaces this scenario created — the generated segments alpha and beta. */
function removeNamespaces(harness, installation) {
  for (const spoke of installation.spokes) {
    harness.rmSync(path.join(harness.repositoryRoot, "public", "spokes", spoke.segment), {
      recursive: true,
      force: true,
    });
  }
}

/**
 * THE SCENARIO: one disposable two-Spoke Installation, one dev server, and every proof above.
 *
 * A failure anywhere is reported as a FAILED CHECK with its cause rather than as a thrown scenario, so the
 * report says WHICH invariant broke; the Installation, the generated namespaces and the server are always
 * released afterwards.
 */
export async function run(chrome, harness) {
  const rows = [];
  const installation = materializeMultihostInstallation({ repositoryRoot: harness.repositoryRoot });
  let server = null;

  try {
    for (const spoke of installation.spokes) await materializeNamespace(harness, spoke);
    const started = await startServer(harness, installation);
    server = started.server;

    await runHostProof(harness, rows, started.port, installation);
    await runSurfaceProof(harness, rows, started.port, installation);
    await runHostnameProof(harness, rows, started.port, installation);
    await runBrowserProof(harness, rows, chrome, started.port, installation);
  } catch (error) {
    harness.check(
      rows,
      "the multi-host scenario ran to completion",
      false,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    try {
      await harness.stopServer(server);
    } catch {
      /* the server is already gone */
    }
    removeNamespaces(harness, installation);
    installation.cleanup();
  }

  return rows;
}

export default { id, run };



