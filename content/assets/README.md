# Site assets — logos, icons and graphics

This is the **one place to add or replace the artwork your site shows**: your logo,
favicon, decorative graphics, page backgrounds and the icons used by navigation and
connectivity links. Everything here is yours to edit.

## The one rule that surprises people

`public/assets/` in the project is a **generated copy** of this folder. Next.js can
only serve files that live under `public/`, so the build copies your artwork there.
That copy is produced by a script — **never edit `public/assets/` by hand**, because
your edit is overwritten the next time the copy runs, and the automated check fails
until it is.

So: edit here, then run the copy (or just `pnpm build`, which copies first).

```text
pnpm assets:sync     # copy your artwork into public/assets
pnpm assets:check    # verify the copy is byte-identical to this folder
```

## What lives where

| Folder | What it holds |
| --- | --- |
| `placeholders/` | The neutral, blank defaults a fresh Foundation site ships. **Replace these in place** — `logo-header.svg`, `favicon.svg`, `header-graphic.svg`, `footer-graphic.svg` and the sidebar icons — or point a role at your own file/URL in `site.config.json`. |
| `icon-library/icons/` | The generic, reusable icon set your navigation and connectivity links can name (`icon-about.svg`, `icon-services.svg`, …). |
| `platform-marks/` | Royalty-free marks for platform/social links (GitHub, WhatsApp, Telegram, …) — used only if you configure such a link. |
| `branding/` | Your own deployment/business artwork. Nothing is shipped here: the generic template has no brand of its own, and the identity roles use `placeholders/` until you add your files. |

Which file plays which role is configuration (`site.assets` in `site.config.json`),
not a folder convention — see `BRAND_ASSETS.md` at the repository root for the
complete, authoritative description of the asset system, the role table and how to
swap artwork.

## Adding a new image

1. Put the file in the folder that matches its purpose (most often
   `branding/` for your own artwork, or `placeholder` replacement in place).
2. Run `pnpm assets:sync` so the runtime copy exists.
3. Reference it in `site.config.json` (for a role) or in your page
   (`![description](/assets/<filename>)`) — a page image is a Markdown image whose
   path starts `/assets/`.
4. Commit both the file here **and** the regenerated `public/assets/` copy, then
   push: the automated checks verify they match.
