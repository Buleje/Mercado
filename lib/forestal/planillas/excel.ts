/**
 * El Excel de una planilla de campo: la MISMA planilla que se imprime, para
 * quien prefiere llenarla en la computadora.
 *
 * Hoja 1 «Planilla» = sólo la fila de encabezados, con los títulos que su
 * importador reconoce tal cual (`encabezadosExcel`): se llena y se sube por el
 * mismo «Importar» de su destino, sin renombrar nada. Sin filas vacías con
 * formato ni fila de ejemplo — el parte de producción toma una fila con algo
 * escrito como dato, y una de ejemplo entraría como pieza.
 *
 * Hoja 2 «Cabecera y método» = los casilleros de la cabecera para anotar, el
 * método, la guía de cada columna (unidad, ejemplo, si es obligatoria) y la
 * fila de ejemplo. Los importadores leen sólo la primera hoja.
 */

import ExcelJS from "exceljs";
import { columnasAMano, encabezadosExcel } from "./catalogo";
import type { PlanillaCampo } from "./tipos";

/** mm de la hoja impresa → ancho de columna de Excel (≈ caracteres). */
const anchoExcel = (mm: number) => Math.max(10, Math.round(mm / 2.2));

const ENCABEZADO_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };

export function nombreArchivoPlanilla(p: PlanillaCampo): string {
  return `planilla-${p.id}.xlsx`;
}

export async function excelDePlanilla(p: PlanillaCampo, opts: { negocio?: string } = {}): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = opts.negocio?.trim() || "Buleje";
  wb.title = `Planilla ${p.nombre}`;

  const cols = columnasAMano(p);
  const titulos = encabezadosExcel(p);

  // ── Hoja 1: la que se importa ─────────────────────────────────────────
  const ws = wb.addWorksheet("Planilla", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = cols.map((c, i) => ({ header: titulos[i], key: c.clave, width: Math.max(anchoExcel(c.anchoMm), (titulos[i]?.length ?? 0) + 4) }));
  const fila1 = ws.getRow(1);
  fila1.font = { bold: true };
  fila1.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cols.forEach((c, i) => {
    const celda = fila1.getCell(i + 1);
    celda.fill = ENCABEZADO_FILL;
    celda.border = { bottom: { style: "thin" } };
    const unidad = c.unidad ? ` en ${c.unidad}` : "";
    celda.note = `${c.titulo}${unidad}. Ejemplo: ${c.ejemplo}.${c.obligatoria ? "" : " Puede ir vacía."}`;
  });
  /* Columnas de texto en formato texto: un código «0012» o «A-001» no se
     vuelve número ni fecha al escribirlo. */
  cols.forEach((c, i) => {
    if (c.tipo === "codigo" || c.tipo === "texto") ws.getColumn(i + 1).numFmt = "@";
  });

  // ── Hoja 2: cabecera, método y guía ───────────────────────────────────
  const g = wb.addWorksheet("Cabecera y método");
  g.columns = [{ width: 30 }, { width: 22 }, { width: 18 }, { width: 50 }];
  g.addRow([`Planilla ${p.nombre} · v${p.versionPrompt}`]).font = { bold: true, size: 13 };
  g.addRow([p.descripcion]);
  if (opts.negocio?.trim()) g.addRow([opts.negocio.trim()]);
  g.addRow([]);

  g.addRow(["Cabecera", "Valor"]).font = { bold: true };
  for (const c of p.cabecera) g.addRow([c.titulo, ""]);
  g.addRow([]);

  if (p.metodo) {
    g.addRow(["Método", p.metodo]).font = { bold: true };
    g.addRow([]);
  }
  const calculadas = p.columnas.filter((c) => c.calculada);
  if (calculadas.length > 0) {
    g.addRow([`${calculadas.map((c) => c.titulo).join(", ")}: lo calcula el sistema al importar (no va en la hoja «Planilla»).`]);
    g.addRow([]);
  }

  g.addRow(["Columna (hoja «Planilla»)", "Unidad", "Ejemplo", "Obligatoria"]).font = { bold: true };
  cols.forEach((c, i) => g.addRow([titulos[i] ?? c.titulo, c.unidad ?? "", c.ejemplo, c.obligatoria ? "Sí" : "No"]));
  g.addRow([]);
  g.addRow(["Fila de ejemplo"]).font = { bold: true };
  g.addRow(titulos);
  g.addRow(cols.map((c) => c.ejemplo));

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
