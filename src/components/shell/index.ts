/**
 * Shell Engine (UI-04).
 *
 * Barrel for the framework-layer shell orchestration components. The engine
 * consumes resolved UI intent + content slots; the shared primitives remain in
 * `src/components/ui`. Boundary: these components receive resolved/config
 * values via props and import no configuration or adapters.
 */
export { ShellEngine } from "./shell-engine";
export type { ShellEngineProps } from "./shell-engine";

export { ShellMobileNav } from "./shell-mobile-nav";
export type { ShellMobileNavProps } from "./shell-mobile-nav";