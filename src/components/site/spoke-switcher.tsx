"use client";

/**
 * THE HUB-SCOPED SPOKE SWITCHER (R1 — generic shell chrome)
 * ========================================================
 *
 * ONE control that lets a visitor travel between the SPOKES of the ONE HUB this Installation represents.
 *
 * ONE INSTALLATION = ONE HUB. Every Spoke the manifest declares is a MEMBER of that Hub, and that
 * declaration is the whole membership boundary: this control can only ever offer those members, and the
 * build refuses any option whose destination would not route back to the member it names. A domain suffix
 * does NOT imply membership, and an unrelated organization's site belongs to a different Hub/Installation —
 * it is never offered here, not even if someone authors its URL.
 *
 * The dimensions are distinct and are NOT collapsed by this control:
 *
 *   Hub        the organizational/navigation association boundary (ONE per Installation)
 *   Spoke      a complete website/domain context, a member of exactly one Hub
 *   Site       a country/global context INSIDE one Spoke (the Site selector)
 *   Location   a physical/business location INSIDE one Site (the Location selector)
 *   Language   an independent locale dimension (the Language selector)
 *
 * So this control moves Spoke → Spoke within the SAME Hub. It is NOT Site switching, NOT Location switching,
 * NOT Language switching, and NOT arbitrary external navigation.
 *
 * WHAT IT RENDERS, AND WHAT IT DOES NOT DECIDE
 * --------------------------------------------
 * The options arrive SERVER-RESOLVED, in AUTHORED order, from the Installation's own declaration
 * (`spokeSwitcher` in the Spoke collection, read through `@/config/spoke-routing`), together with the
 * identity of the Spoke this page belongs to — the request/hostname-authoritative current member, never a
 * client guess. The build has already refused any option whose destination would not route to the member it
 * names, so this control only presents and navigates.
 *
 * A SPOKE IS ANOTHER ORIGIN, so the visit is a REAL navigation: `window.location.assign` sends the browser to
 * that origin's root, where the target member's own routing completes the visit at its default entry point.
 * Selecting the current member is a NO-OP — nothing reloads, nothing changes.
 *
 * A native `<select>` is the platform's established control for "choose a destination and go there" (the Site,
 * Location and Language selectors are the same primitive), so this control is a `<select>` too: it carries the
 * accessible name the caller resolved from the current locale's dictionary, and every option's label is the
 * authored member label.
 */
export interface SpokeSwitcherOption {
  /** The Spoke's authored identity (also the option's value — a Spoke is never a label). */
  readonly spokeId: string;
  /** The authored label a visitor reads. */
  readonly label: string;
  /** The absolute origin the option travels to (already proved routable to `spokeId` at build time). */
  readonly href: string;
}

interface SpokeSwitcherProps {
  /** The identity of the Spoke THIS page belongs to — what the control shows as selected. */
  readonly current: string;
  /** The control's localized accessible name (dictionary `spokeSwitcher.label`). */
  readonly label: string;
  readonly options: readonly SpokeSwitcherOption[];
}

/**
 * WHERE ONE SELECTION SENDS THE VISITOR, or `null` when it should send them nowhere.
 *
 * The rule is PURE and shared by the control and its tests: choosing the Spoke the visitor is already in is a
 * NO-OP (nothing reloads, nothing changes), and a value no option offers is ignored rather than guessed at.
 * Everything else travels to that option's authored origin.
 */
export function switcherDestinationFor(
  current: string,
  options: readonly SpokeSwitcherOption[],
  nextSpokeId: string,
): string | null {
  if (nextSpokeId === current) return null;
  const option = options.find((candidate) => candidate.spokeId === nextSpokeId);
  return option?.href ?? null;
}

export function SpokeSwitcher({ current, label, options }: SpokeSwitcherProps) {
  function handleChange(nextSpokeId: string) {
    const destination = switcherDestinationFor(current, options, nextSpokeId);
    if (destination === null) return;
    window.location.assign(destination);
  }

  return (
    <select
      aria-label={label}
      data-switcher="spoke"
      value={current}
      onChange={(event) => handleChange(event.target.value)}
      className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
    >
      {options.map((option) => (
        <option key={option.spokeId} value={option.spokeId}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
