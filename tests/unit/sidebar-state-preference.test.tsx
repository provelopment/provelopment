/**
 * FOUNDATION-UI1 — THE SIDEBAR'S PRESENTATION PREFERENCE (contract + architectural boundary).
 *
 * The two owner-observed defects were LIFECYCLE defects (a rail that returns OPEN after a reload, and a
 * rail that arrives OPEN after a navigation click), so their proof is a BROWSER scenario:
 * `tests/browser/matrix.mjs` → `runSidebarStateScenario`. What can be proved without a browser — and
 * what that scenario then relies on — is the contract underneath it:
 *
 *   · the storage vocabulary is EXPLICIT and CLOSED: one stable Foundation-owned key, two recognized
 *     values, and "no usable preference" for a missing key, an unrecognized value or blocked storage;
 *   · the preference is a VISITOR preference, never route state — the key carries no route, site, locale
 *     or location, and the modules that own the state import no routing API and read no location, so no
 *     route, remount or breakpoint can set, reset or even observe the rail's state. NAV1D-V2 adds the
 *     ONE deliberate exception, and it is not a route state either: SELECTING a destination inside the
 *     rail dismisses the expanded overlay (the rail returns to CLOSED) through the same visitor
 *     preference and the same single writer the disclosure control uses;
 *   · the canonical no-preference state of a composed rail is CLOSED (the shell engine declares it), and
 *     the stored preference is adopted BEFORE THE FIRST PAINT, which is what makes the repair invisible
 *     rather than a visible correction after hydration.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SIDEBAR_PREFERENCE_STORAGE_KEY,
  SIDEBAR_PREFERENCES,
  isSidebarPreference,
  readSidebarPreference,
  storeSidebarPreference,
  subscribeSidebarPreference,
} from "@/components/ui/sidebar-preference";
import type { SidebarProps } from "@/components/ui/sidebar";
import { siteConfig } from "@/config";
import type { PageRegionBinding } from "@/core/region";
import { siteSetOf } from "@/core/site";
import { resolveUiConfig } from "@/core/ui";

/**
 * A FRESH module instance is a fresh DOCUMENT: the resolved runtime preference lives for the life of the
 * module, so isolating the registry is exactly how a test starts a new document.
 */
async function freshPreferenceModule() {
  vi.resetModules();
  const preference = await import("@/components/ui/sidebar-preference");
  const { Sidebar } = await import("@/components/ui/sidebar");
  // The composed shell from the SAME fresh registry, so a rendered rail belongs to the same document.
  const { ShellEngine } = await import("@/components/shell");
  return { preference, Sidebar, ShellEngine };
}

/** The shell's required site context — the same projection the other static-markup suites use. */
const SITE_SET = siteSetOf(siteConfig.sites, siteConfig.defaultSite);

const SOURCE_ROOT = path.resolve(__dirname, "../../src");

const readSource = (relative: string) => readFileSync(path.join(SOURCE_ROOT, relative), "utf8");

/** The three modules that own — or compose — the rail's state. */
const OWNERS: Readonly<Record<string, string>> = {
  "components/ui/sidebar-preference.ts": readSource("components/ui/sidebar-preference.ts"),
  "components/ui/sidebar.tsx": readSource("components/ui/sidebar.tsx"),
  "components/shell/shell-engine.tsx": readSource("components/shell/shell-engine.tsx"),
};

/** A minimal browser-storage stand-in: no jsdom, and nothing beyond what the module reads. */
interface StorageStub {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
}

const originalWindow = (globalThis as { window?: unknown }).window;

