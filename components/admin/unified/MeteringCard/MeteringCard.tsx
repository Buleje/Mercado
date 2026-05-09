/**
 * MeteringCard — React Server Component (RSC)
 *
 * Fetches metering data server-side y pasa el snapshot al componente
 * cliente para interactividad (sparklines, toggle, tooltips).
 *
 * Regla ADR-047: usa "use cache" + cacheLife({ revalidate: 60 }) para no
 * golpear la DB en cada render del dashboard.
 * Regla CLAUDE.md #6: NO calcula totales en cliente — el backend entrega
 * números pre-computados.
 */

import { Suspense } from "react";
import type { MeteringCardProps, MeteringSnapshot, BillingPlan, QuotaThresholds } from "./types";
import { MeteringCardClient } from "./MeteringCard.client";
import type { MeteredEvent } from "@/lib/billing/metering";
import { METERED_EVENTS } from "@/lib/billing/metering";

// ─── Quotas por plan (espejo de ADR-047 usage-tiers) ─────────────────────────

const FREE_QUOTAS: QuotaThresholds = {
  "order.created":  { limit: 100,      alertAt: 0.8 },
  "ai.call":        { limit: 50,       alertAt: 0.8 },
  "ai.recommend":   { limit: 200,      alertAt: 0.8 },
  "ai.insight":     { limit: 100,      alertAt: 0.8 },
  "sms.sent":       { limit: 50,       alertAt: 0.8 },
  "whatsapp.sent":  { limit: 500,      alertAt: 0.8 },
  "sunat.emitted":  { limit: 0,        alertAt: 1.0 },
  "storage.blob":   { limit: 1_000,    alertAt: 0.8 },
};

const STARTER_QUOTAS: QuotaThresholds = {
  "order.created":  { limit: 1_000,    alertAt: 0.8 },
  "ai.call":        { limit: 500,      alertAt: 0.8 },
  "ai.recommend":   { limit: 2_000,    alertAt: 0.9 },
  "ai.insight":     { limit: 1_000,    alertAt: 0.9 },
  "sms.sent":       { limit: 500,      alertAt: 0.8 },
  "whatsapp.sent":  { limit: 5_000,    alertAt: 0.8 },
  "sunat.emitted":  { limit: 500,      alertAt: 0.9 },
  "storage.blob":   { limit: 10_000,   alertAt: 0.8 },
};

const PRO_QUOTAS: QuotaThresholds = {
  "order.created":  { limit: 10_000,   alertAt: 0.9 },
  "ai.call":        { limit: 5_000,    alertAt: 0.9 },
  "ai.recommend":   { limit: 20_000,   alertAt: 0.9 },
  "ai.insight":     { limit: 10_000,   alertAt: 0.9 },
  "sms.sent":       { limit: 5_000,    alertAt: 0.9 },
  "whatsapp.sent":  { limit: 50_000,   alertAt: 0.9 },
  "sunat.emitted":  { limit: 5_000,    alertAt: 0.9 },
  "storage.blob":   { limit: 100_000,  alertAt: 0.9 },
};

const ENTERPRISE_QUOTAS: QuotaThresholds = Object.fromEntries(
  METERED_EVENTS.map((e) => [e, { limit: Infinity, alertAt: 1.0 }]),
) as QuotaThresholds;

const PLAN_QUOTAS: Record<BillingPlan, QuotaThresholds> = {
  free:       FREE_QUOTAS,
  starter:    STARTER_QUOTAS,
  pro:        PRO_QUOTAS,
  enterprise: ENTERPRISE_QUOTAS,
};

