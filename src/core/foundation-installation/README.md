# The Foundation installation lifecycle

The framework-neutral model of ONE **Foundation installation**: what may be live, what a candidate is, which
moves are legal, why a move failed, and the durable record that answers those questions without reading
prose.

**Nothing in this directory performs a lifecycle operation.** No installer, no materialiser, no validator,
no staging deployer, no promoter, no rollback executor and no health probe. Those are the mechanics of later
phases; this directory is the CONTRACT they must obey, and its value is that it can be read, reviewed and
tested before any of them exists.

## One installation, autonomous

```text
FOUNDATION INSTALLATION
        │
        ├── its own lifecycle and operational state     ← this directory
        │
        ├── spoke A          one website it owns and manages
        ├── spoke B              └── Site contexts (`ww`, `de`) live inside a spoke
        └── spoke N
```

An installation is **completely self-contained**. It exists, operates and manages its own spokes with
**zero knowledge of any other installation** — another installation is not its parent, its child, its
sibling, its source or a spoke. Consequences that are architecture, not etiquette:

* there is **no registry, no fleet, no clone aggregate, no clone lifecycle, no sibling awareness, no
  cross-installation state and no runtime connection** between installations — nothing in this model can
  name another installation, so nothing can accidentally depend on one;
* `clone` is an **operation**, not a domain entity: it may describe the one-time act by which another
  complete installation is initially created, and once created the result is simply *a Foundation
  installation*. There is no `Clone`, `ParentInstallation`, `SourceInstallation`, `UpstreamInstallation` or
  `CloneOf` anywhere in the platform;
* an installation never **phones home**, polls an upstream, discovers "the latest release" or requires any
  connection to operate. It works indefinitely offline, from a release it was given.

**The canonical repository is provenance, not a runtime relationship.** Provelopment's GitHub Foundation
repository is the canonical PUBLIC source of official releases; that is what `FOUNDATION_SOURCE_REPOSITORY`
records, and it is what makes a release recognizable and verifiable. It says nothing about where an
installation obtained the bytes for a particular install or upgrade, and it establishes no ongoing
dependency (see "Release provenance vs acquisition" below).

**If an installation exposes a genuine Foundation defect**, the installation does not patch the platform: it
STOPS and reports. The Foundation source is fixed under separate Foundation work, a new immutable release is
published, and the installation MAY then choose to adopt it like any other release. "An installation
self-patches some external Foundation source" is not a state this model can represent.

## Release provenance vs acquisition

Two questions, two answers, deliberately not one fact:

| | Answers | Lives | Nature |
| --- | --- | --- | --- |
| **release provenance** | *what immutable Foundation release is this?* | in the release itself: `@/core/foundation-release` (`tag`, source commit/tree, content policy, content digest, manifest format, canonical repository) | immutable, travels with the release, never changes |
| **release acquisition** | *where did the operator obtain the bytes used for THIS attempted install/upgrade?* | an acquisition adapter's act (`@/application/foundation-installation-ports`) | mutable and incidental; never part of a release's identity |

So the core lifecycle NEVER assumes `upgrade = connect to GitHub`. It accepts **THIS verified immutable
Foundation release** as its input (`startInstallationAttempt` takes a release reference; never a URL, a
provider or a connection). Canonical GitHub releases are the default and canonical public acquisition
source, and an operator may instead supply a release from a local directory, a local archive, a mirror or
another approved provider — with the release's identity unchanged either way.

The operational record therefore records **what is running** (immutable identity) and not where those bytes
came from: acquisition provenance belongs to the act, in the adapter's own diagnostics, and mixing it into
the installation's durable state would make an incidental fact look like part of the platform.

## Terminology (used precisely)

| Term | Means | Does NOT mean |
| --- | --- | --- |
| **Foundation installation** | ONE complete, autonomous installation: the platform it runs, its authored state, its own operational state, and the spokes it owns | a spoke, a Site, another installation, or a release |
| **spoke** | one website the installation owns and manages (its own lifecycle is a later, separate concern) | an installation, a Site, or another installation's website |
| **Site** (`ww`, `de`) | a country or global context inside a spoke (`@/core/site-code`) | a spoke, an installation, or the Foundation |
| **Foundation release** | an immutable platform release named by identity — `provelopment-foundation-vYYYYMMDD.HHMM` (UTC), or the grandfathered first release | a branch, `main`, `HEAD`, "the latest", or a historical checkpoint tag |
| **baseline** | the release an installation has deliberately ADOPTED (`deployment/foundation-baseline.json`, FOUNDATION-R1C) | what is running right now — that is `live` |
| **candidate** | an immutable artifact built from one release plus this installation's authored state, identified by content digest | a branch, a workspace, or "a build that could be rebuilt later" |
| **staging** | an environment carrying ONE exact validated candidate for inspection | a long-lived divergent branch |
| **live** | the currently active release **and** installation revision | the desired release, or the last thing that was attempted |
| **health** | whether the LIVE installation is serving: `online` or `offline` | whether the last attempt passed. There is no `degraded` |

