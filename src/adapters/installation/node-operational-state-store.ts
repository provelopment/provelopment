/**
 * THE FIRST REAL WRITER OF `operational-state.json` (FOUNDATION-B4B)
 * =================================================================
 *
 * The installation's durable operational record, on the installation's own filesystem: the file
 * `@/core/foundation-installation` defines, at the location its path authority composes. Establishment
 * writes it ONCE, as its last act; every future mechanic (health evaluation, upgrade, rollback) uses this
 * same store.
 *
 * WHY THIS CANNOT BECOME AUTHORED STATE, mechanically rather than by intention:
 *
 *   · the file name comes from the lifecycle contract and the location from the installation's own root —
 *     this adapter invents neither, and it refuses a location outside the root it was constructed for, so
 *     the record is always INSTALLATION-LOCAL;
 *   · the capsule's shipped `.gitignore` ignores the record by name, and establishment refuses a seed
 *     without that rule — so the record is never version-controlled authored state;
 *   · the release content policy classifies it as EXCLUDED, so no Foundation release carries one;
 *   · the authored-state manifest (`tests/support/production-state-manifest.ts`) does not cover it, so
 *     writing it produces no authored drift.
 *
 * `read()` answers `null` when this installation has no record yet — an installation that has never been
 * established, which is a real state rather than an error. The bytes are returned exactly as stored,
 * WITHOUT repair: validating them is the domain's job, and a store that filtered or fixed a record would
 * hide the corruption the record exists to expose.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { InstallationOperationalStateStore } from "@/application/foundation-installation-ports";
import type { FoundationInstallationOperationalState } from "@/core/foundation-installation/index";

/** The installation root, and the record's location inside it. */
export interface NodeOperationalStateStoreOptions {
  /** The installation's root — the boundary the record may never leave. */
  readonly root: string;
  /** The record's absolute path, resolved through the installation path authority by the caller. */
  readonly file: string;
}

export class NodeOperationalStateStore implements InstallationOperationalStateStore {
  /** The record's absolute location, for diagnostics and for the establishment report. */
  readonly file: string;

  private readonly root: string;

  constructor(options: NodeOperationalStateStoreOptions) {
    this.root = path.resolve(options.root);
    this.file = path.resolve(options.file);
    // The boundary is decided by the RELATIVE path, not by string prefixes: a root may legitimately end in
    // a separator (a filesystem root, for instance), and comparing prefixes would then refuse a record that
    // is genuinely inside it — or, worse, admit one that is not.
    const inside = path.relative(this.root, this.file);
    if (inside === "" || inside.startsWith("..") || path.isAbsolute(inside)) {
      throw new Error(
        `FOUNDATION-B4B: the operational record would live at ${this.file}, outside the installation root ` +
          `(${this.root}). An installation's record is INSTALLATION-LOCAL: it describes this installation ` +
          "and is never stored anywhere else.",
      );
    }
  }

  /** The stored record exactly as written, or `null` when this installation has no record yet. */
  async read(): Promise<unknown | null> {
    if (!existsSync(this.file)) return null;
    return JSON.parse(readFileSync(this.file, "utf8")) as unknown;
  }

  /** Store a record the domain has already validated, whole. */
  async write(state: FoundationInstallationOperationalState): Promise<void> {
    writeFileSync(this.file, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }
}
