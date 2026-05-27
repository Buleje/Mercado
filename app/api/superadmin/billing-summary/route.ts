/**
 * GET /api/superadmin/billing-summary
 *
 * Dashboard agregado de billing platform-level. NO devuelve secretos
 * Stripe/MP — sólo IDs públicos y status; los amounts vienen de la
 * tabla de precios local (PLAN_PRICE_PEN) para evitar drift cuando
 * Stripe está desconectado en dev.
 *
 * KPIs:
 *  - MRR total · MRR por plan
 *  - Cuentas: paid, trial, canceled, free
 *  - Próximos vencimientos (7d) — con plan y monto
 *  - Trials activos (orden por días restantes asc)
 *  - Tabla resumida de tenants (slug, plan, status, mrr, nextBill, source)
 *  - Distribución por industria
 *
 * Auth: requirePlatformAPI · Rate-limit GENEROUS · Cache-Control no-store
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
 
import { prisma } from "@/lib/prisma";

// ── Tabla de precios PEN (ADR-076 / pricing 2026-05) ────────────────────────
// Si querés cambiar precios, hacelo acá — single source of truth para el
// summary. El cobro real lo manda Stripe/MP con su propio Price.
const PLAN_PRICE_PEN: Record<string, number> = {
  free: 0,
  starter: 89,
  pro: 179,
  business: 349,
  // Aliases legacy del modelo viejo
  basico: 0,
  enterprise: 179,
  max: 349,
};

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  business: "Business",
  basico: "Free",
  enterprise: "Pro",
  max: "Business",
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

interface TenantBillingRow {
  id: string;
  slug: string;
  name: string;
  plan: string;
  planLabel: string;
  industry: string;
  active: boolean;
  /** "paid" | "trial" | "canceled" | "free" */
  status: "paid" | "trial" | "canceled" | "free";
  monthlyPEN: number;
  source: "stripe" | "mp" | "none";
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  nextBillAt: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}

interface BillingSummary {
  generatedAt: string;
  mrrPEN: number;
  arrPEN: number;
  counts: {
    total: number;
    paid: number;
    trial: number;
    canceled: number;
    free: number;
    activeNonFree: number;
  };
  byPlan: Array<{
    plan: string;
    label: string;
    pricePEN: number;
    activeCount: number;
    mrrPEN: number;
  }>;
  byIndustry: Array<{ industry: string; count: number }>;
  upcoming7d: TenantBillingRow[];
  trials: TenantBillingRow[];
  tenants: TenantBillingRow[];
}

