import {
  ContactInquiryMisconfigurationError,
  type ContactFeatureConfig,
  type ContactInquiryEnv,
} from "@/core/contact-inquiry";
import type { ContactInquirySender } from "@/application/contact-inquiry-sender";
import { createStubContactInquirySender } from "./stub";
import { createWebhookContactInquirySender } from "./webhook";

export { createStubContactInquirySender } from "./stub";
export { createWebhookContactInquirySender } from "./webhook";
export { ContactInquiryMisconfigurationError } from "@/core/contact-inquiry";

/** Hosts allowed to use plain `http://` webhook endpoints (local dev/tests only). */
function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

/**
 * Resolves the configured provider to a concrete sender.
 *
 * - No `features.contact` block, or `provider: "stub"` → explicit demo stub.
 * - `provider: "webhook"` requires `CONTACT_WEBHOOK_URL`.
 *   A missing/unsafe endpoint throws `ContactInquiryMisconfigurationError`
 *   and is surfaced as a distinct configuration-error state — a configured
 *   webhook can never silently degrade to the demo stub. Non-loopback
 *   endpoints must use HTTPS (adopter-controlled external trust boundary).
 */
export function createContactInquirySender(
  config: ContactFeatureConfig | undefined,
  env: ContactInquiryEnv,
): ContactInquirySender {
  if (!config || config.provider === "stub") {
    return createStubContactInquirySender();
  }

  const url = env.webhookUrl?.trim();
  if (!url) {
    throw new ContactInquiryMisconfigurationError(
      'features.contact.provider is "webhook" but CONTACT_WEBHOOK_URL is not set. ' +
        "Set the webhook receiver URL (and optional auth token) as an environment variable, " +
        'or set the provider to "stub". The form will not pretend to send inquiries.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ContactInquiryMisconfigurationError(
      "CONTACT_WEBHOOK_URL is not a valid URL. Provide an absolute https:// endpoint.",
    );
  }

  if (!isLoopbackHost(parsed.hostname) && parsed.protocol !== "https:") {
    throw new ContactInquiryMisconfigurationError(
      "CONTACT_WEBHOOK_URL must use https:// for non-local endpoints. " +
        "Production webhook URLs are an adopter-controlled external trust boundary and must be TLS.",
    );
  }

  return createWebhookContactInquirySender({ url, token: env.webhookToken });
}