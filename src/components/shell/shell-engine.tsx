import type { ReactNode } from "react";

import { AppShell } from "@/components/ui/app-shell";
import { NavCta } from "@/components/ui/nav-cta";
import type { ResolvedUiConfig } from "@/core/ui";
import { contentWidthClass, densityClass, resolveShellPattern } from "@/core/ui";

/**
 * ShellEngine (UI-04 — Shell Engine).
 *
 * The framework-layer orchestration component. It consumes RESOLVED SEMANTIC
 * INTENT (`ResolvedUiConfig`, UI-02) plus business CONTENT SLOTS and composes
 * the responsive shell around the SHARED PRIMITIVES (UI-03):
 *
 *  - computes the deterministic `ShellPatternDecision` for the resolved config;
 *  - renders the `AppShell` frame (deterministic `<main id>` skip-link target,
 *    stable landmarks, single optional nav landmark, optional mobile slot);
 *  - applies the density/content-width utility classes on the frame wrapper;
 *  - composes a primary CTA only when `resolved.cta.enabled` (the Foundation
 *    never invents one by default — UI-02/D1 preserved; via `NavCta`).
 *
 * LAYOUT FIDELITY (locked zero-visual-delta decision): the `header` slot is
 * expected to contain the brand, the language/location switchers AND the
 * ≥md navigation landmark, composed by the CONTENT layer (`SiteHeader`) so the
 * established header markup and nav landmark stay exactly as-is at
 * desktop/tablet. The <md mobile layer (ShellMobileNav: trigger + closed-by-
 * default drawer/overlay) is likewise composed INTO the header by the content
 * layer, and/or passed via `mobileNavigation` (bottom-bar / other frame-level
 * patterns). This engine adds the frame, the decision-driven utility classes,
 * the CTA, and the optional mobile slot — no second nav landmark is rendered.
 *
 * BOUNDARIES (master §7): the engine understands INTENT, not business content
 * and never preset identity — it reacts purely to resolved vocabulary values
 * (UI-05+ presets require no change here). The shared primitives remain
 * breakpoint-free; the only breakpoint utilities are the Tailwind classes the
 * CONTENT layer applies (e.g. `hidden md:flex`) and any classes this engine
 * emits for CTA/slot placement.
 */
export interface ShellEngineProps {
  /** The resolved UI configuration (UI-02). */
  readonly resolved: ResolvedUiConfig;
  /** Header content slot: brand + switchers + the ≥md nav landmark (+ <md ShellMobileNav). */
  readonly header: ReactNode;
  /** Main content (the primary landmark receives `id={mainId}`). */
  readonly main: ReactNode;
  /** Footer content slot. */
  readonly footer: ReactNode;
  /** Deterministic id for the `<main>` landmark (skip-link target). */
  readonly mainId: string;
  /** Optional class for the `<main>` landmark (layout-fidelity, e.g. `flex-1`). */
  readonly mainClassName?: string;
  /** Accessible label for the optional navigation slot. */
  readonly navigationLabel?: string;
  /** Optional <md frame-level layer (bottom-bar and similar). */
  readonly mobileNavigation?: ReactNode;
  /** CTA label (rendered only when `resolved.cta.enabled`). */
  readonly ctaLabel?: string;
  /** CTA href (rendered only when `resolved.cta.enabled`). */
  readonly ctaHref?: string;
}

export function ShellEngine({
  resolved,
  header,
  main,
  footer,
  mainId,
  mainClassName,
  navigationLabel,
  mobileNavigation,
  ctaLabel,
  ctaHref,
}: ShellEngineProps) {
  const decision = resolveShellPattern(resolved);
  // The wrapper preserves the previous flex-column body behavior (main fills,
  // footer pinned on short pages) while leaving the FULL page width to the
  // header/footer — so the shipped default shell stays byte-identical.
  const wrapperClass = `flex flex-col flex-1 ${densityClass(resolved.density)} ${contentWidthClass(resolved.content.width)}`.trim();

  return (
    <div className={wrapperClass}>
      <AppShell
        header={header}
        main={main}
        footer={footer}
        mainId={mainId}
        mainClassName={mainClassName}
        navigationLabel={navigationLabel}
        mobileNavigation={mobileNavigation}
      />
      {decision.cta.present && ctaLabel && ctaHref ? (
        <NavCta item={{ label: ctaLabel, href: ctaHref }} className="ui-shell-cta" />
      ) : null}
    </div>
  );
}