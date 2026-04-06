import "server-only";
import { prisma } from "@/lib/prisma";

// ── Constantes ────────────────────────────────────────────────────────────────

/** Tasas de interés mensual por número de cuotas */
export const INTEREST_RATES: Record<number, number> = {
  2: 0.00, // 0%  — incentivo para adopción
  3: 0.03, // 3%  mensual
  4: 0.05, // 5%  mensual
};

/** Cuotas permitidas */
export const ALLOWED_INSTALLMENTS = [2, 3, 4] as const;
export type AllowedInstallments = (typeof ALLOWED_INSTALLMENTS)[number];

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type InstallmentPlanResult = {
  id: string;
  totalAmount: number;
  installments: number;
  installmentAmount: number;
  interestRate: number;
  totalWithInterest: number;
  nextDueDate: string;
};

export type PaymentResult = {
  installmentId: string;
  paidAmount: number;
  remainingAmount: number;
  paidInstallments: number;
  totalInstallments: number;
  status: string;
  isFullyPaid: boolean;
};

export type AvailableCreditResult = {
  creditLimit: number;
  usedCredit: number;
  availableCredit: number;
  isActive: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Calcula el monto total con interés compuesto mensual */
function calculateTotalWithInterest(
  principal: number,
  monthlyRate: number,
  months: number,
): number {
  if (monthlyRate === 0) return principal;
  // Fórmula de cuota fija (sistema francés)
  const factor = Math.pow(1 + monthlyRate, months);
  const payment = (principal * monthlyRate * factor) / (factor - 1);
  return Math.round(payment * months * 100) / 100;
}

/** Fecha de vencimiento de la primera cuota (30 días desde hoy) */
function firstDueDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date;
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Crea un plan de cuotas para una compra.
 * Valida que el cliente tenga crédito disponible suficiente.
 * Descuenta el crédito usado del perfil.
 */
export async function createInstallmentPlan(
  tenantId: string,
  customerId: string,
  amount: number,
  installments: AllowedInstallments,
  orderId?: string,
): Promise<InstallmentPlanResult> {
  const profile = await prisma.creditProfile.findUnique({
    where: { tenantId_customerId: { tenantId, customerId } },
  });

  if (!profile) {
    throw new Error("El cliente no tiene perfil crediticio");
  }

  if (!profile.isActive) {
    throw new Error("El crédito de este cliente está desactivado");
  }

  if (profile.availableCredit < amount) {
    throw new Error(
      `Crédito insuficiente. Disponible: S/${profile.availableCredit.toFixed(2)}, requerido: S/${amount.toFixed(2)}`,
    );
  }

  const interestRate = INTEREST_RATES[installments] ?? 0.05;
  const totalWithInterest = calculateTotalWithInterest(amount, interestRate, installments);
  const installmentAmount = Math.round((totalWithInterest / installments) * 100) / 100;
  const nextDue = firstDueDate();

  // Crear plan y actualizar crédito en transacción atómica
  const [plan] = await prisma.$transaction([
    prisma.creditInstallment.create({
      data: {
        tenantId,
        creditProfileId: profile.id,
        orderId: orderId ?? null,
        totalAmount: amount,
        installments,
        installmentAmount,
        interestRate,
        paidAmount: 0,
        paidInstallments: 0,
        status: "active",
        nextDueDate: nextDue,
      },
    }),
    prisma.creditProfile.update({
      where: { id: profile.id },
      data: {
        usedCredit: { increment: amount },
        availableCredit: { decrement: amount },
        totalLoans: { increment: 1 },
      },
    }),
  ]);

  return {
    id: plan.id,
    totalAmount: amount,
    installments,
    installmentAmount,
    interestRate,
    totalWithInterest,
    nextDueDate: nextDue.toISOString(),
  };
}

/**
 * Registra un pago sobre un plan de cuotas.
 * Actualiza el estado del plan y el crédito usado del perfil.
 * Si el plan queda completamente pagado, libera el crédito.
 */
export async function processPayment(
  installmentId: string,
  amount: number,
): Promise<PaymentResult> {
  const plan = await prisma.creditInstallment.findUnique({
    where: { id: installmentId },
    include: { creditProfile: true },
  });

  if (!plan) {
    throw new Error("Plan de cuotas no encontrado");
  }

  if (plan.status === "paid") {
    throw new Error("Este plan ya está completamente pagado");
  }

  if (plan.status === "defaulted") {
    throw new Error("Este plan está marcado como impago");
  }

  const newPaidAmount = plan.paidAmount + amount;
  const isOnTime = new Date() <= plan.nextDueDate;

  // Calcular cuotas pagadas basadas en el monto acumulado
  const newPaidInstallments = Math.min(
    Math.floor(newPaidAmount / plan.installmentAmount),
    plan.installments,
  );

  const isFullyPaid = newPaidAmount >= plan.totalAmount * (1 + plan.interestRate) - 0.01;
  const newStatus = isFullyPaid
    ? "paid"
    : new Date() > plan.nextDueDate
      ? "overdue"
      : "active";

  // Calcular cuánto crédito liberar al perfil
  // Solo liberamos el principal (sin interés), proporcional a la cuota pagada
  const principalPerInstallment = plan.totalAmount / plan.installments;
  const newlyPaidInstallments = newPaidInstallments - plan.paidInstallments;
  const creditToRelease = newlyPaidInstallments * principalPerInstallment;

  // Siguiente fecha de vencimiento (30 días desde hoy si queda saldo)
  const nextDueDate = isFullyPaid
    ? plan.nextDueDate
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.creditInstallment.update({
      where: { id: installmentId },
      data: {
        paidAmount: newPaidAmount,
        paidInstallments: newPaidInstallments,
        status: newStatus,
        nextDueDate,
      },
    }),
    // Liberar crédito proporcional al pago
    ...(creditToRelease > 0
      ? [
          prisma.creditProfile.update({
            where: { id: plan.creditProfileId },
            data: {
              usedCredit: { decrement: creditToRelease },
              availableCredit: { increment: creditToRelease },
              ...(isFullyPaid && isOnTime
                ? { paidOnTime: { increment: 1 } }
                : isFullyPaid && !isOnTime
                  ? { paidLate: { increment: 1 } }
                  : {}),
            },
          }),
        ]
      : []),
  ]);

  const remainingAmount = Math.max(
    0,
    plan.totalAmount * (1 + plan.interestRate) - newPaidAmount,
  );

  return {
    installmentId,
    paidAmount: newPaidAmount,
    remainingAmount: Math.round(remainingAmount * 100) / 100,
    paidInstallments: newPaidInstallments,
    totalInstallments: plan.installments,
    status: newStatus,
    isFullyPaid,
  };
}

