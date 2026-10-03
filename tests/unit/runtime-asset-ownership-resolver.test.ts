import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { namespaceOwning } from "@/config/assets";
import type { RuntimeAssetNamespace } from "@/config/deployment-root";
import {
  createRuntimeAssetOwnershipResolver,
  type RuntimeAssetOwnershipResolver,
} from "@/config/runtime-asset-resolver";

/**
 * RUNTIME ASSET NAMESPACE OWNERSHIP, PROVED INDEPENDENTLY (FOUNDATION-MULTISITE-S3F2A2-R1)
 * =======================================================================================
 *
 * Three disposable namespace directories in the OS temp directory stand in for a platform namespace and two
 * contexts' own namespaces. They live OUTSIDE every served output root, so the rule is proved without
 * writing inside the repository's shipped assets.
 *
 * Alpha and Beta deliberately own the SAME basename with different contents: exactly the case a
 * process-wide basename cache cannot survive, and what the A/B/A/B proof below catches.
 */

const trees: string[] = [];

afterAll(() => {
  for (const tree of trees) rmSync(tree, { recursive: true, force: true });
});

function tempTree(): string {
  const root = mkdtempSync(path.join(tmpdir(), "runtime-asset-ownership-"));
  trees.push(root);
  return root;
}

function write(file: string, contents: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
}

interface Fixture {
  readonly platform: RuntimeAssetNamespace;
  readonly alpha: RuntimeAssetNamespace;
  readonly beta: RuntimeAssetNamespace;
  readonly platformDirectory: string;
  readonly alphaDirectory: string;
  readonly betaDirectory: string;
}

/** A platform namespace plus two different contexts' own namespaces, all disposable directories. */
function fixture(): Fixture {
  const root = tempTree();
  const platformDirectory = path.join(root, "platform");
  const alphaDirectory = path.join(root, "alpha");
  const betaDirectory = path.join(root, "beta");
  for (const directory of [platformDirectory, alphaDirectory, betaDirectory]) {
    mkdirSync(directory, { recursive: true });
  }
  return {
    platform: { directory: platformDirectory, urlBase: "/assets" },
    alpha: { directory: alphaDirectory, urlBase: "/alpha/assets" },
    beta: { directory: betaDirectory, urlBase: "/beta/assets" },
    platformDirectory,
    alphaDirectory,
    betaDirectory,
  };
}

function alphaResolver(probe: Fixture): RuntimeAssetOwnershipResolver {
  return createRuntimeAssetOwnershipResolver([probe.platform, probe.alpha]);
}

function betaResolver(probe: Fixture): RuntimeAssetOwnershipResolver {
  return createRuntimeAssetOwnershipResolver([probe.platform, probe.beta]);
}

