"use client";

/**
 * El saldo por permiso en papel y en Excel (ADR-409).
 *
 * Las dos salidas dicen **lo mismo que la pantalla**, y lo dicen con las mismas
 * palabras: el 56 % es un techo, se resta sólo la producción sin lote, y lo que
 * no está en m³ no se convierte. Un Excel que omita esas tres líneas se va a
 * leer como un informe de capacidad — y es una simulación.
 *
 * Reusa `ctp-print-shared` (identidad del CTP, tablas, firma, pie): un reporte
 * del libro con su propia cabecera no se lee como parte del mismo expediente.
 */

import {
  esc,
  ctpIdentityBlock,
  ctpReportFooter,
  openCtpReport,
  type CtpReportFicha,
} from "./ctp-print-shared";
import { SIN_PERMISO, type BaseDeSaldo, type SaldoDePermiso } from "./saldo-por-permiso";

const n3 = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const n0 = (n: number) => Math.round(n).toLocaleString("es-PE");

/** De dónde sale la rolliza que se está mirando, dicho en una línea. */
export const LEYENDA_BASE: Record<BaseDeSaldo, string> = {
  patio: "rolliza que sigue en el patio (la que todavía puede entrar a la sierra)",
  ingresado: "toda la rolliza que entró bajo el permiso, aserrada o no",
};

/** La nota metodológica — la misma en la pantalla, el papel y el Excel. */
export const NOTA_METODO = [
  "El 56 % es el TECHO de rendimiento de la plaza (ADR-358): «aserrable» es un máximo, no lo que la sierra va a sacar.",
  "Se resta SÓLO la producción declarada sin lote que cita el permiso: una corrida que consumió trozas ya descontó su madera del patio.",
  "Lo que no se declara en m³ (pt, kg, unidad) no se convierte: se lista aparte.",
  "Es una simulación: no mueve saldos del libro ni consume trozas.",
];

export interface SaldoExportData {
  saldos: readonly SaldoDePermiso[];
  base: BaseDeSaldo;
  /** `true` si la lectura del patio no trajo todas las piezas. */
  patioTruncado?: { total: number; leidas: number } | null;
  ficha?: CtpReportFicha | null;
}

const COLUMNAS = [
  "Especie",
  "Trozas",
  "Rolliza m³",
  "Aserrable 56 % (pt)",
  "Aserrable 56 % (m³)",
  "Declarado sin lote (m³)",
  "Sobrante (m³)",
  "Sobrante (pt)",
] as const;

/* ── Papel ────────────────────────────────────────────────────────────────── */

const CSS = `
  .nota{font-size:11px;color:#555;margin:2px 0 10px;padding-left:14px}
  .nota li{margin:1px 0}
  .neg{color:#b91c1c;font-weight:700}
  .permiso{margin-top:14px}
  .permiso h2{margin-bottom:2px}
  .sub2{font-size:11.5px;color:#666;margin:0 0 4px}
`;

const celdaNum = (v: number, fmt: (n: number) => string, alerta = false) =>
  `<td class="num${alerta && v < -0.001 ? " neg" : ""}">${fmt(v)}</td>`;

