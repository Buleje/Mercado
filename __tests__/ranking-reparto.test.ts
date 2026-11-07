import { describe, it, expect } from "vitest";
import {
  desdeDelPeriodo,
  filaDeRanking,
  rankingReparto,
  type AsignacionRanking,
  type RepartidorRankingFuente,
} from "@/lib/delivery/ranking-reparto";

const asig = (status: string, fee = 5, extra: Partial<AsignacionRanking> = {}): AsignacionRanking => ({
  status,
  fee,
  pickedUpAt: null,
  deliveredAt: null,
  ...extra,
});

const rep = (id: string, assignments: AsignacionRanking[], rating = 5): RepartidorRankingFuente => ({
  id,
  name: id,
  phone: "987654321",
  vehicleType: "Moto",
  rating,
  acceptanceRate: 1,
  totalOffers: 0,
  totalAccepted: 0,
  assignments,
});

describe("filaDeRanking", () => {
  it("sin ninguna cerrada: tasa null (Sin datos), no 0", () => {
    expect(filaDeRanking(rep("nuevo", [])).completionRate).toBeNull();
    expect(filaDeRanking(rep("en-curso", [asig("picked_up")])).completionRate).toBeNull();
  });

  it("lo que sigue en camino no baja la tasa", () => {
    const f = filaDeRanking(rep("a", [asig("delivered"), asig("delivered"), asig("in_transit")]));
    expect(f.completionRate).toBe(1);
    expect(f.inProgress).toBe(1);
    expect(f.cerradas).toBe(2);
  });

  it("canceladas y fallidas cuentan como no entregadas", () => {
    const f = filaDeRanking(rep("a", [asig("delivered"), asig("cancelled"), asig("failed"), asig("delivered")]));
    expect(f.completionRate).toBe(0.5);
    expect(f.cancelled).toBe(2);
  });

  it("tarifas sólo de las entregadas, a centavos (Decimal como texto)", () => {
    const f = filaDeRanking(rep("a", [asig("delivered", "5.10" as unknown as number), asig("delivered", 0.2), asig("cancelled", 9)]));
    expect(f.totalEarnings).toBe(5.3);
  });

  it("minutos promedio de recogido a entregado", () => {
    const t0 = new Date("2026-10-10T10:00:00Z");
    const f = filaDeRanking(
      rep("a", [asig("delivered", 5, { pickedUpAt: t0, deliveredAt: new Date(t0.getTime() + 20 * 60_000) })]),
    );
    expect(f.avgDeliveryMin).toBe(20);
  });
});

describe("rankingReparto", () => {
  it("la tasa del equipo es ponderada por pedido, no el promedio de porcentajes", () => {
    // A: 9 de 10 (90 %) · B: 0 de 1 (0 %). Promedio simple = 45 %; real = 9/11.
    const a = rep("A", [...Array(9).fill(0).map(() => asig("delivered")), asig("cancelled")]);
    const b = rep("B", [asig("cancelled")]);
    const { summary, ranking } = rankingReparto([b, a]);
    expect(summary.completionRate).toBeCloseTo(9 / 11);
    expect(summary.cerradas).toBe(11);
    expect(ranking[0].id).toBe("A");
  });

  it("nadie cerró nada: tasa del equipo null", () => {
    expect(rankingReparto([rep("A", []), rep("B", [asig("accepted")])]).summary.completionRate).toBeNull();
  });

  it("empate en entregas: gana la mejor calificación", () => {
    const { ranking } = rankingReparto([rep("bajo", [asig("delivered")], 4.1), rep("alto", [asig("delivered")], 4.9)]);
    expect(ranking.map((r) => r.id)).toEqual(["alto", "bajo"]);
  });
});

describe("desdeDelPeriodo", () => {
  const ahora = new Date("2026-10-17T15:00:00Z");
  it("7 y 30 días corridos hacia atrás", () => {
    expect(desdeDelPeriodo("week", ahora).toISOString()).toBe("2026-10-10T15:00:00.000Z");
    expect(desdeDelPeriodo("month", ahora).toISOString()).toBe("2026-09-17T15:00:00.000Z");
  });
});
