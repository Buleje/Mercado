import "server-only";

/**
 * lib/contabilidad/exportar.ts — los cuatro libros de la contabilidad en .xlsx
 * (ADR-529), armados en el SERVIDOR con exceljs. Cabecera como los formatos de
 * SUNAT (período, RUC, razón social) y el aviso «documento de trabajo».
 *
 * - diario: columnas del Formato 5.1 (correlativo, fecha, glosa, código y
 *   denominación de la cuenta, debe, haber) + fila de totales.
 * - mayor: una sección por cuenta (saldo inicial, movimientos, saldo final).
 * - comprobación: las 8 columnas del Formato 3.17 (sumas, saldos, inventario, resultados).
 * - estados: situación financiera + resultados del mes y del ejercicio + cruce.
 */

import type { Worksheet } from "exceljs";
import type { LibroExportable, RenglonEstado, RespuestaComprobacion, RespuestaDiario, RespuestaEstados, RespuestaMayor } from "./tipos";

export interface CabeceraContable {
  ruc: string | null;
  razonSocial: string | null;
}

export type DatosExportar =
  | { libro: "diario"; datos: RespuestaDiario }
  | { libro: "mayor"; datos: RespuestaMayor }
  | { libro: "comprobacion"; datos: RespuestaComprobacion }
  | { libro: "estados"; datos: RespuestaEstados };

const TITULOS: Record<LibroExportable, string> = {
  diario: "FORMATO 5.1: LIBRO DIARIO",
  mayor: "FORMATO 6.1: LIBRO MAYOR",
  comprobacion: "FORMATO 3.17: BALANCE DE COMPROBACIÓN",
  estados: "ESTADOS FINANCIEROS",
};

const SOLES = "#,##0.00";

export function nombreArchivoContable(libro: LibroExportable, mes: string): string {
  return `contabilidad-${libro}-${mes}.xlsx`;
}

function cabecera(h: Worksheet, libro: LibroExportable, mes: string, c: CabeceraContable): void {
  h.addRow([`${TITULOS[libro]} (DOCUMENTO DE TRABAJO)`]).font = { bold: true, size: 13 };
  h.addRow([`PERÍODO: ${mes.replace("-", "")}`]);
  h.addRow([`RUC: ${c.ruc ?? "(no está en Configuración)"}`]);
  h.addRow([`APELLIDOS Y NOMBRES, DENOMINACIÓN O RAZÓN SOCIAL: ${c.razonSocial ?? "(no está en Configuración)"}`]);
  h.addRow([]);
}

function encabezado(h: Worksheet, rotulos: string[]): void {
  const r = h.addRow(rotulos);
  r.font = { bold: true };
  r.alignment = { wrapText: true, vertical: "top" };
}

function anchos(h: Worksheet, a: number[], soles: number[]): void {
  a.forEach((w, i) => (h.getColumn(i + 1).width = w));
  for (const i of soles) h.getColumn(i).numFmt = SOLES;
}

function diario(h: Worksheet, d: RespuestaDiario): void {
  encabezado(h, ["1. Número correlativo del asiento", "2. Fecha de la operación", "3. Glosa o descripción de la operación", "4. Código de la cuenta", "5. Denominación de la cuenta", "6. Debe", "7. Haber"]);
  for (const a of d.asientos) {
    if (a.anulado) continue;
    a.lineas.forEach((l, i) => {
      h.addRow([a.numero, a.fecha, i === 0 ? a.glosa : l.glosa ?? "", l.cuenta, l.nombreCuenta, l.debe || null, l.haber || null]);
    });
  }
  h.addRow(["TOTALES", null, null, null, null, d.totalDebe, d.totalHaber]).font = { bold: true };
  anchos(h, [12, 12, 50, 12, 40, 14, 14], [6, 7]);
}

function libroMayor(h: Worksheet, d: RespuestaMayor): void {
  encabezado(h, ["Cuenta", "Fecha", "N.º asiento", "Glosa", "Debe", "Haber", "Saldo"]);
  for (const c of d.cuentas) {
    h.addRow([`${c.codigo} ${c.nombre}`, null, null, "Saldo inicial", null, null, c.saldoInicial]).font = { bold: true };
    for (const m of c.movimientos) h.addRow([c.codigo, m.fecha, m.numero, m.tercero ? `${m.glosa} · ${m.tercero}` : m.glosa, m.debe || null, m.haber || null, m.saldo]);
    h.addRow([c.codigo, null, null, "Saldo final", c.debe, c.haber, c.saldoFinal]).font = { bold: true };
    h.addRow([]);
  }
  anchos(h, [40, 12, 10, 50, 14, 14, 14], [5, 6, 7]);
}

