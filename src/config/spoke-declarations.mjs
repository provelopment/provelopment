/**
 * THE INSTALLATION'S DECLARED SPOKE ROOTS — ONE AUTHORITY (FOUNDATION-MULTISITE-S3E1C/S3F1)
 * =======================================================================================
 *
 * ONE question, answered once for every consumer that must answer it:
 *
 *     given an Installation root, which Spokes does it declare, and where is each one authored?
 *
 * An Installation declares its Spokes in ONE authored manifest at its own root:
 *
 *     <InstallationRoot>/spokes.json     { "spokes": [ { "id": "…", "root": "spokes/…" } ] }
 *     <InstallationRoot>/spokes/…        the declared Spoke roots (the DEDICATED namespace)
 *
 * LEGACY IS THE ABSENCE OF A MANIFEST
 * -----------------------------------
 *
 *   no `spokes.json`       LEGACY IMPLICIT: the Installation root IS the implicit Spoke root, and its
 *                          single Spoke carries the reserved `IMPLICIT_SPOKE_ID`.
 *   `spokes.json` present  EXPLICIT: the manifest's entries (1..*) are the Installation's Spokes.
 *   BOTH authored          REFUSED — never a precedence rule, never a silent migration.
 *   NEITHER authored       REFUSED — an Installation root must be authored one way.
 *
 * WHY THIS MODULE IS PLAIN ESM, AND WHY IT EXISTS AT ALL
 * ------------------------------------------------------
 * The TypeScript authority (`./spoke-roots.ts`) and the BUILD selection seam
 * (`./deployment-build.mjs`) must agree about which authored roots exist — a build that selected a root the
 * configuration/domain layer would refuse could serve material the platform considers invalid. TypeScript
 * cannot be executed by the plain-Node seam, so the CONTRACT lives here in ONE implementation that both
 * consume, rather than in two that drift. This is the smallest such seam: declaration parsing, the identity
 * rules (shared with the domain, `../core/spoke/spoke-id.mjs`), the locator rules, and physical root
 * containment. It composes no Spoke, builds no Hub, resolves no Site, and knows nothing about hostnames,
 * Sites, dictionaries, pages, assets or runtime namespaces.
 *
 * IDENTITY SEMANTICS ARE NOT RESTATED HERE
 * ----------------------------------------
 * Non-blank ids, the reserved implicit identity and duplicate ids come from the pure domain module, which
 * this one imports — so the configuration layer, the build seam and the domain cannot disagree about what
 * an acceptable id is.
 *
 * SERVER/BUILD ONLY: this module reads the filesystem.
 */
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

import { IMPLICIT_SPOKE_ID, spokeCollectionIssues } from "../core/spoke/spoke-id.mjs";
import { normalizeHostname } from "../core/spoke/hostname.mjs";

/** The authored manifest an Installation may carry at its own root. */
export const INSTALLATION_SPOKE_COLLECTION_FILE_NAME = "spokes.json";

/**
 * The DEDICATED NAMESPACE every explicitly declared Spoke root lives in: `<InstallationRoot>/spokes/`.
 *
 * An architectural OWNERSHIP boundary, not a suggested directory name: a manifest locator must be spelled
 * beneath it AND must resolve physically beneath it, so authored website material can never be planted
 * among the Installation's configuration, content or tooling. The id stays independent of the spelling
 * (`{ "id": "foundation", "root": "spokes/foundation-web" }` is valid), and membership comes from the
 * MANIFEST alone: a directory here that no entry names is inert.
 */
export const SPOKE_ROOTS_DIRECTORY_NAME = "spokes";

/** The authored configuration file a declared Spoke root must carry (the root-level contract). */
export const SPOKE_CONFIG_FILE_NAME = "site.config.json";

