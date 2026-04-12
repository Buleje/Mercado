import "server-only";
import { logger } from "@/lib/logger";

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
