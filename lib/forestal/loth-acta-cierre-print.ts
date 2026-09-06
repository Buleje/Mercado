"use client";

/**
 * loth-acta-cierre-print — el papel del período cerrado.
 *
 * Cerrar el mes ya dejaba constancia en la base; faltaba el documento que se
 * muestra en una fiscalización: qué se cerró, cuándo, quién, con qué totales por
 * sección y con qué observaciones **quedaron dentro del cierre**. Esto último es
 * lo que distingue un acta de un resumen: si el mes se cerró con líneas fuera de
 * plazo, el acta lo dice — esconderlo sería falsear el propio documento.
 */

import { esc, idRow, openCtpReport } from "./ctp-print-shared";
import { eudrSignatureBlock } from "./eudr-map-figure";
import { fmtM3 } from "./cubicacion-formato";
import type { ResumenPeriodo } from "./loth-cierre-resumen";
import type { LothSection } from "./loth-constants";

export interface ActaCaratula {
  titularName?: string | null;
  tituloHabilitante?: string | null;
  registroNumber?: string | null;
  tomo?: string | null;
}

const SECCION_LABEL: Record<LothSection, string> = {
  tala: "1 · Tala",
  trozado: "2 · Trozado",
  despacho_troza: "3 · Despacho de trozas",
  consumo_troza: "4 · Consumo de trozas",
  producto_terminado: "5 · Producto terminado",
  despacho_producto: "6 · Despacho de producto terminado",
};

const fdate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
  } catch {
    return iso;
  }
};

export function printActaCierre(
  resumen: ResumenPeriodo,
  cierre: { closedAt: string; closedBy: string; reabierto?: { at: string; by: string; motivo: string } | null } | null,
  caratula?: ActaCaratula | null,
): void {
  const identidad = [
    idRow("Titular", caratula?.titularName ?? "—"),
    idRow("Título habilitante", caratula?.tituloHabilitante ?? "—"),
    idRow("Registro / Tomo", [caratula?.registroNumber, caratula?.tomo].filter(Boolean).join(" · ") || "—"),
    idRow("Período", resumen.label),
    idRow("Actividad registrada", `${fdate(resumen.primeraFecha)} — ${fdate(resumen.ultimaFecha)}`),
    idRow("Cerrado el", cierre ? `${fdate(cierre.closedAt)} por ${esc(cierre.closedBy)}` : "— (vista previa, aún sin cerrar)"),
  ].join("");

  const filas = resumen.porSeccion
    .map(
      (s) =>
        `<tr class="${s.lineas === 0 ? "off" : ""}"><td>${SECCION_LABEL[s.section]}</td><td class="num">${s.lineas}</td><td class="num">${
          s.volumenM3 > 0 ? fmtM3(s.volumenM3) : "—"
        }</td><td class="num">${s.cantidad > 0 ? s.cantidad.toFixed(4) : "—"}</td></tr>`,
    )
    .join("");

  const observaciones = resumen.pendientes.length
    ? `<h2>Observaciones incluidas en el cierre</h2>
       <div class="obs">${resumen.pendientes
         .map((p) => `<div class="ob ${p.nivel}">${p.nivel === "error" ? "⚠" : "•"} ${esc(p.detalle)}</div>`)
         .join("")}</div>`
    : `<h2>Observaciones</h2><p class="ok">El período se cerró sin observaciones pendientes.</p>`;

  const reapertura = cierre?.reabierto
    ? `<div class="reab"><b>Período reabierto</b> el ${fdate(cierre.reabierto.at)} por ${esc(cierre.reabierto.by)} — ${esc(
        cierre.reabierto.motivo,
      )}</div>`
    : "";

  openCtpReport({
    title: `Acta de cierre · ${resumen.label}`,
    css: `
      .ahead h1 { font-size: 20px; margin: 0; }
      .ahead .sub { color: #64748b; font-size: 12px; margin: 2px 0 14px; }
      h2 { font-size: 14px; margin: 18px 0 6px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; }
      .metrics { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
      .metrics > div { flex: 1 1 130px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; }
      .mlabel { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #94a3b8; }
      .mval { display: block; font-size: 15px; font-weight: 800; color: #0f172a; font-variant-numeric: tabular-nums; }
      table.sec { width: 100%; border-collapse: collapse; font-size: 12px; }
      table.sec th { text-align: left; background: #f1f5f9; padding: 6px 9px; border-bottom: 1px solid #cbd5e1; }
      table.sec td { border-bottom: 1px solid #eef2f7; padding: 6px 9px; }
      table.sec td.num, table.sec th.num { text-align: right; font-variant-numeric: tabular-nums; }
      table.sec tr.off td { color: #94a3b8; }
      table.sec tfoot td { font-weight: 800; border-top: 2px solid #cbd5e1; }
      .obs .ob { font-size: 12px; padding: 6px 10px; border-radius: 8px; margin-top: 4px; }
      .ob.error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
      .ob.warn { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
      .ok { font-size: 12px; color: #15803d; }
      .reab { margin-top: 10px; font-size: 12px; background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; padding: 6px 10px; border-radius: 8px; }
      .foot { color: #64748b; font-size: 11px; margin-top: 14px; }
    `,
    body: `
      <div class="ahead">
        <h1>Acta de cierre de período</h1>
        <p class="sub">Libro de Operaciones · Títulos Habilitantes (SERFOR / OSINFOR)</p>
      </div>
      <table class="id-table">${identidad}</table>
      <div class="metrics">
        <div><span class="mlabel">Líneas asentadas</span><span class="mval">${resumen.lineas}</span></div>
        <div><span class="mlabel">Anuladas</span><span class="mval">${resumen.anuladas}</span></div>
        <div><span class="mlabel">Talado</span><span class="mval">${resumen.taladoM3.toFixed(3)} m³</span></div>
        <div><span class="mlabel">Trozado</span><span class="mval">${resumen.trozadoM3.toFixed(3)} m³</span></div>
        <div><span class="mlabel">Movilizado</span><span class="mval">${resumen.movilizadoM3.toFixed(3)} m³</span></div>
      </div>
      <h2>Movimiento por sección</h2>
      <table class="sec">
        <thead><tr><th>Sección</th><th class="num">Líneas</th><th class="num">Volumen m³</th><th class="num">Cantidad</th></tr></thead>
        <tbody>${filas}</tbody>
        <tfoot><tr><td>Total</td><td class="num">${resumen.lineas}</td><td class="num">${fmtM3(
          resumen.porSeccion.reduce((a, s) => a + s.volumenM3, 0),
        )}</td><td class="num">${resumen.porSeccion.reduce((a, s) => a + s.cantidad, 0).toFixed(4)}</td></tr></tfoot>
      </table>
      ${resumen.especies.length ? `<p class="foot">Especies del período: ${esc(resumen.especies.join(", "))}.</p>` : ""}
      ${observaciones}
      ${reapertura}
      <p class="foot">Las líneas de este período quedan inmutables mientras el cierre esté vigente. Reabrirlo exige motivo y queda
      registrado. Documento interno de control; no reemplaza el registro oficial en el SNIFFS.</p>
      ${eudrSignatureBlock(caratula?.titularName ? `${caratula.titularName} (titular)` : "Titular / representante", "Sello y recepción · ARFFS / OSINFOR")}
    `,
  });
}
