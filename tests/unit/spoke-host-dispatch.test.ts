import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { normalizeHostname } from "@/core/spoke";

/**
 * HOSTNAME DISPATCH, PROVED AGAINST THE ACCEPTED AUTHORITIES (FOUNDATION-MULTISITE-M16)
 * =====================================================================================
 *
 * The build inlines ONE routing description; the request boundary turns it into a decision. These tests drive
 * that description and the boundary itself with a SYNTHETIC two-Spoke table, so the semantics the milestone
 * requires are provable without a browser:
 *
 *   claimed host                      → that Spoke's runtime segment
 *   differently-cased / ported host    → the SAME claim (the domain's normalization, reused)
 *   unclaimed host                     → NOTHING (fail closed, no default, no redirect)
 *   subdomain of a claimed host        → NOTHING (exact claims only — no wildcard, no suffix rule)
 *   a Spoke with no canonical origin   → refused LOUDLY in a multi-Spoke Installation
 *
 * The normalization itself is NEVER re-implemented here: the expectations are built with `normalizeHostname`
 * and the claim derivation is the domain's `hostnameFromOrigin`.
 */
const ENV = "FOUNDATION_DEPLOYMENT_HOST_ROUTING";

const TABLE = {
  mode: "multi",
  spokes: [
    { id: "alpha", segment: "alpha", canonicalOrigin: "https://alpha.localhost" },
    { id: "beta", segment: "beta", canonicalOrigin: "https://beta.example.com" },
  ],
};

/** A FRESH module graph per case: the routing table is a per-build value, cached by design. */
async function withTable(table) {
  vi.resetModules();
  if (table === undefined) delete process.env[ENV];
  else process.env[ENV] = typeof table === "string" ? table : JSON.stringify(table);
  const routing = await import("@/config/spoke-routing");
  const proxy = await import("@/proxy");
  return { ...routing, proxy: proxy.proxy };
}

const request = (pathname, host) =>
  new NextRequest(`https://${host}${pathname}`, { headers: { host } });

const rewrittenTo = (response) => {
  const target = response.headers.get("x-middleware-rewrite");
  return target === null ? null : new URL(target).pathname;
};

const savedEnv = process.env[ENV];

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env[ENV];
  else process.env[ENV] = savedEnv;
  vi.resetModules();
});

describe("a claimed hostname selects exactly one Spoke", () => {
  it("rewrites the public path into that Spoke's own runtime namespace", async () => {
    const { proxy } = await withTable(TABLE);

    const alpha = proxy(request("/ww/en/about", "alpha.localhost"));
    expect(rewrittenTo(alpha)).toBe("/~spoke/alpha/ww/en/about");

    const beta = proxy(request("/ww/en/about", "beta.example.com"));
    expect(rewrittenTo(beta)).toBe("/~spoke/beta/ww/en/about");
    // The SAME public pathname, a DIFFERENT Spoke: dispatch is the only difference.
    expect(alpha.headers.get("x-middleware-rewrite")).not.toBe(beta.headers.get("x-middleware-rewrite"));
    // …and the public URL is never redirected anywhere (a rewrite is invisible to a visitor).
    expect(alpha.headers.get("location")).toBeNull();
  });

  it("resolves the bare root of a claimed host too", async () => {
    const { proxy } = await withTable(TABLE);
    expect(rewrittenTo(proxy(request("/", "beta.example.com")))).toBe("/~spoke/beta");
  });
});

describe("the accepted normalization is reused, not restated", () => {
  it("matches case-insensitively and ignores the port", async () => {
    const { proxy } = await withTable(TABLE);
    for (const host of ["Alpha.LocalHost", "alpha.localhost:8443", "alpha.localhost.", "ALPHA.localhost.:3000"]) {
      expect(rewrittenTo(proxy(request("/ww/en", host))), host).toBe("/~spoke/alpha/ww/en");
    }
  });

  it("reports the normalized hostname the decision was made from", async () => {
    const { hostRoutingForBuild, spokeSelectionForHost } = await withTable(TABLE);
    const selection = spokeSelectionForHost(hostRoutingForBuild(), "Alpha.LocalHost:8080");
    expect(selection).not.toBeNull();
    expect(selection.hostname).toBe(normalizeHostname("Alpha.LocalHost:8080"));
    expect(selection.spokeId).toBe("alpha");
    expect(selection.reason).toBe("registered-hostname");
  });
});

