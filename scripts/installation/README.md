# Establishing a Foundation installation

This directory holds the **one supported way** to create a complete Foundation installation: the command
`pnpm installation:establish`, its argument handling, and the small runtime shim that lets a plain Node
process run the platform's own TypeScript implementation.

| File | Owns |
| --- | --- |
| `index.mjs` | the command: arguments, reporting, exit codes. It decides nothing about establishment itself |
| `platform-typescript.mjs` | running the platform's TypeScript from plain Node: the `@/…` alias and TypeScript's extensionless relative imports, resolved exactly as the compiler and the bundlers resolve them. Node executes erasable TypeScript itself; this adds those two rules and nothing else |

**What establishment IS.** It writes ONE complete Foundation installation into a target root you name, from
one immutable Foundation release plus the authored material you supply, and it records what it did. What an
installation is made of, and what establishment refuses, is the platform's contract
(`src/core/foundation-installation/establishment.ts`); the mechanism is
`src/application/establish-foundation-installation.ts` and `src/adapters/installation/**`.

## The procedure

```bash
# 1. Construct the release you are installing (or unpack one you were given).
pnpm release:build --release <identity> --source <commit> --dest <an empty directory>

# 2. Establish the installation. The target must be ABSENT or EMPTY.
pnpm installation:establish \
  --release <identity> \
  --payload <the directory from step 1> \
  --seed    <your authored capsule> \
  --target  <the installation root> \
  --name    "<the name you use for this installation>" \
  --repository "<this installation's own repository>"
```

`--seed` is the authored material the platform cannot invent: a directory holding `site.config.json`,
`config/i18n/**` and `content/**` (in this repository that is the `deployment/` capsule). `--name` and
`--repository` describe **this installation**, and are recorded in its operational record.

**An existing installation's capsule is a valid seed** — it is the ordinary case. Such a capsule carries its
own `foundation-baseline.json`, and establishment does not inherit it: the record names the release THAT
installation adopted, so it is left behind (the report prints it as `not inherited`) and the new installation
gets its own record for the release you are establishing. Nothing in the seed is modified or deleted, and its
record is never trusted as the new installation's provenance. Generated `operational-state.json` is different
in kind — machine state rather than authored material — so a seed that contains it is refused, and the
capsule's `.gitignore` must keep ignoring it.

## What you get, and what establishment never does

```
<target>/
  <the release's platform>                     the release payload, byte-identical
  <capsule>/                                   your authored material, verbatim
    site.config.json, config/i18n, content/**  …what you supplied
    foundation-baseline.json                   WRITTEN: this installation's adoption of the release
    operational-state.json                     WRITTEN: generated state, never version-controlled
```

* **Nothing is installed, built or tested for you.** Establishment writes an installation; proving that the
  installation can install, build and test *itself* is the separate act below, and it is what makes the
  result meaningful.
* **Nothing outside `--target` is touched.** Not the release directory, not the seed, not the platform you
  ran the command from. The writer resolves every path inside the target root and refuses anything else.
* **Nothing is overwritten or deleted, ever.** A target that already holds an installation, a previous
  incomplete attempt, or anybody's files is refused with the reason printed, and you decide what to do.
* **No network, no GitHub, no questions.** The release comes from the directory you named. Establishment
  records no connection, no credential and no remote state, and works with no network at all.

## When it is run again

| Target | Behaviour |
| --- | --- |
| an installation that already exists | **refused** (exit 1). Establishment never re-establishes, repairs or upgrades |
| a non-empty target | **refused** (exit 1): nothing is overwritten or deleted. Clear it yourself if it is a failed attempt |
| an empty or absent target | establishes, and reports what it wrote |
| a target it failed part-way through | there is NO operational record, so it is visibly incomplete — and a re-run refuses it, like any non-empty target |

Exit codes: `0` established · `1` establishment refused or failed (with the reason) · `2` usage or runtime.

## Proving the installation you just made

Run these **inside** the installation root — it needs nothing from the installation it was created from:

```bash
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm build
pnpm test:foundation        # the platform contract suite
```

An installation whose capsule ships its own acceptance tests runs them too (`pnpm test:deployment`). A
capsule that ships none has none to run — that is the owner's material, not the platform's.

Two things are worth knowing about that list, and both are properties of the platform rather than of your
installation:

* **The installation is not a Git repository** unless you make it one. `git init`, add your installation and
  commit it if you want version control — that is your decision, and establishment deliberately does not
  make it for you. The generated `public/assets/**` mirror and `operational-state.json` are already excluded
  by the policies the release ships, so they cannot become commits.
* **The platform's generic test suite contains repository-shaped suites.** Several of them describe the
  FOUNDATION PROJECT's own repository — its git history, its release tags and its tracked inventory — rather
  than any installation, so `pnpm test:foundation` inside an installation reports those suites as failures
  while everything the installation actually runs (install, typecheck, lint, build, its own tooling, its own
  capsule's acceptance) is green. Separating "the platform contract" from "this project's repository" is
  recorded as a Foundation freeze-audit item; until it is done, treat `pnpm test:foundation` in an
  installation as informative rather than conclusive, and use the list above as the installation's own
  verification.

The record of what the installation runs is in its capsule: `foundation-baseline.json` names the immutable
release it adopted, and `operational-state.json` names the exact revision that became live.

**Established is not the same as serving.** The record establishment writes says the installation is ACTIVE
(`live` names the exact candidate) and `offline` with no evaluation instant — `healthEvaluatedAt: null` —
because no health check ran: establishing files cannot prove that anything answers a request. Only a real
health evaluation, performed later by whoever operates the installation, can record it `online`. Read the
record as two separate facts: `current.live` says WHAT is active, `current.health`/`healthEvaluatedAt` say
whether anyone has judged it, and when.
