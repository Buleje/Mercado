import "server-only";
import { logger } from "@/lib/logger";
import type { FunnelStep, SloSourceStatus } from "./types";

/**
 * Checkout funnel REAL desde PostHog vía HogQL. Cuenta sesiones distintas que
 * vieron cada paso del checkout en los últimos N días. Estado honesto
 * "not_configured" si faltan las credenciales (nunca inventa el funnel).
 *
 * Activar: POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID (+ opcional
 * POSTHOG_HOST, default us.posthog.com) en el env.
 * Doc: https://posthog.com/docs/api/queries
 */

// Pasos del checkout por patrón de URL (pageview). Orden = embudo.
const STEPS: Array<{ label: string; like: string }> = [
  { label: "Ver carrito", like: "%/marketplace/carrito%" },
  { label: "Datos", like: "%/checkout/datos%" },
  { label: "Entrega", like: "%/checkout/entrega%" },
  { label: "Confirmar", like: "%/checkout/confirmar%" },
];

export async function getCheckoutFunnel(windowDays = 30): Promise<{ status: SloSourceStatus; steps: FunnelStep[] }> {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  if (!key || !projectId) return { status: "not_configured", steps: [] };

  const host = (process.env.POSTHOG_HOST ?? "https://us.posthog.com").replace(/\/$/, "");

  // Conditional aggregation: una query, una columna por paso.
  const cols = STEPS.map(
    (s, i) => `countDistinct(if(properties.$current_url LIKE '${s.like}', $session_id, NULL)) AS s${i}`,
  ).join(", ");
  const hogql = `SELECT ${cols} FROM events WHERE event = '$pageview' AND timestamp > now() - INTERVAL ${windowDays} DAY`;

  try {
    const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query: hogql } }),
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      logger.warn("[SLO/PostHog] query error", { status: res.status });
      return { status: "error", steps: [] };
    }
    const json = (await res.json()) as { results?: number[][] };
    const row = json.results?.[0];
    if (!row) return { status: "empty", steps: [] };

    const counts = STEPS.map((_, i) => Number(row[i] ?? 0));
    const base = counts[0] || 0;
    if (base === 0) return { status: "empty", steps: [] };

    const steps: FunnelStep[] = STEPS.map((s, i) => {
      const prev = i === 0 ? counts[i] : counts[i - 1];
      const dropoff = i === 0 || prev === 0 ? 0 : Math.round(((prev - counts[i]) / prev) * 100);
      return { step: s.label, sessions: counts[i], dropoff };
    });
    return { status: "live", steps };
  } catch (err) {
    logger.error("[SLO/PostHog] fetch failed", { error: String(err) });
    return { status: "error", steps: [] };
  }
}
