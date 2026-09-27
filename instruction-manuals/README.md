# Provelopment Foundation Instruction Manuals

> **Manual system:** Provelopment Foundation Instruction Manuals
> **Manual revision:** `2026-09-27.3`
> **Procedure validated against:** Foundation template release `v2026.09.17-foundation-generic-template` (`b9f7a18`) + the current public/private topology (the public reusable product `provelopment-foundation`, and the live Foundation site implemented as a site profile in the private downstream `provelopment-web`)
> **Content model described:** Foundation release `v2026.09.27-foundation-markdown-single-h1` (`df50fc250c6beb1c237f32b7f0a0d91fd55b0c37`) — the **final multisite model**: the one-page authoring model (author-facing collections retired by `FOUNDATION-PAGES-A1E`) with the **delivered declarative JSON authoring mode** (`FOUNDATION-PAGES-A2`), **independent sites and localization** (`FOUNDATION-S1`, `v2026.09.27-foundation-multisite-localization`) — the page address is authoring mode → site → language → page, so a page is identified by site + locale path key + route path — and the **single-H1 Markdown closure** (`FOUNDATION-PAGES-H1`): the page title is a page's only level-1 heading
> **Master authority:** maintained in the Provelopment governance repository (private; not part of this product)
> **Adopter baseline:** per adopter — recorded in that project's `platform/SOURCE.md`
>
> This copy is **distributed**. It is byte-identical to the master. Edit the master
> upstream and propagate; never edit a distributed copy in place.

## How to read the version header

Five different Foundation references are easy to confuse, and confusing them is how
a project ends up claiming a baseline it never acquired. They are defined here and
nowhere else; every manual's header uses exactly these terms.

| Term | Meaning | Where it lives |
| --- | --- | --- |
| **Manual revision** | The version of this manual **set**. Bumped when the procedures change. Not a Foundation release. | The header of every manual + the version table below. |
| **Procedure validated against** | The exact Foundation ref on which this manual **set** was last exercised **end to end, with recorded evidence** — for *any* procedure in the set. A procedure statement is only trustworthy to the ref at which *that* procedure was last exercised; the version table records which run produced the current revision. | The header of every manual. |
| **Content model described** | The Foundation ref whose **content-authoring model** this manual set teaches — the authoring layout, the page modes and the URLs a page gets. It is recorded **separately** from *procedure validated against* because a model can be documented truthfully before its procedures are re-exercised end to end: the two move independently, exactly as the manual revision and an adopter baseline do. A manual may therefore describe a newer model than the ref its procedures were last exercised at — and it says so rather than implying a validation run that did not happen. | The header of every manual. |
| **Adopter baseline** | The Foundation ref a **specific adopter project** actually runs. Independent per adopter. | That project's `platform/SOURCE.md`. |
| **Target ref** | The immutable ref **selected for one upgrade** (a release tag, or a full commit SHA when no tag covers the accepted state — never a moving branch name). | The upgrade record + `platform/SOURCE.md` after acceptance. |

A manual revision and an adopter baseline move **independently**: the manuals can
improve without any adopter moving, and an adopter can upgrade without the manuals
changing. `2026-09-11.1`, for example, was the manual revision a `f5c94da` adopter
recorded while the master was already documenting `1114759`.

## Purpose

A Foundation adoption delivers **two** things, and both are required:

1. **The source code** — the reusable platform snapshot.
2. **The operating knowledge** — how to configure, customize, upgrade, validate,
   deploy, and maintain that source code correctly.

This package is item 2. Without it an adopter receives a code snapshot and no
safe way to operate it: they cannot know which material is platform-owned, which
is theirs, what "done" means, or how to absorb a newer Foundation release
without destroying their own business content and branding.

These manuals are written for **downstream coding agents and developers**. They
are operational procedure, not marketing.

## Authority

| | Location | Role |
| --- | --- | --- |
| **Master** | the maintainer's private governance repository (not part of this product) | Authoritative. All edits happen here. |
| **Distributed** | `<project>/instruction-manuals/` in every Foundation-derived repository carrying a copy | A verbatim copy for readers working inside that project. Never edited directly. |

**Edit rule:** a distributed copy is never edited independently. If a manual is
wrong or incomplete, fix the master, review it, then propagate. Two divergent
copies of the same procedure are a process defect.

