import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { createInstallmentPlan } from "@/lib/credit/installment-manager";
import type { AllowedInstallments } from "@/lib/credit/installment-manager";

// ── Schema ────────────────────────────────────────────────────────────────────

const CreatePlanSchema = z.object({
  customerId: z.string().min(1),
  orderId: z.string().optional(),
  amount: z.number().positive(),
  installments: z.union([z.literal(2), z.literal(3), z.literal(4)]),
});

// ── POST /api/credit/create-plan ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const parsed = CreatePlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { customerId, orderId, amount, installments } = parsed.data;

  logger.info("[credit/create-plan] POST", {
    customerId,
    orderId,
    amount,
    installments,
    tenantId: auth.tenantId,
    user: auth.username,
  });

  try {
    const plan = await createInstallmentPlan(
      auth.tenantId,
      customerId,
      amount,
      installments as AllowedInstallments,
      orderId,
    );

    logActivity(
      "credit_plan_created",
      "CreditInstallment",
      `Plan de ${installments} cuotas de S/${plan.installmentAmount} creado para cliente ${customerId} (total: S/${plan.totalWithInterest})`,
      plan.id,
      auth.username,
    ).catch(() => {});

    return NextResponse.json(plan, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al crear el plan";
    logger.warn("[credit/create-plan] error", { message, customerId, tenantId: auth.tenantId });
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
