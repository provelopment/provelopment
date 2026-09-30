# The Foundation deployment lifecycle

The framework-neutral model ONE independently managed deployment follows: what may be live, what a
candidate is, which moves are legal, why a move failed, and the durable record that answers those questions
without reading prose.

**Nothing in this directory performs a lifecycle operation.** No installer, no materialiser, no validator,
no staging deployer, no promoter, no rollback executor and no health probe. Those are the mechanics of later
phases; this directory is the CONTRACT they must obey, and its value is that it can be read, reviewed and
tested before any of them exists.

## Terminology (used precisely)

| Term | Means | Does NOT mean |
| --- | --- | --- |
| **deployment** (a *spoke*) | one independently built and deployed website repository/capsule: its own configuration, content, tests and operational record | a site inside it, a Foundation release, or the Foundation repository |
| **Site** (`ww`, `de`) | a country or global context INSIDE one deployment (`@/core/site-code`) | a deployment. A site is just a site; it is not the Foundation |
| **Foundation release** | an immutable platform release named by identity — `provelopment-foundation-vYYYYMMDD.HHMM` (UTC), or the grandfathered first release | a branch, `main`, `HEAD`, "the latest", or a historical checkpoint tag |
| **baseline** | the release a deployment has deliberately ADOPTED (`deployment/foundation-baseline.json`, FOUNDATION-R1C) | what is running right now — that is `live` |
| **candidate** | an immutable artifact built from one release plus this deployment's authored state, identified by content digest | a branch, a workspace, or "a build that could be rebuilt later" |
| **staging** | an environment carrying ONE exact validated candidate for inspection | a long-lived divergent branch |
| **live** | the currently active release **and** deployment revision | the desired release, or the last thing that was attempted |
| **health** | whether the LIVE deployment is serving: `online` or `offline` | whether the last attempt passed. There is no `degraded` |

## The model: three concerns, never conflated

```text
ACTIVATION   current.live                    what is live — or null, meaning UNESTABLISHED
ATTEMPT      current.lastAttempt             what is happening, or last happened, and why it stopped
HEALTH       current.health / healthEvaluatedAt   is the live deployment serving, as of when
```

Keeping them apart is what makes the failure semantics structural rather than a promise:

| Situation | ACTIVATION | HEALTH | ATTEMPT |
| --- | --- | --- | --- |
| fresh deployment, never operated | `null` (unestablished) | `offline` | `null` |
| fresh install failed | `null` (not activated) | `offline` | `failed` (`materialization`/`build`/…) |
| live on release A, healthy | release A | `online` | whatever it last was |
| upgrade to B rejected before promotion | release A — untouched | `online` — untouched | `failed` |
| the live deployment itself fails health | release A | `offline` | untouched |

## States, entities and value objects

* **Deployment identity** — `current.deploymentIdentity`: the name the operator uses and the deployment's
  own repository/authority, so a record is readable without trusting the path it was found at.
* **Release reference** (`release-reference.ts`) — the ONE way a release is named: identity, repository,
  commit, tree, manifest format and content identity (policy, digest, file count), exactly the shape
  `deployment/foundation-baseline.json` already records. Recognition is delegated to the release identity
  authority; nothing here restates the naming contract, and a deployment can never name a mutable revision.
