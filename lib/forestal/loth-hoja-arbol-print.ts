"use client";

/**
 * loth-hoja-arbol-print — «Hoja del árbol» imprimible del Libro TH: UNA página
 * por árbol con todo lo que el regente firma de él — censo, tala, trozas (y a
 * dónde fue cada una), rendimiento, alertas. El pasaporte cuenta la cadena de
 * custodia; ésta es la ficha del árbol, con el censo al lado de lo real.
 *
 * Parte de una `TraceFila` (censo + operación ya unidos). No hace fetch.
 * Reusa la ventana, el CSS, el QR y la carátula del pasaporte.
 *
 * Reglas del documento:
 *   · TODO dato pasa por `esc()` (hay un precedente de XSS en un reporte impreso).
 *   · Sin dato → «—». Nunca «0»: «no se midió» no es «cero».
 *   · Las cifras son las de la pantalla (`TraceFila`): un solo número por hecho.
 */

import { limaDateKey } from "@/lib/utils";
import { esc, idRow, openCtpReport } from "./ctp-print-shared";
import { eudrSignatureBlock } from "./eudr-map-figure";
import { FLAG_LABEL, FLAG_TONE } from "./loth-arbol";
import { PASAPORTE_CSS, qrDe, type PasaporteCaratula } from "./loth-pasaporte-print";
import type { TraceAlert } from "./loth-trace";
import type { TraceFila } from "./loth-trace-tabla";
import { formatUtmFull, toUtm } from "./loth-utm";
import type { LothEntryDTO } from "./loth-constants";