/**
 * THE MANIFEST'S STRUCTURAL CONTRACT — STRICT, and exactly the leaves a declaration may author.
 *
 * FIVE kinds of leaf, and no others:
 *
 *   `spokes`           the declared Spoke roots, each an `id`, a `root` locator and — OPTIONALLY — the
 *                      exact ADDITIONAL hostnames that Spoke answers for (`hostAliases`, WEB-1 owner
 *                      requirement 6). An additional claim never changes the Spoke's canonical origin:
 *                      `site.url` stays the origin every canonical URL, sitemap entry and social card is
 *                      built from, and an alias is a ROUTING claim only.
 *   `spokeSwitcher`    OPTIONAL: THE HUB-SCOPED SPOKE SWITCHER — the ORDERED list of members of ONE Hub
 *                      (`options`, each naming a `spokeId`, the `label` they read and the absolute HTTPS
 *                      `href` they travel to).
 *
 *                      ONE INSTALLATION IS ONE HUB for organizational/navigation purposes, and every Spoke
 *                      this manifest declares is a MEMBER of that Hub. The switcher may therefore offer
 *                      ONLY declared members, and every option must lead back to the member it names —
 *                      through that member's canonical origin, one of its additional hostname claims, or an
 *                      inspection hostname this Installation's policy nominates for it.
 *
 *                      A hostname or domain SUFFIX does not determine membership: a Spoke is a member
 *                      because it is DECLARED HERE, never because it shares a name with one. An unrelated
 *                      organization's site is not switchable merely because its URL could be authored —
 *                      it belongs to another Hub/Installation, and there is no second registry to consult
 *                      (the routing check above IS the enforcement mechanism).
 *
 *                      This is navigation between Spokes — a dimension of its own, never the within-Spoke
 *                      Site selector, and never an arbitrary external link list. It is also not a
 *                      template/provisioning lineage: a site generated or updated from a centrally managed
 *                      template is still its OWN Hub/Installation unless it is declared as a member here.
 *   `inspectionSpoke`  OPTIONAL: the ONE Spoke that represents this Installation when it is
 *                      reached through an accepted hosting-platform INSPECTION hostname
 *                      (a Vercel deployment/branch URL). It is an EXPLICIT policy, never a
 *                      first-declared or manifest-order fallback — which is why it is stated
 *                      here, beside the declaration, instead of being derived from it.
 *   `inspectionHosts`  OPTIONAL: the deployment-owned INSPECTION ALIASES — exact hostnames this
 *                      Installation answers for even though no Spoke owns them as a public domain
 *                      (a hosting provider's PERMANENT project alias, for instance, which is a
 *                      first-party surface of this project but is not one of the deployment-specific
 *                      hostnames the provider reports to a build). Each one selects the Spoke the
 *                      `inspectionSpoke` policy nominates. NEVER a wildcard, a suffix or a
 *                      provider-wide rule: an unrelated project's hostname, a team hostname and a
 *                      name that merely CONTAINS ours stay unclaimed, and the request boundary
 *                      answers them with nothing.
 *
 * Identity semantics (non-blank, the reserved id, uniqueness) are NOT restated here — they belong to the
 * pure domain (`../core/spoke/spoke-id.mjs`), so configuration and the domain cannot drift apart. The
 * HOSTNAME rules are not restated either: they belong to `../core/spoke/hostname.mjs`, which this seam
 * consumes and which the request boundary consumes too. This validator does STRUCTURAL typing only,
 * exactly as the zod schema it replaces did; that the policy NAMES a declared Spoke, that the aliases
 * are exact normalized hostnames and that a policy without a nominated Spoke means nothing are semantic
 * checks the resolver makes, where the declared set and the hostname authority are at hand.
 *
 * WHY IT IS HAND-ROLLED, NOT ZOD: this seam is loaded by the platform's own Node tooling, and a
 * RELEASE must run that tooling in an installation with NO third-party packages at all
 * (`tests/integration/foundation-installation-bootstrap.test.ts` proves the self-containment). The
 * platform's runtime `zod` dependency is therefore not available to it, so the seam keeps the same
 * STRICT shape and the same message vocabulary in a few explicit checks — one implementation, no
 * package. The `{ success, data, error: { issues } }` surface is the minimal one its callers use (this
 * module's own resolver and the S3C1 acceptance suite), with `issues` shaped like a zod issue list.
 *
 * @type {{ safeParse: (raw: unknown) => { success: true, data: { spokes: { id: string, root: string, hostAliases: string[] }[], inspectionSpoke: string | null, inspectionHosts: string[], spokeSwitcher: { options: { spokeId: string, label: string, href: string }[] } | null } } |
 *   { success: false, error: { issues: { path: (string|number)[], message: string }[] } } }}
 */