describe("runtime asset ownership resolver", () => {
  it("keeps two contexts' ownership of one basename independent across A/B/A/B lookups", () => {
    const probe = fixture();
    write(path.join(probe.alphaDirectory, "logo-header.svg"), '<svg width="48" height="48"></svg>');
    write(path.join(probe.betaDirectory, "logo-header.svg"), '<svg width="96" height="96"></svg>');

    const alpha = alphaResolver(probe);
    const beta = betaResolver(probe);
    const sequence: ReadonlyArray<readonly [RuntimeAssetOwnershipResolver, string, string]> = [
      [alpha, probe.alphaDirectory, "/alpha/assets"],
      [beta, probe.betaDirectory, "/beta/assets"],
      [alpha, probe.alphaDirectory, "/alpha/assets"],
      [beta, probe.betaDirectory, "/beta/assets"],
    ];

    for (const [resolver, directory, urlBase] of sequence) {
      expect(resolver.namespaceOwning("logo-header.svg")?.directory).toBe(directory);
      expect(resolver.namespaceOwning("logo-header.svg")?.urlBase).toBe(urlBase);
      expect(resolver.runtimeAssetPath("logo-header.svg")).toBe(
        path.join(directory, "logo-header.svg"),
      );
    }
  });

  it("selects the platform namespace when both the platform and a context hold the basename", () => {
    const probe = fixture();
    write(path.join(probe.platformDirectory, "shared.svg"), "<svg></svg>");
    write(path.join(probe.alphaDirectory, "shared.svg"), "<svg></svg>");

    const alpha = alphaResolver(probe);
    expect(alpha.namespaceOwning("shared.svg")?.urlBase).toBe("/assets");
    expect(alpha.namespaceOwning("absent.svg")).toBeNull();
    expect(alpha.namespaceOwning("shared.svg")?.urlBase).toBe("/assets");
    expect(alpha.runtimeAssetPath("shared.svg")).toBe(
      path.join(probe.platformDirectory, "shared.svg"),
    );
  });

  it("cannot see a namespace its context does not declare, even when that directory holds the file", () => {
    const probe = fixture();
    write(path.join(probe.betaDirectory, "foreign.svg"), "<svg></svg>");

    const alpha = alphaResolver(probe);
    expect(alpha.namespaceOwning("foreign.svg")).toBeNull();
    expect(alpha.runtimeAssetPath("foreign.svg")).toBeUndefined();
    expect(betaResolver(probe).namespaceOwning("foreign.svg")?.urlBase).toBe("/beta/assets");
  });

  it("answers unavailable for a basename no declared namespace holds", () => {
    const probe = fixture();
    const alpha = alphaResolver(probe);
    expect(alpha.namespaceOwning("missing.svg")).toBeNull();
    expect(alpha.runtimeAssetPath("missing.svg")).toBeUndefined();
    expect(alpha.namespaceOwning("")).toBeNull();
    expect(alpha.runtimeAssetPath("")).toBeUndefined();
    expect(alpha.runtimeAssetPath(undefined)).toBeUndefined();
  });

  it("is unaffected by later mutation of the array it was created from", () => {
    const probe = fixture();
    write(path.join(probe.betaDirectory, "later.svg"), "<svg></svg>");
    const supplied: RuntimeAssetNamespace[] = [probe.platform, probe.alpha];
    const resolver = createRuntimeAssetOwnershipResolver(supplied);

    supplied.push(probe.beta);
    supplied[0] = probe.beta;

    expect(supplied).toHaveLength(3);
    expect(resolver.namespaces).toHaveLength(2);
    expect(resolver.namespaces[0].directory).toBe(probe.platformDirectory);
    expect(Object.isFrozen(resolver.namespaces)).toBe(true);
    expect(resolver.namespaceOwning("later.svg")).toBeNull();
    expect(resolver.runtimeAssetPath("later.svg")).toBeUndefined();
  });

  it("agrees with the accepted ownership primitive on the same namespace list, for every name", () => {
    const probe = fixture();
    write(path.join(probe.platformDirectory, "platform-own.svg"), "<svg></svg>");
    write(path.join(probe.alphaDirectory, "alpha-own.svg"), "<svg></svg>");
    write(path.join(probe.platformDirectory, "both-own.svg"), "<svg></svg>");
    write(path.join(probe.alphaDirectory, "both-own.svg"), "<svg></svg>");

    const supplied = [probe.platform, probe.alpha];
    const resolver = createRuntimeAssetOwnershipResolver(supplied);
    for (const name of ["platform-own.svg", "alpha-own.svg", "both-own.svg", "missing.svg", ""]) {
      expect(resolver.namespaceOwning(name)).toEqual(namespaceOwning(name, supplied));
    }
  });
});

/**
 * S3F2A2-R2 — RESOLVER-LOCAL IMAGE DIMENSIONS
 * ==========================================
 *
 * The same disposable namespace directories now carry artwork, and the SAME BASENAME deliberately holds
 * DIFFERENT sizes in different contexts. A measurement must come from the file THIS resolver's ownership
 * resolves, so Alpha's `banner.svg` can never be Beta's — in either order.
 */

/** A real SVG whose ROOT element declares its size. */
function svg(width: number, height: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}"><rect width="1" height="1"/></svg>`
  );
}

/** Synthetic minimal headers carrying real container magic bytes — no large binary fixtures. */
function pngHeader(width: number, height: number): Buffer {
  const head = Buffer.alloc(24);
  head.writeUInt32BE(0x89504e47, 0);
  head.writeUInt32BE(width, 16);
  head.writeUInt32BE(height, 20);
  return head;
}

