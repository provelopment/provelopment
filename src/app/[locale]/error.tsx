"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useErrorMessages } from "@/components/site/error-messages-context";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";

/**
 * Segment error boundary for recoverable render errors within a locale.
 *
 * This error.tsx catches errors in this segment and its children, so it renders
 * inside the `[locale]` layout and therefore preserves the site header, footer,
 * and current locale. It is a Client Component (per App Router requirements)
 * and localizes its copy via the canonical `dictionary.error` block, transported
 * from the `[locale]` layout through `ErrorMessagesProvider`.
 *
 * Security: the UI must never surface any details of the thrown error to
 * users — not its message, its stack, internal paths, or environment
 * information. Only Next.js's opaque error digest (never user-visible) is
 * available, and not even that is displayed here.
 */
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ locale?: string }>();
  const messages = useErrorMessages();
  const locale = params?.locale;

  return (
    <Section className="py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight">{messages.title}</h1>
      <p className="mt-4 text-muted-foreground">{messages.message}</p>
      <div className="mt-8 flex items-center justify-center gap-4">
        <Button type="button" onClick={() => reset()}>
          {messages.tryAgain}
        </Button>
        <Link
          href={`/${locale ?? ""}`}
          className="font-medium text-primary hover:underline"
        >
          {messages.returnHome}
        </Link>
      </div>
    </Section>
  );
}