function useStorage(storage: StorageStub): void {
  (globalThis as { window?: unknown }).window = { localStorage: storage };
}

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("UI1 — the storage contract", () => {
  it("publishes ONE stable Foundation-owned key whose value vocabulary is exactly two words", () => {
    expect(SIDEBAR_PREFERENCE_STORAGE_KEY).toBe("foundation.sidebar");
    expect([...SIDEBAR_PREFERENCES]).toEqual(["open", "closed"]);
  });

  it("keys the preference to the VISITOR, never to a route, site, locale or location", () => {
    // A route-partitioned key would be a second state per page — the defect this contract removes.
    const key = SIDEBAR_PREFERENCE_STORAGE_KEY;
    expect(key).not.toMatch(/[/\\:${}[\]()]/);
    for (const forbidden of ["route", "path", "page", "locale", "site", "location", "url"]) {
      expect(key).not.toContain(forbidden);
    }
  });

  it("recognizes the declared values and nothing else", () => {
    expect(isSidebarPreference("open")).toBe(true);
    expect(isSidebarPreference("closed")).toBe(true);
    const unusable: unknown[] = ["", "OPEN", "Closed", "true", "compact", "open ", null, undefined, 1, {}, []];
    for (const value of unusable) {
      expect(isSidebarPreference(value), String(value)).toBe(false);
    }
  });

  it("reads a recorded choice, and answers `no preference` for anything unusable", () => {
    const store: Record<string, string> = {};
    useStorage({
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => {
        store[key] = value;
      },
    });

    // Missing key → no preference (the rail then keeps its declared CANONICAL state: CLOSED).
    expect(readSidebarPreference()).toBeNull();
    // Valid values are honoured, both ways.
    store[SIDEBAR_PREFERENCE_STORAGE_KEY] = "open";
    expect(readSidebarPreference()).toBe("open");
    store[SIDEBAR_PREFERENCE_STORAGE_KEY] = "closed";
    expect(readSidebarPreference()).toBe("closed");
    // A hostile, stale or truncated value degrades to "no preference" instead of being applied.
    for (const value of ["compact", "", "true", "OPEN", "open;closed", '{"open":true}']) {
      store[SIDEBAR_PREFERENCE_STORAGE_KEY] = value;
      expect(readSidebarPreference(), value).toBeNull();
    }
  });

  it("treats blocked or unavailable storage as `no preference` (never an error)", () => {
    useStorage({
      getItem: () => {
        throw new Error("storage is blocked");
      },
      setItem: () => {
        throw new Error("storage is blocked");
      },
    });
    expect(readSidebarPreference()).toBeNull();
    expect(() => storeSidebarPreference("open")).not.toThrow();
  });

  it("records the choice and publishes it to the other mounted rails", () => {
    const written: Record<string, string> = {};
    useStorage({
      getItem: (key) => written[key] ?? null,
      setItem: (key, value) => {
        written[key] = value;
      },
    });

    const seen: string[] = [];
    const unsubscribe = subscribeSidebarPreference((preference) => seen.push(preference));
    storeSidebarPreference("open");
    storeSidebarPreference("closed");
    expect(written[SIDEBAR_PREFERENCE_STORAGE_KEY]).toBe("closed");
    expect(seen).toEqual(["open", "closed"]);
    unsubscribe();
    storeSidebarPreference("open");
    expect(seen).toEqual(["open", "closed"]);
  });

  it("still publishes when storage is unavailable — persistence is the only loss", () => {
    useStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
    });
    const seen: string[] = [];
    const unsubscribe = subscribeSidebarPreference((preference) => seen.push(preference));
    expect(() => storeSidebarPreference("open")).not.toThrow();
    expect(seen).toEqual(["open"]);
    unsubscribe();
  });

