import type { Dictionary } from "@/config/i18n/dictionary";
import type { ConnectMethod } from "@/config";

/**
 * Phase M refinement — shared connection-method label source, used by BOTH the
 * Connect page and the footer so the two interfaces can never drift.
 *
 *   1. localized dictionary override (`dictionary.connect.methods[method.id]`);
 *   2. otherwise the configured method label (proper nouns such as WhatsApp,
 *      Telegram or Viber typically flow straight through).
 */
export function connectMethodLabel(
  dictionary: Dictionary,
  method: ConnectMethod,
): string {
  return dictionary.connect.methods?.[method.id] ?? method.label;
}