const DASH = "—";
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Decimal del libro (string) o número → «12,345». null/NaN → «—». */
const dec = (v: string | number | null | undefined, dp: number): string => {
  if (v == null || v === "") return DASH;
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(dp) : DASH;
};
const m3 = (v: string | number | null | undefined, dp = 3): string => {
  const s = dec(v, dp);
  return s === DASH ? s : `${s} m³`;
};
/** Fecha date-only del libro: día calendario UTC (Lima es UTC−5: off-by-one si no). */
const fdate = (iso: string | null | undefined): string => {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const fdateKey = (key: string): string => {
  const [y, mo, d] = key.split("-");
  return y && mo && d ? `${d} ${MESES[Number(mo) - 1] ?? mo} ${y}` : DASH;
};
const pct = (v: number | null | undefined): string => (v == null || !Number.isFinite(v) ? DASH : `${v.toFixed(1)}%`);
const dias = (v: number | null | undefined): string => (v == null ? DASH : `${v} ${v === 1 ? "día" : "días"}`);

const kv = (k: string, v: string) => `<tr><th class="hk">${esc(k)}</th><td>${esc(v)}</td></tr>`;

export interface HojaArbolOpts {
  /** QR de verificación pública (data URL). Sin él la hoja sigue siendo válida. */
  qr?: string | null;
  /** Fecha de impresión (inyectable para tests deterministas). */
  hoy?: Date;
  /** Altura comercial del censo (m). La ficha del árbol todavía no la trae. */
  alturaM?: number | null;
}

function alertasDe(fila: TraceFila): TraceAlert[] {
  const out: TraceAlert[] = [...(fila.op?.alerts ?? [])];
  for (const f of fila.flags) {
    if (FLAG_TONE[f] === "info") continue;
    out.push({ level: FLAG_TONE[f] === "error" ? "error" : "warn", message: FLAG_LABEL[f] });
  }
  const vistos = new Set<string>();
  return out.filter((a) => (vistos.has(a.message) ? false : (vistos.add(a.message), true)));
}

function medidas(t: LothEntryDTO): string {
  const d = t.diamMayorM != null || t.diamMenorM != null ? `Ø ${dec(t.diamMayorM, 2)}/${dec(t.diamMenorM, 2)} m` : null;
  const l = t.lengthM != null ? `L ${dec(t.lengthM, 2)} m` : null;
  return [d, l].filter(Boolean).join(" · ") || DASH;
}

/** Estado de UNA troza, con el N.º de guía y la fecha cuando salió. */
function estadoTroza(fila: TraceFila, t: LothEntryDTO): string {
  const op = fila.op;
  if (!op || !t.trozaCode) return "Sin código (no se sabe si salió)";
  const estado = op.trozaEstado[t.trozaCode];
  if (estado === "despachada") {
    const d = op.despachoTroza.find((x) => x.trozaCode === t.trozaCode);
    return `Despachada · GTF ${d?.gtfNumber ?? DASH} · ${fdate(d?.entryDate)}`;
  }
  if (estado === "consumida") {
    const c = op.consumo.find((x) => x.trozaCode === t.trozaCode);
    return `Consumida en aserrío · ${fdate(c?.entryDate)}`;
  }
  return "En patio";
}

/** Cuerpo de UNA hoja. Aislado para poder encuadernar varias seguidas. */
export function hojaArbolHtml(fila: TraceFila, caratula?: PasaporteCaratula | null, opts: HojaArbolOpts = {}): string {
  const op = fila.op;
  const tala = op?.tala[0] ?? null;
  const gps = op?.gps ?? null;
  const hoy = opts.hoy ?? new Date();

  const utm = gps ? formatUtmFull(toUtm(gps.lat, gps.lng)) : DASH;
  const especie = `${fila.especie ?? DASH}${op?.scientific ? ` (${op.scientific})` : ""}`;

  const carat = [
    idRow("Titular", caratula?.titularName ?? DASH),
    idRow("Título habilitante", caratula?.tituloHabilitante ?? DASH),
    idRow("Registro / Tomo", [caratula?.registroNumber, caratula?.tomo].filter(Boolean).join(" · ") || DASH),
  ].join("");

  const censo = [
    kv("Código", fila.tree),
    kv("Especie (común · científica)", especie),
    kv("CITES", fila.cites ? "Sí — especie CITES" : "No"),
    kv("DAP", fila.dapCm != null ? `${dec(fila.dapCm, 1)} cm` : DASH),
    kv("Altura comercial", opts.alturaM != null ? `${dec(opts.alturaM, 1)} m` : DASH),
    kv("Volumen estimado (censo)", m3(fila.censoM3)),
    kv("UTM / zona", gps ? `${utm} (calculado del GPS de la tala)` : DASH),
  ].join("");

  const gpsTxt = gps ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : DASH;
  const origenGps = tala?.gpsOrigen === "telefono" ? " · teléfono en el tocón" : tala?.gpsOrigen === "censo" ? " · coordenada del censo" : tala?.gpsOrigen === "utm" ? " · UTM tipeada" : "";
  const talaRows = [
    kv("Fecha de tala", fdate(tala?.entryDate)),
    kv("Volumen talado", m3(fila.taladoM3)),
    kv("Medidas del fuste", tala ? medidas(tala) : DASH),
    kv("GPS", gps ? `${gpsTxt}${origenGps}` : DASH),
    kv("Foto del tocón", tala?.photoUrl ? "Registrada en el libro" : DASH),
  ].join("");

  const trozas = op?.trozado ?? [];
  const trozasBody = trozas.length
    ? trozas
        .map(
          (t) =>
            `<tr><td><b>${esc(t.trozaCode ?? DASH)}</b>${t.isRama ? ' <span class="muted">(rama)</span>' : ""}</td><td>${esc(medidas(t))}</td><td class="num">${esc(m3(t.volumeM3, 4))}</td><td>${esc(estadoTroza(fila, t))}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="muted">${DASH} sin trozado registrado</td></tr>`;

  const sinTrozar = !(fila.trozadoM3 > 0);
  const rendColor = fila.rendimientoPct == null ? "#64748b" : fila.rendimientoPct >= 60 ? "#15803d" : fila.rendimientoPct >= 40 ? "#b45309" : "#b91c1c";
  const resumen = `
    <div class="metrics">
      <div><span class="mlabel">Rendimiento (trozado/talado)</span><span class="mval" style="color:${rendColor}">${esc(fila.rendimientoPct == null ? `${DASH} (sin trozar)` : pct(fila.rendimientoPct))}</span></div>
      <div><span class="mlabel">Trozado</span><span class="mval">${esc(sinTrozar ? DASH : m3(fila.trozadoM3))}</span></div>
      <div><span class="mlabel">Merma</span><span class="mval">${esc(fila.mermaM3 == null ? DASH : `${m3(fila.mermaM3)} · ${pct(fila.mermaPct)}`)}</span></div>
      <div><span class="mlabel">Días de tala a salida</span><span class="mval">${esc(dias(fila.diasTalaSalida))}</span></div>
      <div><span class="mlabel">Precisión del censo</span><span class="mval">${esc(pct(fila.precisionCensoPct))}</span><span class="mlabel">talado ${esc(m3(fila.taladoM3))} / estimado ${esc(m3(fila.censoM3))}</span></div>
    </div>`;

  const alertas = alertasDe(fila);
  const alertasHtml = alertas.length
    ? `<div class="alerts">${alertas.map((a) => `<div class="alert ${a.level}">${a.level === "error" ? "⚠" : "•"} ${esc(a.message)}</div>`).join("")}</div>`
    : `<p class="muted">${DASH} sin alertas</p>`;

  return `
    <section class="pasaporte hoja">
    <div class="phead">
      <div>
        <h1>Hoja del árbol ${esc(fila.tree)}</h1>
        <p class="sub">${esc(fila.especie ?? DASH)} · ${fila.enPie ? "en pie (censado, sin talar)" : "talado"} · Libro de Operaciones · Títulos Habilitantes (SERFOR / OSINFOR)</p>
      </div>
      ${opts.qr ? `<div class="qrbox"><img src="${esc(opts.qr)}" alt="QR del árbol ${esc(fila.tree)}" /><span>Verificar ${esc(fila.tree)}</span></div>` : ""}
    </div>
    <h2>1 · Título habilitante</h2>
    <div class="id">${carat}</div>
    <h2>2 · Censo</h2>
    <table class="kv">${censo}</table>
    <h2>3 · Tala</h2>
    <table class="kv">${talaRows}</table>
    <h2>4 · Trozado</h2>
    <table class="chain">
      <thead><tr><th>Troza</th><th>Medidas</th><th>Volumen</th><th>Estado</th></tr></thead>
      <tbody>${trozasBody}</tbody>
    </table>
    <h2>5 · Resumen</h2>
    ${resumen}
    <h2>6 · Alertas</h2>
    ${alertasHtml}
    <p class="foot">Impreso el ${esc(fdateKey(limaDateKey(hoy)))}. Cifras reconstruidas desde el Libro TH; no reemplazan el registro oficial en el SNIFFS.</p>
    ${eudrSignatureBlock("Regente forestal (firma y sello)", "Recepción · ARFFS / OSINFOR")}
    </section>
  `;
}

const HOJA_CSS = `
  ${PASAPORTE_CSS}
  table.kv th.hk { width: 230px; background: #f1f5f9; font-size: 11px; }
  table.kv td { font-size: 12.5px; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
`;

/** Abre la ventana en el MISMO clic (después de un `await` el navegador la bloquea: ADR-436). */
function abrirVentana(): Window | null {
  if (typeof window === "undefined") return null;
  const w = window.open("", "_blank", "width=980,height=760");
  w?.document.write("<!doctype html><title>Generando…</title><p style='font:14px system-ui;padding:24px'>Generando la hoja del árbol…</p>");
  return w;
}

export async function printHojaArbol(fila: TraceFila, caratula?: PasaporteCaratula | null): Promise<void> {
  const ventana = abrirVentana();
  const qr = await qrDe(fila.tree);
  openCtpReport({ title: `Hoja del árbol · ${fila.tree}`, css: HOJA_CSS, body: hojaArbolHtml(fila, caratula, { qr }), ventana });
}

/** N hojas en un solo documento, una por página (para la selección múltiple). */
export async function printHojasArbol(filas: TraceFila[], caratula?: PasaporteCaratula | null): Promise<number> {
  if (filas.length === 0) return 0;
  const ventana = abrirVentana();
  const qrs = await Promise.all(filas.map((f) => qrDe(f.tree)));
  openCtpReport({
    title: `Hojas de árbol · ${filas.length}`,
    css: HOJA_CSS,
    body: filas.map((f, i) => hojaArbolHtml(f, caratula, { qr: qrs[i] })).join(""),
    ventana,
  });
  return filas.length;
}
