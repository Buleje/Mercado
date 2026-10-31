/**
 * lib/billing/mrr-plataforma.ts — la plata de la PLATAFORMA (Buleje SaaS), en
 * funciones puras: qué tienda paga hoy, cuánto suma el MRR y el estado de
 * resultados del mes. La usan Facturación (`billing-summary`), Analítica
 * ejecutiva y Gastos (P&L), para que las tres digan el mismo número.
 *
 * Reglas (2026-10-09):
 *  - El precio de cada plan sale de `precioMensualDePlan` (plan-tiers.ts).
 *  - Una tienda en prueba, cancelada, inactiva o con la prueba VENCIDA aporta
 *    S/ 0 al MRR. «Paga» = lo mismo que decide el modo solo lectura
 *    (`getTrialStatus(t).kind === "paid"`): pasarela al día o plan otorgado a
 *    mano sin prueba encima. Antes, una prueba vencida sin pasarela contaba
 *    como pagando aunque la app la dejaba en solo lectura.
 *  - Lo COBRADO (vouchers aprobados) y el MRR ESTIMADO (precio de lista de los
 *    planes vigentes) son dos números distintos y viajan rotulados aparte.
 *  - La infra estimada entra al gasto solo si ese mes no registraste gastos de
 *    infra a mano (si no, se contaría dos veces).
 */

import { PLANS, precioMensualDePlan } from "@/lib/billing/plan-tiers";
import { getTrialStatus } from "@/lib/billing/trial-status";

/** `expired` = la prueba venció (o la pasarela no renovó) y nadie pagó: solo lectura. */
export type EstadoDeCobro = "paid" | "trial" | "canceled" | "free" | "expired";
export type FuenteDeCobro = "stripe" | "mp" | "none";