export const installationSpokeCollectionSchema = {
  safeParse(raw) {
    /** @type {{ path: (string|number)[], message: string }[]} */
    const issues = [];
    const unrecognized = (value, allowed, at) => {
      for (const key of Object.keys(value)) {
        if (!allowed.includes(key)) issues.push({ path: at, message: `Unrecognized key: "${key}"` });
      }
    };

    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return {
        success: false,
        error: { issues: [{ path: [], message: "Invalid input: expected object" }] },
      };
    }

    unrecognized(raw, ["spokes", "inspectionSpoke", "inspectionHosts", "spokeSwitcher"], []);
    if (!Array.isArray(raw.spokes)) {
      issues.push({ path: ["spokes"], message: "Invalid input: expected array" });
      return { success: false, error: { issues } };
    }

    // OPTIONAL, and structural only: `null` states "this Installation declares no inspection policy".
    /** @type {string | null} */
    let inspectionSpoke = null;
    if (raw.inspectionSpoke !== undefined && raw.inspectionSpoke !== null) {
      if (typeof raw.inspectionSpoke !== "string") {
        issues.push({ path: ["inspectionSpoke"], message: "Invalid input: expected string" });
      } else {
        inspectionSpoke = raw.inspectionSpoke;
      }
    }

    // OPTIONAL, and structural only — exactly like `inspectionSpoke`: the deployment-owned inspection
    // ALIASES this Installation answers for on hosts no Spoke owns publicly. WHETHER each value is an
    // exact hostname, and whether a policy with no nominated Spoke can mean anything, are semantic
    // checks the resolver makes below.
    /** @type {string[]} */
    const inspectionHosts = [];
    if (raw.inspectionHosts !== undefined && raw.inspectionHosts !== null) {
      if (!Array.isArray(raw.inspectionHosts)) {
        issues.push({ path: ["inspectionHosts"], message: "Invalid input: expected array" });
      } else {
        raw.inspectionHosts.forEach((value, index) => {
          if (typeof value !== "string") {
            issues.push({ path: ["inspectionHosts", index], message: "Invalid input: expected string" });
          } else {
            inspectionHosts.push(value);
          }
        });
      }
    }

    // OPTIONAL, and structural only — THE CROSS-SPOKE SWITCHER (WEB-1 owner requirement 1): the ORDERED
    // list of Spokes a visitor may switch BETWEEN, each naming a Spoke, the label they read and the
    // absolute origin they travel to. Order is authored data and is preserved exactly; nothing here
    // infers an order from the manifest, a directory or a filesystem listing.
    //
    // WHETHER an option's destination actually ROUTES to the Spoke it names — through that Spoke's
    // canonical hostname, one of its ADDITIONAL claims, or an inspection hostname the policy nominates —
    // is a ROUTING question, so it is decided by the build's routing authority (`./spoke-host-routing.mjs`),
    // where every claim is at hand. This seam keeps the same division it keeps everywhere: STRUCTURAL typing
    // here, semantics where the authorities are.
    /** @type {{ options: { spokeId: string, label: string, href: string }[] } | null} */
    let spokeSwitcher = null;
    if (raw.spokeSwitcher !== undefined && raw.spokeSwitcher !== null) {
      if (typeof raw.spokeSwitcher !== "object" || Array.isArray(raw.spokeSwitcher)) {
        issues.push({ path: ["spokeSwitcher"], message: "Invalid input: expected object" });
      } else {
        unrecognized(raw.spokeSwitcher, ["options"], ["spokeSwitcher"]);
        if (!Array.isArray(raw.spokeSwitcher.options)) {
          issues.push({ path: ["spokeSwitcher", "options"], message: "Invalid input: expected array" });
        } else {
          /** @type {{ spokeId: string, label: string, href: string }[]} */
          const options = [];
          raw.spokeSwitcher.options.forEach((option, index) => {
            const at = ["spokeSwitcher", "options", index];
            if (option === null || typeof option !== "object" || Array.isArray(option)) {
              issues.push({ path: at, message: "Invalid input: expected object" });
              return;
            }
            unrecognized(option, ["spokeId", "label", "href"], at);
            /** @type {{ spokeId?: string, label?: string, href?: string }} */
            const typed = {};
            let complete = true;
            for (const leaf of ["spokeId", "label", "href"]) {
              if (typeof option[leaf] !== "string") {
                issues.push({ path: [...at, leaf], message: "Invalid input: expected string" });
                complete = false;
              } else {
                typed[leaf] = option[leaf];
              }
            }
            if (complete) options.push(/** @type {{ spokeId: string, label: string, href: string }} */ (typed));
          });
          spokeSwitcher = { options };
        }
      }
    }

    /** @type {{ id: string, root: string, hostAliases: string[] }[]} */
    const declared = [];
    raw.spokes.forEach((entry, index) => {
      const at = ["spokes", index];
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        issues.push({ path: at, message: "Invalid input: expected object" });
        return;
      }
      unrecognized(entry, ["id", "root", "hostAliases"], at);
      const idIsString = typeof entry.id === "string";
      const rootIsString = typeof entry.root === "string";
      if (!idIsString) issues.push({ path: [...at, "id"], message: "Invalid input: expected string" });
      if (!rootIsString) issues.push({ path: [...at, "root"], message: "Invalid input: expected string" });
      // OPTIONAL, and structural only — the Spoke's ADDITIONAL hostname claims (WEB-1 owner requirement 6):
      // exact hostnames this Spoke answers for IN ADDITION to its canonical one, which stays the origin
      // every canonical URL, sitemap entry and social card is built from. WHETHER each value is an exact
      // hostname, and whether it collides with another Spoke's claim or with an inspection hostname, are
      // checks the authorities make below and in `./spoke-host-routing.mjs` — never restated here.
      /** @type {string[]} */
      const hostAliases = [];
      if (entry.hostAliases !== undefined && entry.hostAliases !== null) {
        if (!Array.isArray(entry.hostAliases)) {
          issues.push({ path: [...at, "hostAliases"], message: "Invalid input: expected array" });
        } else {
          entry.hostAliases.forEach((value, aliasIndex) => {
            if (typeof value !== "string") {
              issues.push({
                path: [...at, "hostAliases", aliasIndex],
                message: "Invalid input: expected string",
              });
            } else {
              hostAliases.push(value);
            }
          });
        }
      }
      if (idIsString && rootIsString) declared.push({ id: entry.id, root: entry.root, hostAliases });
    });

    return issues.length > 0
      ? { success: false, error: { issues } }
      : { success: true, data: { spokes: declared, inspectionSpoke, inspectionHosts, spokeSwitcher } };
  },
};

