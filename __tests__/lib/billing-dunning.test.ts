import { describe, it, expect } from "vitest";
import {
  computeMrrMovement,
  computeDunning,
  type DunningInputRow,
} from "@/lib/billing/dunning";

// Precio de plan de prueba (igual orden de magnitud que producción).
const planPrice = (plan: string): number =>
  ({ starter: 89, pro: 179, enterprise: 179, business: 349 })[plan] ?? 0;

// "Ahora" fijo para determinismo: 17 jun 2026, 12:00 local.
const NOW = new Date("2026-06-17T12:00:00").getTime();
const iso = (s: string) => new Date(s).toISOString();

function mk(partial: Partial<DunningInputRow>): DunningInputRow {
  return {
    id: partial.id ?? "id",
    slug: partial.slug ?? "slug",
    name: partial.name ?? "Tienda",
    plan: partial.plan ?? "free",
    planLabel: partial.planLabel ?? "Free",
    status: partial.status ?? "free",
    monthlyPEN: partial.monthlyPEN ?? 0,
    source: partial.source ?? "none",
    trialEndsAt: partial.trialEndsAt ?? null,
    trialDaysLeft: partial.trialDaysLeft ?? null,
    nextBillAt: partial.nextBillAt ?? null,
    cancelAtPeriodEnd: partial.cancelAtPeriodEnd ?? false,
    createdAt: partial.createdAt ?? iso("2025-01-01T00:00:00"),
  };
}

const rows: DunningInputRow[] = [
  // alta paga este mes → newMRR
  mk({ id: "new", name: "Nueva", plan: "pro", planLabel: "Pro", status: "paid", monthlyPEN: 179, source: "stripe", nextBillAt: iso("2026-07-05"), createdAt: iso("2026-06-05T10:00:00") }),
  // cancelando (status canceled, monthlyPEN 0, pero MRR a fugar = precio plan)
  mk({ id: "cancel", name: "Se va", plan: "enterprise", planLabel: "Pro", status: "canceled", monthlyPEN: 0, cancelAtPeriodEnd: true, source: "stripe", nextBillAt: iso("2026-06-30") }),
  // cobro vencido (paid, nextBill en el pasado)
  mk({ id: "due", name: "Vencido", plan: "business", planLabel: "Business", status: "paid", monthlyPEN: 349, source: "stripe", nextBillAt: iso("2026-06-14") }),
  // sin método de pago (paid, source none)
  mk({ id: "nomethod", name: "Manual", plan: "starter", planLabel: "Starter", status: "paid", monthlyPEN: 89, source: "none", nextBillAt: null }),
  // trial por vencer (≤3d) → oportunidad
  mk({ id: "trial", name: "Trial corto", plan: "enterprise", planLabel: "Pro", status: "trial", trialDaysLeft: 2, trialEndsAt: iso("2026-06-19") }),
  // trial largo → NO debe aparecer
  mk({ id: "trial-far", name: "Trial largo", plan: "enterprise", status: "trial", trialDaysLeft: 20, trialEndsAt: iso("2026-07-07") }),
  // free → ignorado en todo
  mk({ id: "free", name: "Gratis", plan: "free", status: "free" }),
];

describe("computeMrrMovement", () => {
  const m = computeMrrMovement(rows, planPrice, NOW);

  it("cuenta sólo las altas pagas de este mes", () => {
    expect(m.newMRRPEN).toBe(179);
    expect(m.newCount).toBe(1);
  });

  it("cuantifica la fuga por precio de plan (no por monthlyPEN)", () => {
    expect(m.churningMRRPEN).toBe(179);
    expect(m.churningCount).toBe(1);
  });

  it("calcula el neto y etiqueta el mes", () => {
    expect(m.netNewMRRPEN).toBe(0);
    expect(m.monthLabel.toLowerCase()).toContain("junio");
  });
});

describe("computeDunning", () => {
  const d = computeDunning(rows, planPrice, NOW);
  const bucket = (k: string) => d.buckets.find((b) => b.key === k)!;

  it("balde Cancelando: cuenta y monto por precio de plan", () => {
    expect(bucket("canceling").count).toBe(1);
    expect(bucket("canceling").amountPEN).toBe(179);
    expect(bucket("canceling").rows[0].name).toBe("Se va");
  });

  it("balde Cobro vencido: sólo nextBill en el pasado", () => {
    expect(bucket("pastDue").count).toBe(1);
    expect(bucket("pastDue").amountPEN).toBe(349);
  });

  it("balde Sin método de pago: paid + source none", () => {
    expect(bucket("noPaymentMethod").count).toBe(1);
    expect(bucket("noPaymentMethod").amountPEN).toBe(89);
  });

  it("balde Trial por vencer: ≤3d y es oportunidad, no riesgo", () => {
    const b = bucket("trialEndingSoon");
    expect(b.count).toBe(1);
    expect(b.amountPEN).toBe(179);
    expect(b.kind).toBe("opportunity");
  });

  it("totalAtRiskPEN suma sólo los baldes de riesgo (excluye oportunidad)", () => {
    expect(d.totalAtRiskPEN).toBe(179 + 349 + 89);
  });

  it("ignora free y trials largos", () => {
    const allRowIds = d.buckets.flatMap((b) => b.rows.map((r) => r.id));
    expect(allRowIds).not.toContain("free");
    expect(allRowIds).not.toContain("trial-far");
  });
});
