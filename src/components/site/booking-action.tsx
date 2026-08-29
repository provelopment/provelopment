import type { BookingAction } from "@/application/booking-action";

interface BookingActionProps {
  /** The already-resolved booking action (composed at the app boundary). */
  readonly action: BookingAction;
  /** Localized label from the platform dictionary. */
  readonly label: string;
}

/**
 * Minimal rendering seam for a booking action.
 *
 * This component is deliberately provider-neutral: it receives the resolved
 * `BookingAction` and a localized label, never a provider or provider URL, and
 * renders a modest static external link when a link action exists. With no
 * action it renders nothing, so a disabled booking integration has zero visual
 * footprint. A future interactive embed is a separate capability and remains
 * out of scope.
 */
export function BookingAction({ action, label }: BookingActionProps) {
  if (action.kind !== "link") return null;

  return (
    <a
      href={action.href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:border-primary hover:text-primary"
    >
      {label}
    </a>
  );
}
