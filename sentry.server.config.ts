import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,

  enabled: process.env.NODE_ENV === "production",

  // Capture 10% of transactions for performance tracing
  tracesSampleRate: 0.1,

  /**
   * Attach the x-request-id header (injected by middleware) to every Sentry
   * event so backend logs and Sentry issues can be correlated by trace ID.
   */
  beforeSend(event, hint) {
    // hint.originalException is the raw Error; hint.data may carry extra context
    const requestId = (hint?.data as Record<string, unknown> | undefined)?.["requestId"] as string | undefined;
    if (requestId) {
      event.tags = { ...event.tags, request_id: requestId };
      event.extra = { ...event.extra, requestId };
    }
    return event;
  },
});
