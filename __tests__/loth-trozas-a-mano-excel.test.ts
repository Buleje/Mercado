/**
 * El formato Excel de la lista de trozas del despacho con guía (16-10): lo que
 * se descarga se vuelve a importar solo, y cada fila pasa la misma revisión
 * que el alta a mano.
 */
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { leerArchivoAFilas } from "@/lib/forestal/cubicacion-import-file";
import { COLUMNAS_FORMATO, trozasDelFormato } from "@/lib/forestal/loth-trozas-a-mano-excel";
import { volumenDeFila } from "@/lib/forestal/loth-trozas-a-mano";

const CATALOGO = { nombres: ["Tornillo", "Shihuahuaco"], cientificoDe: (n: string) => ({ Tornillo: "Cedrelinga cateniformis", Shihuahuaco: "Dipteryx micrantha" })[n] ?? null };
const ENCABEZADO = COLUMNAS_FORMATO.map((c) => c.titulo);

describe("trozasDelFormato", () => {
  it("lee el formato que se descarga y salta las filas que sólo traen fórmulas", () => {
    const r = trozasDelFormato(
      [
        ENCABEZADO,
        ["Cedrelinga cateniformis", "Tornillo", "", 45, 40, 3.2, 1, 0.4546],
        ["", "", "", null, null, null, null, ""],
        ["", "Shihuahuaco", "", "60,5", "55", "4", "2", ""],
      ],
      CATALOGO,
    );
    expect(r.errores).toEqual([]);
    expect(r.trozas).toHaveLength(2);
    expect(r.trozas[0]).toMatchObject({ especie: "Tornillo", d1Cm: 45, d2Cm: 40, largoM: 3.2, cantidad: 1 });
    expect(r.trozas[1]).toMatchObject({ especie: "Shihuahuaco", d1Cm: 60.5, d2Cm: 55, largoM: 4, cantidad: 2 });
    expect(r.cuantas).toBe(3);
  });

  it("con sólo el científico encuentra el común; sin D2 la troza va pareja y marcada", () => {
    const r = trozasDelFormato([ENCABEZADO, ["dipteryx MICRANTHA", "", "", 50, "", 3, "", ""]], CATALOGO);
    expect(r.trozas[0]).toMatchObject({ especie: "Shihuahuaco", d1Cm: 50, d2Cm: 50, d2Supuesto: true, cantidad: 1 });
  });

  it("reconoce los encabezados de la lista SERFOR y arranca la numeración en el primer N°", () => {
    const r = trozasDelFormato(
      [
        ["Lista de trozas"],
        ["N°", "(3) N. científico", "(4) N. común o comercial", "(5) Codificación", "(6) d1", "(7) d2", "(8) L", "(9) Cantidad", "(10) Volumen m³"],
        [1, "", "Tornillo", "12", 45, 40, 3.2, 1, ""],
      ],
      CATALOGO,
    );
    expect(r.sinEncabezado).toBe(false);
    expect(r.desde).toBe(12);
    expect(r.trozas).toHaveLength(1);
  });

  it("la fila que no pasa la revisión se informa con su N° y no entra", () => {
    const r = trozasDelFormato([ENCABEZADO, ["", "Tornillo", "", "", 40, 3, 1, ""], ["", "", "", 45, 40, 3, 1, ""]], CATALOGO);
    expect(r.trozas).toHaveLength(0);
    expect(r.errores[0]).toMatch(/^Fila 2: .*D1/);
    expect(r.errores[1]).toMatch(/^Fila 3: .*especie/i);
  });

  it("el volumen del archivo no manda: si no es el de Smalian, avisa y entra con el de Smalian", () => {
    const r = trozasDelFormato([ENCABEZADO, ["", "Tornillo", "", 45, 40, 3.2, 1, 0.6]], CATALOGO);
    expect(r.trozas).toHaveLength(1);
    expect(volumenDeFila(r.trozas[0]!)).toBeCloseTo(0.4537, 3);
    expect(r.avisos[0]).toMatch(/Fila 2: el archivo dice 0,6 m³/);
  });

  it("no pasa del tope de la guía", () => {
    const r = trozasDelFormato([ENCABEZADO, ["", "Tornillo", "", 45, 40, 3, 3, ""], ["", "Tornillo", "", 45, 40, 3, 1, ""]], { ...CATALOGO, caben: 3 });
    expect(r.cuantas).toBe(3);
    expect(r.errores).toEqual(["1 fila no entra: la guía lleva hasta 150 trozas"]);
  });

  it("sin columnas reconocibles no inventa trozas", () => {
    expect(trozasDelFormato([["a", "b"], [1, 2]], CATALOGO).sinEncabezado).toBe(true);
  });

  it("un .xlsx que no se recalculó: las filas con sólo fórmulas (sin resultado guardado) no se leen como llenas", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Trozas");
    ws.addRow(ENCABEZADO);
    ws.addRow([{ formula: "B2&\"\"" }, "Tornillo", null, 45, 40, 3.2, 1, { formula: "ROUND(1,4)" }]);
    ws.addRow([{ formula: "B3&\"\"" }, null, null, null, null, null, null, { formula: "ROUND(1,4)" }]);
    const buf = await wb.xlsx.writeBuffer();
    const filas = await leerArchivoAFilas(new File([buf], "formato.xlsx"));
    expect(filas[2]![0]).toBeNull();
    const r = trozasDelFormato(filas, CATALOGO);
    expect(r.errores).toEqual([]);
    expect(r.trozas).toHaveLength(1);
  });
});
