# Synthetic deployment content

Test-only content for the generic Foundation test suite (`tests/fixtures/synthetic-deployment/**`).
Nothing here is deployed, and nothing in `src/**` reads it.

| Where | What it is |
| --- | --- |
| `pages/markdown/<site>/<locale>/` | pages in the simple Markdown mode |
| `pages/json/<site>/<locale>/` | pages in the declarative JSON mode |
| `assets/` | the artwork sources this deployment mirrors into `public/assets/` |
| `COUNTRY-CODES.md` | this deployment's generated country-code reference: the marked section is written by `pnpm country-codes:sync` and verified by `pnpm country-codes:check` |
