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
 *     navigation can set, reset or even observe the rail's state;
 *   · the canonical no-preference state of a composed rail is CLOSED (the shell engine declares it), and
 *     the stored preference is adopted BEFORE THE FIRST PAINT, which is what makes the repair invisible
 *     rather than a visible correction after hydration.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { ShellEngine } from "@/components/shell";
import {
  SIDEBAR_PREFERENCE_STORAGE_KEY,
  SIDEBAR_PREFERENCES,
  isSidebarPreference,
  readSidebarPreference,
  storeSidebarPreference,
  subscribeSidebarPreference,
} from "@/components/ui/sidebar-preference";
import { siteConfig } from "@/config";
import type { PageRegionBinding } from "@/core/region";
import { siteSetOf } from "@/core/site";
import { resolveUiConfig } from "@/core/ui";

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

  it("changes the state from the disclosure control ONLY, and persists exactly there", () => {
    const sidebar = OWNERS["components/ui/sidebar.tsx"];
    // The one writer, inside the one toggle handler, wired to the one control.
    expect(sidebar.match(/storeSidebarPreference\(/g) ?? []).toHaveLength(1);
    expect(sidebar).toMatch(/function toggle\(\): void \{[\s\S]*?storeSidebarPreference\(/);
    expect(sidebar).toContain("onClick={toggle}");
  });

  it("keeps navigation items inert with respect to the state (a click navigates, nothing else)", () => {
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
    expect(sidebar).toMatch(/useIsomorphicLayoutEffect\(\(\) => \{[\s\S]*?readSidebarPreference\(\)/);
    // The first render is still the DECLARED state, so hydration cannot disagree with the server.
    expect(sidebar).toMatch(
      /useState<DisclosureState>\(\(\) => createInitialDisclosure\(!collapsed\)\)/,
    );
  });
describe("UI1 — the canonical no-preference state of a composed rail is CLOSED", () => {
  it("renders an untoggled collapsible rail collapsed, with its expand control intact", () => {
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
