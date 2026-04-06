import "server-only";
import { prisma } from "@/lib/prisma";

// ── Constantes de pesos del scoring ──────────────────────────────────────────

const WEIGHTS = {
  purchaseHistory: 0.30, // frecuencia, recencia, monto acumulado
  paymentPunctuality: 0.30, // % pagados a tiempo vs tarde vs impagos
  avgTicket: 0.15, // mayor ticket = mayor confiabilidad
  seniority: 0.15, // meses desde primera compra
  loyaltyPoints: 0.10, // engagement con el negocio
} as const;

const MAX_SCORE = 1000;

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type RiskLevel = "none" | "low" | "medium" | "high";

export type CreditScoreResult = {
  score: number;
  creditLimit: number;
  riskLevel: RiskLevel;
  breakdown: {
    purchaseHistory: number;
    paymentPunctuality: number;
    avgTicket: number;
    seniority: number;
    loyaltyPoints: number;
  };
};

// ── Helpers internos ──────────────────────────────────────────────────────────

/** Clampea un valor entre 0 y max, retorna normalizado 0-1 */
function normalize(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max) / max;
}

/** Calcula puntuación del historial de compras (frecuencia + recencia + volumen) */
function scoreFromPurchaseHistory(
  totalSales: number,
  totalOrders: number,
  totalSpent: number,
  purchaseFreqDays: number | null,
  daysSinceLastPurchase: number | null,
): number {
  const totalPurchases = totalSales + totalOrders;

  // Frecuencia: 20+ compras = score máximo
  const freqScore = normalize(totalPurchases, 20);

  // Recencia: 0 días = 1.0, 90+ días = 0.0
  const recencyScore =
    daysSinceLastPurchase !== null
      ? Math.max(0, 1 - daysSinceLastPurchase / 90)
      : 0;

  // Volumen: S/5000+ = score máximo
  const volumeScore = normalize(totalSpent, 5000);

  // Regularidad: si compra cada <7 días = excelente, >30 días = bajo
  const regularityScore =
    purchaseFreqDays !== null
      ? Math.max(0, 1 - purchaseFreqDays / 60)
      : 0;

  return (freqScore * 0.3 + recencyScore * 0.3 + volumeScore * 0.2 + regularityScore * 0.2) * MAX_SCORE;
}

/** Calcula puntuación de puntualidad basada en fiados y cuotas */
function scoreFromPunctuality(
  paidOnTime: number,
  paidLate: number,
  defaulted: number,
  fiadosActivos: number,
  fiadosPagados: number,
  fiadosVencidos: number,
): number {
  const totalHistory = paidOnTime + paidLate + defaulted + fiadosActivos + fiadosPagados + fiadosVencidos;

  if (totalHistory === 0) {
    // Sin historial: puntuación neutra (0.5)
    return MAX_SCORE * 0.5;
  }

  // Penalización fuerte por impagos
  const penaltyDefault = defaulted + fiadosVencidos;
  const penaltyLate = paidLate * 0.5;
  const positives = paidOnTime + fiadosPagados;

  const rawScore = (positives - penaltyDefault * 2 - penaltyLate) / totalHistory;
  return Math.max(0, Math.min(rawScore, 1)) * MAX_SCORE;
}

/** Calcula puntuación basada en ticket promedio */
function scoreFromAvgTicket(avgTicket: number): number {
  // S/200+ por compra = score máximo
  return normalize(avgTicket, 200) * MAX_SCORE;
}

