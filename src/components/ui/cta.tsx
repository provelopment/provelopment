import { NavCta } from "./nav-cta";

/**
 * Cta (P0-2 — CTA Composition Convergence).
 *
 * The ONE semantic path for the primary CTA. It owns:
 *  - PRESENCE semantics: a primary CTA renders exactly when `enabled` is true
 *    AND an adopter label + href are supplied. The Foundation never invents a
 *    label or infers a destination (`href` is adopter-owned, UI-07 D1);
 *  - PRESENTATION: delegates to the shared `NavCta` primitive (link semantics,
 *    `aria` state, external handling) and applies the `prominent` visual
 *    treatment from the resolved `cta.style` when requested;
 *
 * It is deliberately NOT responsible for shell layout or placement: the shell
 * engine / content layer decide WHERE the CTA is composed (header / aside /
 * drawer / overlay) from the resolved ctaSlot decision. This component only
 * decides WHETHER a CTA exists and what it looks like.
 *
 * One semantic contract, preset-agnostic, custom-config compatible: the same
 * `Cta` is used by the engine's header/aside composition and by the content
 * layer's mobile disclosure composition — there is exactly one presence
 * predicate and one prominence rule in the whole codebase.
 */
export interface CtaProps {
  /** Whether the primary CTA is enabled (`resolved.cta.enabled`). */
  readonly enabled: boolean;
  /** Visual prominence (`resolved.cta.style`): `standard` or `prominent`. */
  readonly style: "standard" | "prominent";
  /** Adopter-provided visible label (`resolved.cta.label`). Never invented. */
  readonly label?: string;
  /** Adopter-owned destination (`resolved.cta.href`). Never inferred. */
  readonly href?: string;
  /** Placement class (e.g. `ui-shell-cta`, `ui-drawer-cta`). */
  readonly className?: string;
}

/** The single presence predicate: a CTA renders only when enabled ∧ label ∧ href. */
export function isCtaRenderable(
  enabled: boolean,
  label: string | undefined,
  href: string | undefined,
): boolean {
  return enabled && !!label && !!href;
}

export function Cta({ enabled, style, label, href, className }: CtaProps) {
  if (!isCtaRenderable(enabled, label, href)) return null;
  const classes = [className, style === "prominent" ? "ui-cta-prominent" : undefined]
    .filter(Boolean)
    .join(" ");
  return <NavCta item={{ label: label as string, href: href as string }} className={classes || undefined} />;
}