**Whose lifecycle this is:** everything in this directory — activation, attempt, health, live state,
candidate, staging, promotion, rollback — belongs to the INSTALLATION, because installing, upgrading and
rolling back a Foundation release are installation acts. None of it belongs to a spoke or a Site, and the
installation's record holds no spoke- or Site-level state: a spoke's own lifecycle, when it is defined, gets
its OWN record rather than widening this one.

## The model: three concerns, never conflated

```text
ACTIVATION   current.live                    what is live — or null, meaning UNESTABLISHED
ATTEMPT      current.lastAttempt             what is happening, or last happened, and why it stopped
HEALTH       current.health / healthEvaluatedAt   is the live installation serving, as of when
```

Keeping them apart is what makes the failure semantics structural rather than a promise:

| Situation | ACTIVATION | HEALTH | ATTEMPT |
| --- | --- | --- | --- |
| fresh installation, never operated | `null` (unestablished) | `offline` | `null` |
| fresh install failed | `null` (not activated) | `offline` | `failed` (`materialization`/`build`/…) |
| live on release A, healthy | release A | `online` | whatever it last was |
| upgrade to B rejected before promotion | release A — untouched | `online` — untouched | `failed` |
| the live installation itself fails health | release A | `offline` | untouched |

## States, entities and value objects

* **Installation identity** — `current.installationIdentity`: the name the operator uses and the installation's
  own repository/authority, so a record is readable without trusting the path it was found at.
* **Release reference** (`@/core/foundation-release/reference`) — the ONE way a release is named: identity,
  repository, commit, tree, manifest format and content identity (policy, digest, file count), exactly the
  shape `deployment/foundation-baseline.json` already records. It lives in the pure release contract, not
  here, because the release tooling and this lifecycle consume it; recognition is delegated to the release
  identity contract, nothing restates the naming contract, and an installation can never name a mutable
  revision.
