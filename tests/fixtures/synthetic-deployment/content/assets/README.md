# Synthetic deployment assets

Test-only artwork sources for the generic Foundation suite. `scripts/sync-runtime-assets.mjs` mirrors
declared files from here into `public/assets/`; the runtime copies are generated output and are never
edited by hand.

This fixture is a **generic contract fixture**, not a site: it carries exactly the asset surfaces the
production asset contract requires, so the generic clean room can install, mirror, build and validate
a Foundation release with this deployment and nothing else.

| Surface | Why it exists |
| --- | --- |
| `placeholders/**` | The eight neutral role sources the installer's declared plan mirrors: the identity roles (`logo-header.svg` → `logo-header.svg` + `logo-footer.svg`, `favicon.svg`), the two **blank** decorative bands (`header-graphic.svg`, `footer-graphic.svg`, which draw nothing), and the four sidebar control/fallback icons. |
| `icon-library/icons/**` | The generic, non-trademark icon library: the two icons this fixture's own navigation configures, plus the seven connectivity icons the generic inventory contract requires to be on disk. |
| `platform-marks/**` | The seven **admitted** platform-mark filenames the runtime inventory fixes (and the withheld platforms must stay absent). The marks are neutral synthetic glyphs: no platform logo is reproduced. |

Every byte here is synthetic and independently authored for testing — this fixture must never carry
another deployment's artwork, and no reference-deployment asset may reach the generic clean room.

Two surfaces are deliberately ABSENT, because the template ships no example artwork until an adopter
provides it: the artwork-only roles (`og-image.png`, `background-all.svg`, `status-graphic.svg`,
`banner-*.png`).

Generated state is not committed here: `pnpm assets:sync` creates the runtime mirror from these
sources, and `pnpm country-codes:sync` writes this deployment's `content/COUNTRY-CODES.md`. Both are
produced when a deployment is selected, which is what the generic clean-room proof exercises.
