import { describe, expect, it } from "vitest";
import { parseImportLineas } from "@/lib/forestal/loth-import-lineas";
import {
  filasQueFrenan,
  planPorDefecto,
  reetiquetarErroresImport,
  revisarContraPlan,
  rotuloPlanImport,
  type PlanImportOpcion,
  type PlanParaImportar,
} from "@/lib/forestal/loth-import-plan";

const plantacion: PlanParaImportar = {
  id: "p1",
  esPlantacion: true,
  rotulo: "Plantación QA-459-IMPORT — QA",
  especies: [{ speciesCommon: "Bolaina (Guazuma crinita)", speciesScientific: "Guazuma crinita", volumenAutorizadoM3: 10, taladoM3: 2 }],
};
const bosque: PlanParaImportar = {
  id: "p2",
  esPlantacion: false,
  rotulo: "PO 12",
  especies: [{ speciesCommon: "Tornillo", volumenAutorizadoM3: 100, taladoM3: 0 }],
};
const CSV = "Cód. árbol,Especie,Fecha,Longitud,Volumen\nA1,Bolaina,01/10/2026,5,4\nA2,Bolaina,01/10/2026,5,5\nA3,Tornillo,01/10/2026,5,3";
const filas = () => parseImportLineas(CSV, "tala").filas;

const opcion = (o: Partial<PlanImportOpcion>): PlanImportOpcion => ({
  id: "x", planType: "PO", planNumber: "PO 12", tituloHabilitante: null, titularName: "Maderera SAC", isActive: false, ...o,
});

describe("rotulo y plan por defecto", () => {
  it("bosque: no repite el tipo; plantación: «Plantación <código>»", () => {
    expect(rotuloPlanImport(opcion({}))).toBe("PO 12 — Maderera SAC");
    expect(rotuloPlanImport(opcion({ planType: "PLANTACION", planNumber: "QA-459" }))).toBe("Plantación QA-459 — Maderera SAC");
    expect(rotuloPlanImport(opcion({ planNumber: "REG-PLT-001" }))).toContain("Plantación REG-PLT-001");
  });
  it("un activo claro > único > ninguno (varios activos no se adivinan)", () => {
    expect(planPorDefecto([opcion({ id: "a" }), opcion({ id: "b", isActive: true })])).toBe("b");
    expect(planPorDefecto([opcion({ id: "a", isActive: true }), opcion({ id: "b", isActive: true })])).toBeNull();
    expect(planPorDefecto([opcion({ id: "a" })])).toBe("a");
    expect(planPorDefecto([opcion({ id: "a" }), opcion({ id: "b" })])).toBeNull();
    expect(planPorDefecto([])).toBeNull();
  });
});

describe("revisarContraPlan", () => {
  it("plantación: la especie fuera del registro se frena (T7) y las del registro bajan el saldo", () => {
    const r = revisarContraPlan(filas(), "tala", plantacion);
    expect(r.avisos.get(3)?.[0]).toMatchObject({ nivel: "freno" });
    expect(r.avisos.get(3)?.[0].texto).toContain("no está en el registro: la tala se frenará (T7)");
    expect(r.frenadas).toBe(1);
    // Bolaina (común) reconoce «Bolaina (Guazuma crinita)» del registro por clave.
    expect(r.avisos.get(1)).toBeUndefined();
    expect(r.saldos).toEqual([
      expect.objectContaining({ species: "Bolaina (Guazuma crinita)", importadoM3: 9, quedariaM3: -1, excede: true }),
    ]);
    // La fila 2 es la que cruza: 2 + 4 = 6 ≤ 10, 2 + 9 = 11 > 10.
    expect(r.avisos.get(2)?.[0].texto).toContain("pasa lo registrado");
  });
  it("lo destildado no cuenta en el saldo ni en los frenos", () => {
    const r = revisarContraPlan(filas(), "tala", plantacion, new Set([2, 3]));
    expect(r.frenadas).toBe(0);
    expect(r.saldos[0]).toMatchObject({ importadoM3: 4, quedariaM3: 4, excede: false });
  });
  it("bosque: especie fuera del plan es aviso, no freno", () => {
    const r = revisarContraPlan(filas(), "tala", bosque);
    expect(r.avisos.get(1)?.[0]).toMatchObject({ nivel: "aviso" });
    expect(r.frenadas).toBe(0);
  });
  it("sin plan o plan sin especies: no acusa nada", () => {
    expect(revisarContraPlan(filas(), "tala", null).avisos.size).toBe(0);
    expect(revisarContraPlan(filas(), "tala", { ...plantacion, especies: [] }).avisos.size).toBe(0);
  });
  it("fuera de Tala no hay saldo", () => {
    expect(revisarContraPlan(filas(), "trozado", plantacion).saldos).toEqual([]);
  });
});

describe("reetiquetarErroresImport", () => {
  it("cambia la posición enviada por la fila del archivo y dice cuál era", () => {
    const enviadas = [filas()[0], filas()[2]]; // se destildó la fila 2
    const out = reetiquetarErroresImport(["Fila 2: La especie Tornillo no está en el registro", "otro"], enviadas);
    expect(out[0]).toBe("Fila 3 (A3 · Tornillo): La especie Tornillo no está en el registro");
    expect(out[1]).toBe("otro");
  });
});

describe("filasQueFrenan — lo que el servidor rechazará arranca sin tildar", () => {
  it("plantación: sólo la fila de especie fuera del registro", () => {
    expect([...filasQueFrenan(filas(), "tala", plantacion)]).toEqual([3]);
  });
  it("bosque, sin plan o en otra sección: ninguna", () => {
    expect(filasQueFrenan(filas(), "tala", bosque).size).toBe(0);
    expect(filasQueFrenan(filas(), "tala", null).size).toBe(0);
    expect(filasQueFrenan(filas(), "despacho_troza", plantacion).size).toBe(0);
  });
});

describe("despacho de producto: la especie del archivo la juzga T7", () => {
  it("fuera del plan → freno (el servidor la rechaza), no sólo aviso", () => {
    const csv = "Producto,Especie,Fecha,Cantidad,Unidad,GTF\nTablas,Cedro,01/10/2026,2,m3,001-1";
    const f = parseImportLineas(csv, "despacho_producto").filas;
    const r = revisarContraPlan(f, "despacho_producto", bosque);
    expect(r.avisos.get(1)?.[0]).toMatchObject({ nivel: "freno" });
  });
});
