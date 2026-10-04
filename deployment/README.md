# This deployment

This directory is **one deployment capsule**: everything a website owner runs and changes for *this*
site, kept apart from the Foundation platform that renders it.

A deployment capsule is a *write boundary*. Work done here cannot change the platform, and work done
on the platform cannot quietly change this site's content. That is what lets one deployment's owner
work confidently while the platform keeps improving, and what keeps two deployments from reaching into
each other.

## What is in here today

| Path | What it is |
| --- | --- |
| `spokes.json` | The Installation's Spoke collection. It declares the two Spokes this Installation serves: `[{ "id": "foundation", "root": "spokes/foundation" }, { "id": "germany", "root": "spokes/germany" }]`. Its presence makes this an EXPLICIT Installation — the form where the website material lives in the declared Spokes beneath `spokes/`, and the installation root keeps only the lifecycle records below. |
| `spokes/foundation/` | **The FOUNDATION Spoke, and the Installation's default Spoke.** It carries: |
| ↳ `spokes/foundation/site.config.json` | The Foundation Spoke's configuration: its one Site (`ww`), its languages, contact details, social links, navigation and feature flags. |
| ↳ `spokes/foundation/config/i18n/` | The Foundation Spoke's user-visible interface strings, one file per locale. |
| ↳ `spokes/foundation/content/` | The Foundation Spoke's authored content: its pages — Markdown, or the declarative JSON mode — and the artwork sources in `content/assets/`. `content/README.md` is the map of what to edit. |
| `spokes/germany/` | **The GERMANY Spoke**, served at its OWN public hostname. It owns exactly ONE Site, `de`, with the two demonstration locations Berlin and Frankfurt, and it carries its own `site.config.json`, its own `config/i18n/` dictionaries and its own `content/` tree, in exactly the same shape as the Foundation Spoke above. |
| `tests/unit/` | This deployment's durable unit-level acceptance: its real configuration, dictionaries, routes, copy and structured data. |
| `tests/integration/` | This deployment's durable integration acceptance: its authored pages served through the real application. |
| `tests/browser/` | This deployment's browser acceptance scenario, run by the Foundation's browser harness. |
| `.test/` | **Ignored ephemeral workspace, never committed.** Temporary fixtures, screenshots, generated reports, browser artifacts, probes, throwaway copies. It is created locally when needed (`deployment/.gitignore` keeps it and everything inside it out of version control) and it must be **empty — or removed — again when the work is finished**: nothing is left behind for the owner to tidy. |
| `foundation-baseline.json` | The immutable Foundation release this deployment adopts (see below). |
| `AGENTS.md` | The contract for an agent working on this deployment. |

**The capsule owns the whole deployment.** Its configuration, dictionaries, authored pages and artwork
sources live here and nowhere else — there is no second copy at the repository root, so a deployment
change needs no edit outside this directory. The artwork's runtime mirror (`public/assets/**`) is
generated build output rather than deployment source: `pnpm assets:sync` writes it and
`pnpm assets:check` proves it is byte-identical to the sources above.

## The topology this Installation serves

```text
Foundation Installation
├── Spoke Hub                     ← the one request boundary: the public Host header is its only input
│   ├── foundation Spoke          → https://foundation-template.provelopment.com
│   │   └── Site ww               (Global)
│   └── germany Spoke             → https://foundation-template-germany.provelopment.com
│       └── Site de               (Germany, with the Locations Berlin and Frankfurt)
```

Each Spoke is a complete, isolated website: its own configuration, dictionaries, content tree, page
tree, sitemap, `robots.txt`, OpenGraph images and asset namespaces. A Spoke owns exactly one Site here,
so neither Spoke offers a Site control: the public `Host` decides which Spoke answers, and the Site is
therefore a property of the hostname rather than a visitor choice.

**Language is not ownership.** `/ww/de` is the *German-language* representation of the Global Site
`ww`, owned by the **Foundation** Spoke — ordinary German pages authored inside that Spoke. `/de/de` is
the German-language representation of Site `de`, owned by the **Germany** Spoke, and it is the only
Spoke that binds the Berlin and Frankfurt locations. Nothing on either host serves the other Spoke's
content: a Site-shaped coordinate addressed to the wrong Spoke is never answered with the other Spoke's
pages, never redirects to the other hostname, and is ultimately refused.

## Which hostname answers: the three kinds (M20 §20–§41)

