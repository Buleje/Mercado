/**
 * Un solo precio por plan y la plata real de la plataforma (2026-10-09).
 *
 * Antes había 4 tablas: Facturación contaba `Tenant.plan = "pro"` (Starter S/ 89)
 * a S/ 179, Analítica usaba 49/149/299 × todas las activas (también las de
 * prueba) y el alta por voucher guardaba el tier «enterprise» (Pro S/ 179) como
 * `Tenant.plan = "enterprise"` (= Business S/ 349).
 */
import { describe, it, expect } from "vitest";
import {
  PLANS,
  PLAN_ORDER,
  etiquetaDePlan,
  precioMensualDePlan,
  tierDePlanGuardado,
} from "@/lib/billing/plan-tiers";
import { tierToPlanId } from "@/lib/billing/plan-mapping";
import { DEFAULT_PLAN_PRICES, PLANS as PLANES_LEGACY, type PlanId } from "@/lib/plans";
import {
  armarPnlPlataforma,
  estadoDeCobro,
  mrrMensualDeTenant,
  resumirMrr,
  type TenantCobrable,
} from "@/lib/billing/mrr-plataforma";

const AHORA = Date.UTC(2026, 9, 9, 15);
const DIA = 24 * 60 * 60 * 1000;

function tienda(plan: string, extra: Partial<TenantCobrable> = {}): TenantCobrable {
  return { plan, active: true, trialEndsAt: null, cancelAtPeriodEnd: false, ...extra };
}

describe("precioMensualDePlan — Tenant.plan guarda el id legacy", () => {
  it("cada plan guardado cuesta lo que se cobra en plan-tiers", () => {
    expect(precioMensualDePlan("free")).toBe(0);
    expect(precioMensualDePlan("pro")).toBe(89);
    expect(precioMensualDePlan("business")).toBe(179);
    expect(precioMensualDePlan("enterprise")).toBe(349);
  });

  it("acepta los alias viejos y no inventa precio para lo desconocido", () => {
    expect(precioMensualDePlan("starter")).toBe(89);
    expect(precioMensualDePlan("basico")).toBe(0);
    expect(precioMensualDePlan("max")).toBe(349);
    expect(precioMensualDePlan(" PRO ")).toBe(89);
    expect(precioMensualDePlan("custom")).toBe(0);
    expect(precioMensualDePlan(null)).toBe(0);
    expect(precioMensualDePlan("toString")).toBe(0);
  });

  it("la etiqueta visible ya no llama «Pro» al Starter", () => {
    expect(etiquetaDePlan("pro")).toBe("Starter");
    expect(etiquetaDePlan("business")).toBe("Pro");
    expect(etiquetaDePlan("enterprise")).toBe("Business");
    expect(etiquetaDePlan("raro")).toBe("raro");
  });

  it("lib/plans.ts dice el mismo precio que plan-tiers (no hay segunda tabla)", () => {
    for (const id of Object.keys(DEFAULT_PLAN_PRICES) as PlanId[]) {
      expect(DEFAULT_PLAN_PRICES[id]).toBe(precioMensualDePlan(id));
      expect(PLANES_LEGACY[id].priceMonthly).toBe(precioMensualDePlan(id));
    }
  });

  it("el alta por voucher guarda el plan que se pagó: tier → Tenant.plan → mismo precio", () => {
    expect(tierToPlanId("enterprise")).toBe("business");
    for (const tier of PLAN_ORDER) {
      const guardado = tierToPlanId(tier);
      expect(tierDePlanGuardado(guardado)).toBe(tier);
      expect(precioMensualDePlan(guardado)).toBe(PLANS[tier].monthlyPrice);
    }
  });
});

