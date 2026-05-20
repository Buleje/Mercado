import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { BillingMpSubscriptionStatusDB } from "@/lib/db/billing-mp-subscription-status.db";
import { getMPSubscriptionStatus } from "@/lib/mercadopago";
import { getPlanDef } from "@/lib/plans";
import { logger } from "@/lib/logger";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/billing/mp-subscription-status
//
// Consulta el estado actual de la suscripción Preapproval del tenant.
// Si el tenant no tiene mpSubscriptionId activo, retorna status: "none".
//
// Respuesta:
//   {
//     status: "authorized" | "paused" | "cancelled" | "pending" | "none",
//     nextPaymentDate: string | null,   // ISO 8601
//     plan: PlanId,
//     planName: string,
//     priceMonthly: number,
//     mpPaymentMethod: string | null,
//     cancelAtPeriodEnd: boolean,
//     periodEnd: string | null,         // stripeCurrentPeriodEnd (ISO 8601)
//   }
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;

  // ── Tenant ───────────────────────────────────────────────
  const tenant = await BillingMpSubscriptionStatusDB.getTenantMpFields(tenantId);
  if (!tenant) {
    return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
  }

  const planDef = getPlanDef(tenant.plan);

  // Sin suscripción MP activa
  if (!tenant.mpSubscriptionId) {
    return NextResponse.json({
      status: "none",
      nextPaymentDate: null,
      plan: tenant.plan,
      planName: planDef.name,
      priceMonthly: planDef.priceMonthly,
      mpPaymentMethod: tenant.mpPaymentMethod,
      cancelAtPeriodEnd: tenant.cancelAtPeriodEnd,
      periodEnd: tenant.stripeCurrentPeriodEnd?.toISOString() ?? null,
    });
  }

  // ── Consultar estado en MP ───────────────────────────────
  let mpStatus: Awaited<ReturnType<typeof getMPSubscriptionStatus>>;
  try {
    mpStatus = await getMPSubscriptionStatus(tenant.mpSubscriptionId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[MP Subscription Status] Error consultando estado en MP", {
      tenantId,
      preapprovalId: tenant.mpSubscriptionId,
      err: msg,
    });
    // Retornar lo que tenemos en DB sin fallar el request
    return NextResponse.json({
      status: "unknown",
      nextPaymentDate: null,
      plan: tenant.plan,
      planName: planDef.name,
      priceMonthly: planDef.priceMonthly,
      mpPaymentMethod: tenant.mpPaymentMethod,
      cancelAtPeriodEnd: tenant.cancelAtPeriodEnd,
      periodEnd: tenant.stripeCurrentPeriodEnd?.toISOString() ?? null,
      error: "No se pudo consultar el estado en Mercado Pago",
    });
  }

  return NextResponse.json({
    status: mpStatus.status,
    nextPaymentDate: mpStatus.nextPaymentDate?.toISOString() ?? null,
    plan: tenant.plan,
    planName: planDef.name,
    priceMonthly: planDef.priceMonthly,
    mpPaymentMethod: tenant.mpPaymentMethod,
    cancelAtPeriodEnd: tenant.cancelAtPeriodEnd,
    periodEnd: tenant.stripeCurrentPeriodEnd?.toISOString() ?? null,
  });
}
