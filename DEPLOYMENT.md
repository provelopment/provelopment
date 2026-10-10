# Deployment Runbook

This runbook takes a site built from this template (upstream or a downstream
clone) from repository to a live production website on Vercel.

## Prerequisites

- Admin access to the GitHub repository.
- A Vercel account on a plan that suits how the site is used. **Foundation itself is free and
  open source; hosting is a separate decision and may cost money.** Vercel restricts its free
  **Hobby** plan to **non-commercial, personal use only** (its own wording in the Hobby plan
  documentation, applying its fair-use guidelines), and describes its paid **Pro** and
  **Enterprise** plans as the plans for businesses, so a **commercial business website needs a
  paid plan**. Prices and conditions are the provider's to state and change — check them yourself
  before you commit: [plans](https://vercel.com/docs/plans) ·
  [Hobby plan](https://vercel.com/docs/plans/hobby) ·
  [fair use](https://vercel.com/docs/limits/fair-use-guidelines) ·
  [terms](https://vercel.com/legal/terms).
- This runbook documents Vercel because that is what the public reference deployment uses. The
  template itself is not tied to it, and no other host is documented here.
- Access to the domain's DNS settings.
- Node.js 24.x and pnpm 11.6.0 installed locally for verification builds.

## First Deployment

1. Log in to [vercel.com](https://vercel.com) with your GitHub account.
2. **Add New → Project** and import the repository.
3. Vercel auto-detects Next.js. Confirm the build settings:
   - Install command: `pnpm install`
   - Build command: `pnpm build`
   - No environment variables are required (see *Environment Variables* below for the optional
     contact-webhook pair).
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
two Spokes, `foundation` and `germany`, so their files are
`deployment/spokes/foundation/site.config.json` and
`deployment/spokes/germany/site.config.json` (a legacy Installation keeps its single file at the
installation root instead).

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

- [ ] `/` completes to the default Site and default Language of the Spoke that answers your
      hostname. The shipped reference Installation shows both cases:
      `https://foundation-template.prodevelopment.com/` → `/ww/en` (Foundation Spoke, Site `ww`,
      default language `en`), and `https://foundation-template-germany.prodevelopment.com/` →
      `/de/de` (Germany Spoke, Site `de`, default language `de`).
- [ ] `/ww/en` returns HTTP 200 (the landing page). Every page is served at
      `/<site>/<language>/<slug>`, and a configured location at
      `/<site>/<language>/<location>/<slug>`. This repository's reference Installation ships
      **two Spokes**, each with its own pages: the Foundation Spoke serves `/ww/en` (Home),
      `/ww/de`, `/ww/en/about` and `/ww/de/about`; the Germany Spoke serves `/de/de` (Home),
      `/de/en`, the About pages and one page per location (`/de/de/berlin`,
      `/de/de/frankfurt`, `/de/en/berlin`, `/de/en/frankfurt`). A clone that authors no page
      still serves the configuration-driven starter landing page at its own `/<site>/<language>`.
- [ ] An unknown path such as `/ww/en/does-not-exist` returns HTTP **404**. Next.js answers
      with its own 404 page: only build-discovered routes are served (`dynamicParams = false`),
      so an unknown path never matches the page route.
- [ ] **Hostname isolation holds.** Each Spoke answers only the hostnames it claims: on the
      Foundation Spoke's host the Germany Site is not served (`/de/de` → 404), and on the
      Germany Spoke's host the Global Site is not served (`/ww/en` → 404).
- [ ] `/sitemap.xml` lists every route for every Site and Language of that Spoke.
- [ ] `/robots.txt` references the sitemap.
- [ ] Page source contains `<html lang="en">`, hreflang `alternates` (including
      `x-default`), canonical URL, and Open Graph tags — with `site.url` set to your real origin
      (the template ships the placeholder `https://www.example.com`, which those URLs use until
      you change it).
- [ ] Social preview renders correctly (test with a sharing debugger such as the LinkedIn Post
      Inspector or Facebook Sharing Debugger).
- [ ] Social preview image renders correctly — `/<site>/<language>/opengraph-image` is
      generated with no configuration.
- [ ] Favicon renders correctly. Each reference Spoke ships a neutral placeholder
      (`deployment/spokes/<spoke>/content/assets/placeholders/favicon.svg`) and declares it as
      `site.assets.favicon` in that Spoke's own `site.config.json`. **Where the file must exist
      at runtime depends on the authoring form:** an Installation that declares Spokes publishes
      role artwork into that Spoke's own namespace (`/spokes/<spoke>/assets/<role>`, for example
      `/spokes/foundation/assets/favicon.svg`), while a legacy single-root Installation
      publishes it into the shared platform namespace (`/assets/favicon.svg`). Replace the
      placeholder in place, or point `site.assets.favicon` at your own absolute URL, then run
      `pnpm assets:sync`. No `favicon.ico` file ships, so a browser's implicit `/favicon.ico`
      request is not served unless you add one. The full role contract is
      [`BRAND_ASSETS.md`](BRAND_ASSETS.md).
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