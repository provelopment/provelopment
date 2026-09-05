import type { ReactNode } from "react";

import { AppShell } from "@/components/ui/app-shell";
import { Cta, isCtaRenderable } from "@/components/ui/cta";
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

  // P0-2 — the primary CTA is the one shared `Cta` capability. The engine owns
  // WHERE the CTA is composed (from the decision-core per-viewport ctaSlot);
  // `Cta` owns WHETHER one exists (enabled ∧ label ∧ href, the single presence
  // predicate) and its prominence. Nothing here invents a label or href.
  const ctaNode = isCtaRenderable(resolved.cta.enabled, ctaLabel, ctaHref) ? (
    <Cta
      enabled={resolved.cta.enabled}
      style={resolved.cta.style}
      label={ctaLabel}
      href={ctaHref}
      className="ui-shell-cta"
    />
  ) : null;

  const headerUsesCta =
    ctaNode !== null && (decision.desktop.ctaSlot === "header" || decision.tablet.ctaSlot === "header");

  // P0-2 responsive contract (exactly ONE interactive CTA per viewport): when
  // the mobile composition owns the CTA slot (drawer / overlay / bottom-bar),
  // the ≥md header CTA instance must NOT remain reachable below `md` — a
  // header-slot preset whose mobile disclosure also exposes its own CTA must
  // never render a duplicate desktop+mobile pair. The hide lives on an OUTER
  // wrapper (not the CTA itself) so the additive `ui-cta-prominent` display
  // rule can never override it (layered utility vs unlayered token rule).
  const mobileOwnsCta =
    decision.mobile.ctaSlot !== "header" && decision.mobile.ctaSlot !== "none";
  const headerCtaNode =
    headerUsesCta && ctaNode !== null
      ? mobileOwnsCta
        ? <div className="hidden md:block">{ctaNode}</div>
        : ctaNode
      : null;

  // Header-slot CTA: composed beside the header only when a real CTA renders
  // (no-op → header passthrough; the shipped demo stays byte-identical).
  const headerContent = headerCtaNode ? (
    <div className="ui-shell-header-row">{header}{headerCtaNode}</div>
  ) : (
    header
  );
  // P0-1 (converged from the verified UI-12.2 demo fix): in the ASIDE
  // composition the page frame becomes a wrapping row on large screens
  // (`lg:flex-row lg:flex-wrap`). The header is a flex ITEM like the rail and
  // `<main>`, so without an explicit full-width basis it sits INLINE beside the
  // sidebar (seen live: header 36%, rail 240px beside it, main squeezed to
  // 45%). The footer already breaks to its own row via `lg:w-full` below; the
  // header must do the same so the rail and `<main>` share a row UNDER a
  // full-width brand row. Header-slot presets (asideActive === false) are
  // untouched — byte-identical as before.
  const headerSlot = asideActive ? (
    <div className="lg:w-full">{headerContent}</div>
  ) : (
    headerContent
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
    // P0-1 — the sidebar capability is configured (not hard-coded per band):
    // `resolved.shell.sidebar.collapsible` is the declarative intent. The
    // tablet `collapsed-sidebar` COMPOSITION additionally means
    // "collapsed-by-default, always expandable" — a property of the pattern,
    // not a second config leaf.
    const sidebarCollapsible = resolved.shell.sidebar.collapsible;
    const renderBand = (id: string, band: "desktop" | "tablet") => {
      const isDesktopBand = band === "desktop";
      const tabletCollapsedSidebar =
        !isDesktopBand && decision.tablet.primitiveKind === "collapsed-sidebar";
      // A collapsed-sidebar band is collapsible BY DEFINITION (its initial
      // state is collapsed; the user must be able to expand it — never a
      // dead-end). Non-collapsed bands follow the configured intent.
      const collapsible = tabletCollapsedSidebar || sidebarCollapsible;
      const collapsedInitial = tabletCollapsedSidebar;
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
          collapsible={collapsible}
          collapsed={collapsedInitial}
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