function gifHeader(width: number, height: number): Buffer {
  const head = Buffer.alloc(10);
  head.write("GIF89a", 0, "ascii");
  head.writeUInt16LE(width, 6);
  head.writeUInt16LE(height, 8);
  return head;
}

function jpegHeader(width: number, height: number): Buffer {
  const head = Buffer.alloc(11);
  head.writeUInt16BE(0xffd8, 0);
  head[2] = 0xff;
  head[3] = 0xc0;
  head.writeUInt16BE(height, 7);
  head.writeUInt16BE(width, 9);
  return head;
}

function riffHeader(chunk: string, length: number): Buffer {
  const head = Buffer.alloc(length);
  head.write("RIFF", 0, "ascii");
  head.write("WEBP", 8, "ascii");
  head.write(chunk, 12, "ascii");
  return head;
}

/** WebP VP8X (extended): canvas size, stored as 24-bit "size − 1" values. */
function webpExtendedHeader(width: number, height: number): Buffer {
  const head = riffHeader("VP8X", 30);
  head.writeUIntLE(width - 1, 24, 3);
  head.writeUIntLE(height - 1, 27, 3);
  return head;
}

/** WebP VP8 (lossy): 14-bit dimensions in the frame header. */
function webpLossyHeader(width: number, height: number): Buffer {
  const head = riffHeader("VP8 ", 30);
  head.writeUInt16LE(width, 26);
  head.writeUInt16LE(height, 28);
  return head;
}

/** WebP VP8L (lossless): a packed 14+14 bit size. */
function webpLosslessHeader(width: number, height: number): Buffer {
  const head = riffHeader("VP8L", 25);
  head.writeUInt32LE((width - 1) | ((height - 1) << 14), 21);
  return head;
}