export interface TenantCobrable {
  plan: string;
  active: boolean;
  trialEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId?: string | null;
  stripeCurrentPeriodEnd?: Date | null;
  mpSubscriptionId?: string | null;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** En qué está la tienda frente al cobro: paga, prueba, cancelada o gratis. */
export function estadoDeCobro(
  t: TenantCobrable,
  now: number = Date.now(),
): {
  status: EstadoDeCobro;
  source: FuenteDeCobro;
  nextBillAt: Date | null;
  trialDaysLeft: number | null;
} {
  const source: FuenteDeCobro = t.stripeSubscriptionId ? "stripe" : t.mpSubscriptionId ? "mp" : "none";
  const trialDaysLeft = t.trialEndsAt
    ? Math.max(0, Math.ceil((t.trialEndsAt.getTime() - now) / DIA_MS))
    : null;
  const isTrial = !!t.trialEndsAt && t.trialEndsAt.getTime() > now;

  if (precioMensualDePlan(t.plan) === 0) {
    return { status: "free", source, nextBillAt: null, trialDaysLeft };
  }
  if (!t.active || t.cancelAtPeriodEnd) {
    return { status: "canceled", source, nextBillAt: t.stripeCurrentPeriodEnd ?? null, trialDaysLeft };
  }
  if (isTrial) {
    return { status: "trial", source, nextBillAt: t.trialEndsAt, trialDaysLeft };
  }
  const pago = getTrialStatus(
    {
      plan: t.plan,
      trialEndsAt: t.trialEndsAt,
      stripeSubscriptionId: t.stripeSubscriptionId ?? null,
      stripeCurrentPeriodEnd: t.stripeCurrentPeriodEnd ?? null,
      mpSubscriptionId: t.mpSubscriptionId ?? null,
      active: t.active,
    },
    now,
  );
  if (pago.kind === "paid") {
    return { status: "paid", source, nextBillAt: t.stripeCurrentPeriodEnd ?? null, trialDaysLeft };
  }
  return { status: "expired", source, nextBillAt: null, trialDaysLeft };
}

/** Lo que la tienda aporta al MRR: precio de lista si paga hoy; 0 si no. */
export function mrrMensualDeTenant(t: TenantCobrable, now: number = Date.now()): number {
  return estadoDeCobro(t, now).status === "paid" ? precioMensualDePlan(t.plan) : 0;
}

/** MRR estimado de un grupo de tiendas + cuántas pagan hoy. */
export function resumirMrr(
  tenants: readonly TenantCobrable[],
  now: number = Date.now(),
): { mrrPen: number; tiendasQuePagan: number; enPrueba: number } {
  let mrrPen = 0;
  let tiendasQuePagan = 0;
  let enPrueba = 0;
  for (const t of tenants) {
    const { status } = estadoDeCobro(t, now);
    if (status === "paid") {
      tiendasQuePagan += 1;
      mrrPen += precioMensualDePlan(t.plan);
    } else if (status === "trial") {
      enPrueba += 1;
    }
  }
  return { mrrPen: redondear(mrrPen), tiendasQuePagan, enPrueba };
}

// ── Estado de resultados del mes ───────────────────────────────────────────

export interface PnlPlataforma {
  /** Mes calendario de Lima (`YYYY-MM`). */
  mes: string;
  ingresos: {
    /** Plata que entró: vouchers APROBADOS cuyo pago se subió este mes. */
    cobradoPen: number;
    pagosCobrados: number;
    /** Precio de lista de las tiendas que pagan hoy (las de prueba, S/ 0). */
    mrrEstimadoPen: number;
    tiendasQuePagan: number;
    tiendasEnPrueba: number;
  };
  gastos: {
    /** Lo que registraste en el Registro (recurrente mensualizado + únicos del mes). */
    registradoPen: number;
    /** Estimado de infra por tienda (/api/superadmin/costs); null si no se pudo calcular. */
    infraEstimadaPen: number | null;
    /** true si la infra estimada se sumó (no había infra registrada este mes). */
    infraEstimadaSumada: boolean;
    totalPen: number;
  };
  /** Cobrado − gasto total. */
  resultadoCobradoPen: number;
  /** MRR estimado − gasto total (cómo queda un mes «normal»). */
  resultadoMrrPen: number;
  /**
   * Margen bruto de la plataforma: (MRR − infra estimada) / MRR. null si nadie
   * paga (las tiendas en prueba no tienen ingreso con qué medir margen).
   */
  margenBrutoPct: number | null;
  puntoDeEquilibrio: {
    /** Tiendas pagando que cubren el gasto total; null si el gasto es 0. */
    tiendas: number | null;
    /** Ticket usado: el promedio de las que pagan o, si no paga nadie, el plan recomendado. */
    ticketPen: number;
    ticketEsReferencia: boolean;
    planReferencia: string;
  };
}

export interface PnlInput {
  mes: string;
  cobrado: { totalPen: number; pagos: number };
  mrr: { mrrPen: number; tiendasQuePagan: number; enPrueba: number };
  gastoRegistradoPen: number;
  /** Infra que registraste a mano este mes (categoría «infra»). */
  infraRegistradaPen: number;
  infraEstimadaPen: number | null;
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

/** El plan marcado como «Más elegido»: ticket de referencia cuando nadie paga aún. */
function planRecomendado(): { label: string; precio: number } {
  const rec = Object.values(PLANS).find((p) => p.recommended) ?? PLANS.enterprise;
  return { label: rec.label, precio: rec.monthlyPrice };
}

export function armarPnlPlataforma(input: PnlInput): PnlPlataforma {
  const infraEstimada = input.infraEstimadaPen;
  const infraEstimadaSumada = infraEstimada !== null && infraEstimada > 0 && input.infraRegistradaPen <= 0;
  const totalPen = redondear(input.gastoRegistradoPen + (infraEstimadaSumada ? infraEstimada : 0));

  const rec = planRecomendado();
  const ticketReal = input.mrr.tiendasQuePagan > 0 ? input.mrr.mrrPen / input.mrr.tiendasQuePagan : 0;
  const ticketEsReferencia = ticketReal <= 0;
  const ticketPen = redondear(ticketEsReferencia ? rec.precio : ticketReal);

  return {
    mes: input.mes,
    ingresos: {
      cobradoPen: redondear(input.cobrado.totalPen),
      pagosCobrados: input.cobrado.pagos,
      mrrEstimadoPen: redondear(input.mrr.mrrPen),
      tiendasQuePagan: input.mrr.tiendasQuePagan,
      tiendasEnPrueba: input.mrr.enPrueba,
    },
    gastos: {
      registradoPen: redondear(input.gastoRegistradoPen),
      infraEstimadaPen: infraEstimada === null ? null : redondear(infraEstimada),
      infraEstimadaSumada,
      totalPen,
    },
    resultadoCobradoPen: redondear(input.cobrado.totalPen - totalPen),
    resultadoMrrPen: redondear(input.mrr.mrrPen - totalPen),
    margenBrutoPct:
      input.mrr.mrrPen > 0 && infraEstimada !== null
        ? Math.round(((input.mrr.mrrPen - infraEstimada) / input.mrr.mrrPen) * 1000) / 10
        : null,
    puntoDeEquilibrio: {
      tiendas: totalPen > 0 && ticketPen > 0 ? Math.ceil(totalPen / ticketPen) : null,
      ticketPen,
      ticketEsReferencia,
      planReferencia: rec.label,
    },
  };
}
