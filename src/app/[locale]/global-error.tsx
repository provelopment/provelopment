"use client";

/**
 * Global error boundary (root-level recovery UI).
 *
 * This boundary is intentionally minimal and unlocalized: it replaces the
 * entire root layout (which is what failed), so it must render its own
 * `<html>`/`<body>` and cannot depend on the header/footer or a known locale.
 * It must never surface any detail of the thrown error (message, stack, or
 * other debugging information) to users.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: "28rem", padding: "2rem", textAlign: "center" }}>
          <h1>Something went wrong</h1>
          <p>We&rsquo;re sorry that happened. Please try again.</p>
          <button type="button" onClick={() => reset()}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}