| Hostname | What it is | Which Spoke answers |
| --- | --- | --- |
| `foundation-template.provelopment.com` | the **Foundation** Spoke's own public domain | **Foundation** |
| `foundation-template-germany.provelopment.com` | the **Germany** Spoke's own public domain | **Germany** |
| a deployment or branch URL Vercel publishes for **this** project, e.g. `provelopment-foundation-git-main-provelopment.vercel.app` | Vercel's own **inspection URL** for the build it made — not a public domain | the **inspection Spoke**, which this Installation states explicitly: `foundation` |
| anything else | no Spoke claims it | **404 Not Found** |

`deployment/spokes.json` states the policy beside the declaration:

```json
"inspectionSpoke": "foundation"
```

That is the ONE Spoke which represents this Installation on an accepted Vercel inspection URL. It is
**explicit**: it is never the first declared Spoke, never a manifest-order fallback, and a multi-Spoke
Installation that is built on Vercel without stating it is refused at build time rather than guessed at.
An Installation that states it must name a Spoke it actually declares.

**A Vercel inspection URL is a viewing surface for operators, not a public-domain alias.** Vercel publishes
those URLs for the deployment it built, and an operator uses them to check that the deployment actually
renders. What they render is the Foundation Spoke's own website, and its metadata stays canonical to
`https://foundation-template.provelopment.com/` — canonical link, `hreflang`, `og:url` and the sitemap all
keep the authored origin, because a deployment URL is not this website's address. Such a URL is never
advertised, never linked from a page and never added to a sitemap, and the cross-Spoke footer link still
points at `https://foundation-template-germany.provelopment.com/` — never at another Vercel hostname.

Recognition is **EXACT equality** against the hostnames Vercel's own build environment reports for the build
it is running (`VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`). Nothing is fetched from
Vercel at request time, no Vercel setting is read or written, and there is deliberately **no `*.vercel.app`
rule**: an unrelated project's Vercel URL, a team URL, or a name that merely *contains* ours answers 404 like
any other unknown host.

## Update, and Upgrade (M20)

| Operation | Foundation release | The authored material |
| --- | --- | --- |
| **Update** | unchanged | `content/pages/**` and `content/assets/**` of the Spokes being changed |
| **Upgrade** | a different immutable Foundation release | carried forward |

This Installation has **one** live Foundation release, so both operations promote the *whole* Installation — all
of its Spokes — as one candidate, and a failed candidate leaves the live revision untouched. The lifecycle
records the kind explicitly and refuses a mislabelled operation (an `update` naming a different release, an
`upgrade` naming the release already live), so a reader can tell an Update from an Upgrade in the history. The
vocabulary (Installation, Spoke Hub, Spoke, Hub, Site) and the reasoning are in
[`ARCHITECTURE.md`](../ARCHITECTURE.md); the full compendium — structures, strategies, ownership transfer and
blast radius — is the programme documentation (`.documentation/`).

## How to work on this deployment

The paths in this section are relative to this capsule.

- **A deployment change never requires editing the Foundation.** Change the configuration, the
  dictionaries or the authored pages, run this deployment's validation, and stop there.
- **Every page is authored in `content/`** — one page per URL, in Markdown or in the declarative JSON
  mode. If a page has its own URL, it is a page: there is no author-facing collection to add.
- **User-visible interface strings live in `config/i18n/<locale>.json`**, never inside a component.
- **Durable tests for this deployment belong in `tests/**`.** They answer questions about *this* site:
  its own origin, sites, languages, locations, routes, copy and assets. Reusable platform behaviour is
  already proved once by the Foundation's own tests — do not copy those here.
- **Temporary work belongs in `.test/**` and is ephemeral.** Do not scatter scratch files through this
  repository, and delete everything you created there before you finish: the workspace is empty (or
  gone) when the task is done.
- **If a change seems to need a platform edit, stop and escalate.** A Foundation defect is reported,
  not patched from inside this capsule.

## The Foundation baseline

`foundation-baseline.json` records the **immutable Foundation release** this deployment deliberately
adopts — never a moving branch, and never "whatever `main` is today":

| Field | What it is |
| --- | --- |
| `release.tag` | the release identity — the immutable name of one Foundation release. The first release is grandfathered as `v2026.09.30-foundation-release-initial`; every later one is canonical (`provelopment-foundation-vYYYYMMDD.HHMM`, UTC — see `scripts/release/README.md`) |
| `release.repository` | the upstream platform authority the release came from |
| `release.commit` / `release.tree` | provenance: the source revision the release was cut from |
| `release.manifestFormat` | the release manifest format this adoption speaks |
| `release.content.policy`, `.digest`, `.fileCount` | the platform-content identity: what the release actually contains |
| `adoptedAt` / `establishedBy` | when, and by which work, this deployment adopted it |

