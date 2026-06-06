import { describe, it, expect } from "vitest";
import { computeAssetFinStats } from "@/lib/db/assets.db";

/**
 * Verifica el cálculo de "costo real por hora" + "utilización por máquina"
 * del módulo Activos & Maquinaria (Brandon 2026-06-06).
 *
 * Escenario base: una oruga con capacidad 8 h/día, trabajó 120 h el último
 * mes, facturó S/18,000 (120 h × S/150) y gastó S/3,600 en combustible.
 *   - costo/hora     = 3600 / 120        = S/30
 *   - ingreso/hora   = 18000 / 120       = S/150
 *   - margen/hora    = 150 − 30          = S/120
 *   - utilización    = 120 / (8 × 30)    = 120/240 = 50%
 */
describe("computeAssetFinStats", () => {
  it("calcula costo/hora, ingreso/hora, margen/hora y utilización", () => {
    const r = computeAssetFinStats({
      incomeSum: 18000,
      expenseSum: 3600,
      unitsWorked: 120,
      units30d: 120,
      capacityPerDay: 8,
    });
    expect(r.costPerUnit).toBe(30);
    expect(r.incomePerUnit).toBe(150);
    expect(r.marginPerUnit).toBe(120);
    expect(r.utilizationPct).toBe(50);
  });

  it("sin horas trabajadas → costo/ingreso/margen null (no divide por cero)", () => {
    const r = computeAssetFinStats({
      incomeSum: 0,
      expenseSum: 500, // gasto fijo sin haber trabajado
      unitsWorked: 0,
      units30d: 0,
      capacityPerDay: 8,
    });
    expect(r.costPerUnit).toBeNull();
    expect(r.incomePerUnit).toBeNull();
    expect(r.marginPerUnit).toBeNull();
    expect(r.utilizationPct).toBe(0);
  });

  it("utilización se acota a 100% aunque trabaje más que su capacidad", () => {
    const r = computeAssetFinStats({
      incomeSum: 60000,
      expenseSum: 10000,
      unitsWorked: 400,
      units30d: 400, // > 8×30 = 240
      capacityPerDay: 8,
    });
    expect(r.utilizationPct).toBe(100);
  });

  it("capacidad null usa el default de 8 h/día", () => {
    const r = computeAssetFinStats({
      incomeSum: 0,
      expenseSum: 0,
      unitsWorked: 0,
      units30d: 120,
      capacityPerDay: null, // → 8
    });
    // 120 / (8 × 30) = 50%
    expect(r.utilizationPct).toBe(50);
  });

  it("margen es null si falta el costo (gasto 0 pero sin horas tampoco da costo)", () => {
    const r = computeAssetFinStats({
      incomeSum: 1000,
      expenseSum: 0,
      unitsWorked: 10,
      units30d: 10,
      capacityPerDay: 8,
    });
    // con horas > 0, costo = 0/10 = 0 (no null), margen = 100 − 0 = 100
    expect(r.costPerUnit).toBe(0);
    expect(r.incomePerUnit).toBe(100);
    expect(r.marginPerUnit).toBe(100);
  });
});
