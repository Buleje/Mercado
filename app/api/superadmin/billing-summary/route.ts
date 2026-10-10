/**
 * GET /api/superadmin/billing-summary
 *
 * Dashboard agregado de billing platform-level. NO devuelve secretos
 * Stripe/MP — sólo IDs públicos y status; los amounts vienen de la
 * tabla de precios de plan-tiers.ts (precioMensualDePlan) para evitar drift cuando
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
 
import { TenantBillingDB } from "@/lib/db/tenant-billing.db";
import { PaymentProofsDB } from "@/lib/db/payment-proofs.db";
import {
  computeMrrMovement,
  computeDunning,
  type MrrMovement,
  type Dunning,
} from "@/lib/billing/dunning";
import { etiquetaDePlan, precioMensualDePlan } from "@/lib/billing/plan-tiers";
import { estadoDeCobro, type EstadoDeCobro } from "@/lib/billing/mrr-plataforma";
import { mesLima, rangoDelMesLima } from "@/lib/finance/ingresos-del-periodo";

// Precio y nombre de cada plan: `precioMensualDePlan` / `etiquetaDePlan`
// (lib/billing/plan-tiers.ts, lo que se cobra). Antes esta ruta tenía su propia
// tabla y contaba «pro» (Starter S/ 89) a S/ 179 con etiqueta «Pro».

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
  /** expired = prueba vencida sin pago (solo lectura). Tipo único en mrr-plataforma. */
  status: EstadoDeCobro;
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
  /** Plata que ENTRÓ por vouchers aprobados (no es el MRR estimado). */
  cobrado: {
    mes: string;
    mesPEN: number;
    pagosMes: number;
    historicoPEN: number;
    pagosHistorico: number;
  };
  mrrMovement: MrrMovement;
  dunning: Dunning;
  counts: {
    total: number;
    paid: number;
    trial: number;
    canceled: number;
    /** Prueba vencida sin pago: la app la tiene en solo lectura. */
    expired: number;
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
    const now = Date.now();
    const rangoMes = rangoDelMesLima(mesLima(new Date(now)));
    const [tenants, cobrado] = await Promise.all([
      TenantBillingDB.listParaMrr(),
      PaymentProofsDB.resumenCobrado(rangoMes.start, rangoMes.end),
    ]);

    const rows: TenantBillingRow[] = tenants.map((t) => {
      const c = estadoDeCobro(t, now);
      const monthlyPEN = c.status === "paid" ? precioMensualDePlan(t.plan) : 0;
      return {
        id: t.id,
        slug: t.slug,
        name: t.name,
        plan: t.plan,
        planLabel: etiquetaDePlan(t.plan),
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
      expired: rows.filter((r) => r.status === "expired").length,
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
        label: etiquetaDePlan(plan),
        pricePEN: precioMensualDePlan(plan),
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

    // ── Movimiento de MRR + cobranza/riesgo (lógica pura, testeable) ─────────
    const mrrMovement: MrrMovement = computeMrrMovement(rows, precioMensualDePlan, now);
    const dunning: Dunning = computeDunning(rows, precioMensualDePlan, now);

    const summary: BillingSummary = {
      generatedAt: new Date().toISOString(),
      mrrPEN,
      arrPEN: mrrPEN * 12,
      cobrado: {
        mes: mesLima(new Date(now)),
        mesPEN: cobrado.mesPen,
        pagosMes: cobrado.pagosMes,
        historicoPEN: cobrado.historicoPen,
        pagosHistorico: cobrado.pagosHistorico,
      },
      mrrMovement,
      dunning,
      counts,
      byPlan,
      byIndustry,
      upcoming7d,
      trials,
      // Detalle acotado para el payload; los KPIs de arriba ya son sobre TODOS.
      tenants: rows.slice(0, 1000),
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
