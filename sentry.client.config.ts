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

  // Replay integration cargada LAZY (post-bundle). Antes estaba en el initial
  // bundle aunque solo se activara en 1% de sesiones — pesaba ~600 KB.
  // Audit perf 2026-05-19: ahora solo se descarga cuando hay error
  // (replaysOnErrorSampleRate=1.0) o si el usuario entra en sample 1%.
  integrations: [],

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

// Lazy-load replay integration on-demand (no afecta initial bundle).
// Se carga cuando el navegador está idle (requestIdleCallback) o después
// de 3s — momento en el que ya pintó LCP. Si falla la carga (CDN Sentry
// down), error silencioso — no rompe la app.
if (typeof window !== "undefined" && process.env.NODE_ENV === "production") {
  const loadReplay = async () => {
    try {
      const replay = await Sentry.lazyLoadIntegration("replayIntegration");
      Sentry.addIntegration(
        replay({
          maskAllText: true,
          blockAllMedia: true,
        }),
      );
    } catch {
      // silent
    }
  };
  const idle = (window as typeof window & {
    requestIdleCallback?: (cb: () => void) => void;
  }).requestIdleCallback;
  if (idle) {
    idle(loadReplay);
  } else {
    setTimeout(loadReplay, 3000);
  }
}
