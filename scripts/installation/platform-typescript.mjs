/**
 * RUNNING THE PLATFORM'S OWN TYPE SCRIPT FROM PLAIN NODE (FOUNDATION-B4B)
 * =====================================================================
 *
 * Establishment is implemented ONCE, in TypeScript, in the platform the release ships
 * (`src/application/establish-foundation-installation.ts`, its ports and its Node adapters). An operator
 * surface must therefore be able to RUN that implementation from a plain `node` process, without adding a
 * bundler, a transpiler or a dependency to the platform — and without a second, plain-JavaScript copy of the
 * establishment logic, which would immediately be able to drift from the contract it implements.
 *
 * Node itself can execute erasable TypeScript. Two things it does not know how to resolve are the platform's
 * two module conventions, so this file teaches it exactly those two and nothing else:
 *
 *   `@/…`            the alias the whole platform uses for `src/…` (tsconfig `paths`, Next's resolver and
 *                    Vitest's alias all agree on it)
 *   extensionless    relative imports written the way TypeScript writes them, resolved to the `.ts` file
 *                    that exists
 *
 * RESOLUTION IS EXPLICIT, NEVER CLEVER: a specifier resolves to the first existing candidate file, and
 * anything else is handed to Node unchanged, which then fails loudly. Nothing is rewritten, no directory
 * index is invented, and no `.js` is fabricated for a `.ts` source — the same rules the compiler and the
 * bundlers already use, in twelve lines.
 *
 * CAPABILITY IS CHECKED, NOT ASSUMED: `process.features.typescript` is Node's own answer to "can this
 * runtime execute TypeScript?". If it cannot, this module says so in one sentence naming the requirement,
 * rather than letting an operator meet a stack trace from a loader.
 */
import path from "node:path";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The platform root this tooling belongs to — never `process.cwd()`, which a caller may be anywhere in. */
export const platformRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Node's own answer to "can I execute TypeScript?" (absent on runtimes that cannot). */
export function platformTypeScriptSupport() {
  return typeof process.features?.typescript === "string" ? process.features.typescript : "unsupported";
}

/** The one sentence to print when this runtime cannot execute the platform's TypeScript. */
export const PLATFORM_TYPESCRIPT_REQUIREMENT =
  "This command runs the platform's own TypeScript implementation, so it needs a Node runtime that can " +
  "execute erasable TypeScript (Node 22.18 or newer, or Node 23.6+; this process is " +
  `${process.version}). Upgrade Node, or run it with --experimental-strip-types on Node 22.6+ where that ` +
  "flag exists.";

const RESOLVER_SOURCE = `
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const platformSource = ${JSON.stringify(pathToFileURL(path.join(platformRoot, "src") + path.sep).href)};
const CANDIDATES = ["", ".ts", ".tsx", ".mts", ".mjs", ".js", "/index.ts", "/index.tsx"];

// A candidate must be a REAL FILE: a directory that happens to share the specifier's name is not a module,
// and handing one to Node produces an unreadable loader error instead of a resolution.
function existingFile(url) {
  if (url.protocol !== "file:") return null;
  const file = fileURLToPath(url);
  for (const extension of CANDIDATES) {
    const candidate = file + extension;
    if (existsSync(candidate) && statSync(candidate).isFile()) return pathToFileURL(candidate).href;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const resolved = existingFile(new URL(specifier.slice(2), platformSource));
    if (resolved !== null) return { url: resolved, shortCircuit: true };
  }
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const resolved = context.parentURL === undefined ? null : existingFile(new URL(specifier, context.parentURL));
    if (resolved !== null) return { url: resolved, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
`;

/**
 * Install the two resolution rules above for this process, then import one platform module by its path
 * inside the platform. Returns whatever the module exports.
 *
 * @param {string} relativePath a path inside the platform, e.g. `src/adapters/installation/establish.ts`
 */
export async function loadPlatformModule(relativePath) {
  const support = platformTypeScriptSupport();
  if (support !== "strip" && support !== "transform") {
    throw new Error(PLATFORM_TYPESCRIPT_REQUIREMENT);
  }

  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  // The resolver is written once per process into a task-owned temporary location: the resolver must not
  // become a tracked build artefact of the platform, and `register()` needs a real file URL.
  const directory = mkdtempSync(path.join(tmpdir(), "foundation-platform-runtime-"));
  const resolver = path.join(directory, "resolve.mjs");
  writeFileSync(resolver, RESOLVER_SOURCE, "utf8");
  register(pathToFileURL(resolver).href);
  try {
    return await import(pathToFileURL(path.join(platformRoot, relativePath)).href);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
