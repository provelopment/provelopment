/**
 * HOSTNAMES AND HOSTNAME CLAIMS (FOUNDATION-MULTISITE-S1) — THE ONE IMPLEMENTATION
 * ==============================================================================
 *
 * The PURE vocabulary the outer multi-domain layer needs: ONE normalized hostname value, and the step
 * from an authored origin to the hostname it claims.
 *
 * WHY THE RULES ARE PLAIN ESM
 * ---------------------------
 * Three consumers need the same answers, and one of them (`src/config/spoke-host-routing.mjs` ←
 * `src/config/deployment-build.mjs` ← `next.config.ts`) runs where TypeScript cannot be executed:
 *
 *   · the TYPED surface (`./hostname.ts`, re-exported through `@/core/spoke`), which the configuration
 *     layer, the request boundary and the runtime index import;
 *   · the BUILD seam (`@/config/spoke-host-routing`), which resolves an Installation's declared Spoke
 *     origins into the routing description the build inlines — and which must refuse an authored
 *     inspection alias that restates a Spoke's canonical hostname by applying THIS rule, not a copy of
 *     it;
 *   · the same seam's alias validation, so an authored alias is refused unless it is already spelled
 *     the one normalized way.
 *
 * The identity rules are split the same way (`./spoke-id.mjs` + `./spoke-id.ts`), for the same reason:
 * one implementation, two surfaces, and no consumer can drift from another.
 *
 * NORMALIZATION IS THE FIRST HALF OF RESOLUTION
 * ---------------------------------------------
 * A raw `Host` header is not a hostname. It may carry a port, any casing, a trailing dot, or be an
 * IPv6 literal in brackets. Every such spelling must normalize to ONE value, or the same domain could
 * resolve differently depending on how a client spelled its request. `normalizeHostname` answers `null`
 * for anything unusable — an absent or empty header is NOT a domain — so a caller can never match
 * against a value that was never normalized.
 *
 * HOSTNAME OWNERSHIP IS EXPLICIT AND EXACT
 * ----------------------------------------
 * Every hostname a domain answers for is claimed EXPLICITLY and EXACTLY. A claim for `example.com` does
 * NOT claim `foundation.example.com`, `demo.example.com` or anything else beneath it: those names stay
 * independently available to other domains. There is deliberately no wildcard, no suffix rule, no
 * regular expression and no implicit subdomain ownership — a hostname belongs to exactly the domain
 * that names it.
 *
 * A domain therefore states its canonical hostname plus any number of exact aliases
 * (`www.example.com` and `example.com` are two exact claims of ONE domain), and the decision
 * `@/core/spoke` makes is simple equality over normalized values.
 *
 * Framework-neutral: pure data and pure functions. No filesystem, no DNS, no provider, no request.
 */

/**
 * A normalized hostname: lowercase, no port, no trailing dot, no IPv6 brackets.
 *
 * @typedef {string} Hostname
 */

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
 *
 * @param {string | null | undefined} host the raw value
 * @returns {Hostname | null} the normalized hostname, or `null`
 */
export function normalizeHostname(host) {
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

/**
 * THE HOSTNAME OF AN AUTHORED CANONICAL ORIGIN, or `null` when the origin yields none.
 *
 * This is the ONE place the `origin → hostname` step is spelled, and the accepted composition authority
 * (`@/config/spoke-composition`'s `canonicalHostnameForSpoke`) consumes it too — so a Spoke's canonical
 * hostname is derived identically at build time, at request time and in the runtime index, and the
 * request boundary's routing table cannot disagree with the domain about which host a Spoke answers for.
 *
 * Pure: it parses an origin and normalizes the result. A value that is not an absolute origin, or whose
 * host normalizes to nothing, answers `null` — the caller decides whether that is a loud failure (the
 * composition authority makes it one) or simply "no claim".
 *
 * @param {string} origin the authored absolute origin
 * @returns {Hostname | null} the hostname it claims, or `null`
 */
export function hostnameFromOrigin(origin) {
  /** @type {string} */
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    return null;
  }

  return normalizeHostname(host);
}
