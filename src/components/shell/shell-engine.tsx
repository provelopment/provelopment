import type { ReactNode } from "react";

import { AppShell } from "@/components/ui/app-shell";
import { NavCta } from "@/components/ui/nav-cta";
import { Sidebar } from "@/components/ui/sidebar";
import type { PageRegionBinding } from "@/core/region";
import type { ResolvedUiConfig } from "@/core/ui";
import { contentWidthClass, densityClass, resolveShellPattern } from "@/core/ui";

import { ShellBottomBar, type ShellBottomBarLink } from "./shell-bottom-bar";

/**
 * ShellEngine (UI-04/UI-05 — Shell Engine).
 *
 * The framework-layer orchestration component. It consumes RESOLVED SEMANTIC
 * INTENT (`ResolvedUiConfig`, UI-02) plus business CONTENT SLOTS and composes
 * the responsive shell around the SHARED PRIMITIVES (UI-03).
 *
 * UI-05 additions (locked founder decisions):
 *  - ASIDE composition: desktop `sidebar` / tablet `collapsed-sidebar` render
 *    via the `Sidebar` primitive in TWO deterministic bands (desktop
 *    `hidden lg:block`, tablet `hidden md:block lg:hidden`) with distinct ids
 *    and mutually exclusive responsive classes — at any width exactly ONE
 *    sidebar landmark is exposed, with zero `useId`/hydration risk.
 *  - MOBILE "bottom-bar": composed via `ShellBottomBar` (deterministic
 *    content split: first `BOTTOM_NAV_PRIMARY_LIMIT` items + More drawer).
 *  - CTA: composed ONLY when `resolved.cta.enabled` AND label+href are
 *    supplied, placed per the decision's structural slot (header/aside/
 *    bottom). The engine NEVER invents an action, href, label, or meaning.
 *
 * LAYOUT FIDELITY (UI-04, owner-applied wording): the `header` slot carries
 * brand + switchers (+ header-slot nav) composed by the CONTENT layer, so
 * established header markup stays as-is at desktop/tablet for header-slot
 * compositions; below `md` the mobile layer (drawer/overlay/bottom-bar) takes
 * over.
 *
 * BOUNDARIES (master §7 + UI-05 requirement E): the engine branches ONLY on
 * resolved VOCABULARY/STRUCTURAL values (`sidebar`, `collapsed-sidebar`,
 * `bottom-bar`, `drawer`, `overlay`, `top`, `header`/`aside` slots, ctaSlot)
 * — NEVER preset identity; it imports no configuration; config-derived context
 * (locale, pageBindings) arrives via props.
 */
export interface ShellEngineProps {
  /** The resolved UI configuration (UI-02). */
  readonly resolved: ResolvedUiConfig;
  /** Header content slot: brand + switchers (+ header-slot nav) via the content layer. */
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
  /** Content for the aside (sidebar) slot; rendered when desktop/tablet is aside. */
  readonly asideContent?: ReactNode;
  /** Localized label for the desktop sidebar collapse/expand toggle. */
  readonly sidebarToggleLabel?: string;
  /** Region-aware bottom-bar spec (mobile "bottom-bar" pattern). */
  readonly bottomNav?: {
    readonly label: string;
    readonly moreLabel: string;
    readonly links: readonly ShellBottomBarLink[];
    readonly demoBadgeLabel?: string;
  };
  /** Client nav context: current locale + configured region page bindings. */
  readonly locale: string;
  readonly pageBindings: readonly PageRegionBinding[];
  /** Optional <md frame-level layer (drawer/bottom bar etc.). */
  readonly mobileNavigation?: ReactNode;
  /** CTA label (only composed when `resolved.cta.enabled`). */
  readonly ctaLabel?: string;
  /** CTA href (only composed when `resolved.cta.enabled`). */
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
  asideContent,
  sidebarToggleLabel,
  bottomNav,
  locale,
  pageBindings,
  mobileNavigation,
  ctaLabel,
  ctaHref,
}: ShellEngineProps) {
  const decision = resolveShellPattern(resolved);
  const asideActive =
    (decision.desktop.slot === "aside" || decision.tablet.slot === "aside") && asideContent !== undefined;

  // Default (header-slot) path stays byte-identical (UI-04): flex column,
  // full page width to header/footer. The aside layout switches the page frame
  // to a wrapping row on large screens so the rail sits beside main.
  const wrapperClass = `flex flex-col flex-1 ${asideActive ? "lg:flex-row lg:flex-wrap" : ""} ${densityClass(resolved.density)} ${contentWidthClass(resolved.content.width)}`.replace(/\s+/g, " ").trim();

  const ctaNode =
    decision.cta.present && ctaLabel && ctaHref ? (
      <NavCta item={{ label: ctaLabel, href: ctaHref }} className="ui-shell-cta" />
    ) : null;

  // Header-slot CTA: composed beside the header only when a real CTA renders
  // (no-op → header passthrough; the shipped demo stays byte-identical).
  const headerUsesCta =
    ctaNode !== null && (decision.desktop.ctaSlot === "header" || decision.tablet.ctaSlot === "header");
  const headerSlot = headerUsesCta ? (
    <div className="ui-shell-header-row">{header}{ctaNode}</div>
  ) : (
    header
  );

  return (
    <div className={wrapperClass}>
      <AppShell
        header={headerSlot}
        main={main}
        footer={asideActive ? <div className="lg:w-full">{footer}</div> : footer}
        sidebar={buildAside()}
        sidebarClassName="ui-shell-sidebar hidden md:block lg:shrink-0 lg:w-60"
        mainId={mainId}
        mainClassName={mainClassName}
        mobileNavigation={buildMobile()}
      />
    </div>
  );

  function buildAside() {
    if (!asideActive || !asideContent) return null;
    const renderBand = (id: string, band: "desktop" | "tablet") => {
      const bandCta =
        ctaNode !== null &&
        ((band === "desktop" && decision.desktop.ctaSlot === "aside") ||
          (band === "tablet" && decision.tablet.ctaSlot === "aside"))
          ? ctaNode
          : null;
      return (
        <Sidebar
          key={band}
          id={id}
          label={navigationLabel ?? "Navigation"}
          collapsible={band === "desktop"}
          toggleLabel={sidebarToggleLabel}
        >
          {asideContent}
          {bandCta}
        </Sidebar>
      );
    };
    return (
      <>
        {decision.desktop.slot === "aside" ? (
          <div className="hidden lg:block">{renderBand("shell-sidebar-desktop", "desktop")}</div>
        ) : null}
        {decision.tablet.slot === "aside" ? (
          <div className="hidden md:block lg:hidden">{renderBand("shell-sidebar-tablet", "tablet")}</div>
        ) : null}
      </>
    );
  }

  function buildMobile() {
    if (decision.mobile.primitiveKind === "bottom-bar" && bottomNav) {
      return (
        <ShellBottomBar
          label={bottomNav.label}
          moreLabel={bottomNav.moreLabel}
          links={bottomNav.links}
          locale={locale}
          pageBindings={pageBindings}
          demoBadgeLabel={bottomNav.demoBadgeLabel}
          cta={
            ctaNode !== null && decision.mobile.ctaSlot === "bottom" && ctaLabel && ctaHref
              ? { label: ctaLabel, href: ctaHref }
              : undefined
          }
        />
      );
    }
    return mobileNavigation;
  }
}