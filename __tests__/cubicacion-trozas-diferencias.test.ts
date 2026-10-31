import { describe, expect, it } from "vitest";
import {
  cambiosPorTroza, diferenciasTrozasPor, lecturaDiferenciasTrozas, medidaDeTroza, mismaFormula,
  parejaPorDefectoTrozas, textoVolumen, totalesTrozasComparados,
} from "@/lib/forestal/cubicacion-trozas-diferencias";
import type { TrozaCongelada } from "@/lib/forestal/cubicacion-cuenta";

const t = (n: number, codigo: string | undefined, especie: string, d1: number, largo: number, volumen: number, d2 = d1): TrozaCongelada => ({
  n, ...(codigo ? { codigo } : {}), especie, d1, d2, largo, volumen,
});

const monte = [t(1, "T-1", "Cedro", 30, 5, 0.353), t(2, "T-2", "Cedro", 50, 5, 0.982), t(3, "T-3", "Tornillo", 20, 4, 0.126)];
const patio = [t(1, "T-1", "Cedro", 30, 5, 0.353), t(2, "T-2", "Cedro", 48, 4.8, 0.868), t(4, "T-4", "Tornillo", 22, 4, 0.152)];

describe("diferenciasTrozasPor", () => {
  it("por especie: Δ B − A y total", () => {
    const d = diferenciasTrozasPor(monte, patio, "smalian", "especie");
    const cedro = d.filas.find((f) => f.label === "Cedro");
    expect(cedro).toMatchObject({ trozasA: 2, trozasB: 2, deltaTrozas: 0, soloEn: null });
    expect(cedro?.deltaVol).toBeCloseTo(-0.114, 4);
    expect(d.total.deltaVol).toBeCloseTo(0.868 + 0.353 + 0.152 - (0.353 + 0.982 + 0.126), 4);
    expect(d.total.label).toBe("TOTAL");
  });

  it("un grupo que sólo está en una sale con 0 del otro lado", () => {
    const d = diferenciasTrozasPor(monte, patio, "smalian", "largo");
    expect(d.filas.map((f) => f.clave)).toEqual(["4", "4.8", "5"]);
    expect(d.filas.find((f) => f.clave === "4.8")?.soloEn).toBe("B");
    expect(d.filas.find((f) => f.clave === "5")?.deltaTrozas).toBe(-1);
  });

  it("tipo sale Delgada → Gruesa", () => {
    const d = diferenciasTrozasPor(monte, patio, "smalian", "tipo");
    expect(d.filas.map((f) => f.label)).toEqual(["Delgada", "Media", "Gruesa"].filter((l) => d.filas.some((f) => f.label === l)));
  });

  it("Oxapampina compara PT, no m³", () => {
    const a = [t(1, "X", "Cedro", 20, 16, 40)];
    const b = [t(1, "X", "Cedro", 20, 16, 45.5)];
    const d = diferenciasTrozasPor(a, b, "oxapampina", "especie");
    expect(d.total).toMatchObject({ volA: 40, volB: 45.5, deltaVol: 5.5 });
  });
});

describe("cambiosPorTroza", () => {
  it("empareja por código y dice qué cambió", () => {
    const c = cambiosPorTroza(monte, patio, "smalian");
    expect(c).not.toBeNull();
    expect(c?.enComun).toBe(2);
    expect(c?.iguales).toBe(1);
    const t2 = c?.cambios.find((x) => x.codigo === "T-2");
    expect(t2?.tipo).toBe("cambiada");
    expect(t2?.detalle.map((x) => x.replace(",", "."))).toEqual(["Ø menor 50 → 48 cm", "Ø mayor 50 → 48 cm", "largo 5 → 4.8 m"]);
    expect(t2?.deltaVol).toBeCloseTo(-0.114, 4);
    expect(c?.cambios.find((x) => x.codigo === "T-3")?.tipo).toBe("soloA");
    expect(c?.cambios.find((x) => x.codigo === "T-4")?.tipo).toBe("soloB");
  });

  it("sin códigos en común no inventa pareja", () => {
    expect(cambiosPorTroza([t(1, undefined, "Cedro", 30, 5, 0.3)], [t(1, undefined, "Cedro", 30, 5, 0.3)], "smalian")).toBeNull();
    expect(cambiosPorTroza(monte, [t(1, "Z-9", "Cedro", 30, 5, 0.3)], "smalian")).toBeNull();
  });

  it("el código no distingue mayúsculas ni espacios", () => {
    const c = cambiosPorTroza([t(1, " t-1 ", "Cedro", 30, 5, 0.353)], [t(1, "T-1", "Cedro", 30, 5, 0.353)], "smalian");
    expect(c).toMatchObject({ enComun: 1, iguales: 1, cambios: [] });
  });
});

