"use client";

import { useRouter } from "next/navigation";

/**
 * One option of the Site selector: the site's code, its visitor-facing label and the destination
 * its switch resolves to (computed server-side by `@/application/site-switch`, so the control
 * itself never asks whether a page exists).
 */
export interface SiteSelectorOption {
  readonly code: string;
  readonly label: string;
  readonly href: string;
}

interface SiteSelectorProps {
  /** The current site's code — the select's value. */
  readonly current: string;
  /** Accessible name for the control (localized group label, e.g. "Site"). */
  readonly label: string;
  readonly options: readonly SiteSelectorOption[];
}

/**
 * SITE dropdown shown in the header (FOUNDATION-S1E2).
 *
 * A SITE is a page/configuration context (`Canada`, `France`, `Worldwide`) — distinct from the
 * Language selector (a language INSIDE this site), the Location selector (a physical place inside
 * this site) and the Layout selector (a presentation choice that belongs to no site at all).
 *
 * The control is deliberately thin: it renders the options the server resolved and navigates to
 * the destination that resolution produced. Choosing the site the visitor is already in is a
 * no-op, and the caller renders no selector at all when the deployment serves one site — so a
 * single-site deployment's chrome is unchanged.
 */
export function SiteSelector({ current, label, options }: SiteSelectorProps) {
  const router = useRouter();

  function handleChange(nextCode: string) {
    if (nextCode === current) return;
    const option = options.find((candidate) => candidate.code === nextCode);
    if (option === undefined) return;
    router.push(option.href);
  }

  return (
    <select
      aria-label={label}
      data-selector="site"
      value={current}
      onChange={(event) => handleChange(event.target.value)}
      className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
    >
      {options.map((option) => (
        <option key={option.code} value={option.code}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
