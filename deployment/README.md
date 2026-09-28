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
| `tests/unit/` | This deployment's durable unit-level acceptance: its real configuration, dictionaries, routes, copy and structured data. |
| `tests/integration/` | This deployment's durable integration acceptance: its authored pages served through the real application. |
| `tests/browser/` | This deployment's browser acceptance scenario, run by the Foundation's browser harness. |
| `.test/` | **Local scratch, never committed.** Temporary fixtures, screenshots, generated reports, browser artifacts, probes. An agent or a test creates it locally when it needs it: `deployment/.gitignore` keeps it out of version control, including any file inside it. |
| `foundation-baseline.json` | The Foundation version this deployment was established from (see below). |
| `AGENTS.md` | The contract for an agent working on this deployment. |

**Not here yet:** this deployment's configuration, dictionaries, authored pages and artwork still sit
at the repository root (`site.config.json`, `config/i18n/**`, `content/**`). Those files are deployed
exactly as they always were; only its *tests* have moved into the capsule so far.

## How to work on this deployment

- **A deployment change never requires editing the Foundation.** Change the configuration, the
  dictionaries or the authored pages, run this deployment's validation, and stop there.
- **Every page is authored in `content/`** — one page per URL, in Markdown or in the declarative JSON
  mode. If a page has its own URL, it is a page: there is no author-facing collection to add.
- **User-visible interface strings live in `config/i18n/<locale>.json`**, never inside a component.
- **Durable tests for this deployment belong in `tests/**`.** They answer questions about *this* site:
  its own origin, sites, languages, locations, routes, copy and assets. Reusable platform behaviour is
  already proved once by the Foundation's own tests — do not copy those here.
- **Temporary work belongs in `.test/**`.** Do not scatter scratch files through this repository.
- **If a change seems to need a platform edit, stop and escalate.** A Foundation defect is reported,
  not patched from inside this capsule.

## The Foundation baseline

`foundation-baseline.json` records the exact Foundation commit and tree this deployment was established
from. It exists so that a future Foundation update is a *deliberate, reviewable* act — compare, decide,
adopt — rather than an accident of pulling the newest code. There is no upgrade mechanism yet; the
record is the starting point.

## Another deployment is out of scope

You may read Foundation code and contracts, because that is how you understand the platform you use.
You may not read, copy from, or modify another deployment — ever.
