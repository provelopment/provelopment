"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * The server-resolved status graphic, or `undefined` when nothing is configured
 * (or the configured file is missing).
 */
export interface StatusGraphicAsset {
  /** Same-origin `public/assets/` path of the resolved `status-graphic` role. */
  readonly src: string;
  /** Intrinsic width in CSS pixels, when the asset header could be decoded. */
  readonly width?: number;
  /** Intrinsic height in CSS pixels, when the asset header could be decoded. */
  readonly height?: number;
}

const StatusGraphicContext = createContext<StatusGraphicAsset | undefined>(undefined);

/**
 * P12-SG — transports the resolved `status-graphic` role to the status surfaces.
 *
 * WHY A PROVIDER (and not a direct resolver call in the status files): the two
 * status surfaces have DIFFERENT server/client natures —
 * `[locale]/not-found.tsx` is a Server Component while `[locale]/error.tsx` is a
 * Client Component (App Router requirement), and the asset resolver
 * (`src/config/assets.ts`) reads `node:fs`, so it can never be imported into a
 * browser chunk. This is exactly the situation `ErrorMessagesProvider` already
 * solves for the error copy: the `[locale]` layout (a Server Component) resolves
 * the value ONCE and hands the ready value down to both surfaces, so there is
 * one resolution site, one config role and no client-side asset registry.
 *
 * FAIL-SAFE BY CONSTRUCTION: the context default is `undefined` (no graphic), so
 * a status surface rendered outside the provider — or before any asset is
 * configured — simply renders no decoration. Unlike `useErrorMessages`, which
 * throws because its copy is ESSENTIAL and must never silently degrade, the
 * status graphic is purely decorative: its absence must never break a status
 * page. Configured-but-missing is indistinguishable from absent for the same
 * reason.
 */
export function StatusGraphicProvider({
  asset,
  children,
}: {
  asset: StatusGraphicAsset | undefined;
  children: ReactNode;
}) {
  return <StatusGraphicContext.Provider value={asset}>{children}</StatusGraphicContext.Provider>;
}

/** Returns the resolved status graphic asset, or `undefined` when there is none. */
export function useStatusGraphic(): StatusGraphicAsset | undefined {
  return useContext(StatusGraphicContext);
}