function renderIssues(issues) {
  return issues.map((issue) => `  - ${issue}`).join("\n");
}

/**
 * The lexical rules for an authored locator: relative, POSIX-style, free of `..`, and located BENEATH the
 * dedicated `spokes/` namespace — which is an ownership boundary, so the container itself is not a Spoke
 * root and a misspelled namespace is not a namespace.
 *
 * @param {string} locator the authored locator
 * @param {string} where the message's subject
 * @returns {string|null} the issue, or `null` when the locator is acceptable
 */
function locatorIssue(locator, where) {
  if (locator.trim() === "") return `${where}: root must not be empty`;
  if (path.isAbsolute(locator) || locator.startsWith("/") || /^[A-Za-z]:/.test(locator)) {
    return `${where}: root "${locator}" must be root-relative, not absolute`;
  }
  if (locator.includes("\\")) {
    return `${where}: root "${locator}" must use POSIX "/" separators`;
  }
  const segments = locator.split("/");
  if (segments.includes("..")) {
    return `${where}: root "${locator}" must not contain a ".." segment`;
  }
  if (segments[0] !== SPOKE_ROOTS_DIRECTORY_NAME) {
    return (
      `${where}: root "${locator}" must live beneath the dedicated ` +
      `"${SPOKE_ROOTS_DIRECTORY_NAME}/" namespace`
    );
  }
  if (segments.slice(1).every((segment) => segment === "")) {
    return (
      `${where}: root "${locator}" must name a Spoke root INSIDE ` +
      `"${SPOKE_ROOTS_DIRECTORY_NAME}/" — the namespace itself is not a Spoke root`
    );
  }
  return null;
}