The version header at the top of every manual makes the provenance
self-describing: a reader working only inside an adopter repository can see where
the manual came from, which Foundation baseline it applies to, and that their
copy is distributed.

This package documents the **public Foundation product** and the workflows of a
project built from it. The private governance repository that maintains it is not
part of this product and is not required in order to use these manuals.

## Propagation procedure

Run this when the master changes, and once per accepted Foundation release.
Concrete commands for a particular workspace belong to that workspace's own
governance documentation, not to these distributed manuals.

1. **Update the master** — edit the master copy only. Never edit a distributed copy.
2. **Review** — read the changed manual end to end; confirm it is actionable and
   consistent with the manuals it cross-references. Bump the header revision if warranted.
3. **Copy the complete file set** — propagate every master file, so additions and
   edits always travel. Copy **explicitly**; do **not** mirror destructively
   (`robocopy /MIR`, `rsync --delete`). A copy is reviewable, and a file that has
   genuinely disappeared from the master is removed from the receivers as its own
   deliberate, visible step:

   ```powershell
   Copy-Item '<master>\*.md'  '<receiver>\instruction-manuals\' -Force
   ```

   ```bash
   cp <master>/*.md <receiver>/instruction-manuals/
   ```

4. **Verify the exact file list** — the copies must contain exactly the master's
   files: no extras, no omissions.
5. **Verify byte/hash parity** — see below. Not optional.
6. **Update the receiving project's records** — an adopter records a row in
   `platform/SOURCE.md` linking the manual revision to the Foundation baseline.
7. **Commit the receiving repository** — separately from the master commit, with
   a conventional message naming the manual revision.

## Parity verification

Substitute `<master>` and `<receiver>` with the two locations being compared; the
check is identical in every workspace.

**PowerShell (Windows):**

```powershell
$master = '<master>'
$copy   = '<receiver>'
$a = Get-ChildItem $master -File | Sort-Object Name
$b = Get-ChildItem $copy   -File | Sort-Object Name
if ($a.Count -ne $b.Count) { Write-Host "FILE-COUNT MISMATCH: $($a.Count) vs $($b.Count)" }
foreach ($f in $a) {
  $h1 = (Get-FileHash $f.FullName -Algorithm SHA256).Hash
  $h2 = if (Test-Path (Join-Path $copy $f.Name)) { (Get-FileHash (Join-Path $copy $f.Name) -Algorithm SHA256).Hash } else { 'MISSING' }
  '{0,-28} {1}' -f $f.Name, $(if ($h1 -eq $h2) { 'MATCH' } else { 'DIFF' })
}
```

**bash / macOS / Linux:**

```bash
diff -r '<master>' '<receiver>' && echo 'PARITY OK'
```

`diff -r` is silent and exits 0 only when every file is byte-identical — that is
the acceptance evidence. No synchronization tooling is required or wanted. Parity
is verified after every propagation, and additionally whenever a receiving
project is adopted.
## Version table

| Manual revision | Procedure validated against | Commit | Date |
| --- | --- | --- | --- |
| `2026-09-27.3` | Foundation template release `v2026.09.17-foundation-generic-template` + the current public/private topology (public product + private downstream application) | `b9f7a18` (template) | 2026-09-27 |
| `2026-09-27.2` | Foundation template release `v2026.09.17-foundation-generic-template` + the current public/private topology (public product + private downstream application) | `b9f7a18` (template) | 2026-09-27 |
| `2026-09-27.1` | Foundation template release `v2026.09.17-foundation-generic-template` + the current public/private topology (public product + private downstream application) | `b9f7a18` (template) | 2026-09-27 |
| `2026-09-25.1` | Foundation template release `v2026.09.17-foundation-generic-template` + the current public/private topology (public product + private downstream application) | `b9f7a18` (template) | 2026-09-25 |
| `2026-09-19.1` | Foundation template release `v2026.09.17-foundation-generic-template` + the current public/private topology (public product + private downstream application) | `b9f7a18` (template) | 2026-09-19 |
| `2026-09-17.2` | Foundation template release `v2026.09.17-foundation-generic-template` + the FS1 repository split | `b9f7a18` (template) · `fb721b3` (historical baseline) | 2026-09-17 |
| `2026-09-17.1` | `main` (single canonical presentation) | `ccc29a5` | 2026-09-17 |
| `2026-09-16.3` | `main` (single canonical presentation) | `dae07b4` | 2026-09-16 |
| `2026-09-16.2` | `main` (single canonical presentation) | `1114759` | 2026-09-16 |
| `2026-09-16.1` | `main` (single canonical presentation) | `1114759` | 2026-09-16 |
| `2026-09-15.1` | `v2026.09.11-foundation-p6-3c-banner-sidebar-cta` | `f5c94da` | 2026-09-15 |
| `2026-09-11.1` | `v2026.09.11-foundation-p6-3c-banner-sidebar-cta` | `f5c94da` | 2026-09-11 |