function classify(t: {
  plan: string;
  active: boolean;
  trialEndsAt: Date | null;
  stripeSubscriptionId: string | null;
  stripeCurrentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  mpSubscriptionId: string | null;
}): {
  status: TenantBillingRow["status"];
  source: TenantBillingRow["source"];
  nextBillAt: Date | null;
  trialDaysLeft: number | null;
} {
  const source: TenantBillingRow["source"] = t.stripeSubscriptionId
    ? "stripe"
    : t.mpSubscriptionId
      ? "mp"
      : "none";

  // Trial activo (futuro trialEndsAt)
  const now = Date.now();
  const trialDaysLeft = t.trialEndsAt
    ? Math.max(
        0,
        Math.ceil((t.trialEndsAt.getTime() - now) / (24 * 60 * 60 * 1000)),
      )
    : null;
  const isTrial = !!t.trialEndsAt && t.trialEndsAt.getTime() > now;

  // Plan free → free
  if (t.plan === "free" || t.plan === "basico") {
    return { status: "free", source, nextBillAt: null, trialDaysLeft };
  }

  if (!t.active || t.cancelAtPeriodEnd) {
    return {
      status: "canceled",
      source,
      nextBillAt: t.stripeCurrentPeriodEnd ?? null,
      trialDaysLeft,
    };
  }

  if (isTrial) {
    return {
      status: "trial",
      source,
      nextBillAt: t.trialEndsAt,
      trialDaysLeft,
    };
  }

  // Pagado
  return {
    status: "paid",
    source,
    nextBillAt: t.stripeCurrentPeriodEnd ?? null,
    trialDaysLeft,
  };
}

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(
    req,
    "GENEROUS",
    "superadmin-billing-summary",
  );
  if (rl) return rl;

  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const tenants = await prisma.tenant.findMany({
      select: {
        id: true,
        slug: true,
        name: true,
        plan: true,
        industry: true,
        active: true,
        trialEndsAt: true,
        stripeSubscriptionId: true,
        stripeCurrentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        mpSubscriptionId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });

    const rows: TenantBillingRow[] = tenants.map((t) => {
      const c = classify(t);
      const price = PLAN_PRICE_PEN[t.plan] ?? 0;
      const monthlyPEN = c.status === "paid" ? price : 0;
      return {
        id: t.id,
        slug: t.slug,
        name: t.name,
        plan: t.plan,
        planLabel: PLAN_LABEL[t.plan] ?? t.plan,
        industry: t.industry,
        active: t.active,
        status: c.status,
        monthlyPEN,
        source: c.source,
        trialEndsAt: t.trialEndsAt ? t.trialEndsAt.toISOString() : null,
        trialDaysLeft: c.trialDaysLeft,
        nextBillAt: c.nextBillAt ? c.nextBillAt.toISOString() : null,
        cancelAtPeriodEnd: t.cancelAtPeriodEnd,
        createdAt: t.createdAt.toISOString(),
      };
    });

    const mrrPEN = rows.reduce((acc, r) => acc + r.monthlyPEN, 0);

    const counts = {
      total: rows.length,
      paid: rows.filter((r) => r.status === "paid").length,
      trial: rows.filter((r) => r.status === "trial").length,
      canceled: rows.filter((r) => r.status === "canceled").length,
      free: rows.filter((r) => r.status === "free").length,
      activeNonFree: rows.filter(
        (r) => r.status === "paid" || r.status === "trial",
      ).length,
    };

    // Por plan (sólo planes pagos)
    const byPlanMap = new Map<
      string,
      { activeCount: number; mrrPEN: number }
    >();
    rows.forEach((r) => {
      if (r.status !== "paid") return;
      const cur = byPlanMap.get(r.plan) ?? { activeCount: 0, mrrPEN: 0 };
      cur.activeCount++;
      cur.mrrPEN += r.monthlyPEN;
      byPlanMap.set(r.plan, cur);
    });
    const byPlan = Array.from(byPlanMap.entries())
      .map(([plan, agg]) => ({
        plan,
        label: PLAN_LABEL[plan] ?? plan,
        pricePEN: PLAN_PRICE_PEN[plan] ?? 0,
        activeCount: agg.activeCount,
        mrrPEN: agg.mrrPEN,
      }))
      .sort((a, b) => b.mrrPEN - a.mrrPEN);

    // Por industria
    const byIndustryMap = new Map<string, number>();
    rows.forEach((r) => {
      byIndustryMap.set(r.industry, (byIndustryMap.get(r.industry) ?? 0) + 1);
    });
    const byIndustry = Array.from(byIndustryMap.entries())
      .map(([industry, count]) => ({ industry, count }))
      .sort((a, b) => b.count - a.count);

    // Próximos vencimientos 7 días
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const upcoming7d = rows
      .filter(
        (r) =>
          r.nextBillAt &&
          new Date(r.nextBillAt).getTime() <= now + sevenDaysMs &&
          new Date(r.nextBillAt).getTime() > now,
      )
      .sort(
        (a, b) =>
          new Date(a.nextBillAt!).getTime() -
          new Date(b.nextBillAt!).getTime(),
      )
      .slice(0, 50);

    // Trials activos ordenados por días restantes
    const trials = rows
      .filter((r) => r.status === "trial")
      .sort((a, b) => (a.trialDaysLeft ?? 999) - (b.trialDaysLeft ?? 999))
      .slice(0, 100);

    const summary: BillingSummary = {
      generatedAt: new Date().toISOString(),
      mrrPEN,
      arrPEN: mrrPEN * 12,
      counts,
      byPlan,
      byIndustry,
      upcoming7d,
      trials,
      tenants: rows,
    };

    logger.info("[billing-summary] generated", {
      by: auth.username,
      total: rows.length,
      mrr: mrrPEN,
    });

    return NextResponse.json(summary, { headers: NO_STORE_HEADERS });
  } catch (err) {
    logger.error("[billing-summary] failed", { error: String(err) });
    return NextResponse.json(
      { error: "Error al generar resumen" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
