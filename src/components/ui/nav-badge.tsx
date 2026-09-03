/**
 * NavBadge (UI-03 — Shared UI Primitives).
 *
 * The presentational "chip" used to mark navigation items (e.g., a NEW pill or
 * a demo badge). Styling-only; must never be the sole carrier of meaning —
 * composers pair it with a visible label/`title` where the badge text is not
 * itself readable.
 */
export interface NavBadgeProps {
  /** Badge text. */
  readonly label: string;
  /** Optional `title` for assistive context when the label is decorative. */
  readonly title?: string;
  readonly className?: string;
}

export function NavBadge({ label, title, className }: NavBadgeProps) {
  return (
    <span title={title} className={className ?? "nav-item-badge"}>
      {label}
    </span>
  );
}