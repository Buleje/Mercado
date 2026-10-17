/**
 * Ranking de repartidores (Reparto › Ranking) — cuentas puras.
 *
 * 17-10 (P37/P38):
 * - Base única: las asignaciones CREADAS en el período. Entregas, canceladas
 *   y tarifas salen de esas mismas filas (antes el texto no lo decía).
 * - «Completadas» = entregadas ÷ (entregadas + canceladas). Las que siguen en
 *   camino no cuentan todavía: antes contaban como no completadas y un pedido
 *   en curso bajaba la tasa.
 * - Sin ninguna cerrada la tasa es `null` («Sin datos»), no 0 %: una persona
 *   nueva no parece la peor.
 * - El total del equipo es ponderado (Σ entregadas ÷ Σ cerradas), no el
 *   promedio de los porcentajes de cada uno.
 */

export type PeriodoRanking = "week" | "month" | "all";

export interface AsignacionRanking {
  status: string;
  fee: unknown; // Decimal de Prisma
  pickedUpAt: Date | null;
  deliveredAt: Date | null;
}

export interface RepartidorRankingFuente {
  id: string;
  name: string;
  phone: string;
  vehicleType: string;
  rating: number;
  acceptanceRate: number;
  totalOffers: number;
  totalAccepted: number;
  assignments: AsignacionRanking[];
}

/** Con menos cerradas que esto, la tasa se muestra con su muestra («de 3»). */
export const MUESTRA_CHICA = 5;

const NO_ENTREGADAS = new Set(["cancelled", "failed"]);

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Desde cuándo cuenta cada período (días corridos hacia atrás desde ahora). */
export function desdeDelPeriodo(period: PeriodoRanking, ahora: Date = new Date()): Date {
  const d = new Date(ahora);
  if (period === "week") d.setDate(d.getDate() - 7);
  else if (period === "month") d.setDate(d.getDate() - 30);
  else d.setFullYear(d.getFullYear() - 5);
  return d;
}

export function filaDeRanking(p: RepartidorRankingFuente) {
  const delivered = p.assignments.filter((a) => a.status === "delivered").length;
  const cancelled = p.assignments.filter((a) => NO_ENTREGADAS.has(a.status)).length;
  const total = p.assignments.length;
  const cerradas = delivered + cancelled;
  const totalEarnings = centavos(
    p.assignments.filter((a) => a.status === "delivered").reduce((s, a) => s + Number(a.fee), 0),
  );
  const tiempos: number[] = [];
  for (const a of p.assignments) {
    if (a.pickedUpAt && a.deliveredAt) {
      tiempos.push((a.deliveredAt.getTime() - a.pickedUpAt.getTime()) / 60_000);
    }
  }
  return {
    id: p.id,
    name: p.name,
    phone: p.phone,
    vehicleType: p.vehicleType,
    rating: p.rating,
    acceptanceRate: p.acceptanceRate,
    totalOffersHistorical: p.totalOffers,
    totalAcceptedHistorical: p.totalAccepted,
    delivered,
    cancelled,
    inProgress: total - cerradas,
    totalAssignments: total,
    cerradas,
    totalEarnings,
    /** `null` = todavía no cerró ninguna: «Sin datos», no 0 %. */
    completionRate: cerradas > 0 ? delivered / cerradas : null,
    avgDeliveryMin: tiempos.length > 0 ? tiempos.reduce((s, n) => s + n, 0) / tiempos.length : null,
  };
}

export type FilaRanking = ReturnType<typeof filaDeRanking>;

export function rankingReparto(partners: RepartidorRankingFuente[]) {
  const ranking = partners
    .map(filaDeRanking)
    .sort((a, b) => b.delivered - a.delivered || b.rating - a.rating);
  const totalDelivered = ranking.reduce((s, r) => s + r.delivered, 0);
  const cerradas = ranking.reduce((s, r) => s + r.cerradas, 0);
  return {
    ranking,
    summary: {
      totalPartners: ranking.length,
      totalDelivered,
      totalCancelled: ranking.reduce((s, r) => s + r.cancelled, 0),
      enCurso: ranking.reduce((s, r) => s + r.inProgress, 0),
      cerradas,
      totalEarnings: centavos(ranking.reduce((s, r) => s + r.totalEarnings, 0)),
      /** Ponderada por pedido; `null` sin cerradas. */
      completionRate: cerradas > 0 ? totalDelivered / cerradas : null,
    },
  };
}

export type ResumenRanking = ReturnType<typeof rankingReparto>["summary"];
