import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { processPayment } from "@/lib/credit/installment-manager";
import { updateCreditProfile } from "@/lib/credit/scoring-engine";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";

// ── Schema ────────────────────────────────────────────────────────────────────

const PaySchema = z.object({
  installmentId: z.string().min(1),
  amount: z.number().positive(),
});

// ── POST /api/credit/pay ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "credit-pay"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const parsed = PaySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { installmentId, amount } = parsed.data;

  logger.info("[credit/pay] POST", {
    installmentId,
    amount,
    tenantId: auth.tenantId,
    user: auth.username,
  });

  // Verificar que el plan pertenece al tenant
  const plan = await prisma.creditInstallment.findFirst({
    where: { id: installmentId, tenantId: auth.tenantId },
    select: { id: true, creditProfile: { select: { customerId: true } } },
  });

  if (!plan) {
    return NextResponse.json({ error: "Plan de cuotas no encontrado" }, { status: 404 });
  }

  try {
    const result = await processPayment(installmentId, amount);

    // Si el pago cierra el plan, recalcular el score del cliente
    if (result.isFullyPaid) {
      updateCreditProfile(auth.tenantId, plan.creditProfile.customerId).catch((err) => {
      logger.error("[credit/pay] updateCreditProfile failed", { error: String(err), tenantId: auth.tenantId });
    });
    }

    logActivity(
      "credit_payment",
      "CreditInstallment",
      `Pago de S/${amount} registrado en plan ${installmentId}${result.isFullyPaid ? " — plan completado" : ` — quedan S/${result.remainingAmount}`}`,
      installmentId,
      auth.username,
    ).catch((err) => {
      logger.error("[credit/pay] logActivity failed", { error: String(err), tenantId: auth.tenantId });
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al procesar el pago";
    logger.warn("[credit/pay] error", { message, installmentId, tenantId: auth.tenantId });
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
