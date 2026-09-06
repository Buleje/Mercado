/**
 * lib/billing/dunning.ts
 *
 * Lógica pura (sin DB, sin I/O) para el movimiento de MRR del mes y los
 * baldes de cobranza/riesgo (dunning) del dashboard de billing platform.
 *
 * Se extrae del route para poder testearla con data sintética sin tocar la
 * base de datos. El route arma las filas (`DunningInputRow`) desde Prisma y
 * delega el cálculo de dinero acá (CLAUDE.md #6 — totales en backend).
 */

/** Fila de tenant ya clasificada — subconjunto de lo que arma el route. */
export interface DunningInputRow {
  id: string;
  slug: string;
  name: string;
  plan: string;
  planLabel: string;
  status: "paid" | "trial" | "canceled" | "free";
  monthlyPEN: number;
  source: "stripe" | "mp" | "none";
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  nextBillAt: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}

/** Precio mensual de un plan en PEN (0 si free/desconocido). */
export type PlanPrice = (plan: string) => number;

/** Movimiento de MRR del mes en curso. Honesto: sin expansion/contraction
 *  porque no hay historial de cambios de plan — sólo altas y fugas. */
export interface MrrMovement {
  monthLabel: string;
  newMRRPEN: number;
  newCount: number;
  churningMRRPEN: number;
  churningCount: number;
  netNewMRRPEN: number;
}

/** Una fila accionable dentro de un balde de cobranza. */
export interface DunningRow {
  id: string;
  slug: string;
  name: string;
  planLabel: string;
  amountPEN: number;
  whenAt: string | null;
  daysLeft: number | null;
}

export type DunningKey =
  | "canceling"
  | "pastDue"
  | "trialEndingSoon"
  | "noPaymentMethod";

export interface DunningBucket {
  key: DunningKey;
  label: string;
  hint: string;
  /** "risk" = MRR que se pierde si no actuás · "opportunity" = MRR a ganar */
  kind: "risk" | "opportunity";
  count: number;
  amountPEN: number;
  rows: DunningRow[];
}

export interface Dunning {
  totalAtRiskPEN: number;
  buckets: DunningBucket[];
}

const MAX_ROWS = 12;
const sum = (arr: number[]): number => arr.reduce((a, b) => a + b, 0);

/** Movimiento de MRR del mes que contiene `now`. */
export function computeMrrMovement(
  rows: DunningInputRow[],
  planPrice: PlanPrice,
  now: number,
): MrrMovement {
  const nowD = new Date(now);
  const startOfMonth = new Date(
    nowD.getFullYear(),
    nowD.getMonth(),
    1,
  ).getTime();

  const newPaidThisMonth = rows.filter(
    (r) => r.status === "paid" && new Date(r.createdAt).getTime() >= startOfMonth,
  );
  // Cancelando = aún activo hasta fin de periodo, pero MRR a punto de irse.
  // El route los marca status "canceled" con monthlyPEN 0 → usamos el precio
  // del plan para cuantificar lo que se pierde.
  const cancelingRows = rows.filter(
    (r) => r.cancelAtPeriodEnd && planPrice(r.plan) > 0,
  );

  const newMRRPEN = sum(newPaidThisMonth.map((r) => r.monthlyPEN));
  const churningMRRPEN = sum(cancelingRows.map((r) => planPrice(r.plan)));

  return {
    // "junio 2026" (sin "de" — el span lo capitaliza a "Junio 2026")
    monthLabel: `${nowD.toLocaleDateString("es-PE", { month: "long" })} ${nowD.getFullYear()}`,
    newMRRPEN,
    newCount: newPaidThisMonth.length,
    churningMRRPEN,
    churningCount: cancelingRows.length,
    netNewMRRPEN: newMRRPEN - churningMRRPEN,
  };
}

/** Baldes de cobranza/riesgo a partir del estado actual de cada tenant. */
export function computeDunning(
  rows: DunningInputRow[],
  planPrice: PlanPrice,
  now: number,
): Dunning {
  const toRow = (
    r: DunningInputRow,
    amountPEN: number,
    whenAt: string | null,
  ): DunningRow => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    planLabel: r.planLabel,
    amountPEN,
    whenAt,
    daysLeft: r.trialDaysLeft,
  });

  const cancelingRows = rows.filter(
    (r) => r.cancelAtPeriodEnd && planPrice(r.plan) > 0,
  );
  const pastDueRows = rows.filter(
    (r) =>
      r.status === "paid" &&
      r.nextBillAt !== null &&
      new Date(r.nextBillAt).getTime() < now,
  );
  const trialEndingRows = rows.filter(
    (r) => r.status === "trial" && (r.trialDaysLeft ?? 99) <= 3,
  );
  const noMethodRows = rows.filter(
    (r) => r.status === "paid" && r.source === "none",
  );

  const buckets: DunningBucket[] = [
    {
      key: "canceling",
      label: "Cancelando",
      hint: "Activarán la baja al cierre del periodo — recuperalos ya",
      kind: "risk",
      count: cancelingRows.length,
      amountPEN: sum(cancelingRows.map((r) => planPrice(r.plan))),
      rows: cancelingRows
        .map((r) => toRow(r, planPrice(r.plan), r.nextBillAt))
        .slice(0, MAX_ROWS),
    },
    {
      key: "pastDue",
      label: "Cobro vencido",
      hint: "La fecha de renovación ya pasó — verificá el pago",
      kind: "risk",
      count: pastDueRows.length,
      amountPEN: sum(pastDueRows.map((r) => r.monthlyPEN)),
      rows: pastDueRows
        .map((r) => toRow(r, r.monthlyPEN, r.nextBillAt))
        .slice(0, MAX_ROWS),
    },
    {
      key: "noPaymentMethod",
      label: "Sin método de pago",
      hint: "Plan pago pero sin Stripe/MP vinculado — cobro manual o en riesgo",
      kind: "risk",
      count: noMethodRows.length,
      amountPEN: sum(noMethodRows.map((r) => r.monthlyPEN)),
      rows: noMethodRows
        .map((r) => toRow(r, r.monthlyPEN, r.nextBillAt))
        .slice(0, MAX_ROWS),
    },
    {
      key: "trialEndingSoon",
      label: "Trial por vencer (≤3d)",
      hint: "MRR potencial si convertís antes de que termine el trial",
      kind: "opportunity",
      count: trialEndingRows.length,
      amountPEN: sum(trialEndingRows.map((r) => planPrice(r.plan))),
      rows: trialEndingRows
        .map((r) => toRow(r, planPrice(r.plan), r.trialEndsAt))
        .slice(0, MAX_ROWS),
    },
  ];

  return {
    totalAtRiskPEN: sum(
      buckets.filter((b) => b.kind === "risk").map((b) => b.amountPEN),
    ),
    buckets,
  };
}
