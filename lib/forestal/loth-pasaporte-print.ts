"use client";

/**
 * loth-pasaporte-print — "Pasaporte de trazabilidad" imprimible de UN árbol del
 * Libro TH. El documento que responde, para un solo árbol, la pregunta que hace
 * OSINFOR: ¿de dónde salió esta madera y a dónde fue? Identidad del titular +
 * ubicación GPS + la cadena completa (tala → … → despacho) + rendimiento.
 *
 * Recibe la operación YA calculada (`loth-trace`, cliente) — no hace fetch.
 * Reusa `ctp-print-shared` + la figura de mapa satelital de `eudr-map-figure`.
 */

import { esc, idRow, openCtpReport } from "./ctp-print-shared";
import { buildEudrMapFigure, eudrMapFigureCss, eudrSignatureBlock } from "./eudr-map-figure";
import type { TraceOperation } from "./loth-trace";

interface PasaporteCaratula {
  titularName?: string | null;
  tituloHabilitante?: string | null;
  registroNumber?: string | null;
  tomo?: string | null;
}

const num = (v: string | null, dp = 4) => (v == null ? "—" : Number(v).toFixed(dp));
const fdate = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  } catch {
    return iso;
  }
};
const unit = (u: string | null) => (u === "m3" ? "m³" : u === "kg" ? "Kg" : u === "unidad" ? "u" : u ?? "");

