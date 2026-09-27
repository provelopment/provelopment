# Your website's content — start here

**Everything you write or upload for your website lives in this folder.** If you are
asking *"where do I edit my website?"*, you are in the right place.

```text
content/
├── README.md            ← this file: the map
├── pages/               ← every page of your website
│   ├── markdown/        ←   the simple way: text files
│   │   └── <language>/<page>.md
│   └── json/            ←   the advanced way: structured data
│       └── <language>/<page>.json
└── assets/              ← your logo, favicon, images and icons
```

**The rule that makes it simple:** if something has its own web address, it is a
**page** and it goes in `pages/`. If it only ever appears *inside* another page — a
customer quote, a row in a table, a card in a list — you write it in that page. There
are no other places to author website content, and nothing else to learn.

| I want to… | Go to | Read |
| --- | --- | --- |
| Add or edit a **page** in plain Markdown (the usual choice) | `pages/markdown/<language>/<page>.md` | [`pages/markdown/README.md`](pages/markdown/README.md) |
| Build an **advanced page** from structured data | `pages/json/<language>/<page>.json` | [`pages/json/README.md`](pages/json/README.md) |
| Add a **logo, favicon, icon or image** | `assets/` | [`assets/README.md`](assets/README.md) |

## Pages: two ways to author, one obvious choice

- **Markdown** — ordinary text files. If you can write an email, you can write a
  page. This is what almost everyone should use, and it is safe by design.
- **JSON** — structured data for an experienced author who needs page composition
  Markdown cannot express: a title, a summary and an ordered list of sections from a
  fixed vocabulary (hero, prose, images, cards, features, steps, table, FAQ, and more).
  It is data, never code, and everything it may say is documented in that folder's
  README.

A page becomes a real web address as soon as its file exists in a language folder —
you never have to "register" a page anywhere.

## A page's address comes from its folders

Any page **inside** your site gets its address from where you put the file:

```text
content/pages/markdown/en/about.md                    →  /en/about
content/pages/markdown/en/services.md                 →  /en/services
content/pages/markdown/en/services/web-design.md      →  /en/services/web-design
content/pages/markdown/en/blog/choosing-a-domain.md   →  /en/blog/choosing-a-domain
```

So a section with its own pages is just a folder. Nothing needs configuring, and the
section's own page (`services.md`) and its pages (`services/web-design.md`) live
happily side by side.

## Languages

Pages are organised by language: the folder name is a language code such as `en`
(English) or `de` (German). Another language mirrors the same structure exactly:

```text
content/pages/markdown/en/services.md                  →  /en/services
content/pages/markdown/en/services/web-design.md       →  /en/services/web-design

content/pages/markdown/de/services.md                  →  /de/services
content/pages/markdown/de/services/web-design.md       →  /de/services/web-design
```

The languages your site serves are configured in `site.config.json`; a language
folder you create but have not configured yet simply publishes nothing. If a page has
no translation in the visitor's language, the default language's page answers instead.

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

## Two things that are deliberate, not mistakes

- **A `README.md` is never a page.** Documentation is safe to keep beside your
  content — at the top level or inside any folder — because only files whose names are
  ordinary lowercase page names can become pages.
- **An empty folder publishes nothing.** You can prepare a language or a section
  before you have anything to put in it; it creates no page and no address.