describe("UI1 — navigation cannot own the sidebar state (architectural boundary)", () => {
  it("keeps the state's owners free of every routing API and of the location", () => {
    for (const [name, source] of Object.entries(OWNERS)) {
      expect(source, `${name} must not import routing`).not.toMatch(/from "next\/navigation"/);
      for (const api of ["usePathname", "useRouter", "useParams", "useSearchParams", "next/headers"]) {
        expect(source, `${name} must not use ${api}`).not.toContain(api);
      }
      expect(source, `${name} must not read the location`).not.toMatch(
        /\blocation\.(pathname|href|search|hash)\b/,
      );
    }
  });

  it("keeps the key in ONE place — the module that owns the preference", () => {
    expect(OWNERS["components/ui/sidebar-preference.ts"]).toContain("localStorage");
    expect(OWNERS["components/ui/sidebar.tsx"]).not.toContain("localStorage");
    expect(OWNERS["components/shell/shell-engine.tsx"]).not.toContain("localStorage");
  });

  it("changes the state through ONE writer — the disclosure control and a navigation selection", () => {
    const sidebar = OWNERS["components/ui/sidebar.tsx"];
    // The one writer, inside the one function that records the preference.
    expect(sidebar.match(/storeSidebarPreference\(/g) ?? []).toHaveLength(1);
    expect(sidebar).toMatch(/function apply\(next: DisclosureState\): void \{[\s\S]*?storeSidebarPreference\(/);
    // The visitor's control remains one caller of it, wired to the one control…
    expect(sidebar).toMatch(/function toggle\(\): void \{[\s\S]*?apply\(disclosureReducer\(/);
    expect(sidebar).toContain("onClick={toggle}");
    // …and NAV1D-V2/R3 adds the second caller: selecting a destination inside the rail dismisses the expanded
    // OVERLAY where the band's policy says so (mobile), through the SAME writer. It is wired to the rail's own
    // panel (never to the nav items, which stay plain data + href), it asks the ONE pure rule, and it is not
    // derived from the route. WHICH bands dismiss it is the composer's decision, one band at a time (R3 —
    // `tests/unit/sidebar-selection-policy.test.ts` proves the per-band matrix and the composer's own table).
    expect(sidebar).toContain('className="ui-sidebar-rail-panel" onClick={closeForSelection}');
    expect(sidebar).toMatch(
      /function closeForSelection\(event: MouseEvent<HTMLDivElement>\): void \{[\s\S]*?railDismissesOnSelection\(selection, collapsible, state, destination\)[\s\S]*?apply\(DISCLOSURE_CLOSED\)/,
    );
    expect(sidebar).toMatch(/target\.closest\("a\[href\]"\)/);
  });

  it("keeps navigation ITEMS inert with respect to the state (the rail's own panel owns the close)", () => {
    const navItem = readSource("components/ui/nav-item.tsx");
    for (const forbidden of ["ui-sidebar-toggle", "setState", "storeSidebarPreference", "toggle("]) {
      expect(navItem, `nav-item.tsx must not contain ${forbidden}`).not.toContain(forbidden);
    }
    // No callback prop exists to smuggle one in: NavItem is data + href only.
    expect(navItem).not.toMatch(/(^|\s)on[A-Z][A-Za-z]*\??:/m);
  });

  it("adopts the stored preference BEFORE the first paint (no visible correction, no mismatch)", () => {
    const sidebar = OWNERS["components/ui/sidebar.tsx"];
    // A layout effect on the client — React flushes it in the same commit, before painting — and an
    // inert one on the server, where there is no browser to read and no warning to emit.
    expect(sidebar).toMatch(/typeof window === "undefined" \? useEffect : useLayoutEffect/);
    // Resolution goes through the module that owns the preference (UI1-A1: once per document, never a
    // storage read in the render path).
    expect(sidebar).toMatch(/useIsomorphicLayoutEffect\(\(\) => \{[\s\S]*?resolveSidebarPreference\(\)/);
    // The first render is the DECLARED state whenever this document has resolved nothing, so hydration
    // cannot disagree with the server; the resolved state is used when there IS one (UI1-A1).
    expect(sidebar).toMatch(/useState<DisclosureState>\(\(\) =>[\s\S]*?initialDisclosureState\(collapsible, collapsed\)/);
    expect(sidebar).toMatch(/const resolved = resolvedSidebarPreference\(\);[\s\S]*?createInitialDisclosure\(!collapsed\) : stateOf\(resolved\)/);
  });
describe("UI1 — the canonical no-preference state of a composed rail is CLOSED", () => {
  it("renders an untoggled collapsible rail collapsed, with its expand control intact", async () => {
    // Its OWN document (a fresh module registry): this file's other tests record preferences, and the
    // canonical state is what a document that has resolved NOTHING composes.
    const { ShellEngine } = await freshPreferenceModule();
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved: resolveUiConfig({}),
        header: <div>h</div>,
        main: <div>m</div>,
        footer: <div>f</div>,
        mainId: "main",
        navigationLabel: "Primary",
        asideContent: <ul><li>One</li></ul>,
        locale: "en",
        pageBindings: [] as readonly PageRegionBinding[],
        siteSet: SITE_SET,
      }),
    );
    expect(html).toContain('data-collapsed="true"');
    expect(html).not.toContain('data-collapsed="false"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('aria-expanded="true"');
    // Never a dead end: the canonical closed rail still exposes its disclosure control.
    expect(html).toContain('aria-controls="shell-sidebar-desktop-panel"');
    expect(html).toContain('aria-controls="shell-sidebar-tablet-panel"');
  });
});

});
});

/**
 * UI1-A1 — THE RESOLVED PREFERENCE IS THE AUTHORITY FOR THE LIFE OF THE DOCUMENT.
 *
 * The defect this pins down was a VISIBLE one: a client-side navigation re-creates the shell, so a
 * replacement rail started from the canonical CLOSED state and adopted the stored `open` in an effect. That
 * correction is invisible as a *state* frame but not as *geometry*: committing `data-collapsed="true"` and
 * correcting it in the same commit starts the rail's `width 200ms` CSS transition, so an OPEN rail collapsed
 * and expanded again on every navigation (measured on the live site as `keyframes=["36px","220px"]`).
 *
 * The contract that removes it: once a document has resolved the preference, a rail created LATER in the
 * same document renders that resolved value on its FIRST render — so there is no canonical-state commit to
 * correct, and therefore no transition and no transient. Storage is read once per document, from an effect;
 * the render path never touches it, which is what keeps hydration honest.
 */
describe("UI1-A1 — a rail created later in the same document renders the resolved state", () => {
  it("resolves the stored preference ONCE per document, then answers from the running value", async () => {
    const store: Record<string, string> = { [SIDEBAR_PREFERENCE_STORAGE_KEY]: "open" };
    let reads = 0;
    useStorage({
      getItem: (key) => {
        reads += 1;
        return key in store ? store[key] : null;
      },
      setItem: (key, value) => {
        store[key] = value;
      },
    });
    const { preference } = await freshPreferenceModule();

    // Nothing resolved yet (a fresh document): there is no preference to apply.
    expect(preference.resolvedSidebarPreference()).toBeNull();
    // Resolution reads the stored choice exactly once…
    expect(preference.resolveSidebarPreference()).toBe("open");
    expect(reads).toBe(1);
    // …and from then on the RUNNING value wins: nothing else — not a later storage value, not a navigation
    // — may move the rail while the visitor is using the site.
    store[SIDEBAR_PREFERENCE_STORAGE_KEY] = "closed";
    expect(preference.resolveSidebarPreference()).toBe("open");
    expect(preference.resolvedSidebarPreference()).toBe("open");
    expect(reads).toBe(1);
  });

  it("never reads storage from the render path (so a fresh document still matches the server)", async () => {
    let reads = 0;
    useStorage({
      getItem: () => {
        reads += 1;
        return "open";
      },
      setItem: () => {},
    });
    const { preference } = await freshPreferenceModule();

    // The value a first render would use — `resolvedSidebarPreference()` — touches no storage at all.
    expect(preference.resolvedSidebarPreference()).toBeNull();
    expect(reads).toBe(0);
    // Only the effect-time resolver reads, and only once.
    expect(preference.resolveSidebarPreference()).toBe("open");
    expect(reads).toBe(1);
  });
});


describe("UI1-A1 — the replacement rail's first render is the repair of the navigation flicker", () => {
  const clearWindow = () => {
    (globalThis as { window?: unknown }).window = originalWindow;
  };

  const rail = (Sidebar: (props: SidebarProps) => ReactElement) => (
    <Sidebar label="Primary" collapsible={true} collapsed={true} id="shell-sidebar-desktop">
      <ul>
        <li>One</li>
      </ul>
    </Sidebar>
  );

  it("renders the resolved state on a replacement rail's FIRST render (nothing left to correct)", async () => {
    const store: Record<string, string> = { [SIDEBAR_PREFERENCE_STORAGE_KEY]: "open" };
    useStorage({
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => {
        store[key] = value;
      },
    });
    const { preference, Sidebar } = await freshPreferenceModule();

    // A fresh document renders the DECLARED canonical state — the state the server's markup carries.
    expect(renderToStaticMarkup(rail(Sidebar))).toContain('data-collapsed="true"');

    // The document resolves the visitor's choice…
    expect(preference.resolveSidebarPreference()).toBe("open");
    // …and the runtime layer is the authority from then on, independent of storage being readable.
    // (Restoring the server-like environment also keeps this render on the warning-free `useEffect` path.)
    clearWindow();
    expect(preference.resolvedSidebarPreference()).toBe("open");

    // A rail created LATER in the same document — exactly what a navigation creates — is OPEN immediately,
    // so no canonical-state commit exists to correct and no CSS width transition can start.
    const replacement = renderToStaticMarkup(rail(Sidebar));
    expect(replacement).toContain('data-collapsed="false"');
    expect(replacement).toContain('aria-expanded="true"');
    expect(replacement).not.toContain('data-collapsed="true"');
  });

  it("keeps the canonical CLOSED state when storage is blocked, empty or unusable", async () => {
    useStorage({
      getItem: () => {
        throw new Error("storage is blocked");
      },
      setItem: () => {
        throw new Error("storage is blocked");
      },
    });
    const { preference, Sidebar } = await freshPreferenceModule();
    expect(preference.resolveSidebarPreference()).toBeNull();
    expect(preference.resolvedSidebarPreference()).toBeNull();
    clearWindow();
    expect(renderToStaticMarkup(rail(Sidebar))).toContain('data-collapsed="true"');
  });

  it("makes the EXPLICIT toggle the writer of the running value (one writer, one authority)", async () => {
    const store: Record<string, string> = {};
    useStorage({
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => {
        store[key] = value;
      },
    });
    const { preference } = await freshPreferenceModule();
    expect(preference.resolvedSidebarPreference()).toBeNull();

    preference.storeSidebarPreference("open");
    expect(preference.resolvedSidebarPreference()).toBe("open");
    expect(store[SIDEBAR_PREFERENCE_STORAGE_KEY]).toBe("open");
    preference.storeSidebarPreference("closed");
    expect(preference.resolvedSidebarPreference()).toBe("closed");
    expect(store[SIDEBAR_PREFERENCE_STORAGE_KEY]).toBe("closed");
  });

  it("keeps the running value when persistence fails (a blocked store costs durability only)", async () => {
    useStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
    });
    const { preference } = await freshPreferenceModule();
    expect(() => preference.storeSidebarPreference("open")).not.toThrow();
    expect(preference.resolvedSidebarPreference()).toBe("open");
  });
});
