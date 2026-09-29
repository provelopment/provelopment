/**
 * FOUNDATION-UI1-A2 — THE PRE-PAINT SIDEBAR PREFERENCE BRIDGE (contract + hand-off).
 *
 * The defect this task repairs is a VISUAL LIFECYCLE defect — a stored OPEN preference painted the canonical
 * CLOSED rail first and expanded it after hydration — so its proof is a BROWSER scenario
 * (`tests/browser/matrix.mjs` → `runSidebarStateScenario`, and the production-mode proof). What can be
 * proved WITHOUT a browser, and what those scenarios then rely on, is the contract underneath them:
 *
 *   · ONE AUTHORITY — the key, the vocabulary and the boot marker are declared once in the sibling contract
 *     module (`src/components/ui/sidebar-contract.ts`) and consumed by BOTH readers (the pre-paint bridge
 *     and the runtime), so no second copy of the key can drift from the first;
 *   · THE BRIDGE APPLIES ONLY THE OPEN PREFERENCE, synchronously, from the SAME key and vocabulary — and for
 *     a missing, invalid or unreadable preference it applies nothing at all, which is the canonical CLOSED
 *     state (blocked storage must never break rendering);
 *   · THE BRIDGE WRITES NOTHING — it is not a second durable state system, and it touches exactly one inert
 *     document attribute;
 *   · THE HAND-OFF EXISTS — the runtime can relinquish the marker, and relinquishing it is idempotent and
 *     never throws, so the rail's own state is the only authority after the first runtime commit.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { afterEach, describe, expect, it } from "vitest";

import {
  SIDEBAR_PREFERENCE_ATTRIBUTE,
  SIDEBAR_PREFERENCE_STORAGE_KEY,
  SIDEBAR_PREFERENCES,
  isSidebarPreference,
  relinquishSidebarPreferenceBoot,
  sidebarPreferenceBootScript,
} from "@/components/ui/sidebar-preference";
import {
  SIDEBAR_PREFERENCE_ATTRIBUTE as CORE_ATTRIBUTE,
  SIDEBAR_PREFERENCE_STORAGE_KEY as CORE_KEY,
  sidebarPreferenceBootScript as coreBootScript,
} from "@/components/ui/sidebar-contract";

const SOURCE_ROOT = path.resolve(__dirname, "../../src");
const readSource = (relative: string) => readFileSync(path.join(SOURCE_ROOT, relative), "utf8");

/** The two modules that read the ONE contract: the runtime, and the contract module the bridge is built in. */
const RUNTIME_SOURCE = readSource("components/ui/sidebar-preference.ts");
const CONTRACT_SOURCE = readSource("components/ui/sidebar-contract.ts");
/** A minimal document stand-in: the ONE element the bridge and the hand-off touch. */
interface ElementStub {
  readonly attributes: Map<string, string>;
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
}

function elementStub(initial: Record<string, string> = {}): ElementStub {
  const attributes = new Map(Object.entries(initial));
  return {
    attributes,
    getAttribute: (name) => (attributes.has(name) ? (attributes.get(name) as string) : null),
    setAttribute: (name, value) => {
      attributes.set(name, String(value));
    },
    removeAttribute: (name) => {
      attributes.delete(name);
    },
  };
}