/** Is `target` inside `root` (both already REAL/resolved) — the ONE containment rule. */
function isInside(root, target) {
  const relative = path.relative(root, target);
  return !(relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative));
}

/**
 * The Spokes ONE Installation root declares, or a descriptive, build-time-loud failure.
 *
 * `installationRoot` is an INPUT: this function never discovers a root of its own (no `process.cwd()`, no
 * environment, no layout) — the Installation is already selected by the ONE build authority.
 *
 * @param {string} installationRoot the Installation root to describe
 * @returns {{ mode: "legacy"|"explicit", installationRoot: string, manifestFile: string|null,
 *   inspectionSpoke: string|null, declarations: { id: string, locator: string|null, root: string }[] }}
 */
export function resolveSpokeDeclarations(installationRoot) {
  const root = path.resolve(installationRoot);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(
      `FOUNDATION-MULTISITE-S3C1: the Installation root "${root}" is not an existing directory.`,
    );
  }

  const manifestFile = path.join(root, INSTALLATION_SPOKE_COLLECTION_FILE_NAME);
  const configFile = path.join(root, SPOKE_CONFIG_FILE_NAME);
  const hasManifest = existsSync(manifestFile);
  const hasConfig = existsSync(configFile);

  if (hasManifest && hasConfig) {
    throw new Error(
      `FOUNDATION-MULTISITE-S3C1: the Installation root "${root}" is authored SIMULTANEOUSLY in both ` +
        `forms: it carries "${SPOKE_CONFIG_FILE_NAME}" (legacy implicit Spokes) and ` +
        `"${INSTALLATION_SPOKE_COLLECTION_FILE_NAME}" (an explicit Spoke collection). An Installation ` +
        `is authored one way or the other: move the website material into its declared Spoke root and ` +
        `remove "${SPOKE_CONFIG_FILE_NAME}", or remove ` +
        `"${INSTALLATION_SPOKE_COLLECTION_FILE_NAME}". No precedence rule exists and nothing is migrated.`,
    );
  }

  if (!hasManifest && !hasConfig) {
    throw new Error(
      `FOUNDATION-MULTISITE-S3C1: the Installation root "${root}" is authored NEITHER way: it carries ` +
        `neither "${SPOKE_CONFIG_FILE_NAME}" (legacy implicit Spokes) nor ` +
        `"${INSTALLATION_SPOKE_COLLECTION_FILE_NAME}" (an explicit Spoke collection). A build must ` +
        "resolve exactly one deployment; nothing falls back silently.",
    );
  }

  if (!hasManifest) {
    return {
      mode: "legacy",
      installationRoot: root,
      manifestFile: null,
      // A legacy implicit Spoke has no manifest to declare a policy in, and one Spoke answers every host.
      inspectionSpoke: null,
      inspectionHosts: [],
      declarations: [{ id: IMPLICIT_SPOKE_ID, locator: null, root, hostAliases: [] }],
      // A switcher between Spokes is authored in the manifest this Installation does not carry.
      spokeSwitcher: null,
    };
  }

  return resolveExplicitSpokeDeclarations(root, manifestFile);
}

/**
 * Every Spoke an EXPLICIT manifest declares, resolved and validated — or an itemised failure naming each
 * unacceptable entry. The manifest is an ASSERTION about the Installation: every entry must be true.
 *
 * @param {string} root the resolved Installation root
 * @param {string} manifestFile the manifest's absolute path
 * @returns {{ mode: "explicit", installationRoot: string, manifestFile: string,
 *   declarations: { id: string, locator: string, root: string }[] }}
 */