function bloquePermiso(s: SaldoDePermiso): string {
  const filas = s.especies
    .map(
      (f) => `<tr>
      <td><b>${esc(f.especie)}</b></td>
      <td class="num">${n0(f.piezas)}</td>
      ${celdaNum(f.rollizaM3, n3)}
      ${celdaNum(f.aserrablePt, n0)}
      ${celdaNum(f.aserrableM3, n3)}
      <td class="num">${f.producidoM3 > 0 ? `− ${n3(f.producidoM3)}` : "—"}</td>
      ${celdaNum(f.sobranteM3, n3, true)}
      ${celdaNum(f.sobrantePt, n0, true)}
    </tr>`,
    )
    .join("");
  const t = s.totales;
  return `<div class="permiso">
    <h2>${esc(s.etiqueta)}</h2>
    <p class="sub2">${n0(t.piezas)} troza(s) · ${s.corridas.length} producción(es) sin lote${
      s.hayExceso ? " · <b class=\"neg\">tiene especies con sobrante negativo</b>" : ""
    }</p>
    <table>
      <thead><tr>${COLUMNAS.map((c, i) => `<th${i > 0 ? ' class="num"' : ""}>${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr style="font-weight:700;background:#f6f8f7">
        <td>Total (${s.especies.length} especie${s.especies.length === 1 ? "" : "s"})</td>
        <td class="num">${n0(t.piezas)}</td>
        <td class="num">${n3(t.rollizaM3)}</td>
        <td class="num">${n0(t.aserrablePt)}</td>
        <td class="num">${n3(t.aserrableM3)}</td>
        <td class="num">${t.producidoM3 > 0 ? `− ${n3(t.producidoM3)}` : "—"}</td>
        ${celdaNum(t.sobranteM3, n3, true)}
        ${celdaNum(t.sobrantePt, n0, true)}
      </tr></tfoot>
    </table>
    ${
      s.sinUnidadM3.length > 0
        ? `<p class="sub2">${s.sinUnidadM3.length} producción(es) de este permiso no declaran en m³: no se restan.</p>`
        : ""
    }
  </div>`;
}

export function printSaldoPorPermiso(d: SaldoExportData): void {
  const fecha = new Date().toLocaleString("es-PE", {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const conExceso = d.saldos.filter((s) => s.hayExceso).length;

  const body = `
  <h1>Saldo por permiso — simulación</h1>
  <p class="sub">${esc(d.ficha?.nombreCtp || "Centro de Transformación Primaria")} · Base: ${esc(
    LEYENDA_BASE[d.base],
  )} · Generado: ${esc(fecha)}</p>

  ${ctpIdentityBlock(d.ficha, [
    `<div><span class="k">Títulos habilitantes con movimiento:</span> ${d.saldos.length}</div>`,
    `<div><span class="k">Con sobrante negativo:</span> ${conExceso}</div>`,
  ])}

  <h2>Cómo leer este cuadro</h2>
  <ul class="nota">${NOTA_METODO.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
  ${
    d.patioTruncado
      ? `<p class="sub2"><b>Aviso:</b> el patio tiene ${n0(d.patioTruncado.total)} piezas y esta lectura trajo ${n0(
          d.patioTruncado.leidas,
        )}: la rolliza de este cuadro es la de esas piezas.</p>`
      : ""
  }

  ${d.saldos.map(bloquePermiso).join("")}

  ${ctpReportFooter(
    "Documento interno de planificación. No reemplaza el Libro de Operaciones ni ningún reporte oficial SERFOR: el 56 % es un techo teórico y lo declarado sin lote todavía no tiene materia prima atribuida.",
  )}`;

  openCtpReport({ title: "Saldo por permiso — Libro CTP", css: CSS, body });
}

/* ── Excel ────────────────────────────────────────────────────────────────── */

export async function exportarSaldoPorPermiso(d: SaldoExportData): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const VERDE = "FF14532D";

  const rs = wb.addWorksheet("Resumen", { properties: { tabColor: { argb: VERDE } } });
  rs.columns = [{ width: 42 }, { width: 26 }];
  rs.addRow(["SALDO POR PERMISO — SIMULACIÓN"]).font = { bold: true, size: 14 };
  const kv = (k: string, v: string | number) => {
    const r = rs.addRow([k, v]);
    r.getCell(1).font = { bold: true };
  };
  kv("Base de la rolliza", LEYENDA_BASE[d.base]);
  kv("Generado", new Date().toLocaleString("es-PE"));
  kv("Títulos habilitantes", d.saldos.length);
  kv("Con sobrante negativo", d.saldos.filter((s) => s.hayExceso).length);
  if (d.patioTruncado) {
    kv("⚠ Patio leído parcialmente", `${d.patioTruncado.leidas} de ${d.patioTruncado.total} piezas`);
  }
  rs.addRow([]);
  rs.addRow(["CÓMO LEER ESTE CUADRO"]).font = { bold: true };
  for (const n of NOTA_METODO) rs.addRow([n]);

  const hoja = wb.addWorksheet("Saldo por permiso");
  hoja.columns = [
    { header: "N° de permiso", key: "permiso", width: 28 },
    { header: "Especie", key: "especie", width: 22 },
    { header: "Trozas", key: "trozas", width: 10 },
    { header: "Rolliza m³", key: "rolliza", width: 14 },
    { header: "Aserrable 56% (pt)", key: "pt", width: 18 },
    { header: "Aserrable 56% (m³)", key: "m3", width: 18 },
    { header: "Declarado sin lote (m³)", key: "sinLote", width: 22 },
    { header: "Sobrante (m³)", key: "sobrante", width: 15 },
    { header: "Sobrante (pt)", key: "sobrantePt", width: 15 },
  ];
  hoja.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  hoja.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };

  for (const s of d.saldos) {
    for (const f of s.especies) {
      const row = hoja.addRow({
        permiso: s.permiso ?? SIN_PERMISO,
        especie: f.especie,
        trozas: f.piezas,
        rolliza: f.rollizaM3,
        pt: f.aserrablePt,
        m3: f.aserrableM3,
        sinLote: f.producidoM3,
        sobrante: f.sobranteM3,
        sobrantePt: f.sobrantePt,
      });
      /* El rojo es el dato: una fila donde se declaró más de lo que la rolliza
         puede dar es lo que alguien busca al abrir esta planilla. */
      if (f.sobranteM3 < -0.001) {
        row.getCell("sobrante").font = { color: { argb: "FFB91C1C" }, bold: true };
        row.getCell("sobrantePt").font = { color: { argb: "FFB91C1C" }, bold: true };
      }
    }
  }

  /* Las corridas que sostienen cada resta: sin esta hoja el número «declarado
     sin lote» no se puede auditar contra el libro. */
  const det = wb.addWorksheet("Producciones sin lote");
  det.columns = [
    { header: "N° de permiso", key: "permiso", width: 28 },
    { header: "Línea", key: "linea", width: 10 },
    { header: "Fecha", key: "fecha", width: 14 },
    { header: "Especie", key: "especie", width: 22 },
    { header: "Cantidad", key: "cantidad", width: 14 },
    { header: "Unidad", key: "unidad", width: 10 },
    { header: "Referencia", key: "ref", width: 36 },
  ];
  det.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  det.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
  for (const s of d.saldos) {
    for (const c of s.corridas) {
      det.addRow({
        permiso: s.permiso ?? SIN_PERMISO,
        linea: c.lineNo ?? "",
        fecha: c.fecha.slice(0, 10),
        especie: c.especie ?? "",
        cantidad: Number(c.cantidad) || 0,
        unidad: c.unidad ?? "",
        ref: c.referencia ?? "",
      });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `saldo-por-permiso-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