* **Candidate identity** — `release` (the identity of the release it contains), `authored` (a `sha256:`
  digest of the deployment's authored input: configuration, dictionaries, pages, artwork) and `materialized`
  (a `sha256:` digest of the candidate tree itself). A digest rather than a commit, because a deployment
  need not be a Git checkout — and the building phase owns the algorithm, while the contract is that
  identical inputs produce one identity.
* **Attempt** — the desired release, the candidate (once materialised), the stage, the outcome, the
  timestamps and the failure. The attempt is the ONLY place a desired release is expressed, so no separate
  "desired release" setting can drift from what is actually happening.
* **Live state** — the release, the exact deployment **revision** (`sha256:`), when it was activated, and the
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
| `startDeploymentAttempt` | any settled state | `preparing`, `pending` | `attempt-started` | an attempt is already in flight; `install` while something is live; `upgrade` while nothing is; `rollback` without a previous live state, or to a release that is not it |
| `recordDeploymentCandidate` | `preparing` | `validating` | `candidate-prepared` | the candidate contains a release other than the one requested |
| `recordDeploymentCandidateValidated` | `validating` | `validated` | `candidate-validated` | — (the validator decides; the deployment records it here) |
| `recordDeploymentCandidateStaged` | `validated` | `staged` | `candidate-staged` | the candidate was not validated in this attempt |
| `recordDeploymentStagingInspected` | `staged` | `inspected` | `candidate-inspected` | the candidate was not staged in this attempt |
| `beginDeploymentPromotion` | `inspected` | `promoting` | — | the candidate is not promotable |
| `completeDeploymentPromotion` | `promoting` | `live` (`succeeded`) | `promoted` (+ `health-online` if it was offline) | the named candidate is not the one this attempt validated and inspected |
| `failDeploymentAttempt` | any in-flight stage | `failed` | `attempt-failed` | nothing is in flight; the category is outside the vocabulary; no message |
| `recordDeploymentHealth` | any state | unchanged | `health-online` / `health-offline` on a CHANGE | `online` while nothing is live |

`isDeploymentCandidatePromotable(state)` and `isDeploymentAttemptPending(state)` are DERIVED from the
attempt's stage and identity. There is no promotable flag to set, forget or forge.

**One attempt at a time.** Starting a second while one is in flight is refused. An attempt that was
abandoned (a process that died) must be CLOSED — recorded as failed, with the category naming where it
stopped — before another can begin, so "what is happening now" always has exactly one answer. Serialising
lifecycle operations themselves (queueing, locking, retrying) belongs to whoever RUNS them, above this
contract; nothing here sleeps, waits, retries or locks.

## Failure semantics

A failure carries a **category** from the closed vocabulary in `failures.ts` (release resolution,
materialization, deployment validation, build, browser acceptance, staging deployment, staging health,
promotion, live health, rollback) and a human **message** with the detail. A category outside the vocabulary
is refused rather than stored: an unnamed failure is one nobody can act on. The category is what later
phases branch on; the message is what a person reads.

**The separation is enforced by what each function is GIVEN.** `failDeploymentAttempt` cannot write health
or the live state — it is not passed them. Therefore:

* a failed fresh install leaves a deployment that was never activated, and therefore offline;
* a rejected upgrade leaves the live release untouched and the deployment online;
* only `recordDeploymentHealth` (a live-health failure) and a completed promotion move health.

`ONLINE` means the live deployment is serving; `OFFLINE` means it is not serving, or that nothing is live
yet. Health never describes an attempt, and an attempt's outcome never explains health.

## Exact promotion, and rollback provenance

```text
validated candidate  ==  staged candidate  ==  promoted candidate
```

is one field-by-field comparison of one value (`identicalDeploymentCandidates`). The revision that becomes
live is the candidate's own `materialized` digest, and the record is checked for the same agreement when it
is READ — a record claiming a promotion of a candidate other than the one it validated is refused.

A rollback returns to the PREVIOUS live state: `startDeploymentAttempt` accepts `kind: "rollback"` only when
it names `current.live.previous.release` exactly, and a completed promotion records the state it replaced as
the new `previous`. Rolling back further than one step is an ordinary upgrade to a release the deployment
already knows — releases are immutable, so it needs no special machinery. Rollback never means undoing an
arbitrary filesystem change, restoring an untracked backup, moving a tag, or `git reset`.

## The durable record

The record is a single file named `operational-state.json`, in the deployment root — the location the ONE
deployment-path authority (`src/config/deployment-root.ts`) resolves, so nothing in the application spells
it.

```jsonc
{
  "schemaVersion": 1,
  "current": {
    "deploymentIdentity": { "name": "…", "repository": "https://…" },
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
  `DEPLOYMENT_LIFECYCLE_HISTORY_LIMIT` (100) with the oldest events dropped — determining current truth
  never requires history, so trimming cannot lose it. This is not an event-sourcing framework: no replay,
  no projection, no rebuild from history.
* Every instant is a UTC ISO-8601 instant (`…Z`) and is PROVENANCE, never identity: the same candidate has
  the same identity whatever the clock says. Nothing in this directory reads a clock; callers pass the
  instant they recorded.
* The record is DEPLOYMENT-LOCAL and independent: it describes one deployment, is written by its own
  operations, and is never shared between deployments.

## Where it lives, and why it is not version-controlled

`operational-state.json` is **generated operational state**, not authored content, and the capsule's
`.gitignore` keeps it out of version control. The reasoning, because "durable" does not mean "committed":

* The record describes what IS running. Committing it would make every health evaluation and every failed
  attempt a change to the repository's source history — a diary nobody asked for, with conflicts whenever a
  deployment is operated from more than one machine.
* A deployment may run one immutable revision. If the record were tracked, writing it would make the working
  tree stop matching the revision that is running, and "which revision is deployed" would stop having an
  answer.
* Durability comes from the deployment's own filesystem (and, later, wherever a deployment keeps its state):
  it survives restarts, it is read by whoever operates the deployment, and it is not carried inside a
  Foundation release payload — so materialising a release can never overwrite it.
* The AUTHORED state stays exactly what it was: `site.config.json`, `config/i18n/**`, `content/**`. The
  record never becomes a second place where an owner authors anything.

The ADOPTED baseline is a different fact and keeps its own file: `deployment/foundation-baseline.json` is a
declaration ("I deliberately adopt this release", a reviewed act), while `live` is an observation ("this is
what is running"). They are expected to agree after a successful promotion and may legitimately differ while
an attempt is in flight; B4A deliberately does not police that equality, because the deployment's history —
not a rule — is what explains the difference.


## Ownership: what lives where

| Layer | Owns | Here |
| --- | --- | --- |
| **domain** | lifecycle invariants, health semantics, candidate/promotion identity rules, legal transitions, the result vocabulary, fail-closed reading | this directory (`src/core/deployment-lifecycle`), pure and framework-independent |
| **application** | the PORTS a lifecycle operation needs — a clock, the operational-state store, a Foundation release reader | `src/application/deployment-lifecycle-ports.ts`, types only |
| **adapters** | the mechanics of B4B–B4G: materialising a candidate, validating it, deploying staging, promoting, rolling back, probing live health | not written yet, by design |

The domain must never import a framework, `@/config`, `@/adapters`, `@/application` or a filesystem — the
repository's boundary suite (`tests/architecture/boundaries.test.ts`) enforces the framework part, and
`tests/architecture/deployment-lifecycle-boundary.test.ts` enforces the rest.

**Caller-agnostic by construction.** Nothing here knows about a terminal, a prompt, a session, a user, an
agent, GitHub or Vercel. A human CLI, a downstream agent, a future control plane and a test drive the SAME
transitions and read the SAME record; anything interactive or host-specific belongs in an adapter.

**The write boundary.** A lifecycle operation may write only inside the deployment it is operating — this
deployment's own operational record, and later its own candidate and staging areas. It never writes another
deployment, a fixture, the Foundation's source or a global system path. When a genuine Foundation defect is
found, the operation STOPS and reports it: the Foundation is fixed by a Foundation release, which the
deployment then adopts like any other release. "A deployment patches the Foundation" is not a state this
model can represent.

**The reference deployment has no record today**, and that is meaningful rather than missing: it has never
been operated by the lifecycle (its baseline was adopted by a reviewed act, FOUNDATION-R1C), so its
operational state is unestablished. Reading a store that answers `null` is the honest way to say so.

## What the reader REFUSES (invalid state fails closed)

`parseDeploymentOperationalState` refuses, rather than repairs:

* an unknown `schemaVersion` (a future migration is a deliberate act, never a guess made while reading);
* health `online` with nothing live, or a live deployment whose health has no evaluation instant;
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
not called `version`, which would invite confusion with the Foundation release a deployment runs
(`live.release.tag`). A record whose number this code does not know is refused. When the schema must change,
the migration is a deliberate, reviewed step that understands both shapes; no migration machinery is
written in advance.

## What later phases add (and must not change here)

* **B4B** fresh installation from an immutable release, using these transitions and the ports above.
* **B4C/B4D** candidate materialisation and validation — implementing the candidate identity's `authored`
  and `materialized` digests, which this contract requires but does not compute.
* **B4E** staging, promotion and rollback mechanics — driving `beginDeploymentPromotion`,
  `completeDeploymentPromotion` and a `rollback` attempt; and the live-health probe that calls
  `recordDeploymentHealth`.
* **B4F/B4G** batches and any control plane — reading records written here, never inventing a second model.

A later phase that needs a new STATE adds it here, with its transition and its refusal cases, rather than
inventing workflow flags beside this model.
