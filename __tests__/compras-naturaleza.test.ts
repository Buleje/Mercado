import { describe, expect, it } from "vitest";
import { esInventariable, esServicio, naturalezaDe } from "@/lib/compras/naturaleza";
import { calculateSuggestedQty, metaDeReposicion, needsReorder } from "@/lib/types/purchases";

/**
 * C01/O07/C25 (17-10): Comprar trataba al aserrado y al alquiler del cargador
 * frontal de Blas como mercadería — AGOTADO, «Sugerido 30 und», «Stock: 6».
 */

const aserrado = { type: "service", pricingUnit: "m3", unit: "unidad", stock: 0, stockMin: 10, stockMax: null };
const cargador = { type: "service", pricingUnit: "hora", unit: "unidad", stock: 6, stockMin: 10, stockMax: null };
const tablas = { type: "product", pricingUnit: null, unit: "pt", stock: 4, stockMin: 10, stockMax: null };

describe("naturalezaDe", () => {
  it("la mercadería no lleva distintivo y conserva su unidad", () => {
    expect(naturalezaDe(tablas)).toMatchObject({ naturaleza: "inventario", distintivo: null, cobro: null, unidad: "pt" });
    expect(naturalezaDe({ type: null, unit: "" }).unidad).toBe("und");
  });

  it("un servicio por hora o por día es alquiler y se pide por esa unidad", () => {
    expect(naturalezaDe(cargador)).toMatchObject({ naturaleza: "alquiler", distintivo: "Alquiler", cobro: "Se alquila por hora", unidad: "hora", unidadPlural: "horas" });
    expect(naturalezaDe({ type: "service", pricingUnit: "dia" }).unidad).toBe("día");
  });

  it("un servicio por cantidad se contrata por su unidad; el de precio fijo, por servicio", () => {
    expect(naturalezaDe(aserrado)).toMatchObject({ naturaleza: "servicio", cobro: "Se contrata por m³", unidad: "m³" });
    expect(naturalezaDe({ type: "service", pricingUnit: "fijo" })).toMatchObject({ cobro: "Se contrata cuando hace falta", unidad: "servicio" });
  });

  it("vacío o desconocido es mercadería, como en la base", () => {
    expect(esServicio({ type: undefined })).toBe(false);
    expect(esServicio({ type: " Service " })).toBe(true);
    expect(esInventariable({ type: "product" })).toBe(true);
  });
});

describe("reglas de stock de Comprar con servicios", () => {
  it("un servicio nunca sale «a reponer», aunque su stock esté bajo el mínimo", () => {
    expect(needsReorder(aserrado)).toBe(false);
    expect(needsReorder(cargador)).toBe(false);
    expect(needsReorder(tablas)).toBe(true);
  });

  it("a un servicio se le sugiere 1, no rellenar hasta una meta de stock", () => {
    expect(calculateSuggestedQty(aserrado)).toBe(1);
    expect(calculateSuggestedQty(tablas)).toBe(26); // meta 3 × 10 = 30 − 4
  });

  it("la meta dice de dónde sale", () => {
    expect(metaDeReposicion({ stockMin: 10, stockMax: 50 })).toEqual({ meta: 50, origen: "maximo", minimo: 10 });
    expect(metaDeReposicion({ stockMin: 10, stockMax: null })).toEqual({ meta: 30, origen: "triple-del-minimo", minimo: 10 });
    expect(metaDeReposicion({ stockMin: null, stockMax: null })).toEqual({ meta: 10, origen: "fija", minimo: 0 });
    // Sin mínimo propio manda el del negocio.
    expect(metaDeReposicion({ stockMin: null, stockMax: null }, 4)).toEqual({ meta: 12, origen: "triple-del-minimo", minimo: 4 });
  });
});
