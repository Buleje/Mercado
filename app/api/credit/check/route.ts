import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { getAvailableCredit } from "@/lib/credit/installment-manager";
import { updateCreditProfile } from "@/lib/credit/scoring-engine";
import { INTEREST_RATES, ALLOWED_INSTALLMENTS } from "@/lib/credit/installment-manager";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";

// ── Schema ────────────────────────────────────────────────────────────────────

const CheckSchema = z.object({
  customerId: z.string().min(1),
  amount: z.number().positive(),
  installments: z.enum(["2", "3", "4"]).transform(Number),
});

// ── POST /api/credit/check ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "credit-check"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const parsed = CheckSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { customerId, amount, installments } = parsed.data;

  logger.info("[credit/check] POST", {
    customerId,
    amount,
    installments,
    tenantId: auth.tenantId,
  });

  // Asegurar que el perfil existe y está actualizado
  await updateCreditProfile(auth.tenantId, customerId);

  const creditInfo = await getAvailableCredit(auth.tenantId, customerId);

  if (!creditInfo.isActive) {
    return NextResponse.json({
      approved: false,
      reason: "El crédito de este cliente está desactivado",
      availableCredit: 0,
      creditLimit: 0,
    });
  }

  if (creditInfo.creditLimit === 0) {
    return NextResponse.json({
      approved: false,
      reason: "El cliente no califica para crédito aún (score insuficiente)",
      availableCredit: 0,
      creditLimit: 0,
    });
  }

  if (creditInfo.availableCredit < amount) {
    return NextResponse.json({
      approved: false,
      reason: `Crédito insuficiente. Disponible: S/${creditInfo.availableCredit.toFixed(2)}`,
      availableCredit: creditInfo.availableCredit,
      creditLimit: creditInfo.creditLimit,
    });
  }

  // Verificar que no tenga planes vencidos sin pagar
  const hasOverdue = await prisma.creditInstallment.findFirst({
    where: {
      tenantId: auth.tenantId,
      creditProfile: { customerId },
      status: { in: ["overdue", "defaulted"] },
    },
  });

  if (hasOverdue) {
    return NextResponse.json({
      approved: false,
      reason: "El cliente tiene cuotas vencidas pendientes de pago",
      availableCredit: creditInfo.availableCredit,
      creditLimit: creditInfo.creditLimit,
    });
  }

  // Calcular cuota y total con interés
  const interestRate = INTEREST_RATES[installments as (typeof ALLOWED_INSTALLMENTS)[number]] ?? 0.05;
  const totalWithInterest =
    interestRate === 0
      ? amount
      : (() => {
          const factor = Math.pow(1 + interestRate, installments);
          const payment = (amount * interestRate * factor) / (factor - 1);
          return Math.round(payment * installments * 100) / 100;
        })();
  const installmentAmount = Math.round((totalWithInterest / installments) * 100) / 100;

  return NextResponse.json({
    approved: true,
    availableCredit: creditInfo.availableCredit,
    creditLimit: creditInfo.creditLimit,
    amount,
    installments,
    installmentAmount,
    interestRate,
    totalWithInterest,
  });
}
