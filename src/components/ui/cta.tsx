import { NavCta } from "./nav-cta";

/**
 * P5-5 — inline control vocabulary types (the shared UI primitives boundary
 * forbids `@/core` imports in primitives; these mirror the core vocabulary
 * values 1:1 so the contract can never drift from the schema).
 */
type CtaState = "default" | "disabled";
type IconPosition = "start" | "end";

/**
 * Cta (P0-2 — CTA Composition Convergence).
 *
 * The ONE semantic path for the primary CTA. It owns:
 *  - PRESENCE semantics: a primary CTA renders exactly when `enabled` is true,
 *    `href` is supplied, there IS visible content (a label or an icon), AND an
 *    accessible name exists (the label, or the semantic `action` for icon-only
 *    CTAs). The Foundation never invents a label, never infers a destination
 *    (`href` is adopter-owned, UI-07 D1), and never leaves an empty
 *    accessible label;
 *  - PRESENTATION: delegates to the shared `NavCta` primitive (link semantics,
 *    `aria` state, external handling), applies the `prominent` visual treatment
 *    from the resolved `cta.style`, the P5-5 icon (asset + placement), and the
 *    semantic `state` (`disabled` renders aria-disabled + non-navigable);
 *
 * It is deliberately NOT responsible for shell layout or placement: the shell
 * engine / content layer decide WHERE the CTA is composed (header / aside /
 * drawer / overlay) from the resolved ctaSlot decision.
 */
export interface CtaProps {
  /** Whether the primary CTA is enabled (`resolved.cta.enabled`). */
  readonly enabled: boolean;
  /** Visual prominence (`resolved.cta.style`): `standard` or `prominent`. */
  readonly style: "standard" | "prominent";
  /** Semantic business action (accessible-name source for icon-only CTAs). */
  readonly action?: string;
  /** Adopter-provided visible label (`resolved.cta.label`). Never invented. */
  readonly label?: string;
  /** Adopter-owned destination (`resolved.cta.href`). Never inferred. */
  readonly href?: string;
  /** P5-5 — optional icon asset (plain public/assets filename; "" = none). */
  readonly icon?: string;
  /** P5-5 — icon placement within the CTA (`start` leading, `end` trailing). */
  readonly iconPosition?: IconPosition;
  /** P5-5 — semantic CTA state (`default` | `disabled`). */
  readonly state?: CtaState;
  /** Placement class (e.g. `ui-shell-cta`, `ui-drawer-cta`). */
  readonly className?: string;
}

/**
 * The single presence predicate. A CTA renders only when:
 *  - `enabled` is true;
 *  - `href` is present (a destination is never invented);
 *  - there is visible content — a non-empty label OR an icon;
 *  - an accessible name exists — the label, or the semantic `action`
 *    (an icon-only CTA without `action` would have NO accessible name, so it
 *    must not render: we never ship an empty accessible label).
 */
export function isCtaRenderable(
  enabled: boolean,
  label: string | undefined,
  href: string | undefined,
  icon: string | undefined,
  action: string | undefined,
): boolean {
  if (!enabled || !href) return false;
  const hasLabel = !!label && label !== "";
  const name = hasLabel ? label : action && action !== "" ? action : null;
  if (!name) return false;
  return hasLabel || !!icon;
}

export function Cta({ enabled, style, label, href, action, icon, iconPosition, state, className }: CtaProps) {
  if (!isCtaRenderable(enabled, label, href, icon, action)) return null;
  const classes = [className, style === "prominent" ? "ui-cta-prominent" : undefined]
    .filter(Boolean)
    .join(" ");
  const hasLabel = !!label && label !== "";
  return (
    <NavCta
      item={{
        label: label ?? "",
        href: href as string,
        icon: icon && icon !== "" ? icon : undefined,
        iconPosition,
        disabled: state === "disabled",
        ariaLabel: hasLabel ? undefined : action,
      }}
      className={classes || undefined}
    />
  );
}