import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanBadge } from "@/components/superadmin/_shared/SABadge";
import { recommendUpgrade, PLAN_LADDER, cupoDeUsoDePlan } from "@/lib/superadmin/upgrade-recommendation";
import { precioMensualDePlan, etiquetaDePlan } from "@/lib/billing/plan-tiers";

// Tenant.plan guarda free | pro | business | enterprise = Free 0 · Starter 89 · Pro 179 · Business 349.
describe("recommendUpgrade", () => {
  it("free al límite → Starter (Tenant.plan «pro») con upside +89", () => {
    const r = recommendUpgrade("free", 95)!;
    expect(r.recommendedPlan).toBe("pro");
    expect(r.recommendedLabel).toBe("Starter");
    expect(r.upsidePEN).toBe(89);
    expect(r.newOrderLimit).toBe(1000);
  });

  it("Starter («pro») cerca del límite → Pro («business») con upside +90 (179−89)", () => {
    const r = recommendUpgrade("pro", 950)!;
    expect(r.recommendedPlan).toBe("business");
    expect(r.recommendedLabel).toBe("Pro");
    expect(r.upsidePEN).toBe(90);
  });

  it("salta al plan que deja el consumo cómodo (≤80%)", () => {
    // free con 900 pedidos: Starter (1000) lo deja al 90% → no cómodo; salta a Pro.
    expect(recommendUpgrade("free", 900)!.recommendedLabel).toBe("Pro");
  });

  it("Pro («business») al límite → Business («enterprise», ilimitado), upside +170", () => {
    const r = recommendUpgrade("business", 9500)!;
    expect(r.recommendedPlan).toBe("enterprise");
    expect(r.recommendedLabel).toBe("Business");
    expect(r.upsidePEN).toBe(170);
    expect(r.newOrderLimit).toBeNull();
  });

  it("Business («enterprise», tope) y desconocido → null", () => {
    expect(recommendUpgrade("enterprise", 50000)).toBeNull();
    expect(recommendUpgrade("ninguno", 100)).toBeNull();
  });

  it("alias viejos: basico = Free, starter = Starter", () => {
    expect(recommendUpgrade("basico", 95)?.recommendedLabel).toBe("Starter");
    expect(recommendUpgrade("starter", 950)?.recommendedLabel).toBe("Pro");
  });

  it("precio y nombre salen de la fuente única de planes", () => {
    for (const r of PLAN_LADDER) {
      expect(r.pricePEN).toBe(precioMensualDePlan(r.plan));
      expect(r.label).toBe(etiquetaDePlan(r.plan));
    }
    expect(PLAN_LADDER.map((r) => r.pricePEN)).toEqual([0, 89, 179, 349]);
  });

  it("el ladder está ordenado por precio y capacidad creciente", () => {
    for (let i = 1; i < PLAN_LADDER.length; i++) {
      expect(PLAN_LADDER[i].pricePEN).toBeGreaterThan(PLAN_LADDER[i - 1].pricePEN);
      expect(PLAN_LADDER[i].orderLimit).toBeGreaterThan(PLAN_LADDER[i - 1].orderLimit);
    }
  });

  it("cupo de uso por plan guardado", () => {
    expect(cupoDeUsoDePlan("free")).toBe("free");
    expect(cupoDeUsoDePlan("pro")).toBe("starter");
    expect(cupoDeUsoDePlan("business")).toBe("pro");
    expect(cupoDeUsoDePlan("enterprise")).toBe("enterprise");
    expect(cupoDeUsoDePlan(null)).toBe("free");
  });
});

// Un solo nombre y un solo cupo por plan en todo el superadmin (09-10: la tarjeta
// decía «Business» y la ficha «Enterprise»; la ruta de uso contaba «pro» con 10.000).
describe("una sola escalera de planes en el superadmin", () => {
  it("PlanBadge usa los nombres de la fuente única", () => {
    const html = (plan: "free" | "pro" | "business" | "enterprise") =>
      renderToStaticMarkup(createElement(PlanBadge, { plan }));
    expect(html("enterprise")).toContain(">Business<");
    expect(html("business")).toContain(">Pro<");
    expect(html("pro")).toContain(">Starter<");
    expect(html("enterprise")).not.toContain("Enterprise");
  });

  it.each(["app/api/superadmin/tenants/usage/route.ts", "lib/superadmin/automations.ts"])(
    "%s no define su propio planToTier: usa cupoDeUsoDePlan",
    (archivo) => {
      const fuente = readFileSync(join(process.cwd(), archivo), "utf8");
      expect(fuente).not.toMatch(/function planToTier/);
      expect(fuente).toContain("cupoDeUsoDePlan(");
    },
  );
});
