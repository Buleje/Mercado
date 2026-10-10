/**
 * tramites-relacion-papel — cómo se imprime la «Relación de guías» (ADR-364):
 * el resumen dentro de la carta, el anexo y, si se pide, la hoja aparte con
 * cada troza.
 *
 * Lista de trozas = SÓLO su N° (Brandon 08-10): una línea por guía con el N°
 * de su lista (`listaTrozasNro`). Si la guía no lo trae, va el N° de la GTF,
 * marcado para revisar EN PANTALLA (`marcar`), nunca en el papel. El detalle
 * pieza por pieza sale en una hoja aparte sólo si se pide («con detalle de
 * trozas»): en la carta y en el anexo se leía como una lista interminable.
 *
 * PURO: devuelve HTML escapado; sin DOM. El estilo vive en `tramites-print`.
 */

import { esc } from "./ctp-print-shared";
import { listaDeTrozas, totalesPorEspecie, type FilaGuiaInforme } from "./tramites-relacion-guias";
import { clavePermisoOficio } from "./tramites-permiso";

export interface OpcionesPapelRelacion {
  /** El papel en pantalla (editable): marca lo que hay que revisar. El que se imprime o va al PDF, sin marcas. */
  marcar?: boolean;
  /**
   * El permiso de la carta (ADR-487): ya va en el título, así que la línea
   * «Permiso:» y la columna «Permiso» sólo salen si alguna guía dice OTRO
   * («Incluirlas igual»). Repetirlo en cada fila era ruido.
   */
  permisoDelOficio?: string | null;
}

/** ¿Alguna guía dice un permiso distinto al de la carta? Sin permiso de carta, cualquiera que diga uno cuenta. */
function hayOtroPermiso(filas: FilaGuiaInforme[], permisoDelOficio: string | null | undefined): boolean {
  const delOficio = clavePermisoOficio(permisoDelOficio);
  return filas.some((f) => {
    const k = clavePermisoOficio(f.permiso);
    return k !== null && k !== delOficio;
  });
}

const fmtFechaCorta = (iso: string): string => {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
};

const fmtM3 = (n: number | null): string => (n == null ? "—" : n.toFixed(3));

const unicos = (xs: string[]): string[] => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

const ANULADA = `<span class="anulada">ANULADA</span>`;

/** El N° de la lista de trozas de la guía; el derivado (N° de la GTF) se marca sólo en pantalla. */
function nroLista(f: FilaGuiaInforme, marcar: boolean): string {
  const l = listaDeTrozas(f);
  if (!l) return "—";
  if (!l.derivada || !marcar) return esc(l.nro);
  return `<span class="revisar" title="La guía no trae N° de lista de trozas: va el N° de la GTF. Revísalo.">${esc(l.nro)}</span>`;
}

// ─── Dentro de la carta ──────────────────────────────────────────────────────

/** Una línea por guía: «GTF N° 019-001-0000001 · Lista de trozas: N° 000006». */
function lineaGuia(f: FilaGuiaInforme, marcar: boolean): string {
  const lista = listaDeTrozas(f) ? ` · Lista de trozas: N° ${nroLista(f, marcar)}` : "";
  return `<li>GTF N° ${esc(f.numero.trim() || "—")}${f.anulada ? ` · ${ANULADA}` : ""}${lista}</li>`;
}

function bloqueNumerado(titulo: string, filas: FilaGuiaInforme[], marcar: boolean, permisoDelOficio?: string | null): string {
  const permisos = hayOtroPermiso(filas, permisoDelOficio) ? unicos(filas.map((f) => f.permiso ?? "")) : [];
  return `<p><strong>${esc(titulo)}:</strong></p>
    ${permisos.length ? `<p><strong>Permiso:</strong> ${esc(`${permisos.join(" ; ")}.`)}</p>` : ""}
    ${filas.length ? `<ul class="por-guia">${filas.map((f) => lineaGuia(f, marcar)).join("")}</ul>` : `<p>—</p>`}`;
}

/**
 * El resumen que va DENTRO del cuerpo de la carta (Brandon 2026-08-20): los
 * N° reales agrupados Emitidas/Anuladas, lo primero que lee un fiscalizador.
 * «Emitidas» siempre se ve (con «—» si todavía no hay guías); «Anuladas», sólo
 * si hay alguna.
 */
export function resumenNumeradoHtml(filas: FilaGuiaInforme[], op: OpcionesPapelRelacion = {}): string {
  const marcar = Boolean(op.marcar);
  const emitidas = filas.filter((f) => !f.anulada);
  const anuladas = filas.filter((f) => f.anulada);
  return `${bloqueNumerado("Emitidas", emitidas, marcar, op.permisoDelOficio)}${anuladas.length > 0 ? bloqueNumerado("Anuladas", anuladas, marcar, op.permisoDelOficio) : ""}`;
}

// ─── El anexo ────────────────────────────────────────────────────────────────

interface Columna {
  titulo: string;
  num?: boolean;
  /** Un N° o una fecha no se parte en dos renglones («019-001-» / «0000771» se leía como dos datos). */
  entero?: boolean;
  celda: (f: FilaGuiaInforme, marcar: boolean) => string;
}

