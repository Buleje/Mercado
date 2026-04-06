import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { cancelMPSubscription } from "@/lib/mercadopago";
import { logger } from "@/lib/logger";
import { reportCriticalError } from "@/lib/sentry-alerts";

export const dynamic = "force-dynamic";

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
  // ── Auth ─────────────────────────────────────────────────
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;

  // ── Tenant ───────────────────────────────────────────────
  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ id: tenantId }, { slug: tenantId }] },
    select: {
      id: true,
      slug: true,
      plan: true,
      mpSubscriptionId: true,
      cancelAtPeriodEnd: true,
    },
  });
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
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { cancelAtPeriodEnd: true },
  });

  logger.info("[MP Cancel] Suscripción cancelada", {
    tenantId,
    plan: tenant.plan,
    preapprovalId: tenant.mpSubscriptionId,
  });

  // Log de actividad (fire-and-forget)
  prisma.activityLog
    .create({
      data: {
        action: "subscription_cancelled",
        entity: "tenant",
        entityId: tenant.slug,
        detail: `Suscripción MP Preapproval cancelada (id: ${tenant.mpSubscriptionId}). Acceso vigente hasta fin del período.`,
        user: "admin",
        tenantId: tenant.slug,
      },
    })
    .catch(() => {});

  return NextResponse.json({
    cancelled: true,
    message: "Suscripción cancelada. El plan se mantiene activo hasta el fin del período ya pagado.",
  });
}
