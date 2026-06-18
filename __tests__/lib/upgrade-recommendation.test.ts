import { describe, it, expect } from "vitest";
import { recommendUpgrade, PLAN_LADDER } from "@/lib/superadmin/upgrade-recommendation";

describe("recommendUpgrade", () => {
  it("free al límite → recomienda starter con upside +89", () => {
    const r = recommendUpgrade("free", 95)!;
    expect(r.recommendedPlan).toBe("starter");
    expect(r.upsidePEN).toBe(89);
    expect(r.newOrderLimit).toBe(1000);
  });

  it("starter cerca del límite → pro con upside +90 (179−89)", () => {
    const r = recommendUpgrade("starter", 950)!;
    expect(r.recommendedPlan).toBe("pro");
    expect(r.upsidePEN).toBe(90);
  });

  it("salta al plan que deja el consumo cómodo (≤80%)", () => {
    // free con 900 pedidos: starter (1000) lo deja al 90% → no cómodo; salta a pro.
    const r = recommendUpgrade("free", 900)!;
    expect(r.recommendedPlan).toBe("pro");
  });

  it("pro al límite → business (ilimitado), upside +170", () => {
    const r = recommendUpgrade("pro", 9500)!;
    expect(r.recommendedPlan).toBe("business");
    expect(r.upsidePEN).toBe(170);
    expect(r.newOrderLimit).toBeNull();
  });

  it("business (tope) → null", () => {
    expect(recommendUpgrade("business", 50000)).toBeNull();
  });

  it("enterprise / desconocido → null", () => {
    expect(recommendUpgrade("enterprise", 100)).toBeNull();
    expect(recommendUpgrade("ninguno", 100)).toBeNull();
  });

  it("alias basico se trata como free", () => {
    expect(recommendUpgrade("basico", 95)?.recommendedPlan).toBe("starter");
  });

  it("el ladder está ordenado por precio y capacidad creciente", () => {
    for (let i = 1; i < PLAN_LADDER.length; i++) {
      expect(PLAN_LADDER[i].pricePEN).toBeGreaterThan(PLAN_LADDER[i - 1].pricePEN);
      expect(PLAN_LADDER[i].orderLimit).toBeGreaterThan(PLAN_LADDER[i - 1].orderLimit);
    }
  });
});
