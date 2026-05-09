import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { cancelMPSubscription } from "@/lib/mercadopago";
import { logger } from "@/lib/logger";
import { reportCriticalError } from "@/lib/sentry-alerts";
import { applyRateLimit } from "@/lib/rate-limit";
import { TenantBillingDB } from "@/lib/db/tenant-billing.db";
import { runWithAuditContext } from "@/lib/audit/audit-context";
import { logActivity } from "@/lib/activity-logger";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/billing/mp-cancel
//
// Cancela la suscripción Preapproval activa del tenant en Mercado Pago.
// El acceso al plan se mantiene hasta el fin del período ya pagado
// (cancelAtPeriodEnd = true). MP deja de cobrar desde el siguiente ciclo.
//
// No requiere body — opera sobre el mpSubscriptionId guardado en el Tenant.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "billing-mp-cancel"); if (_rl) return _rl;
  // ── Auth ─────────────────────────────────────────────────
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;

  return runWithAuditContext(req, auth.username, async () => {
    // ── Tenant ───────────────────────────────────────────────
    const tenant = await TenantBillingDB.getById(tenantId);
    if (!tenant) {
      return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
    }

    if (!tenant.mpSubscriptionId) {
      return NextResponse.json(
        { error: "No tienes una suscripción activa de Mercado Pago" },
        { status: 409 },
      );
    }

    if (tenant.cancelAtPeriodEnd) {
      return NextResponse.json(
        { error: "La suscripción ya está marcada para cancelarse al final del período" },
        { status: 409 },
      );
    }

    // ── Cancelar en Mercado Pago ─────────────────────────────
    try {
      await cancelMPSubscription(tenant.mpSubscriptionId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("[MP Cancel] Error cancelando suscripción en MP", {
        tenantId,
        preapprovalId: tenant.mpSubscriptionId,
        err: msg,
      });
      reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
        module: "billing",
        tenantId,
        tags: { operation: "mp-cancel-subscription" },
        extra: { preapprovalId: tenant.mpSubscriptionId },
      });
      return NextResponse.json(
        { error: "Error al cancelar la suscripción en Mercado Pago. Inténtalo de nuevo." },
        { status: 502 },
      );
    }

    // ── Marcar cancelación al fin del período en DB ──────────
    await TenantBillingDB.markCancelAtPeriodEnd(tenant.id);

    logger.info("[MP Cancel] Suscripción cancelada", {
      tenantId,
      plan: tenant.plan,
      preapprovalId: tenant.mpSubscriptionId,
    });

    // Log de actividad (fire-and-forget)
    logActivity(
      "subscription_cancelled",
      "tenant",
      `Suscripción MP Preapproval cancelada (id: ${tenant.mpSubscriptionId}). Acceso vigente hasta fin del período.`,
      tenant.slug,
      "admin",
    ).catch((err) => logger.warn("[mp-cancel] activity log failed", { err: String(err) }));

    return NextResponse.json({
      cancelled: true,
      message: "Suscripción cancelada. El plan se mantiene activo hasta el fin del período ya pagado.",
    });
  });
}
