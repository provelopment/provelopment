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
| `site.config.json` | This deployment's configuration: its sites, languages, locations, contact details, social links, navigation and feature flags. |
| `config/i18n/` | This deployment's user-visible interface strings, one file per locale. |
| `content/` | This deployment's authored content: its pages — Markdown, or the declarative JSON mode — and the artwork sources in `content/assets/`. `content/README.md` is the map of what to edit. |
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
| `current.health` / `healthEvaluatedAt` | whether the live installation is serving, as of when |
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
