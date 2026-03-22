import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Reduce noise in development
  enabled: process.env.NODE_ENV === "production",

  // Capture 10% of transactions for performance tracing
  tracesSampleRate: 0.1,

  // Capture 100% of sessions with errors
  replaysOnErrorSampleRate: 1.0,

  // Capture 1% of all sessions for session replay
  replaysSessionSampleRate: 0.01,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  /**
   * Attach the x-request-id response header to Sentry client events.
   * The middleware echoes this header on every response so the browser
   * can read it and include it in crash reports for log correlation.
   */
  beforeSend(event, hint) {
    // Ignore errors from browser extensions (password managers, autofill overlays, etc.)
    const err = hint?.originalException;
    if (err instanceof Error) {
      const stack = err.stack || "";
      const msg = err.message || "";
      if (
        stack.includes("bootstrap-autofill") ||
        stack.includes("chrome-extension") ||
        stack.includes("moz-extension") ||
        stack.includes("extension:") ||
        msg.includes("bootstrap-autofill")
      ) {
        return null; // Drop the event — don't send to Sentry
      }
    }
    // Read the most recent request id stored by the fetch interceptor (if any)
    if (typeof document !== "undefined") {
      const requestId = document.head.querySelector<HTMLMetaElement>(
        'meta[name="x-request-id"]',
      )?.content;
      if (requestId) {
        event.tags = { ...event.tags, request_id: requestId };
      }
    }
    return event;
  },
});