const COL: Record<"numero" | "fecha" | "permiso" | "destinatario" | "especie" | "lista" | "cantidad" | "estado" | "motivo", Columna> = {
  numero: { titulo: "N° de GTF", entero: true, celda: (f) => esc(f.numero || "—") },
  fecha: { titulo: "Fecha", entero: true, celda: (f) => esc(fmtFechaCorta(f.fecha)) },
  permiso: { titulo: "Permiso", celda: (f) => esc(f.permiso?.trim() || "—") },
  destinatario: { titulo: "Destinatario", celda: (f) => esc(f.destinatario || "—") },
  especie: { titulo: "Especie / producto", celda: (f) => esc([f.especie, f.producto].filter(Boolean).join(" · ") || "—") },
  lista: { titulo: "Lista de trozas N°", entero: true, celda: (f, marcar) => nroLista(f, marcar) },
  cantidad: {
    titulo: "Cantidad",
    num: true,
    entero: true,
    celda: (f) => (f.cantidad.trim() ? esc(`${f.cantidad} ${/^m3$/i.test(f.unidad.trim()) ? "m³" : f.unidad}`.trim()) : "—"),
  },
  estado: { titulo: "Estado", celda: () => ANULADA },
  motivo: { titulo: "Motivo de anulación", celda: (f) => esc(f.motivo || "—") },
};

function tablaGuias(filas: FilaGuiaInforme[], cols: Columna[], marcar: boolean, vacio: string): string {
  if (filas.length === 0) return vacio ? `<p class="vacio">${esc(vacio)}</p>` : "";
  const clase = (c: Columna) => [c.num ? "num" : "", c.entero ? "nw" : ""].filter(Boolean).join(" ");
  const attr = (c: Columna) => (clase(c) ? ` class="${clase(c)}"` : "");
  const th = cols.map((c) => `<th${c.num ? ` class="num"` : ""}>${esc(c.titulo)}</th>`).join("");
  const filasHtml = filas.map((f) => `<tr>${cols.map((c) => `<td${attr(c)}>${c.celda(f, marcar)}</td>`).join("")}</tr>`).join("");
  return `<table class="tabla-guias"><thead><tr>${th}</tr></thead><tbody>${filasHtml}</tbody></table>`;
}

/**
 * Las columnas de una tabla: «Lista de trozas N°» sólo si alguna fila la trae
 * (las relaciones viejas o manuales salen como antes); «Permiso», sólo si
 * alguna guía dice uno distinto al de la carta (ADR-487).
 */
function columnas(filas: FilaGuiaInforme[], base: Columna[], conPermisoEn: number, conListaEn: number, permisoDelOficio?: string | null): Columna[] {
  const cols = [...base];
  if (filas.some((f) => listaDeTrozas(f))) cols.splice(conListaEn, 0, COL.lista);
  if (hayOtroPermiso(filas, permisoDelOficio)) cols.splice(conPermisoEn, 0, COL.permiso);
  return cols;
}

/** Totales por especie (trozas y m³) con el total al pie: sólo las emitidas, las anuladas no movieron madera. */
function tablaTotales(emitidas: FilaGuiaInforme[]): string {
  const t = totalesPorEspecie(emitidas);
  if (t.guias === 0) return "";
  const filas = t.especies
    .map((e) => `<tr><td>${esc(e.especie)}</td><td class="num">${e.trozas || "—"}</td><td class="num">${fmtM3(e.m3)}</td></tr>`)
    .join("");
  return `<h3>Totales por especie</h3>
    <table class="tabla-guias tabla-totales"><thead><tr><th>Especie</th><th class="num">Trozas</th><th class="num">Volumen (m³)</th></tr></thead>
    <tbody>${filas}</tbody>
    <tfoot><tr><td>Total · ${t.guias} ${t.guias === 1 ? "guía" : "guías"}</td><td class="num">${t.trozas || "—"}</td><td class="num">${fmtM3(t.m3)}</td></tr></tfoot></table>`;
}

/**
 * El anexo: emitidas y anuladas por separado (mezclarlas obligaría a leer una
 * columna extra fila por fila para saber si esa guía todavía vale). Las
 * anuladas dicen «ANULADA» en cada fila; sin color: el papel es en blanco y negro.
 */
export function tablaGuiasHtml(filas: FilaGuiaInforme[], op: OpcionesPapelRelacion = {}): string {
  if (filas.length === 0) return "";
  const marcar = Boolean(op.marcar);
  const emitidas = filas.filter((f) => !f.anulada);
  const anuladas = filas.filter((f) => f.anulada);
  const colsEmitidas = columnas(emitidas, [COL.numero, COL.fecha, COL.destinatario, COL.especie, COL.cantidad], 2, 4, op.permisoDelOficio);
  const colsAnuladas = columnas(anuladas, [COL.numero, COL.fecha, COL.estado, COL.motivo], 2, 2, op.permisoDelOficio);
  const seccionAnuladas = anuladas.length
    ? `<h2>Anexo 2 · Guías anuladas</h2>${tablaGuias(anuladas, colsAnuladas, marcar, "")}`
    : "";
  return `<div class="anexo-guias">
    <h2>Anexo 1 · Guías emitidas</h2>
    ${tablaGuias(emitidas, colsEmitidas, marcar, "Sin guías emitidas declaradas en este período.")}
    ${tablaTotales(emitidas)}
    ${seccionAnuladas}
  </div>`;
}

/** La hoja aparte «con detalle de trozas»: cada troza de cada guía, una por línea. */
export function detalleTrozasHtml(filas: FilaGuiaInforme[]): string {
  if (filas.length === 0) return "";
  const fila = (f: FilaGuiaInforme) => {
    const trozas = f.trozas.trim() ? esc(f.trozas).replace(/\n/g, "<br/>") : `<span class="sin-dato">sin lista cargada</span>`;
    return `<tr><td>${esc(f.numero || "—")}${f.anulada ? `<br/>${ANULADA}` : ""}</td><td>${trozas}</td></tr>`;
  };
  return `<div class="hoja-aparte">
    <h2>Detalle de trozas</h2>
    <table class="tabla-guias tabla-trozas"><thead><tr><th>N° de GTF</th><th>Trozas (código · especie · medidas · volumen)</th></tr></thead>
    <tbody>${filas.map(fila).join("")}</tbody></table>
  </div>`;
}
