"use client";

import { useEffect } from "react";
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from "web-vitals";
import { getActiveTenantSlug } from "@/lib/tenant-fetch";

function sendToGA(metric: Metric) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", metric.name, {
    value: Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value),
    metric_id: metric.id,
    metric_value: metric.value,
    metric_delta: metric.delta,
    metric_rating: metric.rating,
    non_interaction: true,
  });
}

// ── RUM per-tenant (historial de admin?tab=rendimiento) ──────────────────────
// Junta los valores FINALES de la visita y los manda UNA sola vez al ocultarse
// la página (patrón recomendado por web-vitals: los valores recién quedan
// definitivos en pagehide). Server: /api/analytics/vitals → lib/rum-history.ts.
const RUM_METRICS = new Set(["LCP", "CLS", "INP", "TTFB"]);
const pending = new Map<string, { value: number; rating: string }>();
let flushed = false;

function collectForRum(metric: Metric) {
  if (!RUM_METRICS.has(metric.name)) return;
  pending.set(metric.name.toLowerCase(), { value: metric.value, rating: metric.rating });
}

function flushRum(tenantSlug: string) {
  if (flushed || pending.size === 0 || typeof navigator === "undefined") return;
  flushed = true;
  const body = JSON.stringify({
    tenantSlug,
    metrics: Object.fromEntries(pending),
  });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics/vitals", new Blob([body], { type: "application/json" }));
    } else {
      void fetch("/api/analytics/vitals", {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      });
    }
  } catch {
    /* beacon best-effort */
  }
}

function report(metric: Metric) {
  sendToGA(metric);
  collectForRum(metric);
}

/**
 * @param tenantSlug atribución explícita del RUM (tiendas white-label lo pasan
 *   server-side). Sin prop, se auto-detecta del path/subdominio (marketplace + home).
 */
export default function WebVitalsReporter({ tenantSlug }: { tenantSlug?: string } = {}) {
  useEffect(() => {
    const slug = tenantSlug || getActiveTenantSlug();
    const flush = () => flushRum(slug);

    onCLS(report);
    onFCP(report);
    onINP(report);
    onLCP(report);
    onTTFB(report);

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flush);
    };
  }, [tenantSlug]);

  return null;
}