// Precio USD por unidad por evento (referencia para estimación)
const USD_PER_UNIT: Record<MeteredEvent, number> = {
  "order.created":  0.01,
  "ai.call":        0.05,
  "ai.recommend":   0.02,
  "ai.insight":     0.03,
  "sms.sent":       0.008,
  "whatsapp.sent":  0.005,
  "sunat.emitted":  0.10,
  "storage.blob":   0.0001,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildEmptyUsage(): Record<MeteredEvent, number> {
  return Object.fromEntries(METERED_EVENTS.map((e) => [e, 0])) as Record<MeteredEvent, number>;
}

function buildEmptySparklines(): Record<MeteredEvent, number[]> {
  return Object.fromEntries(METERED_EVENTS.map((e) => [e, Array(7).fill(0)])) as Record<MeteredEvent, number[]>;
}

function estimateCost(usage: Record<MeteredEvent, number>): number {
  return METERED_EVENTS.reduce((sum, evt) => {
    return sum + (usage[evt] ?? 0) * (USD_PER_UNIT[evt] ?? 0);
  }, 0);
}

// ─── Fetch del snapshot ───────────────────────────────────────────────────────

async function fetchMeteringSnapshot(
  tenantId: string,
  baseUrl: string,
  from?: string,
  to?: string,
): Promise<MeteringSnapshot> {
  const url = new URL("/api/billing/meter", baseUrl);
  url.searchParams.set("tenantId", tenantId);
  if (from) url.searchParams.set("from", from);
  if (to)   url.searchParams.set("to", to);

  const empty = buildEmptyUsage();
  const emptySparklines = buildEmptySparklines();

  try {
    const res = await fetch(url.toString(), {
      next: { revalidate: 60 },
      headers: { "x-internal": "1" },
    });

    if (!res.ok) {
      return {
        tenantId,
        plan: "free",
        period: { from: from ?? new Date().toISOString(), to: to ?? new Date().toISOString() },
        usage: empty,
        quotas: FREE_QUOTAS,
        estimatedCostUsd: 0,
        sparklines: emptySparklines,
      };
    }

    const data = (await res.json()) as {
      tenantId: string;
      from: string;
      to: string;
      usage: Record<MeteredEvent, number>;
      plan?: BillingPlan;
    };

    const plan: BillingPlan = data.plan ?? "free";
    const usage = data.usage ?? empty;

    return {
      tenantId,
      plan,
      period: { from: data.from, to: data.to },
      usage,
      quotas: PLAN_QUOTAS[plan],
      estimatedCostUsd: estimateCost(usage),
      sparklines: emptySparklines, // el backend de sparklines se implementa en wire-up fase 2
    };
  } catch {
    return {
      tenantId,
      plan: "free",
      period: { from: from ?? new Date().toISOString(), to: to ?? new Date().toISOString() },
      usage: empty,
      quotas: FREE_QUOTAS,
      estimatedCostUsd: 0,
      sparklines: emptySparklines,
    };
  }
}

// ─── Skeleton de carga ────────────────────────────────────────────────────────

function MeteringCardSkeleton() {
  return (
    <div
      className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 animate-pulse"
      aria-busy="true"
      aria-label="Cargando métricas de facturación"
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="h-5 w-32 bg-[var(--rule-soft)] dark:bg-gray-700 rounded" />
        <div className="h-5 w-16 bg-[var(--rule-soft)] dark:bg-gray-700 rounded-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-36 rounded-xl bg-[var(--surface-sunken)]"
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}

// ─── Inner async component ────────────────────────────────────────────────────

async function MeteringCardInner({ tenantId, period }: MeteringCardProps) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const snapshot = await fetchMeteringSnapshot(
    tenantId,
    baseUrl,
    period?.from,
    period?.to,
  );

  const upgradeUrl = "/admin/billing/upgrade";

  return (
    <MeteringCardClient
      snapshot={snapshot}
      onUpgrade={() => {
        if (typeof window !== "undefined") {
          window.location.href = upgradeUrl;
        }
      }}
    />
  );
}

// ─── Export público con Suspense boundary ─────────────────────────────────────

export default function MeteringCard(props: MeteringCardProps) {
  return (
    <Suspense fallback={<MeteringCardSkeleton />}>
      <MeteringCardInner {...props} />
    </Suspense>
  );
}