function resolveExplicitSpokeDeclarations(root, manifestFile) {
  const invalid = (issues) =>
    new Error(`Invalid Installation Spoke collection (${manifestFile}):\n${renderIssues(issues)}`);

  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(readFileSync(manifestFile, "utf8"));
  } catch (error) {
    throw new Error(
      `FOUNDATION-MULTISITE-S3C1: "${manifestFile}" is not valid JSON: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const parsed = installationSpokeCollectionSchema.safeParse(raw);
  if (!parsed.success) {
    throw invalid(
      parsed.error.issues.map((issue) => {
        const where = issue.path.join(".") || "(root)";
        return `${where}: ${issue.message}`;
      }),
    );
  }

  const declarations = parsed.data.spokes;
  // IDENTITY semantics come from the pure domain — never restated here.
  const issues = [...spokeCollectionIssues(declarations.map((entry) => entry.id))];

  const realRoot = realpathSync(root);
  /** @type {Map<string, { index: number, locator: string }>} */
  const seen = new Map();
  /** @type {{ id: string, locator: string, root: string }[]} */
  const declared = [];

  declarations.forEach((entry, index) => {
    const where = `Spoke #${index + 1} ("${entry.id}")`;
    const lexical = locatorIssue(entry.root, where);
    if (lexical !== null) {
      issues.push(lexical);
      return;
    }

    const resolved = path.resolve(root, entry.root);
    if (!existsSync(resolved)) {
      issues.push(`${where}: root "${entry.root}" does not exist`);
      return;
    }
    if (!statSync(resolved).isDirectory()) {
      issues.push(`${where}: root "${entry.root}" is not a directory`);
      return;
    }

    // PHYSICAL containment, in TWO steps: the Installation root must not be escaped at all, and the
    // boundary that actually owns Spoke roots is the DEDICATED CONTAINER — so the container itself may
    // not be a link out, and a link inside `spokes/` may not reach material elsewhere in the
    // Installation.
    const realResolved = realpathSync(resolved);
    if (!isInside(realRoot, realResolved)) {
      issues.push(
        `${where}: root "${entry.root}" resolves outside the Installation root — a Spoke root must ` +
          "be authored inside it",
      );
      return;
    }
    const realContainer = realpathSync(path.join(root, SPOKE_ROOTS_DIRECTORY_NAME));
    if (!isInside(realContainer, realResolved)) {
      issues.push(
        `${where}: root "${entry.root}" resolves outside the dedicated ` +
          `"${SPOKE_ROOTS_DIRECTORY_NAME}/" namespace`,
      );
      return;
    }
    if (!existsSync(path.join(resolved, SPOKE_CONFIG_FILE_NAME))) {
      issues.push(`${where}: root "${entry.root}" carries no "${SPOKE_CONFIG_FILE_NAME}"`);
      return;
    }

    const previous = seen.get(realResolved);
    if (previous !== undefined) {
      issues.push(
        `${where}: root "${entry.root}" resolves to the same directory as Spoke #${previous.index} ` +
          `("${previous.locator}") — two Spokes cannot share one authored root`,
      );
      return;
    }
    seen.set(realResolved, { index: index + 1, locator: entry.root });

    // THE SPOKE'S ADDITIONAL CLAIMS (WEB-1 owner requirement 6) — resolved and validated HERE, where the
    // Spoke they belong to is known, so every diagnostic can name it. Each one must be an EXACT hostname in
    // the ONE normalized spelling (never a wildcard, a suffix rule, a URL or a path — recognition at the
    // boundary is exact equality), and a Spoke may not state the same alias twice: a duplicate would read
    // as two claims while being one.
    const accepted = [];
    for (const value of entry.hostAliases) {
      const issue = exactHostnameIssue(value, `${where}: `, "hostAliases");
      if (issue !== null) {
        issues.push(issue);
        continue;
      }
      if (accepted.includes(value)) {
        issues.push(`${where}: hostAliases states "${value}" more than once`);
        continue;
      }
      accepted.push(value);
    }

    declared.push({ id: entry.id, locator: entry.root, root: resolved, hostAliases: accepted });
  });

  if (issues.length > 0) throw invalid(issues);

  const declaredIds = declared.map((entry) => entry.id);
  const inspectionSpoke = parsed.data.inspectionSpoke;

  // §29/§30 — THE POLICY NAMES A DECLARED SPOKE, or the Installation is refused HERE (a configuration
  // error at build time) rather than falling back to "the first Spoke" at request time. An absent policy
  // stays absent: no Spoke is ever chosen implicitly.
  if (inspectionSpoke !== null && !declaredIds.includes(inspectionSpoke)) {
    throw invalid([
      `inspectionSpoke: "${inspectionSpoke}" is not one of the declared Spokes ` +
        `(${declaredIds.map((id) => `"${id}"`).join(", ")}). The Spoke that represents this ` +
        "Installation on an accepted hosting-platform inspection hostname must be declared here, " +
        "by identity — there is no default.",
    ]);
  }

  // THE POLICY'S ALIASES (M22 correction). `inspectionHosts` names hosts that no Spoke owns publicly but
  // that ARE first-party surfaces of this project — a hosting provider's PERMANENT project alias, for
  // example, which is not one of the deployment-specific hostnames the provider reports to a build. Two
  // consequences are semantic, and both are refused HERE, at build time, rather than becoming a
  // request-time surprise:
  //
  //   · aliases with no nominated Spoke could never select anything — a silent no-op, so they are
  //     refused instead of authored hopefully;
  //   · each alias must be an EXACT hostname in the ONE normalized spelling. The rule comes from the pure
  //     domain (`../core/spoke/hostname.mjs`), never a copy of it, and it is why a wildcard (`*.x`), a
  //     URL, a path or a differently spelled hostname cannot be declared: recognition is exact, so a
  //     second spelling would be a SECOND hostname that no request ever carries.
  const inspectionHosts = [];
  const authoredHosts = parsed.data.inspectionHosts;

  if (authoredHosts.length > 0 && inspectionSpoke === null) {
    throw invalid([
      `inspectionHosts: ${authoredHosts.length} inspection alias hostname(s) are declared, but the ` +
        "collection declares no \"inspectionSpoke\" — an alias selects the Spoke the policy nominates, " +
        "so without one nothing could ever answer on it. State which Spoke represents this Installation " +
        "there, or remove the aliases.",
    ]);
  }

  for (const value of authoredHosts) {
    const issue = inspectionAliasIssue(value);
    if (issue !== null) {
      issues.push(issue);
      continue;
    }
    if (inspectionHosts.includes(value)) {
      issues.push(`inspectionHosts: the hostname "${value}" is stated more than once`);
      continue;
    }
    inspectionHosts.push(value);
  }

  if (issues.length > 0) throw invalid(issues);

  // §7/§8 — THE HUB-SCOPED SPOKE SWITCHER'S IDENTITY RULES, decided where the declared Spokes are known:
    // ONE INSTALLATION IS ONE HUB, and these are its MEMBERS. Every option must NAME a declared member — the
    // membership boundary itself, so an unrelated organization (which belongs to another Hub/Installation)
    // can never be listed; no `hubId`, no second registry and no hostname-suffix rule exists or is needed.
    // No two options may name the same member or the same destination hostname, the label must say
    // something, and the destination must be an absolute HTTPS ORIGIN — a switcher travels to another
    // domain, so a relative path could not reach one, and a non-HTTPS origin is refused rather than silently
    // downgraded. WHETHER that origin actually ROUTES to the member the option names is a routing question,
    // refused by `./spoke-host-routing.mjs`.
  const authoredSwitcher = parsed.data.spokeSwitcher;
  /** @type {{ options: { spokeId: string, label: string, href: string }[] } | null} */
  let spokeSwitcher = null;
  if (authoredSwitcher !== null) {
    const seenSpokes = new Set();
    const seenHosts = new Set();
    for (const [index, option] of authoredSwitcher.options.entries()) {
      const where = `spokeSwitcher.options[${index}]`;
      if (!declaredIds.includes(option.spokeId)) {
        issues.push(
          `${where}: spokeId "${option.spokeId}" is not one of the declared Spokes ` +
            `(${declaredIds.map((id) => `"${id}"`).join(", ")}). A switcher between Spokes can only ` +
            "offer Spokes this Installation declares.",
        );
        continue;
      }
      if (option.label.trim() === "") {
        issues.push(`${where}: label must not be blank — it is what the visitor reads.`);
        continue;
      }
      const destination = switcherDestination(option.href);
      if (destination === null) {
        issues.push(
          `${where}: href "${option.href}" must be an absolute HTTPS origin such as ` +
            '"https://docs.example.test" — a switcher sends the visitor to ANOTHER domain, so a ' +
            "relative path, a non-HTTPS scheme, a path, a query or a fragment can never be one.",
        );
        continue;
      }
      if (seenSpokes.has(option.spokeId)) {
        issues.push(`${where}: spokeId "${option.spokeId}" is offered more than once`);
        continue;
      }
      if (seenHosts.has(destination.hostname)) {
        issues.push(
          `${where}: href "${option.href}" names a destination hostname another option already offers — ` +
            "two options would send the visitor to the same Spoke",
        );
        continue;
      }
      seenSpokes.add(option.spokeId);
      seenHosts.add(destination.hostname);
    }
    // ORDER IS AUTHORED DATA: the list is preserved exactly as written, never sorted, never derived.
    if (issues.length === 0) {
      spokeSwitcher = { options: authoredSwitcher.options.map((option) => ({ ...option })) };
    }
  }

  if (issues.length > 0) throw invalid(issues);

  return {
    mode: "explicit",
    installationRoot: root,
    manifestFile,
    inspectionSpoke,
    inspectionHosts,
    declarations: declared,
    spokeSwitcher,
  };
}

