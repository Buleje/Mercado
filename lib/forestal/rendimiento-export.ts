"use client";

/**
 * El informe de rendimiento en Excel y en PDF (e6). Dice lo mismo que la
 * pantalla y con las mismas palabras: ponderado (no el promedio simple),
 * «parcial» para las corridas de un lote en proceso, «≈» en lo estimado y
 * «falta …» en vez de S/ 0.
 *
 * Reusa `ctp-print-shared` (cabecera y pie del Libro CTP) y el mismo patrón de
 * ExcelJS de `saldo-permiso-export`: import dinámico, fuera del bundle.
 */
import { esc, ctpReportFooter, openCtpReport } from "./ctp-print-shared";
import type { CorridaRendimientoDTO, RendimientoAserraderoDTO } from "./rendimiento-especie";
import type { RendimientoPlata } from "./rendimiento-plata";

const ESTADO_TXT: Record<CorridaRendimientoDTO["estado"], string> = {
  parcial: "Parcial (lote en proceso)",
  bajo_lo_suyo: "Bajo lo suyo",
  sobre_lo_suyo: "Sobre lo suyo",
  en_rango: "En su rango",
  sin_rango: "Sin rango aún",
  sin_dato: "Sin dato",
};

const n = (v: number | null | undefined, d: number) => (v == null ? "—" : v.toLocaleString("es-PE", { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (v: number | null | undefined, d = 2) => (v == null ? "—" : `${n(v, d)} %`);
const rangoTxt = (r: CorridaRendimientoDTO["rango"]) =>
  r ? `${n(r.min, 1)}–${n(r.max, 1)} %${r.provisional ? ` (provisional, ${r.corridas})` : ` (${r.corridas})`}` : "—";
const comercial = (p: RendimientoPlata | null) => (p?.rendimientoPtPct == null ? "—" : `${p.ptEntradaEstimado ? "≈ " : ""}${n(p.rendimientoPtPct, 1)} %`);
const costo = (p: RendimientoPlata | null) =>
  !p ? "—" : p.servicio ? "De servicio" : p.costoPorPt != null ? `S/ ${n(p.costoPorPt, 2)}` : p.faltantes.length > 0 ? `Falta ${p.faltantes.join(", ")}` : "—";

const fecha = () => new Date().toISOString().slice(0, 10);

/* ── PDF ─────────────────────────────────────────────────────────────────── */

const CSS = `.num{text-align:right;font-variant-numeric:tabular-nums} .parcial{color:#555;font-style:italic} .falta{color:#9a3412}`;

export function imprimirRendimiento(d: RendimientoAserraderoDTO, nombreCtp?: string): void {
  const t = d.total;
  const especies = d.especies
    .map(
      (e) => `<tr><td>${esc(e.especie)}</td><td class="num">${e.corridas}${e.enProceso ? ` (${e.enProceso} en proceso)` : ""}</td>
      <td class="num">${n(e.m3Entrada, 3)}</td><td class="num">${n(e.m3Salida, 3)}</td><td class="num">${pct(e.ponderadoPct)}${e.enProceso ? " parcial" : ""}</td>
      <td>${esc(rangoTxt(e.rango))}</td><td>${e.tendencia ? esc(e.tendencia.sentido) : "—"}</td></tr>`,
    )
    .join("");
  const corridas = d.corridas
    .map(
      (c) => `<tr class="${c.parcial ? "parcial" : ""}"><td>#${c.lineNo}</td><td>${esc(c.fecha)}</td><td>${esc(c.especie)}</td><td>${esc(c.lote ?? "—")}</td>
      <td class="num">${n(c.m3Entrada, 3)}</td><td class="num">${n(c.m3Salida, 3)}</td><td class="num">${pct(c.rendimientoPct)}</td>
      <td>${esc(ESTADO_TXT[c.estado])}${c.parcial && c.finProceso ? ` hasta ${esc(c.finProceso)}` : ""}</td>
      ${d.plataVisible ? `<td class="num">${esc(comercial(c.plata))}</td><td class="${c.plata?.costoPorPt == null ? "falta" : "num"}">${esc(costo(c.plata))}</td>` : ""}</tr>`,
    )
    .join("");
  const body = `
  <h1>Rendimiento del aserradero</h1>
  <p class="sub">${esc(nombreCtp || "Centro de Transformación Primaria")} · Al ${esc(d.hoy)} · Libro CTP</p>
  <div class="id">
    <div><span class="k">Corridas:</span> ${t.corridas}${t.enProceso ? ` (${t.enProceso} en proceso: rendimiento parcial)` : ""}</div>
    <div><span class="k">Troza → aserrado:</span> ${n(t.m3Entrada, 3)} m³ → ${n(t.m3Salida, 3)} m³</div>
    <div><span class="k">Rendimiento ponderado:</span> ${pct(t.ponderadoPct)} (promedio simple de los %: ${pct(t.promedioSimplePct)})</div>
    ${d.plataVisible && t.plata ? `<div><span class="k">Rendimiento comercial (PT ÷ PT pagado):</span> ${esc(comercial(t.plata))}</div><div><span class="k">Costo por PT aserrado:</span> ${esc(costo(t.plata))}</div>` : ""}
  </div>
  <h2>Por especie</h2>
  <table><thead><tr><th>Especie</th><th>Corridas</th><th>Troza m³</th><th>Aserrado m³</th><th>Rendimiento</th><th>Tu rango</th><th>Tendencia</th></tr></thead><tbody>${especies}</tbody></table>
  <h2>Por corrida</h2>
  <table><thead><tr><th>N°</th><th>Fecha</th><th>Especie</th><th>Lote</th><th>Troza m³</th><th>Aserrado m³</th><th>Rend.</th><th>Estado</th>${d.plataVisible ? "<th>Comercial</th><th>Costo/PT</th>" : ""}</tr></thead><tbody>${corridas}</tbody></table>
  ${ctpReportFooter(
    "Documento interno. Rendimiento = m³ aserrados ÷ m³ de troza del Libro CTP, ponderado por m³. «Parcial»: el lote sigue en proceso y su producción todavía no está toda declarada. «≈»: PT pagado estimado del m³ × 424 × 0,624. Ningún costo faltante se cuenta como cero.",
  )}`;
  openCtpReport({ title: "Rendimiento del aserradero — Libro CTP", css: CSS, body });
}

/* ── Excel ───────────────────────────────────────────────────────────────── */

export async function exportarRendimientoExcel(d: RendimientoAserraderoDTO): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const VERDE = "FF14532D";
  const cabecera = (ws: import("exceljs").Worksheet) => {
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  const rs = wb.addWorksheet("Resumen");
  rs.columns = [{ width: 44 }, { width: 30 }];
  rs.addRow(["RENDIMIENTO DEL ASERRADERO"]).font = { bold: true, size: 14 };
  const t = d.total;
  const kv: [string, string | number][] = [
    ["Al", d.hoy],
    ["Corridas", t.corridas],
    ["En proceso (rendimiento parcial)", t.enProceso],
    ["Troza (m³)", t.m3Entrada],
    ["Aserrado (m³)", t.m3Salida],
    ["Rendimiento ponderado (%)", t.ponderadoPct ?? "—"],
    ["Promedio simple de los % (sólo referencia)", t.promedioSimplePct ?? "—"],
  ];
  if (d.plataVisible && t.plata) kv.push(["Rendimiento comercial (PT ÷ PT pagado)", comercial(t.plata)], ["Costo por PT aserrado", costo(t.plata)]);
  for (const [k, v] of kv) rs.addRow([k, v]).getCell(1).font = { bold: true };

  const pe = wb.addWorksheet("Por especie");
  pe.columns = [
    { header: "Especie", key: "especie", width: 22 },
    { header: "Corridas", key: "corridas", width: 10 },
    { header: "En proceso", key: "enProceso", width: 12 },
    { header: "Troza (m³)", key: "m3e", width: 13 },
    { header: "Aserrado (m³)", key: "m3s", width: 14 },
    { header: "Rendimiento ponderado (%)", key: "pct", width: 24 },
    { header: "Tu rango", key: "rango", width: 26 },
    { header: "Tendencia", key: "tend", width: 12 },
  ];
  cabecera(pe);
  for (const e of d.especies) {
    pe.addRow({ especie: e.especie, corridas: e.corridas, enProceso: e.enProceso, m3e: e.m3Entrada, m3s: e.m3Salida, pct: e.ponderadoPct ?? "—", rango: rangoTxt(e.rango), tend: e.tendencia?.sentido ?? "—" });
  }

  const pc = wb.addWorksheet("Por corrida");
  pc.columns = [
    { header: "N°", key: "n", width: 6 },
    { header: "Fecha", key: "fecha", width: 12 },
    { header: "Especie", key: "especie", width: 20 },
    { header: "Lote", key: "lote", width: 14 },
    { header: "Troza (m³)", key: "m3e", width: 12 },
    { header: "Aserrado (m³)", key: "m3s", width: 13 },
    { header: "Rendimiento (%)", key: "pct", width: 15 },
    { header: "Estado", key: "estado", width: 26 },
    { header: "Fin del lote", key: "fin", width: 12 },
    ...(d.plataVisible
      ? [
          { header: "Comercial (PT ÷ PT pagado)", key: "com", width: 24 },
          { header: "Costo por PT", key: "costo", width: 48 },
        ]
      : []),
  ];
  cabecera(pc);
  for (const c of d.corridas) {
    pc.addRow({
      n: c.lineNo, fecha: c.fecha, especie: c.especie, lote: c.lote ?? "", m3e: c.m3Entrada, m3s: c.m3Salida,
      pct: c.rendimientoPct ?? "—", estado: ESTADO_TXT[c.estado], fin: c.finProceso ?? "",
      ...(d.plataVisible ? { com: comercial(c.plata), costo: costo(c.plata) } : {}),
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `rendimiento-aserradero-${fecha()}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
