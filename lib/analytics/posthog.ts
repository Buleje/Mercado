import { PostHog } from "posthog-node";

// Server-side PostHog client — fire-and-forget pattern.
// Bug fix 2026-04-26: `new PostHog("")` arroja durante el build cuando
// NEXT_PUBLIC_POSTHOG_KEY no esta seteado (page data collection step
// instancia el modulo y crashea). Si falta la key exportamos un no-op
// client que tiene la misma firma pero descarta los eventos.
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

type PHCapture = (args: { distinctId: string; event: string; properties?: Record<string, unknown> }) => unknown;
type PHIdentify = (args: { distinctId: string; properties: Record<string, unknown> }) => unknown;
type PHClient = { capture: PHCapture; identify: PHIdentify };

const noopClient: PHClient = {
  capture: () => undefined,
  identify: () => undefined,
};

const posthogClient: PHClient = POSTHOG_KEY
  ? (new PostHog(POSTHOG_KEY, {
      host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
      flushAt: 10,
      flushInterval: 5000,
    }) as unknown as PHClient)
  : noopClient;

export function trackEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
) {
  try { posthogClient.capture({ distinctId, event, properties }); } catch { /* silent */ }
}

export function identifyUser(
  distinctId: string,
  properties: Record<string, unknown>
) {
  try { posthogClient.identify({ distinctId, properties }); } catch { /* silent */ }
}

export function trackPageView(distinctId: string, url: string) {
  try { posthogClient.capture({ distinctId, event: "$pageview", properties: { $current_url: url } }); } catch { /* silent */ }
}

export { posthogClient };
