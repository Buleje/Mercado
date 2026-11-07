/**
 * lib/billing/trial-status — quién puede escribir y quién queda en read-only.
 *
 * Contexto (2026-08-12): un tenant real con plan `enterprise` no podía crear
 * Órdenes de Compra porque su prueba había vencido, y "arreglarlo" tratando
 * todo plan pago como pagado habría **regalado el producto**: el alta
 * self-serve da período de prueba a cualquier plan que el usuario elija.
 *
 * La marca de "plan otorgado a mano" es `trialEndsAt == null` sin suscripción
 * de pasarela — sólo el superadmin la deja así. Estos tests fijan esa frontera
 * en los dos sentidos.
 */

import { describe, it, expect } from "vitest";
import { getTrialStatus, isReadOnlyMode } from "@/lib/billing/trial-status";

const AYER = new Date(Date.now() - 24 * 60 * 60 * 1000);
const EL_ANO_QUE_VIENE = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

const BASE = {
  plan: "free",
  trialEndsAt: null as Date | null,
  stripeSubscriptionId: null as string | null,
  mpSubscriptionId: null as string | null,
};

describe("plan otorgado a mano por el superadmin", () => {
  it("puede operar: plan pago, sin pasarela y sin prueba encima", () => {
    const t = { ...BASE, plan: "enterprise" };
    expect(getTrialStatus(t)).toEqual({ kind: "paid", provider: "manual" });
    expect(isReadOnlyMode(t)).toBe(false);
  });

  it("no aplica si el plan es free", () => {
    expect(getTrialStatus({ ...BASE, plan: "free" })).toEqual({ kind: "unknown" });
  });

  it("un tenant suspendido sigue en read-only aunque tenga plan otorgado", () => {
    expect(isReadOnlyMode({ ...BASE, plan: "enterprise", active: false })).toBe(true);
  });
});

describe("la puerta que NO se puede abrir (fuga de ingresos)", () => {
  it("elegir enterprise en el alta y no pagar NO da plan pago: la prueba vence", () => {
    // Exactamente lo que crea `app/api/onboarding`: plan elegido + prueba.
    const t = { ...BASE, plan: "enterprise", trialEndsAt: AYER };
    expect(getTrialStatus(t).kind).toBe("trial_expired");
    expect(isReadOnlyMode(t)).toBe(true);
  });

  it("con la prueba todavía corriendo sigue siendo prueba, no plan pago", () => {
    const t = { ...BASE, plan: "enterprise", trialEndsAt: EL_ANO_QUE_VIENE };
    expect(getTrialStatus(t).kind).toBe("trial_active");
    expect(isReadOnlyMode(t)).toBe(false);
  });

  it("una suscripción de Stripe vencida no revive por la puerta del plan manual", () => {
    const t = {
      ...BASE,
      plan: "enterprise",
      stripeSubscriptionId: "sub_123",
      stripeCurrentPeriodEnd: AYER,
      trialEndsAt: AYER,
    };
    expect(getTrialStatus(t).kind).toBe("trial_expired");
    expect(isReadOnlyMode(t)).toBe(true);
  });

  it("tampoco revive una suscripción de Stripe vencida sin prueba registrada", () => {
    const t = {
      ...BASE,
      plan: "enterprise",
      stripeSubscriptionId: "sub_123",
      stripeCurrentPeriodEnd: AYER,
    };
    // Sin trialEndsAt cae a `unknown` (fail-open histórico), pero lo que importa
    // es que NO se clasifique como pagado por tener plan.
    expect(getTrialStatus(t)).not.toEqual({ kind: "paid", provider: "manual" });
  });
});

describe("suscripciones de pasarela vigentes", () => {
  it("Stripe con período vigente = pagado", () => {
    const t = {
      ...BASE,
      plan: "pro",
      stripeSubscriptionId: "sub_1",
      stripeCurrentPeriodEnd: EL_ANO_QUE_VIENE,
    };
    expect(getTrialStatus(t)).toEqual({ kind: "paid", provider: "stripe" });
  });

  it("Mercado Pago con período vigente = pagado", () => {
    const t = {
      ...BASE,
      plan: "pro",
      mpSubscriptionId: "mp_1",
      stripeCurrentPeriodEnd: EL_ANO_QUE_VIENE,
    };
    expect(getTrialStatus(t)).toEqual({ kind: "paid", provider: "mp" });
  });
});
