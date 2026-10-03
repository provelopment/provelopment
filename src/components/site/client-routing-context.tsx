"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { ClientRoutingContext } from "./client-routing";

/**
 * THE ONE CLIENT TRANSPORT FOR THE ROUTING PROJECTION (FOUNDATION-MULTISITE-M14)
 * =============================================================================
 *
 * A SERVER component builds the projection (`buildClientRoutingContext`) and provides it here; the client
 * controls read it with `useClientRouting()`. There is exactly one transport, so a control can never fall
 * back to a global configuration, and a placement can never be left reading a different source than its
 * siblings: the provider is emitted by the server composition (the document) and by the chrome that composes
 * controls directly (`SiteHeader`, `SiteFooter`).
 *
 * The value is plain data (see `./client-routing`), so it crosses the server/client boundary without
 * carrying authority: no context object, no resolver, no registry, no filesystem path, and no way for client
 * code to select a Spoke.
 *
 * ABSENT PROVIDER IS A DEFECT, NOT A FALLBACK: `useClientRouting()` throws rather than reaching for a global
 * configuration, so a control that is rendered outside its server parent fails loudly in tests and in
 * development instead of silently resolving against another Spoke.
 */
const ClientRoutingContextValue = createContext<ClientRoutingContext | null>(null);

export function ClientRoutingProvider({
  routing,
  children,
}: {
  readonly routing: ClientRoutingContext;
  readonly children: ReactNode;
}) {
  return (
    <ClientRoutingContextValue.Provider value={routing}>
      {children}
    </ClientRoutingContextValue.Provider>
  );
}

export function useClientRouting(): ClientRoutingContext {
  const routing = useContext(ClientRoutingContextValue);
  if (routing === null) {
    throw new Error(
      "FOUNDATION-MULTISITE-M14: no client routing context is provided. A control that resolves its own " +
        "destination must be rendered under the server composition (or the chrome that composes it), which " +
        "provides the CURRENT Spoke's routing projection — there is deliberately no global-configuration " +
        "fallback.",
    );
  }
  return routing;
}
