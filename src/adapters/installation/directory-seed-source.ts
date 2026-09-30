/**
 * THE AUTHORED INSTALLATION MATERIAL, READ FROM A DIRECTORY (FOUNDATION-B4B)
 * ==========================================================================
 *
 * The seed establishment materialises: one capsule's worth of authored material — `site.config.json`,
 * `config/i18n/**`, `content/**` — supplied by whoever is establishing the installation. Reading it is
 * deliberately dull: every regular file beneath the directory, verbatim, with links refused. What the seed
 * MUST and MUST NOT contain is a domain rule, applied by the use case
 * (`@/core/foundation-installation/establishment`), not a reading policy.
 *
 * It reads and never writes, and it remembers nothing, so a seed directory may be another installation's
 * authored material, a template, or an export — the new installation inherits the AUTHORED material and
 * nothing else, and the source becomes irrelevant the moment establishment completes.
 */
import path from "node:path";

import type { FoundationContentFile, FoundationInstallationSeedSource } from "@/application/foundation-establishment-ports";

import { readContentFiles } from "./node-content-files";

/** The directory holding the authored installation material. */
export interface DirectorySeedSourceOptions {
  /** The absolute (or resolvable) directory holding the authored capsule material. */
  readonly seedDirectory: string;
}

export class DirectorySeedSource implements FoundationInstallationSeedSource {
  readonly description: string;

  private readonly seedDirectory: string;

  constructor(options: DirectorySeedSourceOptions) {
    this.seedDirectory = path.resolve(options.seedDirectory);
    this.description = `an authored installation capsule (${this.seedDirectory})`;
  }

  /** The authored material, verbatim, root-relative and byte-wise ordered. */
  async files(): Promise<readonly FoundationContentFile[]> {
    return readContentFiles(this.seedDirectory);
  }
}
