/**
 * Regenerates the machine-checkable country-code section of `content/COUNTRY-CODES.md`
 * from the ONE runtime authority (`src/core/site-code.ts`).
 *
 * The document is human-readable first; this script only guarantees that the code column is
 * EXACTLY the recognized set, with names taken from Node's ICU data (no hand-typed list can
 * drift). Run it after changing `COUNTRY_SITE_CODES`:
 *
 *   node scripts/generate-country-code-reference.mjs
 *
 * `tests/unit/country-code-reference.test.ts` fails when the document and the runtime disagree,
 * so a forgotten run is caught by the normal gate rather than by a reader.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SOURCE = join(ROOT, "src", "core", "site-code.ts");
const TARGET = join(ROOT, "content", "COUNTRY-CODES.md");
const START = "<!-- CODES:START -->";
const END = "<!-- CODES:END -->";

const source = readFileSync(SOURCE, "utf8");
const block = source.split("export const COUNTRY_SITE_CODES")[1].split("];")[0];
const codes = [...block.matchAll(/"([a-z]{2})"/g)].map((match) => match[1]);
const names = new Intl.DisplayNames(["en"], { type: "region" });

const columns = 3;
const cells = codes.map((code) => `\`${code}\` ${names.of(code.toUpperCase()) ?? code}`);
const perColumn = Math.ceil(cells.length / columns);
const lines = [];
for (let row = 0; row < perColumn; row += 1) {
  const line = [];
  for (let column = 0; column < columns; column += 1) {
    const cell = cells[row + column * perColumn];
    if (cell !== undefined) line.push(cell);
  }
  lines.push(line.join(" · "));
}

const document = readFileSync(TARGET, "utf8");
const generated = [START, "", ...lines, "", END].join("\n");
const existing = document.slice(document.indexOf(START), document.indexOf(END) + END.length);
if (existing !== generated) {
  writeFileSync(TARGET, document.replace(existing, generated), "utf8");
  console.log(`[country-codes] updated ${codes.length} codes in ${TARGET}`);
} else {
  console.log(`[country-codes] already current (${codes.length} codes)`);
}