export function printTrozaPasaporte(op: TraceOperation, caratula?: PasaporteCaratula | null): void {
  const identity = [
    idRow("Titular", caratula?.titularName ?? "—"),
    idRow("Título habilitante", caratula?.tituloHabilitante ?? "—"),
    idRow("Registro / Tomo", [caratula?.registroNumber, caratula?.tomo].filter(Boolean).join(" · ") || "—"),
    idRow("Árbol", op.tree),
    idRow("Especie", `${op.species ?? "—"}${op.scientific ? ` (${op.scientific})` : ""}${op.cites ? " · CITES" : ""}`),
  ].join("");

  const chainColor = op.chain === "completa" ? "#15803d" : op.chain === "parcial" ? "#b45309" : "#64748b";
  const rendColor = op.rendimientoPct >= 60 ? "#15803d" : op.rendimientoPct >= 40 ? "#b45309" : "#b91c1c";

  const metrics = `
    <div class="metrics">
      <div><span class="mlabel">Talado</span><span class="mval">${op.talaVolM3.toFixed(3)} m³</span></div>
      <div><span class="mlabel">Trozado</span><span class="mval">${op.trozadoVolM3.toFixed(3)} m³</span></div>
      <div><span class="mlabel">Rendimiento</span><span class="mval" style="color:${rendColor}">${op.rendimientoPct}%</span></div>
      <div><span class="mlabel">Merma</span><span class="mval">${op.mermaVolM3.toFixed(3)} m³</span></div>
      <div><span class="mlabel">Estado de cadena</span><span class="mval" style="color:${chainColor};text-transform:capitalize">${op.chain}</span></div>
    </div>`;

  const figura = op.gps
    ? buildEudrMapFigure({ points: [{ lat: op.gps.lat, lng: op.gps.lng, label: op.tree, color: "#16a34a" }], caption: `Ubicación de la tala · ${op.gps.lat.toFixed(5)}, ${op.gps.lng.toFixed(5)} · satélite Esri`, height: 360 })
    : "";

  const alerts = op.alerts.length
    ? `<div class="alerts">${op.alerts.map((a) => `<div class="alert ${a.level}">${a.level === "error" ? "⚠" : "•"} ${esc(a.message)}</div>`).join("")}</div>`
    : "";

  const stageRow = (title: string, done: boolean, body: string) =>
    `<tr class="${done ? "" : "off"}"><td class="stg">${esc(title)}</td><td>${done ? body : '<span class="muted">— sin registros</span>'}</td></tr>`;

  const trozadoBody = op.trozado.map((t) => `<b>${esc(t.trozaCode ?? "—")}</b> ${num(t.volumeM3)}${t.isRama ? " <span class='muted'>(rama)</span>" : ""}`).join(" · ");
  const despTrozaBody = op.despachoTroza.map((d) => `<b>${esc(d.trozaCode ?? "—")}</b>${d.gtfNumber ? ` → GTF ${esc(d.gtfNumber)}` : ""}`).join(" · ");
  const consumoBody = op.consumo.map((c) => `<b>${esc(c.trozaCode ?? "—")}</b> ${num(c.volumeM3)}`).join(" · ");
  const prodBody = op.producto.map((p) => `${esc(p.productType ?? "—")} ${num(p.quantity)} ${esc(unit(p.unit))}`).join(" · ");
  const despPtBody = op.despachoPT.map((d) => `${d.gtfNumber ? `GTF ${esc(d.gtfNumber)} · ` : ""}${esc(d.productType ?? "—")} ${num(d.quantity)} ${esc(unit(d.unit))}`).join("<br>");

  const chainTable = `
    <table class="chain">
      <thead><tr><th>Etapa</th><th>Detalle</th></tr></thead>
      <tbody>
        ${stageRow("1 · Tala", op.tala.length > 0, op.tala[0] ? `Ø ${num(op.tala[0].diamMayorM, 2)}/${num(op.tala[0].diamMenorM, 2)} m · L ${num(op.tala[0].lengthM, 2)} m · <b>${num(op.tala[0].volumeM3)} m³</b> · ${fdate(op.tala[0].entryDate)}` : "")}
        ${stageRow("2 · Trozado", op.trozado.length > 0, `${op.trozado.length} trozas · ${trozadoBody}`)}
        ${stageRow("3 · Despacho de trozas", op.despachoTroza.length > 0, despTrozaBody)}
        ${stageRow("4 · Consumo de trozas", op.consumo.length > 0, `${consumoBody} · <b>${op.consumoVolM3.toFixed(3)} m³</b> al aserrío`)}
        ${stageRow("5 · Producto terminado", op.producto.length > 0, prodBody)}
        ${stageRow("6 · Despacho de producto", op.despachoPT.length > 0, despPtBody)}
      </tbody>
    </table>`;

  const body = `
    <div class="phead">
      <h1>Pasaporte de trazabilidad</h1>
      <p class="sub">Árbol <b>${esc(op.tree)}</b> · Libro de Operaciones · Títulos Habilitantes (SERFOR / OSINFOR)</p>
    </div>
    <table class="id-table">${identity}</table>
    ${metrics}
    ${alerts}
    ${figura ? `<h2>Ubicación</h2>${figura}` : ""}
    <h2>Cadena de custodia</h2>
    ${chainTable}
    <p class="foot">Período de la operación: ${fdate(op.firstDate)} — ${fdate(op.lastDate)}. Trazabilidad interna reconstruida desde el Libro TH; no reemplaza el registro oficial en el SNIFFS.</p>
    ${eudrSignatureBlock(caratula?.titularName ? `${caratula.titularName} (titular)` : "Titular / representante", "Sello y recepción · ARFFS / OSINFOR")}
  `;

  openCtpReport({
    title: `Pasaporte · ${op.tree}`,
    css: `
      .phead h1 { font-size: 20px; margin: 0; }
      .phead .sub { color: #64748b; font-size: 12px; margin: 2px 0 14px; }
      h2 { font-size: 14px; margin: 18px 0 6px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; }
      .metrics { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
      .metrics > div { flex: 1 1 120px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; }
      .mlabel { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #94a3b8; }
      .mval { display: block; font-size: 15px; font-weight: 800; color: #0f172a; font-variant-numeric: tabular-nums; }
      .alerts { margin: 10px 0; }
      .alert { font-size: 12px; padding: 6px 10px; border-radius: 8px; margin-top: 4px; }
      .alert.error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
      .alert.warn { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
      table.chain { width: 100%; border-collapse: collapse; font-size: 12px; }
      table.chain th { text-align: left; background: #f1f5f9; padding: 6px 9px; border-bottom: 1px solid #cbd5e1; }
      table.chain td { border-bottom: 1px solid #eef2f7; padding: 6px 9px; vertical-align: top; }
      table.chain td.stg { font-weight: 700; white-space: nowrap; color: #334155; width: 190px; }
      table.chain tr.off td { color: #94a3b8; }
      .muted { color: #94a3b8; }
      ${eudrMapFigureCss()}
    `,
    body,
  });
}
