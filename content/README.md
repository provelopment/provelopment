# Your website's content — start here

**Everything you write or upload for your website lives in this folder.** If you are
asking *"where do I edit my website?"*, you are in the right place.

| I want to… | Go to | Read |
| --- | --- | --- |
| Add or edit a **page** in plain Markdown (the usual choice) | `pages/markdown/<language>/<page-name>.md` | [`pages/markdown/README.md`](pages/markdown/README.md) |
| Build an **advanced page** from structured data | `pages/json/<language>/<page-name>.json` | [`pages/json/README.md`](pages/json/README.md) |
| Add a **logo, favicon, icon or graphic** | `assets/` | [`assets/README.md`](assets/README.md) |
| Add a **legal document** (privacy policy, terms, cookies) | `legal/<language>/<name>.md` | `../CUSTOMIZING.md` |
| Add **services or products** you offer | `offerings/<language>/<name>.md` | `../CUSTOMIZING.md` |
| Add **work you have done**, **reviews**, or **articles** | `portfolio/`, `testimonials/`, `posts/` | `../CUSTOMIZING.md` |

Each folder carries its own `README.md` explaining exactly what belongs there. Those
README files are documentation, never pages: they cannot appear on your website by
accident.

## Pages: two ways to author, one obvious choice

- **Markdown** — ordinary text files. If you can write an email, you can write a
  page. This is what almost everyone should use, and it is safe by design.
- **JSON** — structured data for an experienced author who needs page composition
  Markdown cannot express. Its vocabulary is still being completed, so it is not
  usable yet; the folder README says exactly what is and is not available.

A page becomes a real web address as soon as its file exists in a language folder —
you never have to "register" a page anywhere.

## Languages

Pages are organised by language: the folder name is a language code such as `en`
(English) or `de` (German). One folder per language you actually publish:

```text
content/pages/markdown/en/opening-hours.md     →  /en/opening-hours
content/pages/markdown/de/oeffnungszeiten.md   →  /de/oeffnungszeiten
```

The languages your site serves are configured in `site.config.json`; a language
folder you create but have not configured yet simply publishes nothing. If a page
has no translation in the visitor's language, the default language's page answers
instead.

## Content versus configuration

- **`content/` = what you write.** Words, images, documents — the material of the
  website.
- **`site.config.json`, `config/` = how the site behaves.** Your business name,
  phone number, colours, menu entries, which optional features are switched on.

You change your text and images in `content/`. You change settings — including which
language is the default, and what appears in the navigation — in
`site.config.json`.

## Saving is not publishing

Editing a file on your own computer does not change the live website. A change
becomes part of the site when it is **committed and pushed**:

```text
edit the file
→ save it
→ review what changed   (git status)
→ stage it              (git add <file>)
→ commit it             (git commit -m "Update About page")
→ push it               (git push)
→ automated checks build the site
```

Each folder's README shows the exact commands for its files. If you have never used
Git, follow that sequence literally: it is the whole workflow, and it works the same
way for every file in this folder.
