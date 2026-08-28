"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Localized copy shown by an error boundary.
 *
 * The canonical source is `dictionary.error` in `config/i18n/<locale>.json`;
 * `ErrorMessagesProvider` receives the already-resolved copy for the active
 * locale from the `[locale]` layout and hands it to client error boundaries,
 * so no client-side locale registry is needed.
 */
export interface ErrorMessages {
  readonly title: string;
  readonly message: string;
  readonly tryAgain: string;
  readonly returnHome: string;
}

const ErrorMessagesContext = createContext<ErrorMessages | null>(null);

/**
 * Provides `dictionary.error` to client error boundaries. Rendered by the
 * `[locale]` layout (a Server Component) with the canonical per-locale copy;
 * `[locale]/error.tsx` reads it via `useErrorMessages()`.
 */
export function ErrorMessagesProvider({
  messages,
  children,
}: {
  messages: ErrorMessages;
  children: ReactNode;
}) {
  return (
    <ErrorMessagesContext.Provider value={messages}>
      {children}
    </ErrorMessagesContext.Provider>
  );
}

/** Returns the localized error copy provided by the `[locale]` layout. */
export function useErrorMessages(): ErrorMessages {
  const messages = useContext(ErrorMessagesContext);
  if (!messages) {
    // Only possible when the boundary is rendered outside the layout that
    // mounts the provider (i.e. a wiring error) — fail loudly rather than
    // silently falling back to a hard-coded locale.
    throw new Error("useErrorMessages must be used within an ErrorMessagesProvider");
  }
  return messages;
}