/**
 * HOSTNAMES AND HOSTNAME CLAIMS (FOUNDATION-MULTISITE-S1)
 * ======================================================
 *
 * The PURE vocabulary the outer multi-domain layer needs: ONE normalized hostname value, and the
 * CLAIMS a domain makes about the hostnames it answers for.
 *
 * NOTHING HERE IS WIRED IN. This slice introduces the vocabulary only; the request boundary
 * (`src/proxy.ts`) is deliberately untouched, and a later slice is what connects this module to a
 * real request. Until then nothing but this module's own tests references it.
 *
 * WHY THIS LIVES IN `core`
 * ------------------------
 * `src/core/**` is framework-free — no React, no Next.js, no `node:*`, no configuration import — and
 * `tests/architecture/boundaries.test.ts` enforces that for the whole tree. "Which domain does this
 * request belong to?" is exactly that kind of logic: a pure function of the raw request host and a
 * domain's claims, valid at a request boundary, in a test, or at build time, and incapable of reading
 * a file or rendering anything.
 *
 * NORMALIZATION IS THE FIRST HALF OF RESOLUTION
 * ---------------------------------------------
 * A raw `Host` header is not a hostname. It may carry a port, any casing, a trailing dot, or be an
 * IPv6 literal in brackets. Every such spelling must normalize to ONE value, or the same domain
 * could resolve differently depending on how a client spelled its request. `normalizeHostname`
 * answers `null` for anything unusable — an absent or empty header is NOT a domain — so a caller can
 * never match against a value that was never normalized.
 *
 * HOSTNAME OWNERSHIP IS EXPLICIT AND EXACT
 * ----------------------------------------
 * Every hostname a domain answers for is claimed EXPLICITLY and EXACTLY. A claim for `example.com`
 * does NOT claim `foundation.example.com`, `demo.example.com` or anything else beneath it: those
 * names stay independently available to other domains. There is deliberately no wildcard, no suffix
 * rule, no regular expression and no implicit subdomain ownership — a hostname belongs to exactly the
 * domain that names it.
 *
 * A domain therefore states its canonical hostname plus any number of exact aliases
 * (`www.example.com` and `example.com` are two exact claims of ONE domain), and the decision
 * `@/core/spoke` makes is simple equality over normalized values.
 *
 * Framework-neutral: pure data and pure functions. No filesystem, no DNS, no provider, no request.
 */

/** A normalized hostname: lowercase, no port, no trailing dot, no IPv6 brackets. */
export type Hostname = string;

/**
 * Normalizes a raw request host to a bare hostname.
 *
 *   `Example.COM:3000`   → `example.com`
 *   `example.com.`       → `example.com`
 *   `[::1]:3000`         → `::1`
 *   `::1`                → `::1`   (a bare IPv6 literal is kept whole)
 *   `` / `null` / spaces → `null`   (not a hostname at all)
 *
 * `null` — never an empty string — is the ONE representation of "no hostname", so a caller can never
 * accidentally match on a value that was never a domain.
 */
export function normalizeHostname(host: string | null | undefined): Hostname | null {
  if (typeof host !== "string") return null;

  let value = host.trim().toLowerCase();
  if (value === "") return null;

  if (value.startsWith("[")) {
    // An IPv6 literal, optionally carrying a port: `[::1]:3000` → `::1`.
    const closing = value.indexOf("]");
    if (closing === -1) return null;
    value = value.slice(1, closing);
  } else {
    // A port on a name or address: `example.com:3000` → `example.com`.
    //
    // Only a SINGLE colon can be a port separator. A BARE IPv6 literal carries several colons and
    // no brackets, so it is kept whole — which is what keeps this value type CLOSED under this
    // function (`normalizeHostname(normalizeHostname(x)) === normalizeHostname(x)`), instead of a
    // normalised value that would be mangled if it were ever normalized again.
    const firstColon = value.indexOf(":");
    if (firstColon !== -1 && value.indexOf(":", firstColon + 1) === -1) {
      value = value.slice(0, firstColon);
    }
  }

  // A single trailing dot is the DNS root spelling of the very same hostname.
  if (value.endsWith(".")) value = value.slice(0, -1);

  return value === "" ? null : value;
}
