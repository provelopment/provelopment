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
  SIDEBAR_TOGGLE_CLASS,
  SIDEBAR_TOGGLE_OPEN_NAME_ATTRIBUTE,
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
    // A bootstrap that needs a kilobyte is a runtime, not a bridge. UI1-A3-A1 grew the script by the ONE
    // thing a stylesheet cannot express — applying the OPEN state's `aria-expanded` (and, when the control
    // declares one, its accessible name) to the disclosure controls as they appear — so the bound is the
    // literal rule this line always stated: still under a kilobyte, and still a bridge.
    expect(source.length).toBeLessThan(1024);
    // …and the addition is a bounded, mechanical application: the two contract hooks, no storage write, no
    // second vocabulary and no second state system.
    expect(source).toContain(JSON.stringify(SIDEBAR_TOGGLE_CLASS));
    expect(source).toContain(JSON.stringify(SIDEBAR_TOGGLE_OPEN_NAME_ATTRIBUTE));
    expect(source).not.toContain("setItem");
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
/**
 * UI1-A3-A1 — THE SEMANTIC HALF OF THE BRIDGE, WITHOUT A BROWSER.
 *
 * A3 made the control PRESENT the visitor's state before hydration; its semantics (`aria-expanded`, and the
 * accessible name when the control declares one) live in attributes a stylesheet cannot select, so the SAME
 * bridge applies them. These tests drive that application against stubs — every control, every content mode,
 * every unusable preference — and assert the three properties the design promises: it writes ONLY what the
 * runtime itself would render, it writes NOTHING when there is no OPEN preference, and it is TEMPORARY (the
 * observer is disconnected at DOMContentLoaded, so no parallel semantic authority survives the boot).
 */
interface ObserverStub {
  callback: () => void;
  observed: number;
  disconnected: boolean;
}

function runSemanticBootScript(
  storage: StorageStub,
  controls: Array<Record<string, string>>,
  { withObserver = true } = {},
) {
  const documentElement = elementStub();
  const elements = controls.map((initial) => elementStub(initial));
  const observers: ObserverStub[] = [];
  const listeners: string[] = [];
  let threw: Error | null = null;
  const MutationObserverStub = function (this: ObserverStub, callback: () => void) {
    this.callback = callback;
    this.observed = 0;
    this.disconnected = false;
    observers.push(this);
  } as unknown as new (callback: () => void) => ObserverStub;
  MutationObserverStub.prototype.observe = function (this: ObserverStub) {
    this.observed += 1;
  };
  MutationObserverStub.prototype.disconnect = function (this: ObserverStub) {
    this.disconnected = true;
  };
  try {
    vm.runInNewContext(sidebarPreferenceBootScript(), {
      window: { localStorage: storage },
      document: {
        documentElement,
        querySelectorAll: () => elements,
        addEventListener: (type: string) => {
          listeners.push(type);
        },
      },
      MutationObserver: withObserver ? MutationObserverStub : undefined,
    });
  } catch (error) {
    threw = error as Error;
  }
  return { documentElement, elements, observers, listeners, threw };
}




describe("UI1-A3-A1 — the bridge applies the OPEN state's SEMANTICS, and nothing else", () => {
  it("gives every disclosure control the presented state's `aria-expanded`", () => {
    // TWO rails (desktop and tablet) is the shipped composition: the bridge must reach BOTH, or the band the
    // visitor is actually looking at would announce the wrong state.
    const run = runSemanticBootScript(storageStub({ [CORE_KEY]: "open" }), [{}, {}]);
    expect(run.threw).toBeNull();
    expect(run.elements.map((element) => element.getAttribute("aria-expanded"))).toEqual(["true", "true"]);
  });

  it("writes the declared OPEN name only for a control that declares one, and never invents copy", () => {
    const run = runSemanticBootScript(storageStub({ [CORE_KEY]: "open" }), [
      // The author-supplied-name mode (the documented icon-only control): one declared name, one write.
      { [SIDEBAR_TOGGLE_OPEN_NAME_ATTRIBUTE]: "Hide navigation" },
      // The modes whose name comes from a rendered label: nothing to declare, so nothing is written — the
      // stylesheet already presents the right label, and an invented `aria-label` would override it.
      {},
      // A declared-but-empty name is inert for the same reason.
      { [SIDEBAR_TOGGLE_OPEN_NAME_ATTRIBUTE]: "" },
    ]);
    expect(run.elements[0].getAttribute("aria-label")).toBe("Hide navigation");
    expect(run.elements[1].getAttribute("aria-label")).toBeNull();
    expect(run.elements[2].getAttribute("aria-label")).toBeNull();
    // Exactly the attributes such a control ships with — the declaration the markup carries, plus the two the
    // bridge wrote — and nothing else.
    expect([...run.elements[0].attributes.keys()]).toEqual([
      SIDEBAR_TOGGLE_OPEN_NAME_ATTRIBUTE,
      "aria-expanded",
      "aria-label",
    ]);
    // A control that declares no name gets ONLY the state attribute: its presented label already carries the
    // name, and an invented `aria-label` would override it.
    expect([...run.elements[1].attributes.keys()]).toEqual(["aria-expanded"]);
  });

  it("applies nothing at all when the preference is closed, absent or unusable", () => {
    const unusable: Array<Record<string, string> | null> = [
      null,
      {},
      { [CORE_KEY]: "closed" },
      { [CORE_KEY]: "compact" },
      { [CORE_KEY]: "OPEN" },
    ];
    for (const stored of unusable) {
      const run = runSemanticBootScript(storageStub(stored), [
        { [SIDEBAR_TOGGLE_OPEN_NAME_ATTRIBUTE]: "Hide navigation" },
      ]);
      expect(run.threw, JSON.stringify(stored)).toBeNull();
      expect(run.documentElement.attributes.size, JSON.stringify(stored)).toBe(0);
      // The canonical CLOSED markup is already correct — the bridge must not touch it.
      expect(run.elements[0].attributes.size, JSON.stringify(stored)).toBe(1);
      expect(run.elements[0].getAttribute("aria-expanded"), JSON.stringify(stored)).toBeNull();
    }
  });

  it("fails safe when storage is blocked: no marker, no semantics, no throw", () => {
    const run = runSemanticBootScript(storageStub({ [CORE_KEY]: "open" }, { blocked: true }), [{}]);
    expect(run.threw).toBeNull();
    expect(run.documentElement.attributes.size).toBe(0);
    expect(run.elements[0].attributes.size).toBe(0);
  });

  it("is TEMPORARY: it observes what appears, then disconnects at DOMContentLoaded", () => {
    const run = runSemanticBootScript(storageStub({ [CORE_KEY]: "open" }), [{}]);
    expect(run.observers).toHaveLength(1);
    expect(run.observers[0].observed).toBe(1);
    expect(run.observers[0].disconnected).toBe(false);
    // The bridge spans the parse and nothing after it: once the document is ready the runtime owns these
    // attributes, so an explicit CLOSED toggle can never be overridden by a stale bridge.
    expect(run.listeners).toContain("DOMContentLoaded");
  });

  it("needs no MutationObserver to remain correct: marker and existing controls are applied anyway", () => {
    const run = runSemanticBootScript(storageStub({ [CORE_KEY]: "open" }), [{}, {}], { withObserver: false });
    expect(run.threw).toBeNull();
    expect(run.documentElement.getAttribute(CORE_ATTRIBUTE)).toBe("open");
    expect(run.elements.map((element) => element.getAttribute("aria-expanded"))).toEqual(["true", "true"]);
    expect(run.observers).toHaveLength(0);
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
