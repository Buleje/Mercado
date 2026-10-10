/**
 * Lo que sale del Control del permiso hacia afuera (ADR-459): el Excel, el
 * resumen por WhatsApp y el reporte impreso para supervisión.
 *
 * Los tres leen el MISMO paquete (`DatosControl`), armado por la pantalla con
 * lo que ya muestra: el Excel no puede decir otra cifra que la tarjeta.
 *
 * El reporte impreso es HTML armado a mano en una ventana del mismo origen:
 * TODO texto pasa por `esc()` (en 29-09 un reporte impreso con
 * `document.write` fue XSS del cajero) y `openCtpReport` además le pone una
 * CSP sin script.
 *
 * PURO salvo los tipos: sin React, sin fetch, sin `window`.
 */

import type { HojaExcel } from "@/lib/export-excel";
import { formatDateNumeric, formatDateShort } from "@/lib/format";
import { fmtM3 } from "./cubicacion-formato";
import { esc } from "./ctp-print-shared";
import type { CascadaEspecie, CascadaPlan } from "./loth-saldo-cascada";
import type { BandaPermiso } from "./loth-tablero-permiso";
import {
  ESTADOS_META,
  UMBRAL_PATIO_DIAS,
  antiguedadEnPatio,
  diaDelLibro,
  type AntiguedadPatio,
  type ResumenEstado,
  type ResumenViejas,
  type TrozaTablero,
} from "./loth-tablero-trozas";

