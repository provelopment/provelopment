import { existsSync } from "node:fs";
import path from "node:path";

/**
 * P6-1 — configured icon-asset availability (framework layer).
 *
 * The P5-5 icon contract is:
 *  - a plain asset filename (schema-validated, no traversal/URL) →
 *    `/assets/<name>` (rendered by the shared disclosure/nav-item icon paths);
 *  - `""` → a DELIBERATE absence (no icon element at all);
 *  - a name with no backing file → NEVER a broken-image `<img>`.
 *
 * This module is the one place that answers "does the asset actually exist?"
 * against `public/assets/` (the established adopter asset directory). It backs
 * two guarantees:
 *
 *  1. LOUD BUILD FAILURE — `assertConfiguredIconAssetsExist` runs from the
 *     SERVER-ONLY layout (module load / build — see `[locale]/layout.tsx`), so
 *     a configured-but-missing icon fails the build by naming the exact leaf
 *     and the expected file, matching the established "invalid configuration
 *     fails loudly" contract (P5-5A). Deliberately-empty (`""`) and absent
 *     leaves are valid and skipped.
 *
 *  2. SAFE RUNTIME RENDER — `availableIconName` is applied at the framework
 *     composition boundary (layout, site-header, nav-links), so an icon that
 *     is unavailable at render time resolves to `""` (no icon) and the DOM can
 *     never contain a broken browser-image placeholder. Config components are
 *     never handed a name that isn't backed by a real file.
 *
 * Layer note: this module lives in `src/config` (the framework layer) because
 * it touches the filesystem; `src/core` stays framework-agnostic and the UI
 * primitives stay config-free (architecture boundary tests). It must only be
 * imported from SERVER modules: a CLIENT component (e.g. `ContextNavLinks`
 * imports siteConfig via `@/config`) must never pull `node:fs` into a browser
 * chunk — the loud check therefore lives in the server layout, not the loader.
 */
const publicAssetsDirectory = path.join(process.cwd(), "public", "assets");

const availabilityCache = new Map<string, boolean>();

/** True when `<name>` exists as a real file under `public/assets/` (cached). */
export function iconAssetAvailable(name: string | undefined): boolean {
  if (!name || name === "") return false;
  const cached = availabilityCache.get(name);
  if (cached !== undefined) return cached;
  const available = existsSync(path.join(publicAssetsDirectory, name));
  availabilityCache.set(name, available);
  return available;
}

/**
 * The icon filename to render: the name when it is backed by a real asset;
 * `""` when a CONFIGURED name has no backing file (safely: no icon, never a
 * broken image — the P5-5 deliberate-absence value); `undefined`/`""` pass
 * through so the P5-5A contract is preserved verbatim (missing → the caller's
 * shipped-asset fallback applies; `""` → deliberately no icon).
 */
export function availableIconName(name: string | undefined): string | undefined {
  if (name === undefined || name === "") return name;
  return iconAssetAvailable(name) ? name : "";
}

interface IconLeafRef {
  readonly label: string;
  readonly value: string | undefined;
}

/** The icon-bearing part of the parsed configuration (structural projection). */
export interface IconConfigSource {
  readonly ui?: {
    readonly navigation?: {
      readonly sidebar?: {
        readonly open?: { readonly icon?: string };
        readonly close?: { readonly icon?: string };
      };
    };
    readonly cta?: { readonly icon?: string };
  };
  readonly navigation?: readonly { readonly icon?: string }[];
}

/**
 * P6-1 — every icon leaf in the configuration that is a plain filename must be
 * backed by a real file under `public/assets/`. Missing files are loud build
 * failures (P5-5A: invalid → loud configuration failure), so an adopter who
 * references a typo'd/absent asset can never ship a broken-image icon.
 *
 * Deliberate absence (`""`) on a control leaf remains valid (icon-only →
 * text-only etc.), exactly as before — only a NAME with no file fails.
 */
export function assertConfiguredIconAssetsExist(json: IconConfigSource): void {
  const leaves: IconLeafRef[] = [];
  const push = (label: string, value: string | undefined) => {
    if (value && value !== "") leaves.push({ label, value });
  };

  push("ui.navigation.sidebar.open.icon", json.ui?.navigation?.sidebar?.open?.icon);
  push("ui.navigation.sidebar.close.icon", json.ui?.navigation?.sidebar?.close?.icon);
  push("ui.cta.icon", json.ui?.cta?.icon);
  for (const [index, item] of (json.navigation ?? []).entries()) {
    push(`navigation[${index}].icon`, item.icon);
  }

  const missing = leaves.filter((leaf) => !iconAssetAvailable(leaf.value));
  if (missing.length > 0) {
    const details = missing
      .map((leaf) => `  - ${leaf.label}: "${leaf.value}" not found under public/assets/`)
      .join("\n");
    throw new Error(
      `Invalid site configuration: configured icon leaf(s) have no matching asset file:\n${details}\n` +
        `Place the asset in public/assets/ (a plain filename) or use "" to deliberately omit the icon.`,
    );
  }
}