describe("totales y lecturas", () => {
  it("el monto sale null si una no se valorizó", () => {
    const a = { nTrozas: 3, volumen: 1.461, monto: 100 };
    const b = { nTrozas: 3, volumen: 1.373, monto: null };
    expect(totalesTrozasComparados(a, b, "smalian")).toMatchObject({ deltaTrozas: 0, deltaVol: -0.088, montoB: null, deltaMonto: null });
    expect(totalesTrozasComparados(a, { ...b, monto: 90 }, "smalian").deltaMonto).toBe(-10);
  });

  it("m³ con 3 decimales y PT con 2", () => {
    expect(textoVolumen(1.5, "smalian")).toMatch(/^1[.,]500 m³$/);
    expect(textoVolumen(2140.5, "oxapampina")).toMatch(/PT$/);
  });

  it("la medida lleva su unidad", () => {
    expect(medidaDeTroza({ d1: 40, d2: 42, largo: 5 }, "smalian")).toBe("Ø 40/42 cm × 5 m");
    expect(medidaDeTroza({ d1: 20, d2: 20, largo: 16 }, "oxapampina")).toBe("Ø 20″ × 16 pies");
  });

  it("la lectura en criollo nombra el grupo que más se movió", () => {
    const d = diferenciasTrozasPor(monte, patio, "smalian", "especie");
    expect(lecturaDiferenciasTrozas(d, "Monte", "Patio", "smalian")).toMatch(/«Patio» tiene .* m³ (más|menos) que «Monte».*lo que más se movió: Cedro/);
    const igual = diferenciasTrozasPor(monte, monte, "smalian", "especie");
    expect(lecturaDiferenciasTrozas(igual, "A", "B", "smalian")).toMatch(/mismas trozas/);
  });
});

describe("mismaFormula / parejaPorDefectoTrozas", () => {
  const c = (id: string, formula: string, fecha: string, gtf: string | null, persona: string | null) =>
    ({ id, formula, fecha, gtfNumber: gtf, personaNombre: persona });
  it("no mezcla fórmulas ni la tablar", () => {
    expect(mismaFormula({ formula: "smalian" }, { formula: "oxapampina" })).toBe(false);
    expect(mismaFormula({ formula: "tablar" }, { formula: "tablar" })).toBe(false);
    expect(mismaFormula({ formula: "smalian" }, { formula: "smalian" })).toBe(true);
  });
  it("prefiere la de la misma guía, luego la misma persona, luego la más reciente", () => {
    const a = c("a", "smalian", "2026-10-01", "G-1", "Wasaco");
    const lista = [a, c("b", "smalian", "2026-10-20", null, null), c("c", "smalian", "2026-10-05", "G-1", null), c("d", "oxapampina", "2026-10-22", "G-1", null), c("e", "smalian", "2026-10-10", null, "wasaco")];
    expect(parejaPorDefectoTrozas(lista, a)?.id).toBe("c");
    expect(parejaPorDefectoTrozas(lista.filter((x) => x.id !== "c"), a)?.id).toBe("e");
    expect(parejaPorDefectoTrozas(lista.filter((x) => !["c", "e"].includes(x.id)), a)?.id).toBe("b");
    expect(parejaPorDefectoTrozas([a, lista[3]!], a)).toBeNull();
  });
});
