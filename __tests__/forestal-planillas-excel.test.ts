// @vitest-environment node
/**
 * El Excel de cada planilla de campo entra TAL CUAL por el importador de su
 * destino: se genera, se «llena» con la fila de ejemplo y se lee por el mismo
 * camino del navegador (`leerArchivoAFilas` con un File) hasta el parser.
 */
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { columnasAMano, encabezadosExcel, planillaPorId } from "@/lib/forestal/planillas/catalogo";
import { excelDePlanilla, nombreArchivoPlanilla } from "@/lib/forestal/planillas/excel";
import type { PlanillaCampo, PlanillaId } from "@/lib/forestal/planillas/tipos";
import { leerArchivoAFilas } from "@/lib/forestal/cubicacion-import-file";
import { parsearFilasImportadas } from "@/lib/forestal/cubicacion-import";
import { parsearFilasTrozas } from "@/lib/forestal/cubicacion-trozas-import";
import { cubicarSegun } from "@/lib/forestal/cubicacion-trozas-formula";
import { interpretarProduccion } from "@/lib/forestal/produccion-import";
import { parseCensoFilas } from "@/lib/forestal/loth-censo-import";

const P = (id: PlanillaId): PlanillaCampo => {
  const p = planillaPorId(id);
  if (!p) throw new Error(`falta ${id}`);
  return p;
};

/** Genera el Excel, le escribe la fila de ejemplo como lo haría alguien en Excel (números como número) y lo lee como el navegador. */
async function llenadoYLeido(p: PlanillaCampo) {
  const buf = await excelDePlanilla(p, { negocio: "Negocio de prueba" });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  expect(wb.worksheets.map((w) => w.name)).toEqual(["Planilla", "Cabecera y método"]);
  const ws = wb.worksheets[0]!;
  ws.addRow(
    columnasAMano(p).map((c) => (c.tipo === "entero" || c.tipo === "decimal" ? Number(c.ejemplo) : c.ejemplo)),
  );
  const lleno = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const file = new File([lleno], nombreArchivoPlanilla(p), { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  return leerArchivoAFilas(file);
}

describe("Excel de las planillas → importador de su destino", () => {
  it("la hoja «Planilla» trae SÓLO los encabezados (ni filas vacías ni ejemplo)", async () => {
    const p = P("parte-produccion");
    const filas = await leerArchivoAFilas(new File([await excelDePlanilla(p)], "x.xlsx"));
    expect(filas).toEqual([encabezadosExcel(p)]);
  });

  it("aserrada → parsearFilasImportadas (Cubicador de madera): 66,67 pt", async () => {
    const r = parsearFilasImportadas(await llenadoYLeido(P("aserrada-pt")));
    expect(r.errores).toEqual([]);
    expect(r.piezas).toHaveLength(1);
    expect(r.piezas[0]).toMatchObject({ cantidad: 5, especie: "Tornillo" });
    expect(r.piezas[0]!.pieTablar).toBeCloseTo(66.67, 2);
  });

  it("Smalian → parsearFilasTrozas (Cubicador de trozas): 0,4965 m³", async () => {
    const r = parsearFilasTrozas(await llenadoYLeido(P("rolliza-smalian")));
    expect(r.errores).toEqual([]);
    expect(r.trozas).toHaveLength(1);
    expect(r.trozas[0]).toMatchObject({ d1: 40, d2: 45, largo: 3.5 });
    expect(r.trozas[0]!.m3).toBeCloseTo(0.4965, 4);
  });

  it("Oxapampina → parsearFilasTrozas lee pulgadas/pies tal cual y el lote recubica: ≈ 180 pt", async () => {
    const r = parsearFilasTrozas(await llenadoYLeido(P("rolliza-oxapampa")));
    expect(r.errores).toEqual([]);
    const t = r.trozas[0]!;
    expect(t).toMatchObject({ d1: 20, d2: 22, largo: 10 });
    expect(cubicarSegun("oxapampina", t.d1, t.largo, t.d2)).toBeCloseTo(180, 0);
  });

  it("parte de producción → interpretarProduccion (con el encabezado en la fila 1)", async () => {
    const filas = (await llenadoYLeido(P("parte-produccion"))).map((f) => f.map((v) => (v == null ? "" : String(v))));
    const r = interpretarProduccion(filas, { fechaPorDefecto: "2026-10-17" });
    expect(r.errores).toEqual([]);
    expect(r.avisos.join(" ")).not.toContain("no trae encabezados");
    expect(r.corridas[0]).toMatchObject({ productType: "Tabla", presentacion: "PIEZAS", especie: "Tornillo", cantidad: 2.35, unit: "m3", codigoRaiz: "T-0412" });
  });

  it("censo → parseCensoFilas (LothCensoImportModal): cada columna en su campo", async () => {
    const r = parseCensoFilas(await llenadoYLeido(P("censo-arboles")));
    expect(r.conEncabezado).toBe(true);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0]).toMatchObject({ treeCode: "A-001", speciesCommon: "Shihuahuaco", dapM: 0.85, alturaComercialM: 18, utmX: 512345, utmY: 8956789 });
    expect(r.filas[0]!.errores).toEqual([]);
  });
});
