# Deployment Runbook

This runbook takes a site built from this template (upstream or a downstream
clone) from repository to a live production website on Vercel.

## Prerequisites

- Admin access to the GitHub repository.
- A Vercel account (the free Hobby tier suffices for most small businesses).
- Access to the domain's DNS settings.
- Node.js 22+ and pnpm installed locally for verification builds.

## First Deployment

1. Log in to [vercel.com](https://vercel.com) with your GitHub account.
2. **Add New → Project** and import the repository.
3. Vercel auto-detects Next.js. Confirm the build settings:
   - Install command: `pnpm install`
   - Build command: `pnpm build`
   - No environment variables are required.
4. Click **Deploy**. The first deployment uses the `*.vercel.app` domain.

Every push to `main` now deploys to production automatically, and every
pull request receives its own preview URL.

## Environment Variables (contact inquiries)

No environment variables are required for a default build (`provider: "stub"`
or no `features.contact`). When you enable **`provider: "webhook"`**, set these
in the Vercel project:

- `CONTACT_WEBHOOK_URL` — the receiver URL (required; `https://` for any
  non-local host).
- `CONTACT_WEBHOOK_TOKEN` — optional shared secret, sent as
  `Authorization: Bearer <token>`.

These are read at **runtime** in the server action, so they do not need to
exist at build time (no build-time secret required). A webhook provider without
a URL never silently degrades — it surfaces an explicit "misconfigured" state
and logs a configuration diagnostic.

**Rate limiting / anti-abuse:** the template is a frontend + integration seam.
Throttle contact submissions at your edge (Vercel/WAF/firewall) or in the
receiver. Foundation provides the honeypot and same-origin form protection, not
server-side rate limiting or spam filtering.

## Continuous Integration Gating

The repository's CI workflow (`.github/workflows/ci.yml`) validates a change
according to **who owns it**. One dependency-free Node tool classifies the changed
paths from the Git diff — never from a commit message, a PR label or a human's
choice — in `scripts/ci/change-scope.mjs`:

| Change | What CI proves |
| --- | --- |
| Documentation only (manuals, READMEs, `LICENSE`) | repository hygiene (`git diff --check`); nothing is installed, built or run |
| The deployment only (`deployment/**`) | the deployment's own contract: `assets:check`, `country-codes:check`, typecheck, lint, `test:deployment`, `build`, `test:browser:deployment` |
| The Foundation only (`src/**`, `tests/**`) | the generic contract (`test:foundation`, `test:browser:foundation`, typecheck, lint) **plus a canary**: the one representative deployment installed in this repository runs its own acceptance contract again |
| Shared or mixed (manifests, lockfiles, build/CI configuration, platform scripts, the runtime asset mirror, or a change touching both owners) | the complete gate: all of the above in its unscoped form |

Unknown or ambiguous ownership always **widens** validation: a new top-level
directory, a re-created historical `content/**`, `config/**` or root
`site.config.json`, or a change whose extent cannot be measured all run the
complete gate instead of skipping work. Routing removes *unrelated* validation; it
never weakens the contract a change actually has. A Foundation change never runs
every deployment that exists — it proves the platform's own contracts, then that
those contracts still fit one real installation.

The pipeline exposes one required status context, **`validate`**, which runs on
every push and pull request and fails whenever the selected route failed — so a
skipped route can never be mistaken for a pass.

Recommended branch protection for `main`:

- Require the **`validate`** check to pass before merging.
- Require pull requests before direct pushes (except by trusted maintainers).

Vercel is unchanged: it still builds a preview for every push, including a
documentation-only one, because preview building is a Vercel project setting
rather than a CI route.

## Custom Domain

1. In the Vercel project, open **Settings → Domains** and add the domain
   (for example `provelopment.com`).
2. Follow the displayed instructions to create the DNS records at the
   registrar (usually an `A` record or `CNAME`, or nameserver delegation).
3. Choose whether the apex or the `www` subdomain is canonical; Vercel
   redirects the other automatically.
4. TLS certificates are provisioned automatically.

## Configuration Alignment

Before go-live, verify that the deployment's `site.config.json` matches reality. Where that file lives
follows how the Installation is authored (S3F1): an explicit Installation declares its Spokes in
`spokes.json` and each Spoke owns its own `site.config.json` — in this repository the capsule declares
the Spoke `foundation`, so the file is `deployment/spokes/foundation/site.config.json` (a legacy
Installation keeps it at the installation root instead).

- `site.url` must be the final production origin (`https://…`, no trailing
  slash). It drives the sitemap, hreflang alternates, canonical URLs, and
  social preview metadata.
- Branding fields (`name`, `tagline`, `description`, contact, social links)
  appear across the UI and in search/social results.
- Feature flags under `features` control optional functionality such as
  analytics.

The file is validated at build time; invalid edits fail the build with an
actionable message. Changing these values is a configuration-level change;
commit and push to trigger a redeploy.

## Post-Deployment Verification Checklist

Run against the live domain:

- [ ] `/` redirects to the default Site and Language — with the shipped
      single-Site, single-Language configuration that is `/ww/en`.
- [ ] `/ww/en` returns HTTP 200 (the landing page). Every page you author is served
      by the same route at `/ww/en/<slug>`, and a configured location at
      `/ww/en/<location>/<slug>`. This repository's own reference deployment ships two
      example pages (`/ww/en` Home, `/ww/en/about` About); a clone that authors none
      serves the starter landing page, and `/ww/en` is then the only page URL.
- [ ] An unknown path such as `/ww/en/does-not-exist` returns HTTP **404**. Next.js
      answers with its own 404 page: only build-discovered routes are served
      (`dynamicParams = false`), so an unknown path never matches the page route.
- [ ] `/sitemap.xml` lists every route for every Site and Language.
- [ ] `/robots.txt` references the sitemap.
- [ ] Page source contains `<html lang="en">`, hreflang `alternates`
      (including `x-default`), canonical URL, and Open Graph tags — with `site.url`
      set to your real origin (the template ships the placeholder
      `https://www.example.com`, which those URLs use until you change it).
- [ ] Social preview renders correctly (test with a sharing debugger such
      as the LinkedIn Post Inspector or Facebook Sharing Debugger).
- [ ] Social preview image renders correctly — `/<site>/<language>/opengraph-image`
      is generated with no configuration.
- [ ] Favicon renders correctly **once configured**: set `site.assets.favicon` in the
      deployment's `site.config.json` (`deployment/spokes/foundation/site.config.json` in this
      repository — the sole declared Spoke's file). The template ships no favicon, so a browser's
      implicit `/favicon.ico` request returns 404 until then.
- [ ] Dark mode renders correctly (emulate `prefers-color-scheme: dark`).

## Rollback

Use **Deployments** in the Vercel dashboard: any previous deployment can be
promoted to production instantly (**⋯ → Promote to Production**) while a fix
is prepared.

## For Downstream Clones

Downstream sites repeat this runbook against their own repository, domain,
and `siteConfig` values. Platform logic requires no modification.

The upstream template's own deployment
(`https://foundation-template.provelopment.com/`) is produced the same way — built
directly from its public repository, with no local build, no overlay and no separate
demo repository — so the runbook above is the process that actually produced it.