/** Calcula puntuación de antigüedad como cliente */
function scoreFromSeniority(customerCreatedAt: Date): number {
  const monthsOld =
    (Date.now() - customerCreatedAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
  // 24 meses (2 años) = score máximo
  return normalize(monthsOld, 24) * MAX_SCORE;
}

/** Calcula puntuación basada en puntos de lealtad */
function scoreFromLoyalty(loyaltyPoints: number): number {
  // 1000+ puntos = score máximo
  return normalize(loyaltyPoints, 1000) * MAX_SCORE;
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Determina el límite de crédito en PEN según el score:
 * < 300  → S/0 (sin crédito)
 * 300-499 → S/50
 * 500-699 → S/200
 * 700-899 → S/500
 * 900+   → S/1000
 */
export function determineCreditLimit(score: number): number {
  if (score < 300) return 0;
  if (score < 500) return 50;
  if (score < 700) return 200;
  if (score < 900) return 500;
  return 1000;
}

/**
 * Clasifica el nivel de riesgo según el score.
 * > 700 → none, 500-699 → low, 300-499 → medium, < 300 → high
 */
export function classifyRisk(score: number): RiskLevel {
  if (score >= 700) return "none";
  if (score >= 500) return "low";
  if (score >= 300) return "medium";
  return "high";
}

/**
 * Calcula el credit score completo de un cliente a partir de su historial.
 * Nunca lanza excepción: devuelve score=0 si el cliente no existe.
 */
export async function calculateCreditScore(
  tenantId: string,
  customerId: string,
): Promise<CreditScoreResult> {
  // Traer datos del cliente + historial de compras + fiados en una sola query
  const customer = await prisma.customer.findFirst({
    where: { phone: customerId, tenantId },
    select: {
      createdAt: true,
      loyaltyPoints: true,
      totalSpent: true,
      sales: {
        where: { tenantId },
        select: { total: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      },
      orders: {
        where: { tenantId },
        select: { total: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      },
      fiados: {
        where: { tenantId },
        select: { status: true, createdAt: true },
      },
    },
  });

  if (!customer) {
    return {
      score: 0,
      creditLimit: 0,
      riskLevel: "high",
      breakdown: {
        purchaseHistory: 0,
        paymentPunctuality: 0,
        avgTicket: 0,
        seniority: 0,
        loyaltyPoints: 0,
      },
    };
  }

  // Calcular métricas de compras
  const allPurchases = [
    ...customer.sales.map((s) => ({ amount: Number(s.total), date: s.createdAt })),
    ...customer.orders.map((o) => ({ amount: Number(o.total), date: o.createdAt })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const totalPurchaseCount = allPurchases.length;
  const totalSpent = customer.totalSpent ?? 0;
  const avgTicket = totalPurchaseCount > 0 ? totalSpent / totalPurchaseCount : 0;

  const daysSinceLastPurchase =
    allPurchases.length > 0
      ? (Date.now() - allPurchases[0].date.getTime()) / (1000 * 60 * 60 * 24)
      : null;

  // Calcular frecuencia promedio de compra en días
  let purchaseFreqDays: number | null = null;
  if (allPurchases.length >= 2) {
    const gaps: number[] = [];
    for (let i = 0; i < allPurchases.length - 1; i++) {
      const gap =
        (allPurchases[i].date.getTime() - allPurchases[i + 1].date.getTime()) /
        (1000 * 60 * 60 * 24);
      gaps.push(gap);
    }
    purchaseFreqDays = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
  }

  // Contabilizar fiados
  const fiadosPagados = customer.fiados.filter((f) => f.status === "PAGADO").length;
  const fiadosVencidos = customer.fiados.filter((f) => f.status === "VENCIDO").length;
  const fiadosActivos = customer.fiados.filter((f) => f.status === "ACTIVO").length;

  // Buscar perfil existente para historial de cuotas de crédito
  const existingProfile = await prisma.creditProfile.findUnique({
    where: { tenantId_customerId: { tenantId, customerId } },
    select: { paidOnTime: true, paidLate: true, defaulted: true },
  });

  const paidOnTime = existingProfile?.paidOnTime ?? 0;
  const paidLate = existingProfile?.paidLate ?? 0;
  const defaulted = existingProfile?.defaulted ?? 0;

  // Calcular sub-scores
  const purchaseHistoryRaw = scoreFromPurchaseHistory(
    customer.sales.length,
    customer.orders.length,
    totalSpent,
    purchaseFreqDays,
    daysSinceLastPurchase,
  );

  const punctualityRaw = scoreFromPunctuality(
    paidOnTime,
    paidLate,
    defaulted,
    fiadosActivos,
    fiadosPagados,
    fiadosVencidos,
  );

  const avgTicketRaw = scoreFromAvgTicket(avgTicket);
  const seniorityRaw = scoreFromSeniority(customer.createdAt);
  const loyaltyRaw = scoreFromLoyalty(customer.loyaltyPoints ?? 0);

  // Score final ponderado
  const finalScore = Math.round(
    purchaseHistoryRaw * WEIGHTS.purchaseHistory +
      punctualityRaw * WEIGHTS.paymentPunctuality +
      avgTicketRaw * WEIGHTS.avgTicket +
      seniorityRaw * WEIGHTS.seniority +
      loyaltyRaw * WEIGHTS.loyaltyPoints,
  );

  const clampedScore = Math.min(MAX_SCORE, Math.max(0, finalScore));

  return {
    score: clampedScore,
    creditLimit: determineCreditLimit(clampedScore),
    riskLevel: classifyRisk(clampedScore),
    breakdown: {
      purchaseHistory: Math.round(purchaseHistoryRaw),
      paymentPunctuality: Math.round(punctualityRaw),
      avgTicket: Math.round(avgTicketRaw),
      seniority: Math.round(seniorityRaw),
      loyaltyPoints: Math.round(loyaltyRaw),
    },
  };
}

/**
 * Recalcula y persiste el CreditProfile completo de un cliente.
 * Crea el perfil si no existe.
 */
export async function updateCreditProfile(
  tenantId: string,
  customerId: string,
): Promise<void> {
  const result = await calculateCreditScore(tenantId, customerId);

  // Calcular métricas adicionales para guardar en el perfil
  const customer = await prisma.customer.findFirst({
    where: { phone: customerId, tenantId },
    select: {
      totalSpent: true,
      sales: { where: { tenantId }, select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 200 },
      orders: { where: { tenantId }, select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 200 },
    },
  });

  if (!customer) return;

  const allDates = [
    ...customer.sales.map((s) => s.createdAt),
    ...customer.orders.map((o) => o.createdAt),
  ].sort((a, b) => b.getTime() - a.getTime());

  const totalPurchaseCount = allDates.length;
  const totalSpent = Number(customer.totalSpent ?? 0);
  const avgTicket = totalPurchaseCount > 0 ? totalSpent / totalPurchaseCount : 0;

  let purchaseFreqDays: number | null = null;
  if (allDates.length >= 2) {
    const gaps: number[] = [];
    for (let i = 0; i < allDates.length - 1; i++) {
      gaps.push((allDates[i].getTime() - allDates[i + 1].getTime()) / (1000 * 60 * 60 * 24));
    }
    purchaseFreqDays = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
  }

  // Obtener crédito usado actual del perfil existente para no sobreescribirlo
  const existing = await prisma.creditProfile.findUnique({
    where: { tenantId_customerId: { tenantId, customerId } },
    select: {
      usedCredit: true,
      totalLoans: true,
      paidOnTime: true,
      paidLate: true,
      defaulted: true,
    },
  });

  const usedCredit = existing?.usedCredit ?? 0;
  const availableCredit = Math.max(0, result.creditLimit - usedCredit);

  await prisma.creditProfile.upsert({
    where: { tenantId_customerId: { tenantId, customerId } },
    create: {
      tenantId,
      customerId,
      creditScore: result.score,
      creditLimit: result.creditLimit,
      usedCredit: 0,
      availableCredit: result.creditLimit,
      riskLevel: result.riskLevel,
      totalLoans: existing?.totalLoans ?? 0,
      paidOnTime: existing?.paidOnTime ?? 0,
      paidLate: existing?.paidLate ?? 0,
      defaulted: existing?.defaulted ?? 0,
      avgTicket,
      purchaseFreqDays,
      lastScoreUpdate: new Date(),
    },
    update: {
      creditScore: result.score,
      creditLimit: result.creditLimit,
      availableCredit,
      riskLevel: result.riskLevel,
      avgTicket,
      purchaseFreqDays,
      lastScoreUpdate: new Date(),
    },
  });
}