export interface DatosControl {
  /** El permiso elegido; `null` = «Todos los permisos». */
  permiso: BandaPermiso | null;
  /** Con «Todos»: de quién es el libro (carátula). */
  libro?: { tituloHabilitante?: string | null; titular?: string | null } | null;
  /** Las trozas del permiso (sin los filtros de la tabla). */
  filas: readonly TrozaTablero[];
  resumen: readonly ResumenEstado[];
  viejas: ResumenViejas;
  /** La cascada del volumen; `null` con «Todos» o si no hay especies. */
  cascada: CascadaPlan | null;
  /** Hoy en Pucallpa, `YYYY-MM-DD`. */
  hoyKey: string;
  /** El nombre del permiso de una troza (columna «Permiso» con «Todos»). */
  nombrePlanDe?: (planId: string | null) => string;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

/** «jueves 02/10» — la fecha como la dice Brandon (días escritos a mano: Intl cambia por ICU). */
export function fechaConDia(key: string): string {
  const d = new Date(`${key}T12:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return key;
  return `${DIAS[d.getUTCDay()]} ${key.slice(8, 10)}/${key.slice(5, 7)}`;
}

/** Despachadas con salida fechada hoy. */
export function despachadasHoy(filas: readonly TrozaTablero[], hoyKey: string): TrozaTablero[] {
  return filas.filter((f) => f.estado === "despachada" && diaDelLibro(f.fechaSalida) === hoyKey);
}

const nombreDelControl = (d: Pick<DatosControl, "permiso">) => d.permiso?.nombre ?? "Todos los permisos";

/** «PO · PO 12» repite el tipo: si el código ya lo trae, va solo. */
export function etiquetaPermiso(p: Pick<BandaPermiso, "tipo" | "nombre"> | null): string {
  if (!p) return "Todos los permisos";
  return p.nombre.toUpperCase().startsWith(p.tipo.toUpperCase()) ? p.nombre : `${p.tipo} · ${p.nombre}`;
}

/** «Faltan 104 días · al 14 ene. 2027». */
const vigenciaCorta = (p: BandaPermiso) => [p.vigencia.texto, p.vigencia.hasta ? `al ${p.vigencia.hasta}` : null].filter(Boolean).join(" · ");

// ─── Excel ──────────────────────────────────────────────────────────────────

/** Una fila de la hoja «Trozas»: números como número, para que Excel sume. */
export function filaExcelDeTroza(f: TrozaTablero, nombrePlanDe?: (planId: string | null) => string): Record<string, unknown> {
  const salida = diaDelLibro(f.fechaSalida);
  return {
    "Cód. troza": f.code,
    Árbol: f.treeCode ?? "",
    Especie: f.especie ?? "",
    "Volumen m³": f.volumenM3 != null ? r3(f.volumenM3) : "",
    Estado: ESTADOS_META[f.estado].label,
    "Trozada el": f.diaTrozado ? formatDateNumeric(f.diaTrozado, { soloFecha: true }) : "",
    "Días en patio": f.diasEnPatio ?? "",
    Antigüedad:
      antiguedadEnPatio(f) === "critico"
        ? `Más de ${UMBRAL_PATIO_DIAS.critico} días`
        : antiguedadEnPatio(f) === "atencion"
          ? `Más de ${UMBRAL_PATIO_DIAS.atencion} días`
          : "",
    GTF: f.gtf ?? "",
    "Salió el": salida ? formatDateNumeric(salida, { soloFecha: true }) : "",
    ...(nombrePlanDe ? { Permiso: nombrePlanDe(f.planId) } : {}),
    CITES: f.cites ? "Sí" : "",
  };
}

function filaCascada(e: CascadaEspecie, base: string): Record<string, unknown> {
  return {
    Especie: e.especie,
    [`${base} m³`]: r3(e.baseM3),
    "Talado m³": r3(e.taladoM3),
    "En pie m³": r3(e.enPieM3),
    "Talado sin trozar m³": r3(e.taladoSinTrozarM3),
    "En patio m³": r3(e.enPatioM3),
    "Despachado m³": r3(e.despachadoM3),
    "Consumido en el TH m³": r3(e.consumidoM3),
    "% talado": e.pctTalado ?? "",
    "Se pasó": e.excedido ? "Sí" : "",
  };
}

/** Las hojas del Excel: Resumen por estado, Trozas, Saldo por especie y Permiso. */
export function hojasDelControl(d: DatosControl): HojaExcel[] {
  const resumen: Record<string, unknown>[] = [
    ...d.resumen.map((r) => ({ Concepto: r.label, Trozas: r.n, "Volumen m³": r3(r.m3), "Sin volumen": r.sinVolumen })),
    {
      Concepto: `En patio hace más de ${UMBRAL_PATIO_DIAS.atencion} días`,
      Trozas: d.viejas.n,
      "Volumen m³": r3(d.viejas.m3),
      "Sin volumen": "",
    },
    {
      Concepto: `   de ésas, más de ${UMBRAL_PATIO_DIAS.critico} días`,
      Trozas: d.viejas.criticas,
      "Volumen m³": "",
      "Sin volumen": "",
    },
  ];
  const base = d.permiso?.baseLabel ?? "Autorizado";
  const saldo = d.cascada
    ? [...d.cascada.especies.map((e) => filaCascada(e, base)), filaCascada(d.cascada.total, base)]
    : [];
  const p = d.permiso;
  const permiso: Record<string, unknown>[] = [
    { Campo: "Permiso", Valor: etiquetaPermiso(p) },
    { Campo: "Título habilitante", Valor: p?.tituloHabilitante ?? d.libro?.tituloHabilitante ?? "" },
    { Campo: "Titular", Valor: p?.titular ?? d.libro?.titular ?? "" },
    { Campo: p?.esPlantacion ? "Registro / resolución" : "Resolución", Valor: p?.resolucion ?? "" },
    { Campo: "Vigencia", Valor: p ? [p.vigencia.texto, p.vigencia.rango].filter(Boolean).join(" · ") : "" },
    { Campo: "Exportado el", Valor: formatDateNumeric(d.hoyKey, { soloFecha: true }) },
  ];
  return [
    { nombre: "Resumen", filas: resumen },
    { nombre: "Trozas", filas: d.filas.map((f) => filaExcelDeTroza(f, d.nombrePlanDe)) },
    { nombre: "Saldo por especie", filas: saldo },
    { nombre: "Permiso", filas: permiso },
  ];
}

/** «control-del-permiso-po-12-2026-10-02». */
export function nombreArchivoControl(nombre: string, hoyKey: string, sufijo = ""): string {
  const slug =
    nombre
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "permiso";
  return `control-del-permiso-${slug}${sufijo ? `-${sufijo}` : ""}-${hoyKey}`;
}

// ─── WhatsApp ───────────────────────────────────────────────────────────────

/**
 * El resumen corto para el grupo de la empresa: lo que el dueño pregunta por
 * teléfono — qué hay en el patio, qué se está quedando viejo, qué salió hoy y
 * cuánto le queda al permiso. `*negrita*` es la de WhatsApp.
 */
export function textoWhatsappControl(d: DatosControl): string {
  const disp = d.resumen.find((r) => r.estado === "disponible");
  const desp = d.resumen.find((r) => r.estado === "despachada");
  const hoy = despachadasHoy(d.filas, d.hoyKey);
  const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
  const titular = d.permiso?.titular ?? d.libro?.titular ?? null;
  const lineas = [
    `*Control del permiso* · ${nombreDelControl(d)}${titular ? ` (${titular})` : ""}`,
    fechaConDia(d.hoyKey),
    `En patio: ${plural(disp?.n ?? 0, "troza", "trozas")} · ${fmtM3(disp?.m3 ?? 0)} m³`,
    d.viejas.n > 0
      ? `Más de ${UMBRAL_PATIO_DIAS.atencion} días en patio: ${d.viejas.n}${d.viejas.criticas > 0 ? ` (${d.viejas.criticas} con más de ${UMBRAL_PATIO_DIAS.critico})` : ""}`
      : null,
    `Despachadas hoy: ${hoy.length}${hoy.length > 0 ? ` · ${fmtM3(hoy.reduce((a, f) => a + (f.volumenM3 ?? 0), 0))} m³` : ""}`,
    `Despachadas en total: ${desp?.n ?? 0} · ${fmtM3(desp?.m3 ?? 0)} m³`,
    d.cascada && d.permiso
      ? `Le queda en pie: ${fmtM3(d.cascada.total.enPieM3)} de ${fmtM3(d.cascada.total.baseM3)} m³ ${d.permiso.esPlantacion ? "registrados" : "autorizados"}`
      : null,
  ];
  return lineas.filter((l): l is string => l != null).join("\n");
}

/** El enlace que abre WhatsApp con el texto listo para elegir el chat. */
export function enlaceWhatsapp(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

// ─── Reporte impreso ────────────────────────────────────────────────────────

/* Colores del papel: los tokens del panel no resuelven en la ventana de
   impresión (mismo criterio que `ctp-print-shared`). */
export const CSS_REPORTE_CONTROL = `
  .chip{display:inline-block;font-size:11px;font-weight:700;border-radius:6px;padding:1px 7px;white-space:nowrap}
  .atencion{background:#fff4e5;color:#9a4b00;border:1px solid #f5c58a}
  .critico{background:#fdecec;color:#a61b1b;border:1px solid #f3b4b4}
  .tot td{font-weight:700;background:#eef4f0}
`;

type Celda = string | { v: string; num?: boolean; cls?: string; chip?: AntiguedadPatio | null };

/** Una fila de tabla; TODO texto pasa por `esc()`. `chip` envuelve el valor en una pastilla de color. */
function filaHtml(celdas: readonly Celda[], clsFila = ""): string {
  return `<tr${clsFila ? ` class="${clsFila}"` : ""}>${celdas
    .map((c) => {
      const x = typeof c === "string" ? { v: c } : c;
      const cls = [x.num ? "num" : "", x.cls ?? ""].filter(Boolean).join(" ");
      const v = x.chip ? `<span class="chip ${x.chip}">${esc(x.v)}</span>` : esc(x.v);
      return `<td${cls ? ` class="${cls}"` : ""}>${v}</td>`;
    })
    .join("")}</tr>`;
}

const tabla = (cabeza: readonly string[], cuerpo: string) =>
  `<table><thead><tr>${cabeza.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${cuerpo}</tbody></table>`;

const dato = (k: string, v: string | null | undefined) =>
  v && v.trim() ? `<div><span class="k">${esc(k)}</span> ${esc(v)}</div>` : "";

/** El reporte de control para supervisión: identidad, estados, volumen y el patio. */
export function htmlReporteControl(d: DatosControl): { title: string; css: string; body: string } {
  const p = d.permiso;
  const identidad = [
    dato("Permiso:", etiquetaPermiso(p)),
    dato("Título habilitante:", p?.tituloHabilitante ?? d.libro?.tituloHabilitante),
    dato("Titular:", p?.titular ?? d.libro?.titular),
    dato(p?.esPlantacion ? "Registro / resolución:" : "Resolución:", p?.resolucion),
    dato("Vigencia:", p ? vigenciaCorta(p) : null),
    dato("Fecha del reporte:", fechaConDia(d.hoyKey) + ` (${formatDateNumeric(d.hoyKey, { soloFecha: true })})`),
  ].join("");

  const estados = tabla(
    ["Estado", "Trozas", "Volumen m³", "Sin volumen"],
    d.resumen.map((r) => filaHtml([r.label, { v: String(r.n), num: true }, { v: fmtM3(r.m3), num: true }, { v: String(r.sinVolumen), num: true }])).join(""),
  );

  const base = p?.baseLabel ?? "Autorizado";
  const volumen = d.cascada
    ? tabla(
        ["Especie", `${base} m³`, "Talado", "En pie", "Sin trozar", "En patio", "Despachado", "Consumido"],
        [...d.cascada.especies, d.cascada.total]
          .map((e) =>
            filaHtml([
              e.especie,
              { v: fmtM3(e.baseM3), num: true },
              { v: fmtM3(e.taladoM3), num: true },
              { v: fmtM3(e.enPieM3), num: true, cls: e.enPieM3 < 0 ? "neg" : "" },
              { v: fmtM3(e.taladoSinTrozarM3), num: true },
              { v: fmtM3(e.enPatioM3), num: true },
              { v: fmtM3(e.despachadoM3), num: true },
              { v: fmtM3(e.consumidoM3), num: true },
            ], e === d.cascada?.total ? "tot" : ""),
          )
          .join(""),
      )
    : "";

  const patio = d.filas.filter((f) => f.estado === "disponible");
  const filasPatio = patio
    .map((f) => {
      const a = antiguedadEnPatio(f);
      const dias = f.diasEnPatio != null ? `${f.diasEnPatio} d` : "—";
      return filaHtml([
        f.code,
        f.treeCode ?? "—",
        f.especie ?? "—",
        { v: f.volumenM3 != null ? fmtM3(f.volumenM3) : "sin medir", num: true },
        f.diaTrozado ? formatDateShort(f.diaTrozado, { soloFecha: true }) : "—",
        { v: dias, num: true, chip: a },
      ]);
    })
    .join("");

  const body = `
    <h1>Control del permiso</h1>
    <p class="sub">${esc(nombreDelControl(d))} · Libro de Operaciones de Títulos Habilitantes</p>
    <div class="id">${identidad}</div>
    <h2>Estado de las trozas</h2>
    ${estados}
    <p class="muted">En patio hace más de ${UMBRAL_PATIO_DIAS.atencion} días: ${esc(String(d.viejas.n))} (${esc(String(d.viejas.criticas))} con más de ${UMBRAL_PATIO_DIAS.critico}).</p>
    ${volumen ? `<h2>Volumen del permiso</h2>${volumen}` : ""}
    <h2>Trozas en el patio (${esc(String(patio.length))})</h2>
    ${patio.length > 0 ? tabla(["Cód. troza", "Árbol", "Especie", "Volumen m³", "Trozada el", "En patio"], filasPatio) : `<p class="muted">No hay trozas en el patio.</p>`}
    <div class="firma"><div>Titular o regente forestal</div><div>Supervisión</div></div>
    <p class="foot">El estado de cada troza se deriva de las secciones Trozado, Despacho y Consumo del Libro de Operaciones (RDE 264-2019-MINAGRI-SERFOR-DE).</p>
  `;
  return { title: `Control del permiso · ${nombreDelControl(d)}`, css: CSS_REPORTE_CONTROL, body };
}