/**
 * Detecta y marca como "overdue" los planes con fecha de vencimiento pasada.
 * Penaliza el score incrementando `paidLate` o `defaulted` según los días de retraso.
 * Retorna el número de planes actualizados.
 */
export async function checkOverdue(tenantId: string): Promise<number> {
  const now = new Date();

  // Planes activos con nextDueDate pasada
  const overdueActive = await prisma.creditInstallment.findMany({
    where: {
      tenantId,
      status: "active",
      nextDueDate: { lt: now },
    },
    select: {
      id: true,
      creditProfileId: true,
      nextDueDate: true,
      totalAmount: true,
    },
  });

  // Planes overdue con más de 60 días → defaulted
  const overdueToDefault = await prisma.creditInstallment.findMany({
    where: {
      tenantId,
      status: "overdue",
      nextDueDate: { lt: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000) },
    },
    select: {
      id: true,
      creditProfileId: true,
      totalAmount: true,
      paidAmount: true,
    },
  });

  let updated = 0;

  if (overdueActive.length > 0) {
    await prisma.creditInstallment.updateMany({
      where: { id: { in: overdueActive.map((p) => p.id) } },
      data: { status: "overdue" },
    });
    updated += overdueActive.length;
  }

  if (overdueToDefault.length > 0) {
    await prisma.$transaction([
      prisma.creditInstallment.updateMany({
        where: { id: { in: overdueToDefault.map((p) => p.id) } },
        data: { status: "defaulted" },
      }),
      // Incrementar contador de impagos en el perfil
      ...overdueToDefault.map((p) =>
        prisma.creditProfile.update({
          where: { id: p.creditProfileId },
          data: { defaulted: { increment: 1 } },
        }),
      ),
    ]);
    updated += overdueToDefault.length;
  }

  return updated;
}

/**
 * Retorna el crédito disponible de un cliente.
 */
export async function getAvailableCredit(
  tenantId: string,
  customerId: string,
): Promise<AvailableCreditResult> {
  const profile = await prisma.creditProfile.findUnique({
    where: { tenantId_customerId: { tenantId, customerId } },
    select: {
      creditLimit: true,
      usedCredit: true,
      availableCredit: true,
      isActive: true,
    },
  });

  if (!profile) {
    return { creditLimit: 0, usedCredit: 0, availableCredit: 0, isActive: false };
  }

  return {
    creditLimit: profile.creditLimit,
    usedCredit: profile.usedCredit,
    availableCredit: profile.availableCredit,
    isActive: profile.isActive,
  };
}
