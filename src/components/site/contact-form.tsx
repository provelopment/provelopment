"use client";

import { useActionState, useState, type FormEvent } from "react";

import { submitContactInquiry } from "@/app/contact-actions";
import {
  initialContactSubmissionState,
  type ContactSubmissionState,
} from "@/application/contact-inquiry-service";
import {
  contactInquirySchema,
  CONTACT_EMAIL_MAX,
  CONTACT_MESSAGE_MAX,
  CONTACT_NAME_MAX,
  CONTACT_SUBJECT_MAX,
  HONEYPOT_FIELD,
  type ContactFeatureConfig,
} from "@/core/contact-inquiry";
import type { Dictionary } from "@/config/i18n/dictionary";

type ContactDictionary = Dictionary["contact"];
type ContactField = "name" | "email" | "subject" | "message";

interface ContactFormProps {
  readonly config?: ContactFeatureConfig;
  readonly locale: string;
  readonly dict: ContactDictionary;
}

interface ClientErrors {
  name?: boolean;
  email?: boolean;
  subject?: boolean;
  message?: boolean;
}

function isContactField(value: unknown): value is ContactField {
  return value === "name" || value === "email" || value === "subject" || value === "message";
}

/**
 * Contact form (Phase B). Config-driven (`features.contact`) and locale-aware.
 *
 * When the feature is unconfigured the form is NOT drawn — an explicit
 * "not configured" state is shown instead (the template never pretends a demo
 * form is operational). The active form validates on the client via the same
 * Zod schema the server is authoritative with, then submits through the
 * server action.
 */
export function ContactForm({ config, locale, dict }: ContactFormProps) {
  if (!config) {
    return (
      <div className="rounded-lg border border-border bg-accent p-6">
        <h2 className="text-lg font-semibold">{dict.unconfigured}</h2>
      </div>
    );
  }
  return <ActiveContactForm config={config} locale={locale} dict={dict} />;
}

interface ActiveContactFormProps {
  readonly config: ContactFeatureConfig;
  readonly locale: string;
  readonly dict: ContactDictionary;
}

function ActiveContactForm({ config, locale, dict }: ActiveContactFormProps) {
  const subjectEnabled = config.fields?.subject !== false;

  const [values, setValues] = useState({ name: "", email: "", subject: "", message: "" });
  const [clientErrors, setClientErrors] = useState<ClientErrors>({});
  const [state, formAction, isPending] = useActionState<ContactSubmissionState, FormData>(
    submitContactInquiry,
    initialContactSubmissionState,
  );

  function updateField(field: "name" | "email" | "subject" | "message", value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
    setClientErrors((previous) => {
      if (!previous[field]) return previous;
      const next = { ...previous };
      next[field] = undefined;
      return next;
    });
  }

  /** Client mirror of the server-authoritative Zod validation (same schema). */
  function validateForm(): boolean {
    const result = contactInquirySchema.safeParse({ ...values, locale });
    if (result.success) {
      setClientErrors({});
      return true;
    }
    const errors: ClientErrors = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (isContactField(field)) errors[field] = true;
    }
    setClientErrors(errors);
    return false;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!validateForm()) {
      event.preventDefault();
    }
  }

  const serverErrors = state.fieldErrors ?? {};
  const errorFor = (field: ContactField): boolean =>
    Boolean(clientErrors[field] || serverErrors[field]);

  const fieldClassName = (field: ContactField) =>
    `w-full rounded border bg-background px-3 py-2 text-sm text-foreground ${
      errorFor(field) ? "border-red-500" : "border-border"
    }`;

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate className="grid gap-4">
      <input type="hidden" name="locale" value={locale} />

      <div className="grid">
        <label htmlFor="contact-name" className="mb-1 text-sm font-medium">
          {dict.nameLabel}
        </label>
        <input
          id="contact-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          maxLength={CONTACT_NAME_MAX}
          value={values.name}
          onChange={(event) => updateField("name", event.target.value)}
          aria-invalid={errorFor("name")}
          aria-describedby={errorFor("name") ? "contact-name-error" : undefined}
          className={fieldClassName("name")}
        />
        {errorFor("name") ? (
          <p id="contact-name-error" className="mt-1 text-sm text-red-600">
            {dict.errors.name}
          </p>
        ) : null}
      </div>

      <div className="grid">
        <label htmlFor="contact-email" className="mb-1 text-sm font-medium">
          {dict.emailLabel}
        </label>
        <input
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={CONTACT_EMAIL_MAX}
          value={values.email}
          onChange={(event) => updateField("email", event.target.value)}
          aria-invalid={errorFor("email")}
          aria-describedby={errorFor("email") ? "contact-email-error" : undefined}
          className={fieldClassName("email")}
        />
        {errorFor("email") ? (
          <p id="contact-email-error" className="mt-1 text-sm text-red-600">
            {dict.errors.email}
          </p>
        ) : null}
      </div>

      {subjectEnabled ? (
        <div className="grid">
          <label htmlFor="contact-subject" className="mb-1 text-sm font-medium">
            {dict.subjectLabel}
          </label>
          <input
            id="contact-subject"
            name="subject"
            type="text"
            autoComplete="off"
            maxLength={CONTACT_SUBJECT_MAX}
            value={values.subject}
            onChange={(event) => updateField("subject", event.target.value)}
            aria-invalid={errorFor("subject")}
            aria-describedby={errorFor("subject") ? "contact-subject-error" : undefined}
            className={fieldClassName("subject")}
          />
          {errorFor("subject") ? (
            <p id="contact-subject-error" className="mt-1 text-sm text-red-600">
              {dict.errors.subject}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid">
        <label htmlFor="contact-message" className="mb-1 text-sm font-medium">
          {dict.messageLabel}
        </label>
        <textarea
          id="contact-message"
          name="message"
          rows={6}
          required
          maxLength={CONTACT_MESSAGE_MAX}
          value={values.message}
          onChange={(event) => updateField("message", event.target.value)}
          aria-invalid={errorFor("message")}
          aria-describedby={errorFor("message") ? "contact-message-error" : undefined}
          className={fieldClassName("message")}
        />
        {errorFor("message") ? (
          <p id="contact-message-error" className="mt-1 text-sm text-red-600">
            {dict.errors.message}
          </p>
        ) : null}
      </div>

      {/* Honeypot: visually hidden, off the tab order; bots that fill it are
          discarded server-side without invoking the sender. */}
      <div className="sr-only" aria-hidden="true">
        <label htmlFor="contact-honeypot">{dict.honeypotLabel}</label>
        <input
          id="contact-honeypot"
          type="text"
          name={HONEYPOT_FIELD}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <p aria-live="polite" className="text-sm">
        {(state.status === "success" || state.status === "botDiscarded")
          ? dict.success
          : null}
        {state.status === "unconfiguredDemo" ? dict.demoNotice : null}
        {state.status === "configError" ? dict.configError : null}
        {state.status === "sendError" ? dict.sendError : null}
        {isPending ? <span aria-busy="true">{dict.sending}</span> : null}
      </p>

      <div>
        <button
          type="submit"
          disabled={isPending}
          aria-busy={isPending}
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {isPending ? dict.sending : dict.submit}
        </button>
      </div>
    </form>
  );
}