> `2026-09-27.3` updates this set to the **final delivered Foundation architecture**: the
> authoring model has a **site** segment, and the Markdown mode has a **single level-1
> heading**. Two delivered releases are incorporated — `FOUNDATION-S1`
> (`v2026.09.27-foundation-multisite-localization`) and the `FOUNDATION-PAGES-H1` closure
> (`v2026.09.27-foundation-markdown-single-h1`, full commit
> `df50fc250c6beb1c237f32b7f0a0d91fd55b0c37`, short `df50fc2`, which contains S1).
>
> **What the manuals now teach.** Every content path carries its site
> (`content/pages/markdown/<site>/<language>/<page>.md`), a page's identity is **site + locale
> path key + route path**, and every public URL is `/<site>/<language>/<route>`.
> `content-management.md` teaches the site model — recognized lowercase two-letter country
> codes, the Foundation-defined `ww` Worldwide/Global code (which is **not** an ISO country
> code), arbitrary names such as `main`, `canada` or `my-office` being invalid, and the
> maintained reference shipped with the product as `content/COUNTRY-CODES.md` instead of a
> second handwritten list; **sites versus locations** (an office, city or region is a location
> *inside* a site — Canada and France may be sites, while Toronto, Montreal and Vancouver are
> locations); the **four independent visitor dimensions** (Site, Language, Location, Layout,
> with unneeded controls simply absent); the **site-bounded page resolution order**
> (exact-language JSON → exact-language Markdown → site default-language JSON when the site's
> configured fallback permits → site default-language Markdown → not found); and the hard rule
> that **a missing page is never satisfied from another site**, merely because the language or
> route matches.
>
> **Localization now documented.** The **simple and explicit locale forms** (`ca/fr` → `fr-CA`,
> with `ca/fr-fr`, `tw/zh-hant`, `tw/zh-hant-tw` for exact dialect, script or region),
> lowercase paths in URLs with canonical tag casing in standards-facing metadata, the absence of
> an implicit country assumption in `ww` (`ww/fr` may simply be canonical `fr`; `ww/en → en-US`
> is an explicit deployment choice), **duplicate effective locales as a HARD configuration
> error** (`ca/en` together with `ca/en-ca`, both meaning `en-CA` — choose one), and the
> **shared-dictionary + optional per-site override** model (`config/i18n/fr.json` refined by
> `config/i18n/sites/ca/fr.json`: optional, partial, unknown keys fail, and another site's
> override is never consulted).
>
> **Authoring modes and the heading contract.** The two-mode model is unchanged in principle —
> simple safe Markdown and advanced declarative JSON, sharing one `site → language → route`
> addressing model, with no collections. `content-management.md` now states the delivered
> **single-H1 Markdown contract**: the page title is a page's only level-1 heading, and headings
> written inside a page are placed underneath it automatically (`#` renders level 2, `##` level
> 3, and so on, capping at level 6), so an author never has to start at `##` and no heading is
> removed. The JSON heading contract is unchanged and stated only for consistency (page title 1,
> section heading 2, item heading 3), with advanced authors pointed at
> `content/pages/json/README.md`. `site-customization.md` states which configuration may differ
> per site (navigation, footer navigation, legal destinations, Connect, the CTA's page
> destination, locale/fallback, page and location bindings) and which stays shared (theme and
> design, assets, component vocabulary, shell/layout) — a duplicated complete configuration file
> per country is **not** required.
>
> **Superseded, and stated as such.** The `2026-09-27.2` note recorded *Content model described*
> as `v2026.09.27-foundation-json-authoring` (`475d32b`); that was accurate when written and is
> **superseded by `2026-09-27.3`**, whose content-model reference is
> `v2026.09.27-foundation-markdown-single-h1` (`df50fc2`). The site-less path form and the
> locale-only identity quoted in the `.2` and `.1` notes are the accurate record of *those*
> revisions and are **superseded** by the site segment documented from `2026-09-27.3` onward;
> the historical notes below are kept unchanged.
>
> **Unchanged, and honest.** *Procedure validated against* still names Foundation template
> release `v2026.09.17-foundation-generic-template` (`b9f7a18`) plus the current public/private
> topology: **no procedure-validation run was performed for this revision**, so the field was
> not advanced.
>
> `2026-09-27.2` records the **delivered** advanced authoring mode. `2026-09-27.1`
> intentionally stated that the declarative JSON vocabulary was *still being completed
> upstream* — accurate then, stale now. Foundation release
> **`v2026.09.27-foundation-json-authoring`** (full commit
> `475d32babe7ba55471431f5433d147cffd48af5a`, short `475d32b`) has delivered it
> (`FOUNDATION-PAGES-A2`), so the manuals now describe JSON as what it is: the
> advanced/developer page-authoring mode, **declarative, schema-validated and
> non-executable**, served from `content/pages/json/<locale>/<route-path>.json` at flat and
> nested routes, with sixteen page-building section types (`hero`, `prose`, `media`,
> `gallery`, `actions`, `callout`, `cards`, `features`, `columns`, `steps`, `stats`,
> `quote`, `table`, `faq`, `list`, `divider`), a finite set of presentation options, and
> higher precedence than Markdown for the same locale+route.
>
> **What the manuals state, and what they deliberately do not.** `content-management.md`
> states the capability, the **safety model** (data, never code: no scripts, imports, JSX,
> component names, handlers, raw HTML or styling; Markdown-bearing fields reuse the ONE
> safe Markdown policy; actions reuse the safe destination rules) and the
> **accessibility contract** (one page `<h1>` from the title, section/item heading levels,
> the image alt-or-decorative rule, table headings, FAQ/disclosure semantics) — and points
> at **`content/pages/json/README.md`**, the author guide that ships with the Foundation,
> for every section type, property, option, bound and error message. The manual set does
> **not** reproduce that reference (368 lines) and does not claim arbitrary composition.
> `validation.md` route validation now covers JSON schema validation too.
>
> **SUPERSEDED by `2026-09-27.3`** — *Content model described* now names
> `v2026.09.27-foundation-markdown-single-h1` (`df50fc2`), and every content path carries its
> site segment. **The header term now names the delivered release.** *Content model described* moves from
> `v2026.09.27-foundation-one-page-model` (`d87f61d`) to
> `v2026.09.27-foundation-json-authoring` (`475d32babe7ba55471431f5433d147cffd48af5a`) in
> every manual's header. **No procedure was exercised**, so *Procedure validated against*
> is unchanged — this is again a documentation reconciliation, not a validation run.
>
> **Still not propagated.** Both receivers remain at `2026-09-25.1`; propagation is a
> separate task, to run after this revision is reviewed/merged and the Foundation
> implementation lane is clear (procedure: `deployment-info/manual-propagation.md`).
>
> `2026-09-27.1` reconciles the **content-authoring model** these manuals teach to the
> **one-page model** of Foundation release `v2026.09.27-foundation-one-page-model`
> (`d87f61d`). It is a **documentation reconciliation, not a new validation run**: the
> procedures were last exercised at the ref recorded in *Procedure validated against*, and
> this revision records that difference explicitly in the header (**Content model
> described**) rather than implying a run that did not happen.
>
> What was corrected. The retired, author-facing **collections** — `content/offerings/`,
> `content/portfolio/`, `content/testimonials/`, `content/posts/` and `content/legal/`,
> each with its own directory, parser, route and feature flag — were removed by
> `FOUNDATION-PAGES-A1E`. They are no longer described, recommended or referenced
> anywhere in this set. Authoring now has **one content area**, `content/`: **pages** in
> `content/pages/` and **artwork** in `content/assets/`. **If authored content has its own
> URL, it is a page**; a page's URL is built from the folders it is authored in
> (**folders are the address**, up to four deep, another language mirroring the same
> structure); and there is **no content feature flag** — a page exists because its file
> exists. `content-management.md` now teaches that model, the two authoring modes, the
> optional two-key metadata and the complete
> `edit → save → status → stage → commit → push → checks` sequence;
> `branding-and-assets.md` places business artwork in `content/assets/` and states that
> `public/assets/` is a **generated mirror** that is never edited by hand;
> `deployment.md`, `foundation-upgrade.md` and `site-customization.md` no longer refer to
> a collection or to a content feature flag.
>
> **Deliberately not stated yet.** The declarative **JSON** mode is documented as
> *declared, discovered and ordered, with its component vocabulary still being completed
> upstream* (`FOUNDATION-PAGES-A2`). No A2 page-level data, component vocabulary or
> renderer behaviour is asserted here, because A2 has not been delivered; a
> propagation/finalisation revision will incorporate the completed vocabulary once it is.
>
> **SUPERSEDED by `2026-09-27.2`** — A2 (the declarative JSON vocabulary) was delivered on
> 2026-09-27; see the `2026-09-27.2` entry above for the current state. The paragraph above
> is kept as the accurate record of what revision `2026-09-27.1` did.
>
> `2026-09-25.1` adds the **access boundary** and its **evidence classes** to
> `agent-operating-rules.md` (*Access boundary — authorised evidence*), and aligns `deployment.md`
> (preconditions + rollback) and `troubleshooting.md` entry 8 with it. Provider-account work —
> creating or configuring a provider project, DNS changes, traffic-level promotion/rollback, and
> reading provider records — is **owner/operator** work; a coding agent works from local/Git
> evidence, GitHub-visible checks and **public production behaviour**, and reports it as
> *"production behaviour verified publicly"* — never as a "provider deployment record". A check
> named after a platform may be reported **only** as a GitHub-visible check result. **No
> deployment procedure changed** — only who performs it and how it is reported. Absence of
> provider access is intentional, not a blocker.
>
> `2026-09-19.1` corrects the **topology** these manuals teach. No procedure changed. The previous
> revisions described the live Foundation site as a private **sibling repository**
> (`provelopment-foundation-site`). That repository was **archived** when the sites were
> consolidated, and it is **historical only** — it is not the current implementation. The current
> truth is: `provelopment-foundation` is the **public reusable product**;
> `foundation.provelopment.com` is a **site profile** inside the private downstream
> **`provelopment-web`** application, which serves several first-party sites; and the public
> template remains **independently usable** — adopting it never requires a downstream
> application. The retired selectable-presentation (preset) feature is confirmed obsolete.
> `adoption.md` → *When the upstream product and the live site are the same codebase* now teaches
> the current model.
>
> `2026-09-17.2` is validated by the **Foundation split (FS1)**: the public repository became the
> **generic template product** and the live Foundation site was moved out of it into a private
> downstream repository. It adds the **public-product / private-implementation** distinction and
> its repository map, the rule that the **public template
> has no production deployment**, the provider-project **re-connect + production-provenance**
> procedure, the **clean-clone acceptance gate** (which caught a CI-only hidden-directory
> dependency), and the **template vs adopter test responsibility** split. See `adoption.md` →
> *When the upstream product and the live site are the same codebase*, `deployment.md` →
> *Re-pointing a provider project to a new repository*, `validation.md` → *Clean-clone acceptance*,
> and `troubleshooting.md` entry 9.
> **adoption** procedure was executed end to end, at Foundation `ccc29a5` (runtime `1114759`).
> It adds the distinction between the two **adoption shapes** (vendored vs **direct downstream
> clone**), the downstream-clone **runbook** that was actually followed, the mandatory
> `origin`/`foundation` remote topology, the rule that a downstream project keeps its own version
> history (upstream release tags are **not** pushed downstream), and the provider-credential
> precondition in `deployment.md` + `troubleshooting.md` entry 8. `foundation-upgrade.md` was not
> re-exercised by this run; its last full exercise remains `2026-09-16.3` @ `dae07b4`.
>
> `2026-09-16.3` is the first revision **validated by a real upgrade run**, not by
> review. The DemoBusinesses shared-platform upgrade (`f5c94da` → `dae07b4`) was
> executed with this procedure and its findings are folded back in:
> `foundation-upgrade.md` now sequences **one pilot adopter before the remaining
> adopters**, requires an **immutable target** (a full commit SHA when no tag covers
> the accepted state) with the exact fetch command, states that the reproduce step
> must **mirror** so upstream **deletions** land, and documents the two traps the run
> exposed — the **asset-classification trap** after a re-vendor, and the
> **canonical-baseline files** a vendoring helper does not copy. The header
> terminology is defined above for the first time, which is why nine manuals
> previously carried a stale, undefined baseline. See
> the maintainer's private adopter upgrade records.
>
> The same upgrade pass also produced the **deployment-blocking** finding recorded in
> `deployment.md` (Preconditions) and `troubleshooting.md` entry 7: a Git-integrated platform
> can **block** a deployment whose commit author is not a member of the platform account, so a
> green gate can coexist with an unchanged production site.

