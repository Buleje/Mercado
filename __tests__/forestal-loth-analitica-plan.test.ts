/**
 * Con 2 planes y la MISMA especie, cada línea cuenta en UN solo plan: los
 * despachos que viajan con `planId: null` siguen a SU troza (misma atribución
 * que «Extracción»), y lo que no se puede atribuir no entra en ninguno.
 */
import { describe, expect, it } from "vitest";
import { lineasDelPlan } from "@/lib/forestal/loth-analitica-plan";
import type { ArbolDeExtraccion, LineaDeExtraccion } from "@/lib/forestal/loth-extraccion";

const arbol = (id: string, planId: string, treeCode: string): ArbolDeExtraccion => ({
  id, planId, treeCode, speciesCommon: "Tornillo", cites: false, dapM: 0.8, volumenEstimadoM3: 5, estado: "en_pie", condicion: null,
});
let n = 0;
const linea = (section: string, o: Partial<LineaDeExtraccion>): LineaDeExtraccion => ({
  id: `l${++n}`, planId: null, section, status: "registrado", lineNo: n, entryDate: "2026-09-01",
  treeCode: null, trozaCode: null, speciesCommon: "Tornillo", cites: false, volumeM3: 2, quantity: null, unit: null, gtfNumber: null, ...o,
});

describe("lineasDelPlan", () => {
  const planes = ["A", "B"];
  const arboles = [arbol("a1", "A", "1-TOR"), arbol("b1", "B", "2-TOR")];
  const talaA = linea("tala", { planId: "A", treeCode: "1-TOR" });
  const trozA = linea("trozado", { planId: "A", treeCode: "1-TOR", trozaCode: "1-TOR-1" });
  const despA = linea("despacho_troza", { planId: null, trozaCode: "1-TOR-1" });
  const talaB = linea("tala", { planId: "B", treeCode: "2-TOR" });
  const trozB = linea("trozado", { planId: "B", treeCode: "2-TOR", trozaCode: "2-TOR-1" });
  const despB = linea("despacho_troza", { planId: null, trozaCode: "2-TOR-1" });
  const huerfano = linea("despacho_troza", { planId: null, trozaCode: "99-XXX-1" });
  const lineas = [talaA, trozA, despA, talaB, trozB, despB, huerfano];

  it("cada despacho sin plan cae en el plan de SU troza y en ningún otro", () => {
    const a = lineasDelPlan(planes, "A", arboles, lineas);
    const b = lineasDelPlan(planes, "B", arboles, lineas);
    expect([...a.ids].sort()).toEqual([talaA.id, trozA.id, despA.id].sort());
    expect([...b.ids].sort()).toEqual([talaB.id, trozB.id, despB.id].sort());
    expect([...a.ids].filter((i) => b.ids.has(i))).toEqual([]);
  });

  it("lo que no se puede atribuir queda sin plan y se cuenta", () => {
    const a = lineasDelPlan(planes, "A", arboles, lineas);
    expect(a.ids.has(huerfano.id)).toBe(false);
    expect(a.sinPlan.lineas).toBe(1);
  });

  it("una sección fuera de la cadena sólo cuenta en el plan que dice tener", () => {
    const pt = linea("producto_terminado", { planId: "B" });
    const sin = linea("producto_terminado", { planId: null });
    expect(lineasDelPlan(planes, "B", arboles, [pt, sin]).ids.has(pt.id)).toBe(true);
    expect(lineasDelPlan(planes, "A", arboles, [pt, sin]).ids.size).toBe(0);
    expect(lineasDelPlan(planes, "B", arboles, [pt, sin]).ids.has(sin.id)).toBe(false);
  });
});
