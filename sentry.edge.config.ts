import * as Sentry from "@sentry/nextjs";
import { tacharEventoSentry, tacharMiga } from "@/lib/telemetry/secretos-en-url";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,

  enabled: process.env.NODE_ENV === "production",

  tracesSampleRate: 0.1,

  /* El proxy corre en edge y ve TODAS las URLs: `?threadToken=` del chat, enlaces de firma (17-10, T4). */
  beforeBreadcrumb(miga) {
    return tacharMiga(miga);
  },

  beforeSendTransaction(event) {
    return tacharEventoSentry(event);
  },

  beforeSend(event, hint) {
    event = tacharEventoSentry(event);
    const requestId = (hint?.data as Record<string, unknown> | undefined)?.["requestId"] as string | undefined;
    if (requestId) {
      event.tags = { ...event.tags, request_id: requestId };
      event.extra = { ...event.extra, requestId };
    }
    return event;
  },
});
