/**
 * loth-chequeo-arboles — árboles, bloques y razones del plan del chequeo
 * avanzado del Libro TH (26-10). Puro, sin DB.
 */
import { describe, it, expect } from "vitest";
import { excesosDeBloques, m3, razonesDelPlan, taladosBajoDmc, taladosSinCenso, taladosSinCoordenadas } from "@/lib/forestal/loth-chequeo-arboles";
import type { LineaChequeo } from "@/lib/forestal/loth-chequeo-tipos";
import type { ExcesoDeBloque } from "@/lib/forestal/loth-plan-bloques-saldo";

const tala = (treeCode: string, o: Partial<LineaChequeo> = {}): LineaChequeo => ({
  section: "tala",
  lineNo: 1,
  fecha: "2026-10-05",
  planId: "p1",
  treeCode,
  trozaCode: null,
  gtfNumber: null,
  gps: false,
  ...o,
});
const nombres = new Map([["p1", "PO 12"], ["p2", "PO1"]]);

describe("taladosSinCenso", () => {
  const base = {
    censo: [{ planId: "p1", treeCode: "85-TOR", conCoordenadas: true }],
    planesConCenso: new Set(["p1"]),
    plantaciones: new Set<string>(),
    nombres,
  };
  it("el árbol fuera del censo de su plan, una vez aunque tenga varias líneas", () => {
    const r = taladosSinCenso({ ...base, talas: [tala("85-tor"), tala("977", { lineNo: 38 }), tala("977", { lineNo: 39 })] });
    expect(r).toEqual(["Árbol 977 (PO 12, tala #38 del lunes 05/10): no está en el censo"]);
  });
  it("plan sin censo cargado o plantación: no se juzga", () => {
    expect(taladosSinCenso({ ...base, talas: [tala("1", { planId: "p2" })] })).toEqual([]);
    expect(taladosSinCenso({ ...base, plantaciones: new Set(["p1"]), talas: [tala("977")] })).toEqual([]);
  });
  it("el mismo código en el censo de OTRO plan no lo salva", () => {
    const r = taladosSinCenso({ ...base, planesConCenso: new Set(["p1", "p2"]), talas: [tala("85-TOR", { planId: "p2" })] });
    expect(r).toHaveLength(1);
  });
});

describe("taladosSinCoordenadas", () => {
  const censo = [
    { planId: "p1", treeCode: "A", conCoordenadas: false },
    { planId: "p1", treeCode: "B", conCoordenadas: false },
    { planId: "p1", treeCode: "C", conCoordenadas: true },
  ];
  it("sin UTM en el censo ni GPS en la tala; los de fuera del censo no se cuentan acá", () => {
    const r = taladosSinCoordenadas({
      talas: [tala("A"), tala("B", { gps: true }), tala("C"), tala("Z")],
      censo,
      planesConCenso: new Set(["p1"]),
      plantaciones: new Set(),
      nombres,
    });
    expect(r).toEqual(["Árbol A (PO 12): sin UTM en el censo ni GPS en la tala"]);
  });
});

describe("taladosBajoDmc", () => {
  it("salta los que traen la justificación escrita", () => {
    const bajo = [
      { planId: "p1", treeCode: "A", especie: "Tornillo", dapCm: 38.5, dmcCm: 41 },
      { planId: "p1", treeCode: "B", especie: "Tornillo", dapCm: 30, dmcCm: 41 },
    ];
    const r = taladosBajoDmc([tala("B", { justificadaDmc: true })], bajo, nombres);
    expect(r).toEqual(["Árbol A (Tornillo, PO 12): DAP 38.5 cm y el DMC es 41 cm, sin justificación"]);
  });
});

describe("excesosDeBloques", () => {
  const e = (o: Partial<ExcesoDeBloque>): ExcesoDeBloque => ({
    bloque: "2",
    clave: "tornillo",
    especie: "Tornillo",
    autorizadoM3: 30,
    usadoM3: 31.25,
    pendienteM3: 0,
    pasaPorM3: 1.25,
    enElReparto: true,
    excedeHoy: true,
    preliminarIds: [],
    ...o,
  });
  it("hoy = lo registrado ya lo pasa; si no, lo que pasaría con las preliminares", () => {
    const r = excesosDeBloques([{ plan: "PO 12", excesos: [e({}), e({ bloque: "Bloque 3", usadoM3: 20, pendienteM3: 18.5, pasaPorM3: 8.5, excedeHoy: false })] }]);
    expect(r.hoy).toEqual([`Bloque 2 · Tornillo (PO 12): ${m3(31.25)} de ${m3(30)} m³, se pasa por ${m3(1.25)} m³`]);
    expect(r.conPreliminares).toEqual([`Bloque 3 · Tornillo (PO 12): con las preliminares se pasaría por ${m3(8.5)} m³ (autorizado ${m3(30)} m³)`]);
  });
  it("m³ siempre con 3 decimales", () => {
    expect(m3(8.5)).toMatch(/^8[.,]500$/);
  });
});

describe("razonesDelPlan", () => {
  it("reparte por chequeo y deja fuera las «info»", () => {
    const r = razonesDelPlan([
      {
        nombre: "PO 12",
        razones: [
          { clave: "vigencia", nivel: "rojo", texto: "Venció el 01/10: con el plan vencido no se puede talar ni movilizar." },
          { clave: "papeles", nivel: "rojo", texto: "Papel vencido: Informe de ejecución." },
          { clave: "papeles", nivel: "ambar", texto: "Falta 1 papel de 4: Mapa." },
          { clave: "ficha", nivel: "ambar", texto: "Ficha al 63 %: falta su RUC o DNI." },
          { clave: "motosierrista", nivel: "info", texto: "Nadie dice quién taló." },
        ],
      },
      { nombre: "PO1", razones: [{ clave: "estado", nivel: "rojo", texto: "El plan está suspendido." }, { clave: "vigencia", nivel: "ambar", texto: "Vence en 7 días." }] },
    ]);
    expect(r.vencido).toEqual(["PO 12: Venció el 01/10: con el plan vencido no se puede talar ni movilizar", "PO1: El plan está suspendido"]);
    expect(r.porVencer).toEqual(["PO1: Vence en 7 días"]);
    expect(r.papelesVencidos).toEqual(["PO 12: Papel vencido: Informe de ejecución"]);
    expect(r.papelesFaltan).toEqual(["PO 12: Falta 1 papel de 4: Mapa"]);
    expect(r.ficha).toEqual(["PO 12: Ficha al 63 %: falta su RUC o DNI"]);
  });
});
