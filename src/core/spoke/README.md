# The Spoke Hub / Spoke / Hub / Site vocabulary (FOUNDATION-MULTISITE-S1 / S2)

The pure outer-domain vocabulary this template needs in order to host more than one publicly
addressable domain from one Foundation installation.

```text
Spoke Hub   coordinates the installation's Spokes        (1..* Spokes)
Spoke       ONE independently addressable domain          (1..* Hubs)
Hub         an internal grouping of Sites in one Spoke    (1..* Sites)
Site        the EXISTING Foundation `sites[]` context     (unchanged; owned by `@/core/site`)
```

## What is here

| Module | Contract |
| --- | --- |
| `hostname.ts` | the normalized hostname value and its pure normalization rule |
| `model.ts` | the container types: `SpokeHub`, `Spoke`, `Hub` and their identities |
| `coherence.ts` | the pure rules that make `hostname → Spoke` total and unambiguous |
| `resolve.ts` | the pure decision: a raw request host → exactly one Spoke, or none |
| `site-ownership.ts` | the pure decision: an already-selected Spoke + a Site code → its owning Hub, or none |

Import from `@/core/spoke`; the inner modules are not a consumer surface.

**Hostname ownership is explicit and EXACT.** A Spoke claims its canonical hostname plus any exact
aliases (`www.example.com` and `example.com` may both belong to one Spoke), and a claim for
`example.com` never claims `foundation.example.com` or any other name beneath it — there is no
wildcard, no suffix rule and no implicit subdomain ownership.

**A Site code belongs to one Hub in its Spoke.** A public URL is `/<site>/<locale>/<route>` with no
Hub segment, so after the hostname has chosen the Spoke the Site code alone must identify the Site;
the same code in two *different* Spokes is valid, because the hostname already separates them.

**Exactly one default Site per Spoke.** `ResolvedSite.isDefault` is the Site domain's own flag, but
the designation is Spoke-wide: because `/` carries no Site segment, a Spoke must have exactly one
default Site across all of its Hubs — while each Spoke has its own.

## What is deliberately NOT here

This slice is vocabulary only, and it is **unwired** — nothing in the application imports it.

- no filesystem roots, no `node:*`, no Next.js, no provider concept (`tests/architecture/boundaries.test.ts`);
- no configuration or schema change: `site.config.json` and `@/config` are untouched;
- no request-boundary wiring: `src/proxy.ts` is untouched;
- no asset, page, locale, navigation, business or theme concerns. A `Hub` carries an identity and the
  EXISTING Foundation Sites it owns (`ResolvedSite`, `@/core/site`) — and nothing else. Assets, Page
  Hubs, configuration and filesystem roots remain later slices.

## Terminology note

Foundation's older prose about an *installation* and its *spokes*
(`@/core/foundation-installation`) describes one website per spoke. Under the vocabulary made
canonical here, that container-of-Sites is the **Hub**, and a **Spoke** is one domain that owns Hubs.
That older prose is intentionally left untouched by this slice; a separate terminology
reconciliation owns it.
