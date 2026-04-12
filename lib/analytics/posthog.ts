import { PostHog } from "posthog-node";

// Server-side PostHog client — fire-and-forget pattern
const posthogClient = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY || "", {
  host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
  flushAt: 10,
  flushInterval: 5000,
});

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