describe("runtime asset dimensions", () => {
  it("keeps two contexts' dimensions for one basename independent across A/B/A/B lookups", () => {
    const probe = fixture();
    write(path.join(probe.alphaDirectory, "banner.svg"), svg(120, 80));
    write(path.join(probe.betaDirectory, "banner.svg"), svg(300, 200));

    const alpha = alphaResolver(probe);
    const beta = betaResolver(probe);
    const sequence: ReadonlyArray<readonly [RuntimeAssetOwnershipResolver, number, number]> = [
      [alpha, 120, 80],
      [beta, 300, 200],
      [alpha, 120, 80],
      [beta, 300, 200],
    ];

    for (const [resolver, width, height] of sequence) {
      expect(resolver.readImageDimensions("/assets/banner.svg")).toEqual({ width, height });
      expect(
        resolver.readImageDimensions("https://example.com/spokes/anything/assets/banner.svg"),
      ).toEqual({ width, height });
    }
  });

  it("never lets one context's dimension cache contaminate another's for the same basename", () => {
    const probe = fixture();
    write(path.join(probe.alphaDirectory, "logo.svg"), svg(10, 20));
    write(path.join(probe.betaDirectory, "logo.svg"), svg(640, 480));
    write(path.join(probe.betaDirectory, "only-beta.svg"), svg(7, 9));

    const alpha = alphaResolver(probe);
    const beta = betaResolver(probe);

    // Both instances measure the SAME basename, in both orders, more than once.
    expect(alpha.readImageDimensions("/assets/logo.svg")).toEqual({ width: 10, height: 20 });
    expect(beta.readImageDimensions("/assets/logo.svg")).toEqual({ width: 640, height: 480 });
    expect(beta.readImageDimensions("/assets/logo.svg")).toEqual({ width: 640, height: 480 });
    expect(alpha.readImageDimensions("/assets/logo.svg")).toEqual({ width: 10, height: 20 });

    // A measurement one context cached is never visible to the other.
    expect(beta.readImageDimensions("/assets/only-beta.svg")).toEqual({ width: 7, height: 9 });
    expect(alpha.readImageDimensions("/assets/only-beta.svg")).toBeUndefined();
  });

  it("reports the platform file's dimensions when both the platform and a context hold the basename", () => {
    const probe = fixture();
    write(path.join(probe.platformDirectory, "shared.svg"), svg(64, 32));
    write(path.join(probe.alphaDirectory, "shared.svg"), svg(999, 111));

    const alpha = alphaResolver(probe);
    expect(alpha.readImageDimensions("/assets/shared.svg")).toEqual({ width: 64, height: 32 });
    expect(alpha.readImageDimensions("/spokes/alpha/assets/shared.svg")).toEqual({
      width: 64,
      height: 32,
    });
    expect(alpha.readImageDimensions("/assets/shared.svg")).toEqual({ width: 64, height: 32 });
  });

  it("cannot measure a file that only an undeclared namespace holds", () => {
    const probe = fixture();
    write(path.join(probe.betaDirectory, "foreign.svg"), svg(500, 250));

    const alpha = alphaResolver(probe);
    expect(alpha.readImageDimensions("/anything/foreign.svg")).toBeUndefined();
    expect(alpha.readImageDimensions("/spokes/beta/assets/foreign.svg")).toBeUndefined();
    expect(betaResolver(probe).readImageDimensions("/anything/foreign.svg")).toEqual({
      width: 500,
      height: 250,
    });
  });

  it("answers undefined for absent, empty and undecodable inputs, without throwing", () => {
    const probe = fixture();
    const alpha = alphaResolver(probe);

    expect(alpha.readImageDimensions(undefined)).toBeUndefined();
    expect(alpha.readImageDimensions("")).toBeUndefined();
    expect(alpha.readImageDimensions("missing.svg")).toBeUndefined();
    expect(alpha.readImageDimensions("/assets/missing.svg")).toBeUndefined();

    write(path.join(probe.alphaDirectory, "zero-length.svg"), "");
    expect(alpha.readImageDimensions("/assets/zero-length.svg")).toBeUndefined();

    write(path.join(probe.alphaDirectory, "unsupported.bin"), "this is not an image");
    expect(alpha.readImageDimensions("/assets/unsupported.bin")).toBeUndefined();

    write(path.join(probe.alphaDirectory, "malformed.svg"), "<svg><rect/></svg>");
    expect(alpha.readImageDimensions("/assets/malformed.svg")).toBeUndefined();

    // A nested element's size is never the document's size.
    write(
      path.join(probe.alphaDirectory, "nested.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg"><image width="40" height="30"/></svg>',
    );
    expect(alpha.readImageDimensions("/assets/nested.svg")).toBeUndefined();

    // Truncated container bytes are undecodable rather than fatal.
    writeFileSync(
      path.join(probe.alphaDirectory, "truncated.png"),
      pngHeader(10, 10).subarray(0, 8),
    );
    expect(alpha.readImageDimensions("/assets/truncated.png")).toBeUndefined();
  });

  it("reads SVG size only from the root element, preserving the accepted viewBox rules", () => {
    const probe = fixture();
    const alpha = alphaResolver(probe);
    const cases: ReadonlyArray<readonly [string, string, number | undefined, number | undefined]> = [
      ["explicit.svg", '<svg width="24" height="12"></svg>', 24, 12],
      ["px.svg", '<svg width="30px" height="15px"></svg>', 30, 15],
      ["viewbox.svg", '<svg viewBox="0 0 300 100"></svg>', 300, 100],
      ["aspect.svg", '<svg width="150" viewBox="0 0 300 100"></svg>', 150, 50],
      ["nonpixel.svg", '<svg width="10cm" height="5cm"></svg>', undefined, undefined],
    ];

    for (const [name, contents] of cases) write(path.join(probe.alphaDirectory, name), contents);
    for (const [name, , width, height] of cases) {
      const expected = width === undefined ? undefined : { width, height };
      expect(alpha.readImageDimensions(`/assets/${name}`)).toEqual(expected);
    }
  });

  it("decodes every accepted container from its own magic bytes", () => {
    const probe = fixture();
    const alpha = alphaResolver(probe);
    const put = (name: string, contents: Buffer | string): void => {
      const file = path.join(probe.alphaDirectory, name);
      if (typeof contents === "string") write(file, contents);
      else writeFileSync(file, contents);
    };
    const cases: ReadonlyArray<readonly [string, Buffer | string, number, number]> = [
      ["vector.svg", svg(120, 80), 120, 80],
      ["flat.png", pngHeader(320, 200), 320, 200],
      ["anim.gif", gifHeader(48, 24), 48, 24],
      ["photo.jpg", jpegHeader(1024, 768), 1024, 768],
      ["extended.webp", webpExtendedHeader(800, 600), 800, 600],
      ["lossy.webp", webpLossyHeader(400, 300), 400, 300],
      ["lossless.webp", webpLosslessHeader(64, 64), 64, 64],
    ];

    for (const [name, contents, width, height] of cases) {
      put(name, contents);
      expect(alpha.readImageDimensions(`/assets/${name}`)).toEqual({ width, height });
    }
  });
});

/**
 * S3F2A2-R3A — RESOLVER-LOCAL URL AND ICON PROJECTION
 * ==================================================
 *
 * The same disposable namespaces — whose URL bases deliberately DIFFER (`/assets`, `/alpha/assets`,
 * `/beta/assets`) — prove that every URL is built from the namespace that actually owns the basename: never
 * from a process-wide name, never from the platform base, and never from another context's namespace.
 */

describe("runtime asset urls", () => {
  it("keeps two contexts' URLs for one icon basename independent across A/B/A/B lookups", () => {
    const probe = fixture();
    write(path.join(probe.alphaDirectory, "sidebar-open.svg"), svg(16, 16));
    write(path.join(probe.betaDirectory, "sidebar-open.svg"), svg(16, 16));

    const alpha = alphaResolver(probe);
    const beta = betaResolver(probe);
    const sequence: ReadonlyArray<readonly [RuntimeAssetOwnershipResolver, string]> = [
      [alpha, "/alpha/assets/sidebar-open.svg"],
      [beta, "/beta/assets/sidebar-open.svg"],
      [alpha, "/alpha/assets/sidebar-open.svg"],
      [beta, "/beta/assets/sidebar-open.svg"],
    ];

    for (const [resolver, url] of sequence) {
      expect(resolver.availableIconName("sidebar-open.svg")).toBe("sidebar-open.svg");
      expect(resolver.availableIconUrl("sidebar-open.svg")).toBe(url);
      expect(resolver.runtimeAssetUrl("https://foundation.example/assets/sidebar-open.svg")).toBe(url);
      expect(resolver.resolveIconControlUrl(undefined, "sidebar-open.svg")).toBe(url);
      expect(resolver.resolveIconControlUrl("unowned.svg", "sidebar-open.svg")).toBe("");
    }
  });

  it("projects a platform-owned basename as the configured path, whatever the context's own base is", () => {
    const probe = fixture();
    write(path.join(probe.platformDirectory, "shared.svg"), svg(20, 10));
    write(path.join(probe.alphaDirectory, "shared.svg"), svg(20, 10));

    const alpha = alphaResolver(probe);
    for (const expected of ["/assets/shared.svg", "/assets/shared.svg"]) {
      expect(alpha.runtimeAssetUrl("https://example.test/assets/shared.svg")).toBe(expected);
      expect(alpha.availableIconUrl("shared.svg")).toBe(expected);
      expect(alpha.resolveIconControlUrl("shared.svg", "shipped-default.svg")).toBe(expected);
    }
  });

  it("cannot project a file that only an undeclared namespace holds", () => {
    const probe = fixture();
    write(path.join(probe.betaDirectory, "foreign.svg"), svg(1, 1));

    const alpha = alphaResolver(probe);
    expect(alpha.iconAssetAvailable("foreign.svg")).toBe(false);
    expect(alpha.availableIconName("foreign.svg")).toBe("");
    expect(alpha.availableIconUrl("foreign.svg")).toBe("");
    expect(alpha.runtimeAssetUrl("https://x.test/custom/foreign.svg")).toBe("/custom/foreign.svg");
    expect(betaResolver(probe).availableIconUrl("foreign.svg")).toBe("/beta/assets/foreign.svg");
  });

  it("keeps an unowned configured path exactly as configured (direct public paths still work)", () => {
    const probe = fixture();
    const alpha = alphaResolver(probe);

    expect(alpha.runtimeAssetUrl("https://example.test/brand/runtime/logo.svg")).toBe(
      "/brand/runtime/logo.svg",
    );
    expect(alpha.runtimeAssetUrl("/brand/runtime/logo.svg")).toBe("/brand/runtime/logo.svg");
    expect(alpha.availableIconName("logo.svg")).toBe("");
  });

  it("preserves the three-state icon contract and the pure pathname projection", () => {
    const probe = fixture();
    write(path.join(probe.alphaDirectory, "owned.svg"), svg(4, 4));
    const alpha = alphaResolver(probe);

    expect(alpha.availableIconName(undefined)).toBeUndefined();
    expect(alpha.availableIconName("")).toBe("");
    expect(alpha.availableIconName("owned.svg")).toBe("owned.svg");
    expect(alpha.availableIconName("unowned.svg")).toBe("");

    expect(alpha.availableIconUrl(undefined)).toBeUndefined();
    expect(alpha.availableIconUrl("")).toBe("");
    expect(alpha.availableIconUrl("owned.svg")).toBe("/alpha/assets/owned.svg");
    expect(alpha.availableIconUrl("unowned.svg")).toBe("");

    expect(alpha.iconAssetAvailable(undefined)).toBe(false);
    expect(alpha.iconAssetAvailable("")).toBe(false);
    expect(alpha.iconAssetAvailable("owned.svg")).toBe(true);

    expect(alpha.resolveIconControlUrl("", "owned.svg")).toBe("");
    expect(alpha.resolveIconControlUrl(undefined, "unowned.svg")).toBe("");

    expect(alpha.assetPathFromUrl(undefined)).toBeUndefined();
    expect(alpha.assetPathFromUrl("")).toBe("");
    expect(alpha.assetPathFromUrl("https://example.test/a/b.svg")).toBe("/a/b.svg");
    expect(alpha.assetPathFromUrl("/a/b.svg")).toBe("/a/b.svg");
    expect(alpha.assetPathFromUrl("b.svg")).toBe("b.svg");

    expect(alpha.runtimeAssetUrl(undefined)).toBeUndefined();
    expect(alpha.runtimeAssetUrl("")).toBe("");
  });
});

/**
 * S3F2A2-R3B — RESOLVER-LOCAL PAGE-ROLE AVAILABILITY
 * ==================================================
 *
 * Every role graphic answers through ONE shared rule (`pathname → basename → this resolver's ownership`), so
 * the same disposable namespaces — whose URL bases deliberately differ (`/assets`, `/alpha/assets`,
 * `/beta/assets`) — prove both isolation between contexts and the distinction from `runtimeAssetUrl` for a
 * CONFIGURED-but-unowned path.
 */

describe("runtime asset roles", () => {
  const banner = "https://foundation.example/assets/banner-home.svg";

  it("keeps two contexts' role URLs for one basename independent across A/B/A/B lookups", () => {
    const probe = fixture();
    write(path.join(probe.alphaDirectory, "banner-home.svg"), svg(40, 20));
    write(path.join(probe.betaDirectory, "banner-home.svg"), svg(40, 20));

    const alpha = alphaResolver(probe);
    const beta = betaResolver(probe);
    const sequence: ReadonlyArray<readonly [RuntimeAssetOwnershipResolver, string]> = [
      [alpha, "/alpha/assets/banner-home.svg"],
      [beta, "/beta/assets/banner-home.svg"],
      [alpha, "/alpha/assets/banner-home.svg"],
      [beta, "/beta/assets/banner-home.svg"],
    ];

    for (const [resolver, url] of sequence) {
      expect(resolver.availableBannerPath(banner)).toBe(url);
      expect(resolver.availableBackgroundPath(banner)).toBe(url);
      expect(resolver.availableFooterGraphicPath(banner)).toBe(url);
      expect(resolver.availableHeaderGraphicPath(banner)).toBe(url);
      expect(resolver.availableStatusGraphicPath(banner)).toBe(url);
    }
  });

  it("resolves a platform-owned role with the configured pathname, not the context's own base", () => {
    const probe = fixture();
    write(path.join(probe.platformDirectory, "shared-role.svg"), svg(30, 10));
    write(path.join(probe.alphaDirectory, "shared-role.svg"), svg(30, 10));

    const alpha = alphaResolver(probe);
    const url = "https://example.test/assets/shared-role.svg";
    for (const expected of ["/assets/shared-role.svg", "/assets/shared-role.svg"]) {
      expect(alpha.availableBannerPath(url)).toBe(expected);
      expect(alpha.availableBackgroundPath(url)).toBe(expected);
    }
  });

  it("reports an undeclared namespace's role as unavailable in every role projection", () => {
    const probe = fixture();
    write(path.join(probe.betaDirectory, "foreign-banner.svg"), svg(10, 10));

    const alpha = alphaResolver(probe);
    const url = "https://x.test/assets/foreign-banner.svg";
    expect(alpha.availableBannerPath(url)).toBeUndefined();
    expect(alpha.availableBackgroundPath(url)).toBeUndefined();
    expect(alpha.availableFooterGraphicPath(url)).toBeUndefined();
    expect(alpha.availableHeaderGraphicPath(url)).toBeUndefined();
    expect(alpha.availableStatusGraphicPath(url)).toBeUndefined();
    expect(alpha.availableBackgroundMap({ all: url })).toEqual({});
    expect(betaResolver(probe).availableBannerPath(url)).toBe("/beta/assets/foreign-banner.svg");
  });

  it("distinguishes an unowned configured path from an unavailable role", () => {
    const probe = fixture();
    const alpha = alphaResolver(probe);
    const url = "https://example.test/custom/banner.svg";

    expect(alpha.runtimeAssetUrl(url)).toBe("/custom/banner.svg");
    expect(alpha.availableBannerPath(url)).toBeUndefined();
    expect(alpha.availableBackgroundPath(url)).toBeUndefined();
    expect(alpha.availableBackgroundMap({ all: url })).toEqual({});
  });

  it("answers unavailable for empty and absent role values through every role method", () => {
    const probe = fixture();
    const alpha = alphaResolver(probe);
    for (const configured of [undefined, ""]) {
      expect(alpha.availableBannerPath(configured)).toBeUndefined();
      expect(alpha.availableBackgroundPath(configured)).toBeUndefined();
      expect(alpha.availableFooterGraphicPath(configured)).toBeUndefined();
      expect(alpha.availableHeaderGraphicPath(configured)).toBeUndefined();
      expect(alpha.availableStatusGraphicPath(configured)).toBeUndefined();
    }
    expect(alpha.availableBackgroundMap(undefined)).toEqual({});
    expect(alpha.availableBackgroundMap({})).toEqual({});
    expect(alpha.availableBackgroundMap({ all: "" })).toEqual({});
  });

  it("keeps two contexts' background maps independent and drops unavailable entries", () => {
    const probe = fixture();
    write(path.join(probe.alphaDirectory, "bg-shared.svg"), svg(8, 8));
    write(path.join(probe.betaDirectory, "bg-shared.svg"), svg(8, 8));
    write(path.join(probe.platformDirectory, "bg-platform.svg"), svg(8, 8));

    const configured = {
      all: "https://example.test/assets/bg-shared.svg",
      about: "https://example.test/assets/missing.svg",
      platform: "https://example.test/assets/bg-platform.svg",
    };
    const alpha = alphaResolver(probe);
    const beta = betaResolver(probe);
    const expected = { all: "/alpha/assets/bg-shared.svg", platform: "/assets/bg-platform.svg" };

    expect(alpha.availableBackgroundMap(configured)).toEqual(expected);
    expect(beta.availableBackgroundMap(configured)).toEqual({
      all: "/beta/assets/bg-shared.svg",
      platform: "/assets/bg-platform.svg",
    });
    expect(alpha.availableBackgroundMap(configured)).toEqual(expected);
    expect(Object.keys(alpha.availableBackgroundMap(configured))).toEqual(["all", "platform"]);
  });
});