The source tree and the content digest are **different identities on purpose**: the tree is the whole
source revision (a release excludes this capsule, the repository's CI and generated state), while the
digest covers exactly the platform content a consumer receives.

The record exists so that a Foundation update is a *deliberate, reviewable* act — compare, decide,
adopt — rather than an accident of pulling the newest code. There is no upgrade mechanism yet; the
record is the starting point, and `deployment/tests/unit/foundation-baseline.test.ts` keeps an invalid
record from entering this deployment.

To re-prove the record against the published release (the release mechanism itself is documented once,
in `scripts/release/README.md`):

```bash
git rev-parse v2026.09.30-foundation-release-initial^{commit}   # must equal release.commit
git rev-parse v2026.09.30-foundation-release-initial^{tree}     # must equal release.tree

pnpm release:build --release v2026.09.30-foundation-release-initial \
                   --source <release.commit> --dest <an empty directory>
pnpm release:verify --payload <that directory> --source-repository . --expect-tag
```

The verification prints the payload digest and file count the record must equal, and `--expect-tag`
refuses a release whose tag no longer resolves to that commit. **A published release identity is
immutable**: it is never repointed, deleted or replaced.

## Another deployment is out of scope

You may read Foundation code and contracts, because that is how you understand the platform you use. You
may not read, copy from, or modify another deployment — ever.

## This deployment's operational record, and establishing a NEW deployment (FOUNDATION-B4B)

The record has a real writer since B4B. `operational-state.json` is written ONCE, as the LAST act of
establishing an installation — which is exactly why a target without it is visibly incomplete and can never
be mistaken for a successful one:

| Field | What it says |
| --- | --- |
| `schemaVersion` | the record's schema version (1) |
| `current.installationIdentity` | WHICH installation this record describes — this deployment, by name and its own repository |
| `current.live` | the immutable release, and the exact revision that is live |
| `current.health` / `healthEvaluatedAt` | whether the live installation is serving, and when that was actually evaluated. `healthEvaluatedAt: null` means nothing has judged it yet — which is exactly how an installation that has just been established reads (`offline`, never evaluated): establishing an installation ACTIVATES it, and activation is not proof that it serves |
| `current.lastAttempt` | what is happening, or what last happened, and why it stopped |
| `history` | the bounded record of how the current state was reached |

It is generated state: never committed, never shipped in a release, never edited by hand, and refused a
location outside the installation it describes
(`src/adapters/installation/node-operational-state-store.ts`).

This capsule is this deployment's authored material, and it is also perfectly good **seed** material for
establishing a NEW, autonomous Foundation installation elsewhere:

```bash
pnpm release:build  --release <identity> --source <commit> --dest <an empty directory>
pnpm installation:establish --release <identity> --payload <that directory> --seed deployment \
                             --target <the new installation root> --name "<its name>" \
                             --repository "<its own repository>"
```

Two things about the result are deliberate:

* **The capsule's `foundation-baseline.json` is NOT carried over.** Establishment writes the new
  installation's own adoption record for the release it actually established from: a copied record would
  claim an adoption that never happened there. Everything else in this capsule is copied verbatim.
* **`operational-state.json` may never be inside a seed.** It is generated state describing what an
  installation is RUNNING, so the new installation gets its own — and this capsule must keep ignoring it
  (establishment refuses a seed whose capsule does not).

The full procedure, the refusals and the proof are in `scripts/installation/README.md`.

## The two Spokes are discoverable from each other (M19)

Each Spoke authors ONE secondary/footer link to the other website, in its own `site.config.json`:

```jsonc
// deployment/spokes/foundation/site.config.json
"footerNavigation": {
  "items": [{ "label": "Germany", "href": "https://foundation-template-germany.provelopment.com/" }]
}

// deployment/spokes/germany/site.config.json
"footerNavigation": {
  "items": [{ "label": "Global", "href": "https://foundation-template.provelopment.com/" }]
}
```

The visitor-facing label comes from that Spoke's OWN dictionaries
(`config/i18n/<locale>.json`, `navigation.items[<href>]`): `Germany` / `Deutschland` on Foundation,
`Global` on Germany. The authored `label` is the fallback for a locale without an override, so no raw
configuration key can ever reach a visitor.

The destination is the other website's ROOT, deliberately: the target applies its own root/locale
completion (the Germany Spoke's default language is German; a visitor whose browser prefers English
lands on that website's own English representation) and neither Spoke constructs a foreign page path.
See `ARCHITECTURE.md` for why this is ordinary authored navigation and not a restored cross-Spoke
selector.
