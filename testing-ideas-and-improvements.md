# Testing ideas and improvements

> **What this file is.** A durable register of useful **future possibilities** for the Foundation's
> testing and validation tooling — the browser matrix, the unit/architecture suites and the gates —
> kept so a good idea is not lost merely because nobody is building it yet.
>
> **What this file is not.** Not architecture authority, not a committed roadmap, not approved
> implementation, not release scope, not backlog priority, and not a promise that anything here will
> be built. Nothing here is a contract and nothing here is tested.
>
> **Governance is stated once, in [`ui-ideas-and-improvements.md`](ui-ideas-and-improvements.md)**
> ("How an idea here becomes work"), and applies to this file unchanged: an idea becomes work only
> when the owner selects it, its architecture is defined, its scope is bounded, and a separate work
> order authorises it. The entry format and the no-dates/no-priorities/no-promises rule are the same
> as there.

## 1. Running one browser scenario without the whole matrix

Status: Future idea — not approved for implementation

Opportunity:
The browser matrix is one harness with families and scopes, and a change to a single scenario can
only be validated by running a whole family — several minutes of dev-server boots per iteration,
locally and in CI. Iterating on one scenario therefore costs the same as validating all of them.

Current behaviour:
- `tests/browser/matrix.mjs` accepts one ownership **scope** (`foundation`, `deployment`, `all`)
  and runs every scenario in that family; there is no per-scenario selection, and the scenario list
  lives in the runner itself.
- CI routes by scope, not by scenario, and that routing must stay ownership-driven.

Possible future directions:
- a `--scenario <name>` (or `--only <name>`) selector alongside `--scope`, validated as loudly as
  `--scope` already is: a name that matches no scenario must **refuse**, never quietly run nothing;
- or a declared scenario manifest the runner and the selector both read, so a scenario cannot exist
  without a name.

Important constraints:
The ownership model must stay intact (a scenario's owner is the tree it lives in — see
`tests/browser/scope.mjs`), CI routing must keep working by scope, and the release classifier's
"every tracked path is classified" rule must not gain an unclassified tool. A local convenience
selector must never become a way to report a green gate for a suite that did not run.

Why deferred:
It is harness tooling with its own bounded change, unit coverage and documentation, and nothing is
broken today — the harness is simply slower to iterate against than it needs to be.

## 2. A gate for documentation references that point at nothing

Status: Future idea — not approved for implementation

Opportunity:
Two consecutive closure tasks found stale documentation claims that no gate can catch: a test
comment describing artwork as "integrated" at a path that ships nowhere, and documents naming test
files by a path that moved (`tests/unit/…` where the file now lives under `deployment/tests/unit/…`)
or that do not exist at all. Every one was found by hand.

Current behaviour:
- The gate proves code, configuration, assets, the release content policy and behaviour; it proves
  nothing about whether the *paths* a document names exist.
- Documentation legitimately names paths that do not exist in this repository: the adopter-owned
  authored tree (`content/assets/branding/**`, which the template must not ship), example URLs,
  role filenames a deployment supplies, and external/private sources. A naive checker would drown in
  false positives.

Possible future directions:
- a bounded check over the platform documents for the *class* of reference that must resolve —
  files in this repository (tests, scripts, contracts) — with an explicit, reviewed exemption list
  for conventions, examples and external sources;
- or a narrower first step: check only the "locking tests" tables that documents already keep,
  so a renamed or moved suite cannot leave a document pointing at nothing.

Important constraints:
The check must fail closed only on what it can prove (a referenced in-repository path that does not
exist), must never demand that a convention path exist, and must not become a second documentation
authority: it verifies references, it does not judge prose.

Why deferred:
It is a new gate whose strictness is a policy decision (how much prose is machine-checkable), and it
must be designed once, with its own unit coverage, rather than grown as a side effect of a
documentation fix.
