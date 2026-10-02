import { describe, expect, it } from "vitest";

import { normalizeHostname } from "@/core/spoke";

/**
 * THE HOSTNAME CONTRACT (FOUNDATION-MULTISITE-S1 / S1A)
 * ====================================================
 *
 * A raw request host is not a hostname: it may carry a port, any casing, a trailing dot, or be an
 * IPv6 literal in brackets. These assertions pin the ONE normalized spelling, so the same domain can
 * never resolve differently depending on how a client spelled its request.
 *
 * Hostname OWNERSHIP is exact and is asserted with the Spoke model (`spoke-hub.test.ts`); this file
 * covers normalization alone.
 *
 * The module is unwired (nothing in the application imports it); these tests are its only consumer.
 */

describe("normalizeHostname — the ONE spelling of a request host", () => {
  it("lowercases, and strips a port, a trailing dot and surrounding whitespace", () => {
    expect(normalizeHostname("Example.COM")).toBe("example.com");
    expect(normalizeHostname("example.com:3000")).toBe("example.com");
    expect(normalizeHostname("example.com.")).toBe("example.com");
    expect(normalizeHostname("  Example.com.  ")).toBe("example.com");
    expect(normalizeHostname("a.b.example.com:443")).toBe("a.b.example.com");
  });

  it("unwraps an IPv6 literal, with or without a port", () => {
    expect(normalizeHostname("[::1]")).toBe("::1");
    expect(normalizeHostname("[::1]:3000")).toBe("::1");
    expect(normalizeHostname("[2001:db8::1]:8443")).toBe("2001:db8::1");
  });

  it("answers null — never an empty string — when there is no hostname", () => {
    for (const value of ["", "   ", null, undefined, ":3000", "["]) {
      expect(normalizeHostname(value), JSON.stringify(value)).toBeNull();
    }
  });

  it("is idempotent: a normalized hostname normalizes to itself", () => {
    for (const value of ["Example.COM:3000", "[::1]:3000", "example.com.", "A.B.example.com"]) {
      const once = normalizeHostname(value);
      expect(once).not.toBeNull();
      expect(normalizeHostname(once)).toBe(once);
    }
  });
});
