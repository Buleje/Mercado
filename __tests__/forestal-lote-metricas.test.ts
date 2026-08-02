import { describe, expect, it } from "vitest";
import { avanceDeLote, enPieTablar, resumenLotes } from "@/lib/forestal/lote-metricas";

const lote = (over: Partial<Parameters<typeof avanceDeLote>[0]> = {}) => ({
  unit: "m3",
  totalCantidad: 10,
  despachado: 0,
  disponible: 10,
  status: "abierto",
  ...over,
});

describe("enPieTablar", () => {
  it("usa la constante del cubicador, no un 424 redondeado", () => {
    // 1 m³ = 423.78 pt. Con 424 daría 424.0 y el PDF del cubicador diría otra cosa.
    expect(enPieTablar(1)).toBe(423.8); // r1 sobre 423.78
    expect(enPieTablar(10)).toBe(4237.8);
  });

  it("un valor no finito da 0, no NaN en pantalla", () => {
    expect(enPieTablar(Number.NaN)).toBe(0);
    expect(enPieTablar(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("resumenLotes", () => {
  it("suma armado, despachado y disponible de los lotes en m³", () => {
    const r = resumenLotes([
      lote({ totalCantidad: 10, despachado: 4, disponible: 6 }),
      lote({ totalCantidad: 5, despachado: 5, disponible: 0 }),
    ]);
    expect(r.armadoM3).toBe(15);
    expect(r.despachadoM3).toBe(9);
    expect(r.disponibleM3).toBe(6);
    expect(r.lotesEnM3).toBe(2);
  });

  it("NO suma lotes de otra unidad: un total sin unidad parece exacto y no lo es", () => {
    const r = resumenLotes([
      lote({ totalCantidad: 10, despachado: 0, disponible: 10 }),
      lote({ unit: "kg", totalCantidad: 800, despachado: 0, disponible: 800 }),
    ]);
    expect(r.armadoM3).toBe(10);
    expect(r.lotesEnM3).toBe(1);
    expect(r.lotesOtraUnidad).toBe(1);
  });

  it("el lote anulado no cuenta: dejó de existir como acuerdo", () => {
    const r = resumenLotes([
      lote({ totalCantidad: 10, despachado: 0, disponible: 10 }),
      lote({ totalCantidad: 99, despachado: 0, disponible: 99, status: "anulado" }),
    ]);
    expect(r.armadoM3).toBe(10);
    expect(r.lotesEnM3).toBe(1);
  });

  it("el avance es null sin nada armado, no 0% (que afirmaría que no salió nada)", () => {
    expect(resumenLotes([]).avancePct).toBeNull();
    expect(resumenLotes([lote({ totalCantidad: 0, disponible: 0 })]).avancePct).toBeNull();
  });

  it("convierte el total a pie tablar una sola vez, sobre el m³ ya sumado", () => {
    const r = resumenLotes([
      lote({ totalCantidad: 1, despachado: 0, disponible: 1 }),
      lote({ totalCantidad: 1, despachado: 0, disponible: 1 }),
    ]);
    // Sumar y convertir, no convertir y sumar: 2 × 423.78 = 847.56 → 847.6
    expect(r.armadoPt).toBe(847.6);
  });
});

describe("avanceDeLote", () => {
  it("distingue 'sin armar' de 'nada despachado'", () => {
    expect(avanceDeLote(lote({ totalCantidad: 0, disponible: 0 })).sinArmar).toBe(true);
    expect(avanceDeLote(lote({ totalCantidad: 10, despachado: 0 })).sinArmar).toBe(false);
  });

  it("marca completo recién al salir todo", () => {
    expect(avanceDeLote(lote({ totalCantidad: 10, despachado: 9.9 })).completo).toBe(false);
    expect(avanceDeLote(lote({ totalCantidad: 10, despachado: 10 })).completo).toBe(true);
  });

  it("un despacho mayor que lo armado no pinta una barra rota", () => {
    const a = avanceDeLote(lote({ totalCantidad: 10, despachado: 14 }));
    expect(a.pct).toBe(100);
  });
});