/**
 * The ONE rule set an authored inspection alias must satisfy, or `null` when it does.
 *
 * The hostname authority itself is NOT restated: `normalizeHostname` decides what a usable hostname is
 * and what its one spelling is. What is added here is the DECLARATION rule — an alias names ONE exact
 * host, so pattern syntax (`*`, `?`), URL syntax, a path or any other non-hostname spelling is refused
 * loudly rather than accepted as a rule nobody meant to write.
 *
 * @param {string} value the authored alias
 * @returns {string|null} the issue, or `null`
 */
function inspectionAliasIssue(value) {
  return exactHostnameIssue(value, "", "inspectionHosts");
}

/**
 * THE ONE EXACT-HOSTNAME DECLARATION RULE, shared by every authored hostname claim.
 *
 * Three authored hostname lists exist — a Spoke's ADDITIONAL claims (`hostAliases`), and the Installation's
 * inspection aliases (`inspectionHosts`) — and all of them mean the same thing: ONE exact host, recognized
 * by exact equality against the host of a request. So the rule is spelled ONCE, with the field name and an
 * optional subject supplied by the caller, rather than once per list: a wildcard, a suffix, a URL, a path,
 * a differently-cased or port-bearing spelling, or a blank value is refused in every one of them, and a
 * second implementation cannot drift.
 *
 * @param {string} value the authored hostname
 * @param {string} where the subject to name (e.g. `Spoke #2 ("docs"): `), or `""`
 * @param {string} field the authored field, named in the message
 * @returns {string|null} the issue, or `null`
 */