describe("estadoDeCobro / MRR — una tienda en prueba aporta S/ 0", () => {
  it("prueba vigente = trial y no suma", () => {
    const enPrueba = tienda("enterprise", { trialEndsAt: new Date(AHORA + 5 * DIA) });
    expect(estadoDeCobro(enPrueba, AHORA).status).toBe("trial");
    expect(estadoDeCobro(enPrueba, AHORA).trialDaysLeft).toBe(5);
    expect(mrrMensualDeTenant(enPrueba, AHORA)).toBe(0);
  });

  it("prueba vencida sin pasarela = expired y S/ 0 (la app la tiene en solo lectura)", () => {
    const vencida = tienda("business", { trialEndsAt: new Date(AHORA - DIA) });
    expect(estadoDeCobro(vencida, AHORA).status).toBe("expired");
    expect(mrrMensualDeTenant(vencida, AHORA)).toBe(0);
    expect(resumirMrr([vencida], AHORA)).toEqual({ mrrPen: 0, tiendasQuePagan: 0, enPrueba: 0 });
  });

  it("paga = plan otorgado a mano sin prueba, o pasarela con el período al día", () => {
    expect(mrrMensualDeTenant(tienda("business"), AHORA)).toBe(179);
    const stripeAlDia = tienda("enterprise", {
      stripeSubscriptionId: "sub_1",
      stripeCurrentPeriodEnd: new Date(AHORA + 10 * DIA),
    });
    expect(estadoDeCobro(stripeAlDia, AHORA).status).toBe("paid");
    expect(mrrMensualDeTenant(stripeAlDia, AHORA)).toBe(349);
    // La pasarela no renovó y ya no hay prueba: no paga aunque el plan diga enterprise.
    const mpVencida = tienda("enterprise", {
      mpSubscriptionId: "mp_1",
      stripeCurrentPeriodEnd: new Date(AHORA - DIA),
    });
    expect(estadoDeCobro(mpVencida, AHORA).status).toBe("expired");
    expect(mrrMensualDeTenant(mpVencida, AHORA)).toBe(0);
  });

  it("inactiva o cancelando = canceled; plan gratis o desconocido = free", () => {
    expect(estadoDeCobro(tienda("pro", { active: false }), AHORA).status).toBe("canceled");
    expect(mrrMensualDeTenant(tienda("pro", { cancelAtPeriodEnd: true }), AHORA)).toBe(0);
    expect(estadoDeCobro(tienda("free"), AHORA).status).toBe("free");
    expect(estadoDeCobro(tienda("custom"), AHORA).status).toBe("free");
  });

  it("resumirMrr suma solo las que pagan y cuenta las de prueba aparte", () => {
    const r = resumirMrr(
      [
        tienda("pro"),
        tienda("business"),
        tienda("enterprise", { trialEndsAt: new Date(AHORA + DIA) }),
        tienda("free"),
        tienda("business", { active: false }),
      ],
      AHORA,
    );
    expect(r).toEqual({ mrrPen: 89 + 179, tiendasQuePagan: 2, enPrueba: 1 });
  });
});

describe("armarPnlPlataforma — cobrado, MRR estimado e infra estimada", () => {
  const base = {
    mes: "2026-10",
    cobrado: { totalPen: 0, pagos: 0 },
    mrr: { mrrPen: 0, tiendasQuePagan: 0, enPrueba: 9 },
    gastoRegistradoPen: 0,
    infraRegistradaPen: 0,
    infraEstimadaPen: 19.15,
  };

  it("sin infra registrada, la estimada entra al gasto (rotulada) en vez de S/ 0", () => {
    const p = armarPnlPlataforma(base);
    expect(p.gastos).toEqual({
      registradoPen: 0,
      infraEstimadaPen: 19.15,
      infraEstimadaSumada: true,
      totalPen: 19.15,
    });
    expect(p.resultadoCobradoPen).toBe(-19.15);
    expect(p.resultadoMrrPen).toBe(-19.15);
    // Nadie paga → no hay margen que medir (antes la tarjeta decía 99 %).
    expect(p.margenBrutoPct).toBeNull();
    // Nadie paga todavía → el equilibrio se mide con el plan recomendado (Pro S/ 179).
    expect(p.puntoDeEquilibrio).toEqual({ tiendas: 1, ticketPen: 179, ticketEsReferencia: true, planReferencia: "Pro" });
  });

  it("con infra registrada este mes, la estimada NO se suma (no contar dos veces)", () => {
    const p = armarPnlPlataforma({ ...base, gastoRegistradoPen: 300, infraRegistradaPen: 120 });
    expect(p.gastos.infraEstimadaSumada).toBe(false);
    expect(p.gastos.totalPen).toBe(300);
  });

  it("lo cobrado y el MRR van separados; el equilibrio usa el ticket real si hay quien pague", () => {
    const p = armarPnlPlataforma({
      ...base,
      cobrado: { totalPen: 179, pagos: 1 },
      mrr: { mrrPen: 89 + 349, tiendasQuePagan: 2, enPrueba: 0 },
      gastoRegistradoPen: 500,
      infraEstimadaPen: null,
    });
    expect(p.ingresos.cobradoPen).toBe(179);
    expect(p.ingresos.mrrEstimadoPen).toBe(438);
    expect(p.gastos.infraEstimadaSumada).toBe(false);
    expect(p.resultadoCobradoPen).toBe(-321);
    expect(p.resultadoMrrPen).toBe(-62);
    expect(p.margenBrutoPct).toBeNull(); // sin estimado de infra no se inventa margen
    expect(armarPnlPlataforma({ ...base, mrr: { mrrPen: 200, tiendasQuePagan: 1, enPrueba: 0 }, infraEstimadaPen: 20 }).margenBrutoPct).toBe(90);
    expect(p.puntoDeEquilibrio.ticketEsReferencia).toBe(false);
    expect(p.puntoDeEquilibrio.ticketPen).toBe(219);
    expect(p.puntoDeEquilibrio.tiendas).toBe(3);
  });

  it("sin gasto no hay punto de equilibrio que calcular", () => {
    const p = armarPnlPlataforma({ ...base, infraEstimadaPen: 0 });
    expect(p.gastos.totalPen).toBe(0);
    expect(p.puntoDeEquilibrio.tiendas).toBeNull();
  });
});
