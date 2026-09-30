# Installation adapters

The concrete mechanisms behind establishment: reading a release, reading the authored material a Foundation
installation is made of, writing the one target root it may write, and keeping the installation's own
operational record. Each implements a port declared in `src/application/foundation-establishment-ports.ts`
or `src/application/foundation-installation-ports.ts`; the use case that composes them knows none of them.

| File | Implements | Owns |
| --- | --- | --- |
| `local-release-source.ts` | the release ACQUISITION source **and** the release payload source | ONE immutable release, read from a local directory and verified against its own manifest — the minimum mechanism, with no network, no discovery and no polling |
| `directory-seed-source.ts` | the authored-seed source | reading one capsule's worth of authored material, verbatim, links refused |
| `node-installation-target.ts` | the target root | **the write boundary, as code**: inspection (empty, absolute, not a filesystem root, not overlapping a source it reads, never through a link) and writing (root-relative paths only, resolved inside the root, read back and hashed) |
| `node-operational-state-store.ts` | the installation's operational-state store | the FIRST writer of `operational-state.json`, refused a location outside the installation it describes |
| `node-content-files.ts` | the content mechanisms | reading a directory as a content set, hashing bytes, and the scoped content digest built on the platform's ONE encoding |
| `establish.ts` | — | the composition root: which implementation an operator gets, and the two paths the ports deliberately do not carry |

**TWO WRITERS, ONE INSTALLATION.** `node-installation-target.ts` and `node-operational-state-store.ts` are
the only executable writers in `src/**`, and `tests/architecture/write-ownership-guard.test.ts` states
exactly that, with the ONE domain each owns. Between them they cannot reach the platform you ran the command
from, another installation, a user's home, global configuration or a network — and nothing in this directory
opens a socket, polls, or mentions another installation (`tests/architecture/foundation-installation-boundary.test.ts`
asserts both against the code).

**HASHING, NOT A SECOND ENCODING.** The digest ENCODING is the platform's contract
(`src/core/foundation-release/content-digest.mjs`); only the hashing is a technology, so only the hashing
lives here. A divergence between this hashing and the release tooling's would contradict the digest recorded
in a release manifest immediately, and `tests/unit/foundation-installation-establishment.test.ts` proves the
two agree on the same content.
