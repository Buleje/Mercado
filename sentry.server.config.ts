import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,

  enabled: process.env.NODE_ENV === "production",

  // Capture 25% of transactions for better performance visibility
  tracesSampleRate: 0.25,

  // Sample 10% of transactions for continuous profiling
  profilesSampleRate: 0.1,

  // Enable Spotlight for local Sentry debugging in development
  spotlight: process.env.NODE_ENV === "development",

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