function exactHostnameIssue(value, where, field) {
  if (value.trim() === "") {
    return `${where}${field}: a hostname must not be blank`;
  }
  if (/[*?/#@\s]/.test(value) || value.includes("://")) {
    return (
      `${where}${field}: "${value}" is not an exact hostname — a wildcard, a URL or a path can never name ` +
      "one host, and recognition here is exact equality against the host of a request"
    );
  }
  const normalized = normalizeHostname(value);
  if (normalized === null) {
    return `${where}${field}: "${value}" is not a usable hostname`;
  }
  if (normalized !== value) {
    return (
      `${where}${field}: "${value}" must be spelled the normalized way, "${normalized}" — recognition is ` +
      "exact equality, so two spellings would be two different hostnames"
    );
  }
  return null;
}

/**
 * THE DESTINATION OF ONE SWITCHER OPTION, or `null` when the authored value is not an absolute HTTPS origin.
 *
 * A switcher sends a visitor to ANOTHER Spoke, and Spokes are distinguished by HOST, so the destination must
 * be a whole origin: no path, no query, no fragment (the target Spoke's own routing completes the visit from
 * its root, which is what "lands at the target Spoke's public entry point" means), and no scheme other than
 * HTTPS. A trailing `/` is the same origin spelled the one other way a URL allows, so it is accepted and
 * normalized away.
 *
 * @param {string} href the authored destination
 * @returns {{ origin: string, hostname: string } | null} the origin and its hostname, or `null`
 */
export function switcherDestination(href) {
  const trimmed = href.trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.pathname !== "/" && parsed.pathname !== "") return null;
  if (parsed.search !== "" || parsed.hash !== "") return null;
  const hostname = normalizeHostname(parsed.host);
  if (hostname === null) return null;
  return { origin: `https://${hostname}`, hostname };
}