* **Candidate identity** — `release` (the identity of the release it contains), `authored` (a `sha256:`
  digest of the installation's authored input: configuration, dictionaries, pages, artwork) and `materialized`
  (a `sha256:` digest of the candidate tree itself). A digest rather than a commit, because an installation
  need not be a Git checkout — and the building phase owns the algorithm, while the contract is that
  identical inputs produce one identity.
* **Attempt** — the desired release, the candidate (once materialised), the stage, the outcome, the
  timestamps and the failure. The attempt is the ONLY place a desired release is expressed, so no separate
  "desired release" setting can drift from what is actually happening.
* **Live state** — the release, the exact installation **revision** (`sha256:`), when it was activated, and the
  previous live state as rollback provenance.
* **Health** — `online` / `offline`, with the instant the value was established.
* **Events** — a closed vocabulary (`attempt-started`, `candidate-prepared`, `candidate-validated`,
  `candidate-staged`, `candidate-inspected`, `attempt-failed`, `promoted`, `health-online`,
  `health-offline`), each naming the release it concerns.

## The transition table

Every move is a pure function in `transitions.ts`. Each result is re-parsed before it is returned, so a
transition can never produce a record the contract would refuse to read.

| Move | From | To | Events | Refused when |
| --- | --- | --- | --- | --- |
| `startInstallationAttempt` | any settled state | `preparing`, `pending` | `attempt-started` | an attempt is already in flight; `install` while something is live; `upgrade` while nothing is; `rollback` without a previous live state, or to a release that is not it |
| `recordInstallationCandidate` | `preparing` | `validating` | `candidate-prepared` | the candidate contains a release other than the one requested |
| `recordInstallationCandidateValidated` | `validating` | `validated` | `candidate-validated` | — (the validator decides; the installation records it here) |
| `recordInstallationCandidateStaged` | `validated` | `staged` | `candidate-staged` | the candidate was not validated in this attempt |
| `recordInstallationStagingInspected` | `staged` | `inspected` | `candidate-inspected` | the candidate was not staged in this attempt |
| `beginInstallationPromotion` | `inspected` | `promoting` | — | the candidate is not promotable |
| `completeInstallationPromotion` | `promoting` | `live` (`succeeded`) | `promoted` (+ `health-online` if it was offline) | the named candidate is not the one this attempt validated and inspected |
| `failInstallationAttempt` | any in-flight stage | `failed` | `attempt-failed` | nothing is in flight; the category is outside the vocabulary; no message |
| `recordInstallationHealth` | any state | unchanged | `health-online` / `health-offline` on a CHANGE | `online` while nothing is live |

`isInstallationCandidatePromotable(state)` and `isInstallationAttemptPending(state)` are DERIVED from the
attempt's stage and identity. There is no promotable flag to set, forget or forge.

**One attempt at a time.** Starting a second while one is in flight is refused. An attempt that was
abandoned (a process that died) must be CLOSED — recorded as failed, with the category naming where it
stopped — before another can begin, so "what is happening now" always has exactly one answer. Serialising
lifecycle operations themselves (queueing, locking, retrying) belongs to whoever RUNS them, above this
contract; nothing here sleeps, waits, retries or locks.

## Failure semantics

A failure carries a **category** from the closed vocabulary in `failures.ts` (release resolution,
materialization, installation validation, build, browser acceptance, staging installation, staging health,
promotion, live health, rollback) and a human **message** with the detail. A category outside the vocabulary
is refused rather than stored: an unnamed failure is one nobody can act on. The category is what later
phases branch on; the message is what a person reads.

**The separation is enforced by what each function is GIVEN.** `failInstallationAttempt` cannot write health
or the live state — it is not passed them. Therefore:

* a failed fresh install leaves an installation that was never activated, and therefore offline;
* a rejected upgrade leaves the live release untouched and the installation online;
* only `recordInstallationHealth` (a live-health failure) and a completed promotion move health.

`ONLINE` means the live installation is serving; `OFFLINE` means it is not serving, or that nothing is live
yet. Health never describes an attempt, and an attempt's outcome never explains health.

## Exact promotion, and rollback provenance

```text
validated candidate  ==  staged candidate  ==  promoted candidate
```

is one field-by-field comparison of one value (`identicalInstallationCandidates`). The revision that becomes
live is the candidate's own `materialized` digest, and the record is checked for the same agreement when it
is READ — a record claiming a promotion of a candidate other than the one it validated is refused.

A rollback returns to the PREVIOUS live state: `startInstallationAttempt` accepts `kind: "rollback"` only when
it names `current.live.previous.release` exactly, and a completed promotion records the state it replaced as
the new `previous`. Rolling back further than one step is an ordinary upgrade to a release the installation
already knows — releases are immutable, so it needs no special machinery. Rollback never means undoing an
arbitrary filesystem change, restoring an untracked backup, moving a tag, or `git reset`.

## The durable record

The record is a single file named `operational-state.json`, in the installation root — the location the ONE
deployment-path authority (`src/config/deployment-root.ts`, the reviewed ISO-B1 filesystem seam) resolves, so
nothing in the application spells it. (That authority keeps its own `deployment-*` vocabulary because its
contract was reviewed before this model existed: it names the ROOT that holds a deployment — this
installation — and it is a filesystem seam, not the lifecycle subject.)

```jsonc
{
  "schemaVersion": 1,
  "current": {
    "installationIdentity": { "name": "…", "repository": "https://…" },
    "health": "online",
    "healthEvaluatedAt": "2026-09-30T13:42:11Z",
    "live": {
      "release": { "tag": "provelopment-foundation-v20261001.0900", "repository": "…", "commit": "…",
                   "tree": "…", "manifestFormat": 1,
                   "content": { "policy": "foundation-source-v1", "digest": "sha256:…", "fileCount": 334 } },
      "revision": "sha256:…",
      "activatedAt": "2026-09-30T13:42:11Z",
      "previous": { "release": { "…": "a release reference" }, "revision": "sha256:…",
                    "retiredAt": "2026-09-30T12:10:00Z" }
    },
    "lastAttempt": {
      "kind": "upgrade",
      "target": { "…": "a release reference" },
      "stage": "live",
      "outcome": "succeeded",
      "candidate": { "release": "provelopment-foundation-v20261001.0900",
                     "authored": "sha256:…", "materialized": "sha256:…" },
      "startedAt": "2026-09-30T13:20:00Z",
      "endedAt": "2026-09-30T13:42:11Z",
      "failure": null
    }
  },
  "history": [
    { "type": "attempt-started", "at": "2026-09-30T13:20:00Z",
      "release": "provelopment-foundation-v20261001.0900", "detail": "upgrade … started" }
  ]
}
```

* `current` is the AUTHORITY for what is true. `history` is append-only, oldest first, bounded by
  `INSTALLATION_LIFECYCLE_HISTORY_LIMIT` (100) with the oldest events dropped — determining current truth
  never requires history, so trimming cannot lose it. This is not an event-sourcing framework: no replay,
  no projection, no rebuild from history.
* Every instant is a UTC ISO-8601 instant (`…Z`) and is PROVENANCE, never identity: the same candidate has
  the same identity whatever the clock says. Nothing in this directory reads a clock; callers pass the
  instant they recorded.
* The record is INSTALLATION-LOCAL and independent: it describes one installation, is written by its own
  operations, and is never shared between installations.

## Where it lives, and why it is not version-controlled

`operational-state.json` is **generated operational state**, not authored content, and the capsule's
`.gitignore` keeps it out of version control. The reasoning, because "durable" does not mean "committed":

* The record describes what IS running. Committing it would make every health evaluation and every failed
  attempt a change to the repository's source history — a diary nobody asked for, with conflicts whenever a
  installation is operated from more than one machine.
* An installation may run one immutable revision. If the record were tracked, writing it would make the working
  tree stop matching the revision that is running, and "which revision is deployed" would stop having an
  answer.
* Durability comes from the installation's own filesystem (and, later, wherever an installation keeps its state):
  it survives restarts, it is read by whoever operates the installation, and it is not carried inside a
  Foundation release payload — so materialising a release can never overwrite it.
* The AUTHORED state stays exactly what it was: `site.config.json`, `config/i18n/**`, `content/**`. The
  record never becomes a second place where an owner authors anything.

The ADOPTED baseline is a different fact and keeps its own file: `deployment/foundation-baseline.json` is a
declaration ("I deliberately adopt this release", a reviewed act), while `live` is an observation ("this is
what is running"). They are expected to agree after a successful promotion and may legitimately differ while
an attempt is in flight; B4A deliberately does not police that equality, because the installation's history —
not a rule — is what explains the difference.


## Ownership: what lives where

| Layer | Owns | Here |
| --- | --- | --- |
| **release contract** | what an immutable Foundation release IS: its identity and naming semantics, its canonical provenance, its manifest contract, the release reference a consumer stores | `src/core/foundation-release` (pure; consumed by this lifecycle, by the release tooling and by future acquisition/verification adapters) |
| **domain** | lifecycle invariants, health semantics, candidate/promotion identity rules, legal transitions, the result vocabulary, fail-closed reading | this directory (`src/core/foundation-installation`), pure and framework-independent |
| **application** | the PORTS a lifecycle operation needs — a clock, the operational-state store, and a release ACQUISITION source | `src/application/foundation-installation-ports.ts`, types only |
| **adapters** | the mechanics of B4B–B4G: obtaining a release, materialising a candidate, validating it, deploying staging, promoting, rolling back, probing live health | not written yet, by design |

The domain must never import a framework, `@/config`, `@/adapters`, `@/application`, a filesystem — or the
procedural tooling in `scripts/**` — the repository's boundary suite (`tests/architecture/boundaries.test.ts`)
enforces the framework and tooling parts, and `tests/architecture/foundation-installation-boundary.test.ts`
enforces the rest, including the ONE-directional release contract:

```text
                     release tooling (`scripts/release/**`)
                                  ↑  consumes
             pure Foundation release contract (`src/core/foundation-release`)
                                  ↓  consumes
        Foundation installation lifecycle (`src/core/foundation-installation`)
```

**Caller-agnostic by construction.** Nothing here knows about a terminal, a prompt, a session, a user, an
agent, GitHub or Vercel. A human CLI, a downstream agent, a future control plane and a test drive the SAME
transitions and read the SAME record; anything interactive or host-specific belongs in an adapter.

**The write boundary.** A lifecycle operation may write only inside the installation it is operating — this
installation's own operational record, and later its own candidate and staging areas. It never writes another
installation, a fixture, the Foundation's source or a global system path. When a genuine Foundation defect is
found, the operation STOPS and reports it: the Foundation is fixed by a Foundation release, which the
installation then adopts like any other release. "An installation patches the Foundation" is not a state this
model can represent.

**The reference installation has no record today**, and that is meaningful rather than missing: it has never
been operated by the lifecycle (its baseline was adopted by a reviewed act, FOUNDATION-R1C), so its
operational state is unestablished. Reading a store that answers `null` is the honest way to say so.

## What the reader REFUSES (invalid state fails closed)

`parseFoundationInstallationOperationalState` refuses, rather than repairs:

* an unknown `schemaVersion` (a future migration is a deliberate act, never a guess made while reading);
* health `online` with nothing live, or a live installation whose health has no evaluation instant;
* a `live.previous` that names the live release itself, or a rollback provenance that is not a complete
  state;
* a release identity no Foundation release could have (a branch, a bare commit, a checkpoint, an impossible
  date or minute), or a malformed commit/tree/digest/count;
* a candidate that contains a release other than the one the attempt asked for;
* a stage and outcome that disagree, a candidate where none can exist, an end instant on a pending attempt,
  or a failure on an attempt that did not fail;
* a succeeded attempt whose live release or live revision is not the candidate it promoted — the
  exact-promotion agreement;
* an `upgrade`/`rollback` with nothing live, or an unsettled `install` that left something live;
* history that is not ordered oldest-first, longer than the contract's bound, or carrying a type outside
  the vocabulary.

Nothing is normalized and no field is filled in: a contradictory record is an error a reader acts on.

## Schema versioning

`schemaVersion` exists from the first release of the contract and is the SCHEMA's own number — deliberately
not called `version`, which would invite confusion with the Foundation release an installation runs
(`live.release.tag`). A record whose number this code does not know is refused. When the schema must change,
the migration is a deliberate, reviewed step that understands both shapes; no migration machinery is
written in advance.

## What later phases add (and must not change here)

* **B4B** establishing a COMPLETE independent installation from an explicit immutable release (and an
  acquisition source), using these transitions and the ports above — the first real proof will use a real
  estate installation, not a synthetic fixture.
* **B4C/B4D** candidate materialisation and validation — implementing the candidate identity's `authored`
  and `materialized` digests, which this contract requires but does not compute.
* **B4E** staging, promotion and rollback mechanics — driving `beginInstallationPromotion`,
  `completeInstallationPromotion` and a `rollback` attempt; and the live-health probe that calls
  `recordInstallationHealth`.
* **Later** acquisition adapters (canonical repository, local directory, archive, mirror), a spoke
  lifecycle with its OWN record, and release batches — each consuming this contract, never inventing a
  second model of the installation.

A later phase that needs a new STATE adds it here, with its transition and its refusal cases, rather than
inventing workflow flags beside this model. A later phase that needs SPOKE state adds its own record, at its
own level, rather than widening this one.

## Establishment: what a COMPLETE installation is made of (FOUNDATION-B4B)

`establishment.ts` in this directory is the pure half of the act that creates an installation. It states the
one relationship the phase exists to keep, and it refuses rather than repairs:

```text
complete installation = immutable release content + authored capsule (a SEED) + generated state
```

* `INSTALLATION_SEED_REQUIREMENTS` — the authored surfaces every installation needs (`site.config.json`,
  `config/i18n`, `content/pages`, `content/assets`), each with the reason it is load-bearing. A seed may
  carry any additional authored material, and it is copied verbatim.
* `INSTALLATION_SEED_REFUSED_PATHS` — generated state a seed may never contain: the operational record above
  all. A seed is authorship, so a seed carrying generated state is not authored material, and copying it
  would give the new installation a history it never had.
* `INSTALLATION_GENERATED_STATE_IGNORE_RULE` — the rule the capsule's `.gitignore` must carry, so the
  record can never become authored, version-controlled state. Establishment refuses a seed without it.
* `INSTALLATION_CONTENT_SCOPE` — the two scopes a candidate identity is built from (`authored`, the seed as
  supplied; `materialized`, the whole tree establishment wrote), in the platform's ONE content encoding
  (`@/core/foundation-release/content-digest.mjs`). One encoding, distinct scopes: never a second digest
  flavour.
* `foundationInstallationAdoptionRecord` / `offsetInstant` — the adoption record this installation writes,
  carrying immutable release provenance and NO acquisition field: where the bytes came from is the act's
  business, and belongs in diagnostics rather than in the installation's durable state.
* `installationIsEstablishedFrom` — the completion question: is something live, is it EXACTLY this release
  in every respect the release contract records, and is the live revision this candidate's materialised
  digest? Only that counts as established.

The mechanics are `@/application/establish-foundation-installation` (the use case, which drives the
transitions below in their approved order for a fresh install) and `src/adapters/installation/**` (the Node
mechanisms, including the guard that keeps every write inside the target root). The operator surface is
`scripts/installation/README.md`.

**A failed establishment records no operational record at all**, because the record is written once, last:
that is what makes an incomplete target visibly incomplete and impossible to mistake for a successful
installation. A re-run refuses it like any other non-empty target — nothing is ever overwritten or deleted.