interface StorageStub {
  readonly writes: Array<{ key: string; value: string }>;
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

function storageStub(stored: Record<string, string> | null, { blocked = false } = {}): StorageStub {
  const data = new Map(Object.entries(stored ?? {}));
  const writes: Array<{ key: string; value: string }> = [];
  return {
    writes,
    getItem: (key) => {
      if (blocked) throw new Error("storage is blocked");
      return data.has(key) ? (data.get(key) as string) : null;
    },
    setItem: (key, value) => {
      if (blocked) throw new Error("storage is blocked");
      writes.push({ key, value: String(value) });
      data.set(key, String(value));
    },
  };
}

/**
 * Run the bridge EXACTLY as a browser would: the script source, synchronously, in a document whose `<html>`
 * element already exists (that is the whole contract — the rail does not exist yet, which is the point).
 */
function runBootScript(storage: StorageStub): { element: ElementStub; threw: Error | null } {
  const element = elementStub();
  let threw: Error | null = null;
  try {
    vm.runInNewContext(sidebarPreferenceBootScript(), {
      window: { localStorage: storage },
      document: { documentElement: element },
    });
  } catch (error) {
    threw = error as Error;
  }
  return { element, threw };
}

const originalDocument = (globalThis as { document?: unknown }).document;

afterEach(() => {
  (globalThis as { document?: unknown }).document = originalDocument;
});

describe("UI1-A2 — one preference contract, two readers", () => {
  it("declares the key, the vocabulary and the boot marker in ONE authority, re-exported for the runtime", () => {
    expect(SIDEBAR_PREFERENCE_STORAGE_KEY).toBe(CORE_KEY);
    expect(SIDEBAR_PREFERENCE_ATTRIBUTE).toBe(CORE_ATTRIBUTE);
    expect(sidebarPreferenceBootScript).toBe(coreBootScript);
    expect(CORE_KEY).toBe("foundation.sidebar");
    expect([...SIDEBAR_PREFERENCES]).toEqual(["open", "closed"]);
    expect(CORE_ATTRIBUTE).toBe("data-ui-sidebar-preference");
  });

  it("keeps NO second copy of the key or the vocabulary in the runtime module", () => {
    // The runtime consumes the contract; a literal here would be a second authority waiting to drift.
    expect(RUNTIME_SOURCE).not.toContain('"foundation.sidebar"');
    expect(RUNTIME_SOURCE).not.toContain('["open", "closed"]');
    expect(RUNTIME_SOURCE).toContain('from "./sidebar-contract"');
    // …and the bridge is BUILT from the contract instead of spelling it out again.
    expect(CONTRACT_SOURCE).toContain("SIDEBAR_PREFERENCE_STORAGE_KEY");
    expect(CONTRACT_SOURCE).toContain("SIDEBAR_PREFERENCE_ATTRIBUTE");
    expect(CONTRACT_SOURCE).toContain("window.localStorage.getItem");
    // The contract is self-contained: the primitive layer may not reach into config, core, adapters or app.
    expect(CONTRACT_SOURCE).not.toMatch(/from ["']@\/(config|core|adapters|app)/);
    expect(CONTRACT_SOURCE).not.toMatch(/from ["'](react|next)/);
  });

  it("builds one small synchronous script that names the real key, vocabulary and marker", () => {
    const source = sidebarPreferenceBootScript();
    expect(source).toContain(JSON.stringify(SIDEBAR_PREFERENCE_STORAGE_KEY));
    expect(source).toContain(JSON.stringify(SIDEBAR_PREFERENCE_ATTRIBUTE));
    expect(source).toContain(JSON.stringify(SIDEBAR_PREFERENCES[0]));
    // A bootstrap that needs a kilobyte is a runtime, not a bridge.
    expect(source.length).toBeLessThan(400);
    // It is guarded: a blocking storage API can never break page execution.
    expect(source.startsWith("try{")).toBe(true);
    expect(source.endsWith("}catch(e){}")).toBe(true);
  });
});

describe("UI1-A2 — the bridge applies the OPEN preference, and nothing else", () => {
  it("marks the document OPEN when — and only when — the visitor stored `open`", () => {
    const open = runBootScript(storageStub({ [CORE_KEY]: "open" }));
    expect(open.threw).toBeNull();
    expect(open.element.getAttribute(CORE_ATTRIBUTE)).toBe("open");
    // Exactly one attribute, exactly one value: the marker IS the vocabulary.
    expect([...open.element.attributes.keys()]).toEqual([CORE_ATTRIBUTE]);
    expect(isSidebarPreference(open.element.getAttribute(CORE_ATTRIBUTE))).toBe(true);

    const unusableStored: Array<Record<string, string> | null> = [
      null,
      {},
      { [CORE_KEY]: "closed" },
      { [CORE_KEY]: "compact" },
      { [CORE_KEY]: "" },
      { [CORE_KEY]: "OPEN" },
    ];
    for (const stored of unusableStored) {
      const result = runBootScript(storageStub(stored));
      expect(result.threw, JSON.stringify(stored)).toBeNull();
      expect(result.element.attributes.size, JSON.stringify(stored)).toBe(0);
    }
  });

  it("writes nothing, anywhere: it is not a second durable state system", () => {
    const storage = storageStub({ [CORE_KEY]: "open" });
    const { element } = runBootScript(storage);
    expect(storage.writes).toEqual([]);
    expect(element.attributes.size).toBe(1);
  });

  it("fails safe when storage is blocked: no marker, no throw, rendering untouched", () => {
    const blocked = runBootScript(storageStub({ [CORE_KEY]: "open" }, { blocked: true }));
    expect(blocked.threw).toBeNull();
    expect(blocked.element.attributes.size).toBe(0);
  });
});

describe("UI1-A2 — the runtime releases the bridge", () => {
  it("removes the boot marker from the document, idempotently", () => {
    const element = elementStub();
    (globalThis as { document?: unknown }).document = { documentElement: element };
    element.setAttribute(CORE_ATTRIBUTE, "open");
    relinquishSidebarPreferenceBoot();
    expect(element.getAttribute(CORE_ATTRIBUTE)).toBeNull();
    // Calling it again (or on a document that never carried the marker) is a no-op, never an error.
    expect(() => relinquishSidebarPreferenceBoot()).not.toThrow();
    expect(element.attributes.size).toBe(0);
  });

  it("never throws when there is no document to relinquish it from", () => {
    (globalThis as { document?: unknown }).document = undefined;
    expect(() => relinquishSidebarPreferenceBoot()).not.toThrow();
  });
});
