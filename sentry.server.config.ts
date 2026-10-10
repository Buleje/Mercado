import * as Sentry from "@sentry/nextjs";
import { tacharSecretosDeRuta } from "@/lib/telemetry/secretos-en-url";

/* La URL del pedido va en `request.url` y, si la ruta no tiene nombre, en `transaction`. */
function tacharEventoServidor<T extends { request?: { url?: string }; transaction?: string }>(event: T): T {
  if (event.request?.url) event.request.url = tacharSecretosDeRuta(event.request.url);
  if (event.transaction) event.transaction = tacharSecretosDeRuta(event.transaction);
  return event;
}

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
  /* El secreto del enlace del kiosko va en la ruta de la página (security 10-10, H2). */
  beforeSendTransaction(event) {
    return tacharEventoServidor(event);
  },

  beforeSend(event, hint) {
    tacharEventoServidor(event);
    // hint.originalException is the raw Error; hint.data may carry extra context
    const requestId = (hint?.data as Record<string, unknown> | undefined)?.["requestId"] as string | undefined;
    if (requestId) {
      event.tags = { ...event.tags, request_id: requestId };
      event.extra = { ...event.extra, requestId };
    }
    return event;
  },
});
