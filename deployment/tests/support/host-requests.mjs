/**
 * THE REAL DEPLOYMENT'S TWO PUBLIC COORDINATES, DRIVEN LOCALLY (FOUNDATION-MULTISITE-M18)
 * ================================================================================
 *
 * A deployment-scope browser scenario proves the REAL deployment at the REAL public hostnames. Two facts
 * are therefore needed, and they are needed by MORE THAN ONE scenario, so they live here:
 *
 *   · the exact hostnames and origins the Installation claims (never derived, never guessed: they are the
 *     authored `site.url` of each Spoke, restated ONCE for the tests that must address them);
 *   · a request helper that sends `Host` explicitly — the request boundary's whole input — plus the
 *     readiness poll built on it, because a plain `fetch` cannot present another host and a multi-Spoke
 *     Installation answers an UNCLAIMED host with nothing at all.
 *
 * `HOST_RESOLVER_RULES` is the SMALLEST test-only mapping a browser needs to reach a local server by those
 * names (Chrome's own `--host-resolver-rules`). It changes no runtime semantic: the boundary still matches
 * the exact `Host` claim, and the mapping exists only in the scenario's Chrome process.
 *
 * Plain ESM: the browser harness and its scenarios run under plain `node`.
 */
import { request as httpRequest } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

export const FOUNDATION_HOST = "foundation-template.provelopment.com";
export const GERMANY_HOST = "foundation-template-germany.provelopment.com";
export const FOUNDATION_ORIGIN = `https://${FOUNDATION_HOST}`;
export const GERMANY_ORIGIN = `https://${GERMANY_HOST}`;
export const PLATFORM_ASSET_ROOT = "/assets";
export const HOST_RESOLVER_RULES = `MAP ${FOUNDATION_HOST} 127.0.0.1, MAP ${GERMANY_HOST} 127.0.0.1`;

/** ONE request with an EXPLICIT `Host` header, as a browser sends it (port included). */
export function requestWithHost(port, host, pathname) {
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
            location: String(response.headers.location ?? ""),
          }),
        );
      },
    );
    request.on("error", reject);
    request.end();
  });
}

/**
 * Waits until the SELECTED deployment answers a CLAIMED host, or throws with the server's own output.
 *
 * A dev server that exited cannot become ready, so its exit is reported immediately rather than after the
 * whole budget — the failure a five-minute stall would otherwise hide.
 */
export async function waitForHostReady(port, host, pathname, server, timeoutMs = 240000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (server && server.proc.exitCode !== null && server.proc.exitCode !== undefined) {
      throw new Error(
        `dev server exited before serving ${host}\n--- dev server output ---\n${
          typeof server.log === "function" ? server.log() : "(no log)"
        }`,
      );
    }
    try {
      const response = await requestWithHost(port, host, pathname);
      if (response.status === 200 || response.status === 307 || response.status === 308) return true;
    } catch {
      /* not ready yet */
    }
    await sleep(1500);
  }
  throw new Error(`dev server not ready for ${host}${pathname}`);
}
