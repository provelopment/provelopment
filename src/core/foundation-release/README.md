# The Foundation release contract

What an **immutable Foundation release** IS — its identity and naming semantics, its canonical provenance,
its manifest contract, and the reference a consumer stores — and nothing about how one is built, published
or obtained.

**This directory is pure.** No filesystem, no Git, no network, no environment, no subprocess and no clock:
every function takes what it needs as an argument. That is what lets the SAME contract be consumed by the
dependency-free Node release tooling, by the TypeScript lifecycle domain, and by tests, without any of them
owning a private copy.

## One authority, two (soon three) consumers

```text
                     release tooling (`scripts/release/**`)      ← constructs, publishes, verifies
                                  ↑  consumes
             pure Foundation release contract (`src/core/foundation-release`)   ← THIS directory
                                  ↓  consumes
        Foundation installation lifecycle (`src/core/foundation-installation`) ← runs/adopts releases
                                  ↓  will consume
        acquisition / verification adapters (B4B and later)         ← obtain and check the bytes
```

`src/core/**` must never depend on `scripts/**` (FOUNDATION-B4A-A2). The tooling therefore does not OWN the
identity, the naming semantics, the manifest format or the content-policy identity: it imports them here and
re-exports them, so every existing caller, test and documented procedure keeps working while there is exactly
one definition of each fact. `tests/architecture/foundation-installation-boundary.test.ts` proves the
direction, the single spelling of the identity and the module set.

## What is here, and why each file has the extension it has

| File | Owns | Extension, and why |
| --- | --- | --- |
| `identity.mjs` | the release identity/naming contract: the prefix and shape, the exact canonical contract statement, the grandfathered first release, recognition (`isRecognizedFoundationReleaseIdentity`), publishability, the publication-moment reader, and the deterministic identity-for-a-moment formatter | **plain ESM**: the release tooling is dependency-free Node ESM run by `node` directly and cannot import TypeScript — the same reason `src/config/deployment-build.mjs` exists |
| `manifest.mjs` | the manifest contract: `RELEASE_MANIFEST_FORMAT`, the canonical `FOUNDATION_SOURCE_REPOSITORY`, `RELEASE_CONTENT_POLICY_ID`, the exact key sets, `assertReleaseManifest`, `parseReleaseManifest` | **plain ESM**, for the same reason — and because verifying an obtained release must not require the tooling that builds one |
| `reference.ts` | the typed reference a consumer stores (`tag`, `repository`, `commit`, `tree`, `manifestFormat`, `content`) and its validators/labels | **TypeScript**: its consumers are typed ones (the lifecycle domain, future acquisition/verification adapters, tests) |

## The identity contract, in one paragraph

A release is named by an immutable identity. There are exactly three classes of tag-shaped name: historical
checkpoint tags (`v<YYYY.MM.DD>-foundation-<slug>`) which are evidence and never releases; the GRANDFATHERED
first release (`v2026.09.30-foundation-release-initial`), which stays valid forever; and every future release,
named canonically `provelopment-foundation-vYYYYMMDD.HHMM` in **UTC**, where `YYYYMMDD.HHMM` is the ACTUAL UTC
publication minute — no seconds, no counter, no `Z`, no offset, and no repointing, deletion or recreation.
Validation is semantic: the timestamp must be a real UTC calendar instant. A collision is never resolved by
adjusting a name (orchestrated publication waits for the next available minute; a direct attempt whose identity
already exists fails closed), and nothing in this directory sleeps, blocks or retries.

`foundationReleaseIdentityForPublicationMoment(moment)` formats a GIVEN moment deterministically — it never
reads the clock. The tooling's façade (`scripts/release/release-identity.mjs`) is where a publisher says
"now", because that is the publisher's boundary.

## Provenance, not acquisition

Everything the reference records is IMMUTABLE:

* `repository` is **canonical provenance** — it answers *which platform is this release OF?*, which is what
  makes a release recognizable and verifiable (`FOUNDATION_SOURCE_REPOSITORY`, and the manifest's
  `source.repository`, already behave this way and are unchanged).
* `commit` / `tree` are the source revision it was cut from; `content` is what it carries.

Where an installation OBTAINED the bytes is a different question with a different answer, and it is
deliberately absent from this structure: a release carrying canonical Provelopment provenance may be acquired
from the canonical repository, a local copy, an archive, a mirror or another configured source — its identity
is identical in every case. Acquisition belongs to an adapter's act
(`@/application/foundation-installation-ports`), and `foundationReleaseReferenceIssues` refuses a reference
that tries to carry an acquisition field, so the two can never quietly merge.

## What stays in the tooling (`scripts/release/**`)

Constructing a release (reading `package.json`, the page-document schema and the deployment-layout vocabulary
out of a payload), the content policy's RULES, the digest, Git access, verification orchestration, the clean
room, publication and the CLI. The split is: **the contract is knowledge, the tooling is what does things.**
