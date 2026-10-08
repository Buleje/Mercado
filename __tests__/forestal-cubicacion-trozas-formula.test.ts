/**
 * Cubicador de trozas en dos fórmulas (Brandon 2026-10-08): Smalian (m³) y
 * Oxapampina (PT = Ø × Ø × L ÷ 24,5, ADR-440), un lote por fórmula, un Ø o dos.
 */
import { describe, expect, it } from "vitest";
import { ptOxapampa, ptOxapampaDelCubicador } from "@/lib/forestal/cubicacion-oxapampa";
import { cubicarTroza, partirEnTrozas } from "@/lib/forestal/cubicacion-trozas";
import {
  claveLoteTrozas, conVolumen, cubicarSegun, diametroUnico, medidasEnVoz, partirEnMedidas, patioACsv,
  resumenDelPatio, tipoDeTrozaSegun, totalesSegun,
} from "@/lib/forestal/cubicacion-trozas-formula";
import { agruparTrozasPor, resumenTrozasACsv, resumenTrozasPorEspecie } from "@/lib/forestal/cubicacion-trozas-resumen";

const ox = (id: string, d1: number, largo: number, d2?: number, especie?: string) =>
  conVolumen("oxapampina", { id, d1, d2: d2 ?? d1, largo, especie });

describe("PT Oxapampina del cubicador", () => {
  it("20″ × 12′ = 195.92 PT", () => {
    expect(ptOxapampaDelCubicador(20, 12)).toBe(195.92);
    expect(cubicarSegun("oxapampina", 20, 12)).toBe(195.92);
  });
  it("18″ y 22″ → Ø 20″ → 195.92 PT (igual que la regla del pago con las dos puntas)", () => {
    expect(ptOxapampaDelCubicador(18, 12, 22)).toBe(195.92);
    expect(ptOxapampa({ d1Pulg: 18, d2Pulg: 22, largoPies: 12 })).toBe(195.92);
  });
  it("mismo redondeo que ADR-440: cada medida a 2 decimales antes de la fórmula", () => {
    expect(ptOxapampaDelCubicador(20.004, 12.001)).toBe(195.92);
  });
  it("sin segunda punta (o en cero) la troza va pareja; sin Ø o sin largo no hay PT", () => {
    expect(ptOxapampaDelCubicador(20, 12, 0)).toBe(195.92);
    expect(ptOxapampaDelCubicador(0, 12)).toBeNull();
    expect(ptOxapampaDelCubicador(20, 0)).toBeNull();
    expect(cubicarSegun("oxapampina", 20, 0)).toBe(0);
  });
  it("la regla del pago sigue exigiendo las dos puntas", () => {
    expect(ptOxapampa({ d1Pulg: 20, largoPies: 12 })).toBeNull();
  });
});

describe("un lote por fórmula", () => {
  it("Oxapampina guarda PT y deja el m³ en 0; Smalian no arrastra un PT", () => {
    const f = ox("a", 20, 12);
    expect(f.pt).toBe(195.92);
    expect(f.m3).toBe(0);
    const s = conVolumen("smalian", { ...f, d1: 40, d2: 45, largo: 3.5 });
    expect(s.m3).toBe(cubicarTroza(40, 3.5, 45));
    expect("pt" in s).toBe(false);
  });
  it("la clave Smalian es la de siempre (la leen el reparto y el rendimiento); la Oxapampina es otra", () => {
    expect(claveLoteTrozas("main", "smalian")).toBe("buleje-cubicacion-trozas-main");
    expect(claveLoteTrozas("main", "oxapampina")).not.toBe(claveLoteTrozas("main", "smalian"));
  });
  it("20″ es Gruesa: no se clasifica como si fueran 20 cm", () => {
    expect(tipoDeTrozaSegun({ d1: 20 }, "oxapampina")).toBe("Gruesa");
    expect(tipoDeTrozaSegun({ d1: 20 }, "smalian")).toBe("Delgada");
    expect(tipoDeTrozaSegun({ d1: 12 }, "oxapampina")).toBe("Media");
  });
});