describe("an unclaimed hostname answers NOTHING", () => {
  it("refuses a host no Spoke claims, without redirecting anywhere", async () => {
    const { proxy } = await withTable(TABLE);
    const response = proxy(request("/ww/en/about", "unknown.localhost"));
    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    expect(rewrittenTo(response)).toBeNull();
  });

  it("refuses a SUBDOMAIN of a claimed host (exact claims only, no wildcard)", async () => {
    const { proxy } = await withTable(TABLE);
    expect(proxy(request("/ww/en/about", "sub.alpha.localhost")).status).toBe(404);
    expect(proxy(request("/ww/en", "alpha.localhost.attacker.test")).status).toBe(404);
    expect(proxy(request("/ww/en", "alpha.localhostX")).status).toBe(404);
  });

  it("refuses an absent Host header entirely", async () => {
    const { hostRoutingForBuild, spokeSelectionForHost } = await withTable(TABLE);
    expect(spokeSelectionForHost(hostRoutingForBuild(), null)).toBeNull();
    expect(spokeSelectionForHost(hostRoutingForBuild(), "")).toBeNull();
    expect(spokeSelectionForHost(hostRoutingForBuild(), "   ")).toBeNull();
  });
});

describe("the internal namespace and Spoke assets belong to the boundary", () => {
  it("refuses a DIRECT internal request on a valid host", async () => {
    const { proxy } = await withTable(TABLE);
    for (const pathname of ["/~spoke", "/~spoke/alpha", "/~spoke/alpha/ww/en/about", "/~spoke/beta/ww/en"]) {
      const response = proxy(request(pathname, "alpha.localhost"));
      expect(response.status, pathname).toBe(404);
      expect(rewrittenTo(response), pathname).toBeNull();
    }
  });

  it("serves a Spoke's own artwork only on a host that Spoke answers for", async () => {
    const { proxy } = await withTable(TABLE);
    expect(proxy(request("/spokes/alpha/assets/sidebar-open.svg", "alpha.localhost")).status).toBe(200);
    expect(proxy(request("/spokes/beta/assets/sidebar-open.svg", "beta.example.com")).status).toBe(200);
    expect(proxy(request("/spokes/beta/assets/sidebar-open.svg", "alpha.localhost")).status).toBe(404);
    expect(proxy(request("/spokes/alpha/assets/sidebar-open.svg", "beta.example.com")).status).toBe(404);
  });
});

describe("the routing description itself is refused when it cannot route", () => {
  it("refuses a malformed description loudly", async () => {
    const { hostRoutingForBuild } = await withTable("{not json");
    expect(() => hostRoutingForBuild()).toThrow(/not valid JSON/);
  });

  it("refuses a multi-Spoke Spoke that declares no canonical origin, naming it", async () => {
    const { hostRoutingForBuild } = await withTable({
      mode: "multi",
      spokes: [
        { id: "alpha", segment: "alpha", canonicalOrigin: "https://alpha.localhost" },
        { id: "beta", segment: "beta", canonicalOrigin: "" },
      ],
    });
    expect(() => hostRoutingForBuild()).toThrow(/Spoke "beta" declares no canonical origin/);
  });

  it("tolerates a Spoke with no canonical origin in a ONE-Spoke Installation (a hostname is never consulted)", async () => {
    const { proxy } = await withTable({
      mode: "single",
      spokes: [{ id: "only", segment: "only", canonicalOrigin: "" }],
    });
    // ANY host answers, and the only entry is the Installation's sole Spoke — never a "first".
    expect(proxy(request("/ww/en", "whatever.localhost")).status).toBe(200);
    expect(rewrittenTo(proxy(request("/ww/en", "whatever.localhost")))).toBe("/~spoke/only/ww/en");
  });

  it("answers nothing when no routing description was inlined at all", async () => {
    const { proxy, hostRoutingForBuild } = await withTable(undefined);
    expect(hostRoutingForBuild().spokes).toHaveLength(0);
    expect(proxy(request("/ww/en", "alpha.localhost")).status).toBe(404);
  });
});
