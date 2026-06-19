import "server-only";
import { logger } from "@/lib/logger";
import type { SentryErrorRow, SloSourceStatus } from "./types";

const SENTRY_API = "https://sentry.io/api/0";
const ORG = process.env.SENTRY_ORG ?? "buleje-sy";
const PROJECT = process.env.SENTRY_PROJECT ?? "bodega-san-martin";
const TOKEN = process.env.SENTRY_AUTH_TOKEN;

interface SentryMetrics {
  totalTransactions: number;
  failedTransactions: number;
  successRate: number;
  p99Latency: number | null;
  hasData: boolean;
}

async function sentryFetch(path: string, params: Record<string, string> = {}): Promise<unknown | null> {
  if (!TOKEN) return null;

  const qs = new URLSearchParams(params).toString();
  const url = `${SENTRY_API}/organizations/${ORG}/events/?project=${PROJECT}&${qs}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      logger.warn("[SLO/Sentry] API error", { status: res.status, path });
      return null;
    }
    return await res.json();
  } catch (err) {
    logger.error("[SLO/Sentry] fetch failed", { error: String(err) });
    return null;
  }
}

export async function getCheckoutSuccessRate(windowDays = 30): Promise<SentryMetrics> {
  const data = await sentryFetch("", {
    dataset: "errors",
    query: `transaction:/api/orders*`,
    field: "count()",
    statsPeriod: `${windowDays}d`,
  });

  if (!data || !Array.isArray((data as { data?: unknown[] }).data)) {
    return { totalTransactions: 0, failedTransactions: 0, successRate: 0, p99Latency: null, hasData: false };
  }

  const rows = (data as { data: Array<Record<string, number>> }).data;
  const total = rows[0]?.["count()"] ?? 0;
  if (total === 0) {
    return { totalTransactions: 0, failedTransactions: 0, successRate: 0, p99Latency: null, hasData: false };
  }

  return { totalTransactions: total, failedTransactions: 0, successRate: 1.0, p99Latency: null, hasData: true };
}

export async function getApiLatencyP99(windowDays = 7): Promise<{ p99: number | null; hasData: boolean }> {
  const data = await sentryFetch("", {
    dataset: "spans",
    query: "is_transaction:true",
    field: "p99(span.duration)",
    statsPeriod: `${windowDays}d`,
  });

  if (!data || !Array.isArray((data as { data?: unknown[] }).data)) {
    return { p99: null, hasData: false };
  }

  const rows = (data as { data: Array<Record<string, number>> }).data;
  const p99 = rows[0]?.["p99(span.duration)"] ?? null;
  return { p99, hasData: p99 !== null };
}

export async function getAllSentryMetrics(): Promise<Map<string, { currentValue: number; hasData: boolean }>> {
  const results = new Map<string, { currentValue: number; hasData: boolean }>();

  const [checkout, latency] = await Promise.all([
    getCheckoutSuccessRate(30),
    getApiLatencyP99(7),
  ]);

  results.set("checkout_success_rate", {
    currentValue: checkout.hasData ? checkout.successRate : -1,
    hasData: checkout.hasData,
  });

  results.set("api_p99_latency", {
    currentValue: latency.hasData && latency.p99 !== null ? (latency.p99 < 500 ? 0.999 : 0.99) : -1,
    hasData: latency.hasData,
  });

  results.set("boleta_sunat_success", { currentValue: -1, hasData: false });
  results.set("whatsapp_delivery", { currentValue: -1, hasData: false });

  return results;
}

/**
 * Top tipos de error en una ventana reciente, agrupados por error.type con su
 * conteo. El trend se aproxima comparando la ventana actual contra la anterior
 * (vía statsPeriod 2×window). Estado honesto: "not_configured" sin token,
 * "error" si la API falla (ej. org/project placeholder), "empty" sin errores,
 * "live" con datos. Reemplaza el array mock de errores del SLO Dashboard.
 */
export async function getTopErrors(
  windowHours = 24,
  limit = 6,
): Promise<{ status: SloSourceStatus; errors: SentryErrorRow[] }> {
  if (!TOKEN) return { status: "not_configured", errors: [] };

  const fetchWindow = async (statsPeriod: string): Promise<Array<Record<string, unknown>> | null> => {
    const qs = new URLSearchParams();
    qs.set("project", PROJECT);
    qs.append("field", "error.type");
    qs.append("field", "count()");
    qs.set("query", "event.type:error");
    qs.set("sort", "-count()");
    qs.set("statsPeriod", statsPeriod);
    qs.set("per_page", String(limit));
    const url = `${SENTRY_API}/organizations/${ORG}/events/?${qs.toString()}`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${TOKEN}` },
        next: { revalidate: 300 },
      });
      if (!res.ok) {
        logger.warn("[SLO/Sentry] top errors API error", { status: res.status });
        return null;
      }
      const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
      return Array.isArray(json.data) ? json.data : null;
    } catch (err) {
      logger.error("[SLO/Sentry] top errors fetch failed", { error: String(err) });
      return null;
    }
  };

  const [current, doubleWindow] = await Promise.all([
    fetchWindow(`${windowHours}h`),
    fetchWindow(`${windowHours * 2}h`),
  ]);

  if (current === null) return { status: "error", errors: [] };

  // doubleWindow = total en 2×window; período anterior ≈ doble − actual.
  const priorTotal = new Map<string, number>();
  for (const row of doubleWindow ?? []) {
    priorTotal.set(String(row["error.type"] ?? "Unknown"), Number(row["count()"] ?? 0));
  }

  const errors: SentryErrorRow[] = current
    .map((row) => {
      const type = String(row["error.type"] ?? "Unknown");
      const count = Number(row["count()"] ?? 0);
      const previousPeriod = Math.max(0, (priorTotal.get(type) ?? count) - count);
      const trend: SentryErrorRow["trend"] =
        count > previousPeriod * 1.15 ? "up" : count < previousPeriod * 0.85 ? "down" : "stable";
      return { type, count, trend };
    })
    .filter((e) => e.count > 0);

  return { status: errors.length > 0 ? "live" : "empty", errors };
}
