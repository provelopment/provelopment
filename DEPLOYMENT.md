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

The repository's CI workflow (`.github/workflows/ci.yml`) runs typecheck,
lint, tests, and a production build on every push and pull request.

Recommended branch protection for `main`:

- Require the **CI** check to pass before merging.
- Require pull requests before direct pushes (except by trusted maintainers).

Vercel deployments can additionally be gated on the same checks in
**Project Settings → Git**.

## Custom Domain

1. In the Vercel project, open **Settings → Domains** and add the domain
   (for example `provelopment.com`).
2. Follow the displayed instructions to create the DNS records at the
   registrar (usually an `A` record or `CNAME`, or nameserver delegation).
3. Choose whether the apex or the `www` subdomain is canonical; Vercel
   redirects the other automatically.
4. TLS certificates are provisioned automatically.

## Configuration Alignment

Before go-live, verify that `site.config.json` matches reality:

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

- [ ] `/` redirects to the default locale (e.g. `/en`) based on browser
      language.
- [ ] `/en`, `/en/about`, and `/en/resources` return HTTP 200.
- [ ] An unknown path such as `/en/does-not-exist` renders the branded 404.
- [ ] `/sitemap.xml` lists every route for every configured locale.
- [ ] `/robots.txt` references the sitemap.
- [ ] Page source contains `<html lang="en">`, hreflang `alternates`
      (including `x-default`), canonical URL, and Open Graph tags.
- [ ] Social preview renders correctly (test with a sharing debugger such
      as the LinkedIn Post Inspector or Facebook Sharing Debugger).
- [ ] Favicon and social preview image render correctly.
- [ ] Dark mode renders correctly (emulate `prefers-color-scheme: dark`).

## Rollback

Use **Deployments** in the Vercel dashboard: any previous deployment can be
promoted to production instantly (**⋯ → Promote to Production**) while a fix
is prepared.

## For Downstream Clones

Downstream sites repeat this runbook against their own repository, domain,
and `siteConfig` values. Platform logic requires no modification.