function libroComprobacion(h: Worksheet, d: RespuestaComprobacion): void {
  h.addRow([`Acumulado desde ${d.desde}`]).font = { italic: true };
  encabezado(h, ["Cuenta", "Denominación", "Sumas debe", "Sumas haber", "Saldo deudor", "Saldo acreedor", "Inventario activo", "Inventario pasivo y patrimonio", "Resultados pérdidas", "Resultados ganancias"]);
  for (const f of d.filas) h.addRow([f.codigo, f.nombre, f.sumasDebe, f.sumasHaber, f.saldoDeudor, f.saldoAcreedor, f.activo, f.pasivo, f.perdidas, f.ganancias]);
  const t = d.totales;
  h.addRow(["TOTALES", null, t.sumasDebe, t.sumasHaber, t.saldoDeudor, t.saldoAcreedor, t.activo, t.pasivo, t.perdidas, t.ganancias]).font = { bold: true };
  const res = d.resultadoDelEjercicio;
  h.addRow(["RESULTADO DEL EJERCICIO", null, null, null, null, null, res < 0 ? -res : null, res > 0 ? res : null, res > 0 ? res : null, res < 0 ? -res : null]).font = { bold: true };
  anchos(h, [10, 40, 14, 14, 14, 14, 14, 14, 14, 14], [3, 4, 5, 6, 7, 8, 9, 10]);
}

function renglones(h: Worksheet, titulo: string, rs: readonly RenglonEstado[], total?: number): void {
  h.addRow([titulo]).font = { bold: true };
  for (const r of rs) h.addRow([`${r.nivel === 1 ? "   " : ""}${r.etiqueta}`, r.monto, r.cuentas.join(", ")]).font = r.nivel === 0 ? { bold: true } : {};
  if (total !== undefined) h.addRow([`Total ${titulo.toLowerCase()}`, total]).font = { bold: true };
  h.addRow([]);
}

function libroEstados(h: Worksheet, d: RespuestaEstados): void {
  const s = d.situacion;
  h.addRow([`ESTADO DE SITUACIÓN FINANCIERA al cierre de ${d.mes}`]).font = { bold: true, size: 12 };
  renglones(h, "Activo corriente", s.activoCorriente);
  renglones(h, "Activo no corriente", s.activoNoCorriente);
  h.addRow(["TOTAL ACTIVO", s.totalActivo]).font = { bold: true };
  h.addRow([]);
  renglones(h, "Pasivo corriente", s.pasivoCorriente);
  renglones(h, "Pasivo no corriente", s.pasivoNoCorriente);
  h.addRow(["TOTAL PASIVO", s.totalPasivo]).font = { bold: true };
  renglones(h, "Patrimonio", s.patrimonio, s.totalPatrimonio);
  h.addRow(["TOTAL PASIVO Y PATRIMONIO", (s.totalPasivo + s.totalPatrimonio)]).font = { bold: true };
  if (!s.cuadra) h.addRow([`No cuadra por S/ ${s.diferencia.toFixed(2)}`]).font = { bold: true };
  h.addRow([]);
  h.addRow([`ESTADO DE RESULTADOS del mes ${d.mes}`]).font = { bold: true, size: 12 };
  renglones(h, "Resultados del mes", d.resultadosDelMes.renglones, d.resultadosDelMes.utilidad);
  h.addRow([`ESTADO DE RESULTADOS del ejercicio (desde ${d.desde})`]).font = { bold: true, size: 12 };
  renglones(h, "Resultados del ejercicio", d.resultadosDelEjercicio.renglones, d.resultadosDelEjercicio.utilidad);
  const c = d.cruce;
  h.addRow(["CRUCE CON «RESULTADO DEL NEGOCIO»"]).font = { bold: true, size: 12 };
  h.addRow(["Resultado del panel", c.resultadoDelPanel]);
  h.addRow(["− IGV de ventas (no es ingreso)", -c.igvVentas]);
  h.addRow(["+ IGV de compras (no es gasto)", c.igvCompras]);
  h.addRow(["+ Asientos a mano", c.ajustesManuales]);
  h.addRow(["Utilidad contable", c.utilidadContable]).font = { bold: true };
  h.addRow(["Diferencia", c.diferencia]).font = { bold: true };
  anchos(h, [52, 16, 30], [2]);
}

export async function contabilidadAXlsx(e: DatosExportar, mes: string, c: CabeceraContable): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Buleje";
  wb.created = new Date();
  const h = wb.addWorksheet(e.libro === "comprobacion" ? "Comprobación" : e.libro[0].toUpperCase() + e.libro.slice(1));
  cabecera(h, e.libro, mes, c);
  if (e.libro === "diario") diario(h, e.datos);
  else if (e.libro === "mayor") libroMayor(h, e.datos);
  else if (e.libro === "comprobacion") libroComprobacion(h, e.datos);
  else libroEstados(h, e.datos);
  h.views = [{ state: "frozen", ySplit: 6 }];
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