> `2026-09-16.2` re-issues the same procedures with the workspace paths updated by
> `2026-09-17.3` removes references to the maintainer's private governance locations
> from these distributed manuals. No procedure changed: the propagation commands
> and the parity check now use `<master>`/`<receiver>` placeholders, and the
> concrete workspace procedure lives with the private governance documentation
> rather than in the shipped package.
> `2026-09-16.2` re-issued the same procedures with the workspace paths updated by
> a workspace reorganisation: the governance home and the Foundation working
> directory were renamed. No procedure changed.
> `2026-09-16.1` re-issued the same procedures with the propagation/parity cycle
> updated for the single-presentation architecture: the retired selectable-
> presentation (preset) feature and the retired sibling demo repository are no
> longer part of the cycle, and the parity check covers Foundation only.
> `2026-09-15.1` re-issued the same procedures with the master authority path moved
> to its governance location. No procedure changed; the propagation and parity
> checks above are unchanged.
## Manual index

| Manual | Use it when |
| --- | --- |
| [`foundation-upgrade.md`](foundation-upgrade.md) | A newer Foundation release must be absorbed without damaging adopter-owned material. |
| [`adoption.md`](adoption.md) | Creating a new Foundation-derived project (a single-site **downstream clone**, or a multi-site **vendored** adopter, or a real customer). |
| [`site-customization.md`](site-customization.md) | Changing identity, navigation, CTA, presentation, theme, contact or metadata **without touching source**. |
| [`branding-and-assets.md`](branding-and-assets.md) | Replacing logos, favicon, banners, sidebar icons or imagery; runtime roles vs business files. |
| [`content-management.md`](content-management.md) | Writing/editing pages (the simple Markdown mode, or the **delivered** advanced declarative JSON mode), the artwork under `content/assets/`, legal documents and dictionaries. |
| [`validation.md`](validation.md) | Before claiming any task complete; understanding what each gate proves. |
| [`deployment.md`](deployment.md) | Taking a validated repository live and verifying production. |
| [`agent-operating-rules.md`](agent-operating-rules.md) | Operating inside an adopter project: authority, boundaries, **the access boundary and evidence classes**, escalation, handoff. |
| [`troubleshooting.md`](troubleshooting.md) | A known recurring failure with a known safe resolution. |

Full configuration schema reference lives in the Foundation's `CUSTOMIZING.md`;
architecture in `ARCHITECTURE.md`. These manuals point at them rather than
duplicating them.

## Retirement policy

Obsolete procedures are **updated**, **consolidated**, or **removed** — never left
active beside their replacement.

- One procedure, one home. If a manual duplicates a project document, keep the
  manual (it is distributed) and reduce the project document to a pointer.
- Superseded guidance is rewritten in place; the version table records the change.
- Dead guidance is deleted. Historically interesting material belongs in project
  history/archives, not in a manual an agent will follow.
- **Contradictory active instructions are not allowed.**

## What this package is not

- Not a substitute for `CUSTOMIZING.md` (schema reference) or `ARCHITECTURE.md`.
- Not a changelog or release history.
- Not a place for project-specific business facts (customer briefs, site copy) —
  those are adopter-owned content.
