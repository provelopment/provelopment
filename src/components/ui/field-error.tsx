import type { ReactNode } from "react";

/**
 * FieldError — P2-8. Shared field-level validation-error presentation primitive.
 *
 * Before P2-8 the contact form repeated the SAME byte-identical conditional
 * error block once per field (name/email/subject/message):
 *
 *     {errorFor(field) ? (
 *       <p id="contact-<field>-error" className="mt-1 text-sm text-destructive">
 *         {dict.errors.<field>}
 *       </p>
 *     ) : null}
 *
 * All four instances share the same semantic contract — same role, same
 * placement (mt-1 under the control), same token styling (`text-destructive`),
 * same stable per-field id, same `aria-describedby` wiring by the caller, and
 * the same conditional "render only when invalid" behavior. This primitive is
 * the single shared path for that demonstrated contract.
 *
 * Contract:
 *  - presentational only: it renders the error `<p>` when `show` is true and
 *    renders NOTHING otherwise (a false show leaves zero DOM residue);
 *  - the caller owns `id` (deterministic per field, e.g. "contact-name-error")
 *    and wires `aria-describedby={show ? id : undefined}` on the associated
 *    control — mirroring the exact pre-P2-8 accessibility contract;
 *  - token-driven: `mt-1 text-sm text-destructive` — byte-identical to the
 *    demonstrated styling; no raw colors;
 *  - no role/aria-live: field-level descriptive error text, announced when the
 *    control is described; the form's SUBMISSION status lives in the separate
 *    `aria-live="polite"` block below the fields (SRP — do not conflate).
 *
 * Deliberately NOT used for: submission-level status (aria-live region), field
 * labels, or helper/description text — those are different contracts.
 */
export interface FieldErrorProps {
  /** Deterministic id of the error element (the `aria-describedby` target). */
  readonly id: string;
  /** Whether the field is currently invalid; when false renders nothing. */
  readonly show: boolean;
  /** Localized error message. */
  readonly children: ReactNode;
}

export function FieldError({ id, show, children }: FieldErrorProps) {
  if (!show) return null;
  return (
    <p id={id} className="mt-1 text-sm text-destructive">
      {children}
    </p>
  );
}