# Deployment agent contract

This file is authoritative for anyone — human or agent — working on **this deployment**.

This directory is this deployment's ownership capsule. Read `deployment/README.md` for what each part
of it is for; this file states the boundary you must not cross.

## HOME

```text
deployment/
```

## WRITE

```text
deployment/**   only
```

Nothing outside this directory is yours to change. If a task appears to require a write outside it,
that is a stop condition, not an obstacle to work around.

## READ

- everything under this capsule (`deployment/**`);
- the common Foundation/system files you need in order to understand and use the platform: the
  application code under `src/**`, the platform contracts and manuals (`ARCHITECTURE.md`,
  `CUSTOMIZING.md`, `DEPLOYMENT.md`), the generic test tree, and the root build configuration.

Reading Foundation code is expected — it is how you learn the system you consume. It does not make it
yours to edit.

## NO ACCESS

```text
another deployment
```

Do not read it, do not use it as a fixture, a reference implementation, an example or a source of
content. This capsule is one deployment; a second deployment is outside your scope by definition.

## NO WRITE

```text
src/**                    the Foundation application
tests/**                  the generic Foundation test tree
scripts/**                platform scripts
package.json / lockfiles  dependencies and manifests
next.config.ts / vitest.config.mts / tsconfig.json / eslint.config.mjs / .github/**
                          root build, CI and quality configuration
platform manuals          ARCHITECTURE.md, CUSTOMIZING.md, DEPLOYMENT.md, README.md, *_ASSETS.md
shared modules            anything imported by more than this deployment
private Web               anything private to the owner or to another deployment
another deployment
```

## Working rules

1. **Scratch work goes in `deployment/.test/`.** It is never version controlled (`deployment/.gitignore`).
   Create the directory locally when you first need it — with your normal file tools, not by committing
   a placeholder. Use it for temporary fixtures, screenshots, generated reports, browser artifacts,
   probes, throwaway copies and your own notes. Do not use repository-global scratch space for
   deployment-specific work, and do not commit anything inside `.test/`.
2. **Durable deployment tests live in `deployment/tests/**`.** A test belongs here when it answers a
   question about *this* deployment: its own sites, languages, locations, routes, copy, assets,
   structured data and acceptance.
3. **Never copy a generic Foundation test into `deployment/tests/**`,** and never restate a platform
   contract here. Platform behaviour is proved once, by the Foundation. A deployment test that merely
   repeats a generic assertion adds maintenance, not confidence.
4. **Author content in the content system; never change production content to satisfy a stale test.**
   When an assertion and the owner's file disagree, the file wins: update the assertion. Copy is
   never adjusted so that a check passes.
5. **A change to this deployment must not require editing Foundation.** Configuration, dictionaries,
   content and this capsule's tests are the levers.
6. **If you find a genuine Foundation defect, STOP and report it.** Name the file, the behaviour and
   the evidence. Do not repair the platform from inside this deployment — and never "fix" a platform
   defect by escaping this write boundary (a copy of platform code, a patched import, a local fork of
   a shared module).
7. **Record nothing outside your boundary.** Provenance, decisions and notes about this deployment
   belong in this capsule.

## Provenance

`deployment/foundation-baseline.json` records the Foundation commit and tree this deployment was
established from. Treat it as the version of the platform this site is known to work against; a
Foundation update is a deliberate, reviewed adoption, not an automatic pull.