describe("dictado: pares con un Ø, tríos con dos", () => {
  it("pares «Ø largo» → troza pareja, con sobrante", () => {
    const { trozas, resto } = partirEnMedidas([20, 12, 18, 10, 22], 1, "oxapampina");
    expect(trozas).toEqual([
      { d1: 20, d2: 20, largo: 12, sospechosa: false },
      { d1: 18, d2: 18, largo: 10, sospechosa: false },
    ]);
    expect(resto).toEqual([22]);
  });
  it("tríos «Ø Ø largo» en Oxapampina", () => {
    const { trozas } = partirEnMedidas([18, 22, 12], 2, "oxapampina");
    expect(trozas[0]).toMatchObject({ d1: 18, d2: 22, largo: 12 });
    expect(cubicarSegun("oxapampina", trozas[0].d1, trozas[0].largo, trozas[0].d2)).toBe(195.92);
  });
  it("Smalian con dos Ø es exactamente lo de antes", () => {
    const nums = [40, 45, 3.5, 30, 32, 16, 8, 9, 2, 250, 40, 3, 50];
    expect(partirEnMedidas(nums, 2, "smalian")).toEqual(partirEnTrozas(nums));
  });
  it("medidas raras en pulgadas y pies: Ø < 4″ o largo > 49 pies", () => {
    const { trozas } = partirEnMedidas([3, 12, 20, 60, 20, 12], 1, "oxapampina");
    expect(trozas.map((t) => t.sospechosa)).toEqual([true, true, false]);
  });
  it("lo que se dice al confirmar o leer", () => {
    expect(medidasEnVoz({ d1: 20, d2: 20, largo: 12 }, 1)).toBe("20, 12");
    expect(medidasEnVoz({ d1: 18, d2: 22, largo: 12 }, 2)).toBe("18, 22, 12");
    expect(diametroUnico({ d1: 18, d2: 22 })).toBe(20);
  });
});

describe("totales, resúmenes y CSV en PT", () => {
  const lote = [ox("a", 20, 12, undefined, "Tornillo"), ox("b", 18, 12, 22, "Tornillo"), ox("c", 10, 10, undefined, "Cedro")];
  it("totales y resumen del patio en PT", () => {
    expect(totalesSegun(lote, "oxapampina")).toEqual({ trozas: 3, volumen: 432.66 });
    const r = resumenDelPatio(lote, "oxapampina");
    expect(r.dominante?.[0]).toBe("Tornillo");
    expect(r.especies[0][1]).toBeCloseTo(391.84, 2);
  });
  it("agrupado por especie sin m³, % sobre el PT", () => {
    const g = agruparTrozasPor(lote, "especie", "oxapampina");
    expect(g.total).toEqual({ trozas: 3, m3: 0, pt: 432.66 });
    const tornillo = g.grupos.find((x) => x.label === "Tornillo");
    expect(tornillo).toMatchObject({ trozas: 2, m3: 0, pt: 391.84, pctM3: 90.6 });
    expect(agruparTrozasPor(lote, "largo", "oxapampina").grupos.map((x) => x.label)).toEqual(["10.0 pies", "12.0 pies"]);
    expect(resumenTrozasPorEspecie(lote, "oxapampina")[0].especie).toBe("Tornillo");
  });
  it("CSV del resumen y del patio en PT", () => {
    const csv = resumenTrozasACsv(agruparTrozasPor(lote, "especie", "oxapampina"), "especie", "oxapampina");
    expect(csv.split("\n")[0]).toBe("﻿especie,Trozas,PT,%PT");
    expect(csv.split("\n").at(-1)).toBe("TOTAL,3,432.66,100.0");
    const patio = patioACsv(lote, "oxapampina", 1).split("\n");
    expect(patio[0]).toBe("﻿Dpulg,LargoPies,Especie,PT");
    expect(patio[2]).toBe("20,12,Tornillo,195.92");
    expect(patio.at(-1)).toBe("TOTAL,,,432.66");
  });
  it("el CSV Smalian con dos Ø sigue igual", () => {
    const s = [conVolumen("smalian", { id: "x", d1: 40, d2: 45, largo: 3.5, especie: "Cedro" })];
    const csv = patioACsv(s, "smalian", 2).split("\n");
    expect(csv[0]).toBe("﻿D1cm,D2cm,LargoM,Especie,m3");
    expect(csv[1]).toBe(`40,45,3.5,Cedro,${s[0].m3}`);
    expect(csv[2]).toBe(`TOTAL,,,,${s[0].m3.toFixed(4)}`);
  });
});
