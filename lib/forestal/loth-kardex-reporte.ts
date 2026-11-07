/**
 * Lo que sale del Kárdex del permiso hacia afuera: el Excel y el reporte
 * impreso. Leen el MISMO `KardexPermiso` que pinta la pantalla.
 *
 * Excel: los m³ van como número (para que Excel sume) y todo texto que viene
 * del libro pasa por `celdaTexto` — un código o una observación que empiece con
 * `=`, `+`, `-` o `@` se abriría como fórmula.
 *
 * Impreso: HTML armado a mano en una ventana del mismo origen; TODO texto pasa
 * por `esc()` y `openCtpReport` le pone una CSP sin script.
 *
 * PURO: sin React, sin fetch, sin `window`.
 */

import type { HojaExcel } from "@/lib/export-excel";
import { formatDateNumeric } from "@/lib/format";
import { esc } from "./ctp-print-shared";
import { fmtM3 } from "./cubicacion-formato";
import {
  MOVIMIENTO_KARDEX,
  cierreDelKardex,
  filasDelKardex,
  resumirKardex,
  saldoDeFila,
  saldoInicial,
  type CuadreKardex,
  type FilaKardex,
  type KardexPermiso,
} from "./loth-kardex";
import type { CascadaEspecie } from "./loth-saldo-cascada";
import type { BandaPermiso } from "./loth-tablero-permiso";
import { etiquetaPermiso, fechaConDia } from "./loth-tablero-reporte";

export interface DatosKardex {
  kardex: KardexPermiso;
  permiso: BandaPermiso;
  /** La especie que se mira (clave); `null` = el permiso entero. */
  especie: string | null;
  /** Cómo cuadra con «Volumen del permiso»; `null` = no hay contra qué (sin registro). */
  cuadre: CuadreKardex | null;
  hoyKey: string;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Un texto del libro en una celda: lo que Excel leería como fórmula va como texto. */
export function celdaTexto(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/** «jueves 28/05»; con el año si no es el de hoy («jueves 28/05/2025»). */
export function fechaKardex(dia: string | null, hoyKey: string): string {
  if (!dia) return "—";
  const corta = fechaConDia(dia);
  return dia.slice(0, 4) === hoyKey.slice(0, 4) ? corta : `${corta}/${dia.slice(0, 4)}`;
}

/** «Tala N° 3», «Despacho N° 12». */
export function documentoDeFila(f: Pick<FilaKardex, "movimiento" | "lineNo">): string {
  return `${MOVIMIENTO_KARDEX[f.movimiento].label} N° ${f.lineNo}`;
}

/** Lo que se dice de una fila además de sus cifras (avisos, sin plan, fuera del registro, anulación). */
export function notasDeFila(f: FilaKardex, sinBase: boolean): string[] {
  const n: string[] = [];
  if (f.anulada) n.push(f.motivoAnulacion ? `Anulada: ${f.motivoAnulacion}` : "Anulada: no cuenta");
  if (f.sinPlan) n.push("Línea sin plan: cuenta en todos los permisos");
  if (!f.anulada && f.clave && !f.delRegistro && !sinBase)
    n.push("La especie no está en el registro: no suma al saldo del permiso");
  return [...n, ...f.avisos];
}

const nombreBase = (p: BandaPermiso) => p.baseLabel;
const nombreDeEspecie = (d: DatosKardex) =>
  d.especie == null
    ? null
    : (d.kardex.especies.find((e) => e.clave === d.especie)?.nombre ?? d.especie);

// ─── Excel ──────────────────────────────────────────────────────────────────

/** Sin especies en el registro no hay base: «por talar» sería −talado, que no dice nada. */
function filaSaldo(s: CascadaEspecie | null, sinBase: boolean): Record<string, unknown> {
  return {
    "Por talar m³": s && !sinBase ? r3(s.enPieM3) : "",
    "Talado sin trozar m³": s ? r3(s.taladoSinTrozarM3) : "",
    "En patio m³": s ? r3(s.enPatioM3) : "",
  };
}

/** Una fila de la hoja «Kárdex». */
export function filaExcelKardex(
  f: FilaKardex,
  d: Pick<DatosKardex, "especie" | "kardex">,
): Record<string, unknown> {
  return {
    Fecha: f.dia ? formatDateNumeric(f.dia, { soloFecha: true }) : "",
    Movimiento: MOVIMIENTO_KARDEX[f.movimiento].label,
    Estado: f.anulada ? "Anulada" : "Vigente",
    Documento: documentoDeFila(f),
    GTF: celdaTexto(f.gtf),
    Especie: celdaTexto(f.especie),
    Árbol: celdaTexto(f.arbol),
    Troza: celdaTexto(f.troza),
    "m³ del movimiento": f.m3 != null ? r3(f.m3) : celdaTexto(f.cantidad),
    /* Anulada: sin entra/sale, para que sumar la columna en Excel no la cuente. */
    "Entra m³": f.entraM3 != null && !f.anulada ? r3(f.entraM3) : "",
    "Sale m³": f.saleM3 != null && !f.anulada ? r3(f.saleM3) : "",
    ...filaSaldo(saldoDeFila(f, d.especie), d.kardex.sinBase),
    Observación: celdaTexto(notasDeFila(f, d.kardex.sinBase).join(" · ")),
  };
}

function filaCierre(
  e: CascadaEspecie,
  base: string,
  delRegistro: boolean,
  sinBase: boolean,
): Record<string, unknown> {
  return {
    Especie: celdaTexto(e.especie),
    [`${base} m³`]: r3(e.baseM3),
    "Talado m³": r3(e.taladoM3),
    "Por talar m³": delRegistro && !sinBase ? r3(e.enPieM3) : "",
    "Talado sin trozar m³": r3(e.taladoSinTrozarM3),
    "En patio m³": r3(e.enPatioM3),
    "Despachado m³": r3(e.despachadoM3),
    "Consumido en el TH m³": r3(e.consumidoM3),
    "En el registro": delRegistro ? "Sí" : "No: no suma al permiso",
  };
}

/** Las hojas: Kárdex (con saldo inicial y cierre), Cierre por especie y Permiso. */
export function hojasDelKardex(d: DatosKardex): HojaExcel[] {
  const { kardex: k, permiso: p } = d;
  const filas = filasDelKardex(k, d.especie);
  const r = resumirKardex(filas, d.especie);
  const inicial = saldoInicial(k, d.especie);
  const cierre = cierreDelKardex(k, d.especie);
  const vacia = (
    concepto: string,
    s: CascadaEspecie | null,
    entra: number | "",
    sale: number | "",
  ) => ({
    Fecha: "",
    Movimiento: concepto,
    Estado: "",
    Documento: "",
    GTF: "",
    Especie: celdaTexto(nombreDeEspecie(d) ?? "Todas las del registro"),
    Árbol: "",
    Troza: "",
    "m³ del movimiento": "",
    "Entra m³": entra,
    "Sale m³": sale,
    ...filaSaldo(s, k.sinBase),
    Observación: "",
  });
  const hoja = [
    vacia(`Saldo inicial (${nombreBase(p).toLowerCase()})`, inicial, "", ""),
    ...filas.map((f) => filaExcelKardex(f, d)),
    vacia("Cierre", cierre, r3(r.entraM3), r3(r.saleM3)),
  ];
  const base = nombreBase(p);
  const porEspecie = [
    ...k.cierre.especies.map((e) => filaCierre(e, base, true, k.sinBase)),
    ...k.fueraDelRegistro.map((e) => filaCierre(e, base, false, k.sinBase)),
    filaCierre(k.cierre.total, base, true, k.sinBase),
  ];
  const nombreEsp = nombreDeEspecie(d);
  const permiso: Record<string, unknown>[] = [
    { Campo: "Permiso", Valor: celdaTexto(etiquetaPermiso(p)) },
    { Campo: "Título habilitante", Valor: celdaTexto(p.tituloHabilitante) },
    { Campo: "Titular", Valor: celdaTexto(p.titular) },
    { Campo: "Especie", Valor: celdaTexto(nombreEsp ?? "Todas") },
    { Campo: "Movimientos", Valor: r.movimientos },
    { Campo: "Anulados (no cuentan)", Valor: r.anulados },
    {
      Campo: "Cuadra con «Volumen del permiso»",
      Valor:
        d.cuadre == null
          ? "Sin registro: no hay contra qué cuadrar"
          : d.cuadre.cuadra
            ? "Sí"
            : `No: ${d.cuadre.diferencias.length} diferencias`,
    },
    { Campo: "Exportado el", Valor: formatDateNumeric(d.hoyKey, { soloFecha: true }) },
  ];
  return [
    { nombre: "Kárdex", filas: hoja },
    { nombre: "Cierre por especie", filas: porEspecie },
    { nombre: "Permiso", filas: permiso },
  ];
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** «kardex-po-12-tornillo-2026-10-02». */
export function nombreArchivoKardex(
  d: Pick<DatosKardex, "permiso" | "especie" | "kardex" | "hoyKey">,
): string {
  const esp = nombreDeEspecie(d as DatosKardex);
  return ["kardex", slug(d.permiso.nombre) || "permiso", esp ? slug(esp) : "", d.hoyKey]
    .filter(Boolean)
    .join("-");
}

// ─── Reporte impreso ────────────────────────────────────────────────────────

/* Colores del papel: los tokens del panel no resuelven en la ventana de impresión. */
export const CSS_KARDEX = `
  body{max-width:1120px}
  td,th{padding:6px 7px;font-size:12px}
  .anulada td{color:#8a8f8c}
  .anulada td.tachar{text-decoration:line-through}
  .tot td{font-weight:700;background:#eef4f0}
  .ini td{font-style:italic;background:#f5f8f6}
  .chip{display:inline-block;font-size:10.5px;font-weight:700;border-radius:6px;padding:0 6px;border:1px solid #cfd8d3;color:#3d4a43;white-space:nowrap}
  .nota{display:block;color:#9a4b00;font-size:11px}
  .ok{color:#0f5132;font-weight:700} .mal{color:#a61b1b;font-weight:700}
`;

const n3 = (v: number | null | undefined) => (v == null ? "—" : fmtM3(v));

/** El kárdex para imprimir o guardar como PDF. */
export function htmlKardex(d: DatosKardex): { title: string; css: string; body: string } {
  const { kardex: k, permiso: p } = d;
  const filas = filasDelKardex(k, d.especie);
  const r = resumirKardex(filas, d.especie);
  const inicial = saldoInicial(k, d.especie);
  const cierre = cierreDelKardex(k, d.especie);
  const nombreEsp = nombreDeEspecie(d);
  const base = nombreBase(p);
  const conPorTalar = !k.sinBase;

  const saldoCeldas = (s: CascadaEspecie | null) =>
    [
      conPorTalar ? `<td class="num">${esc(n3(s?.enPieM3))}</td>` : "",
      `<td class="num">${esc(n3(s?.taladoSinTrozarM3))}</td>`,
      `<td class="num">${esc(n3(s?.enPatioM3))}</td>`,
    ].join("");

  const cuerpo = filas
    .map((f) => {
      const notas = notasDeFila(f, k.sinBase);
      const mov = `<span class="chip">${esc(MOVIMIENTO_KARDEX[f.movimiento].label)}</span>`;
      const det = f.m3 == null && f.cantidad ? `<span class="nota">${esc(f.cantidad)}</span>` : "";
      return `<tr${f.anulada ? ' class="anulada"' : ""}>
        <td>${esc(fechaKardex(f.dia, d.hoyKey))}</td>
        <td class="tachar">${esc(`N° ${f.lineNo}`)}${f.gtf ? `<br>${esc(`GTF ${f.gtf}`)}` : ""}</td>
        <td>${mov}${det}${notas.map((x) => `<span class="nota">${esc(x)}</span>`).join("")}</td>
        <td>${esc(f.especie ?? "—")}</td>
        <td>${esc([f.arbol, f.troza].filter(Boolean).join(" · ") || "—")}</td>
        <td class="num tachar">${esc(n3(f.entraM3))}</td>
        <td class="num tachar">${esc(n3(f.saleM3))}</td>
        ${f.anulada ? `<td colspan="${conPorTalar ? 3 : 2}" class="num">no cuenta</td>` : saldoCeldas(saldoDeFila(f, d.especie))}
      </tr>`;
    })
    .join("");

  const cabeza = [
    "Fecha",
    "Documento",
    "Movimiento",
    "Especie",
    "Árbol · troza",
    "Entra m³",
    "Sale m³",
    ...(conPorTalar ? ["Por talar"] : []),
    "Sin trozar (monte)",
    "En patio",
  ];
  const tablaKardex = `<table><thead><tr>${cabeza.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>
    <tr class="ini"><td colspan="5">${esc(`Saldo inicial · ${base.toLowerCase()} del permiso`)}</td><td class="num">—</td><td class="num">—</td>${saldoCeldas(inicial)}</tr>
    ${cuerpo}
    <tr class="tot"><td colspan="5">${esc("Cierre")}</td><td class="num">${esc(fmtM3(r.entraM3))}</td><td class="num">${esc(fmtM3(r.saleM3))}</td>${saldoCeldas(cierre)}</tr>
  </tbody></table>`;

  const cierreEsp = [...k.cierre.especies, ...k.fueraDelRegistro, k.cierre.total]
    .map(
      (e) =>
        `<tr${e === k.cierre.total ? ' class="tot"' : ""}><td>${esc(e.especie)}${k.fueraDelRegistro.includes(e) ? ` <span class="chip">${esc("fuera del registro")}</span>` : ""}</td>${[
          e.baseM3,
          e.taladoM3,
          e.enPieM3,
          e.taladoSinTrozarM3,
          e.enPatioM3,
          e.despachadoM3,
          e.consumidoM3,
        ]
          .map((v, i) =>
            /* «Por talar» de una especie fuera del registro (o sin registro) sería −talado: no se imprime. */
            i === 2 && (k.sinBase || k.fueraDelRegistro.includes(e))
              ? `<td class="num">—</td>`
              : `<td class="num">${esc(fmtM3(v))}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
  const tablaCierre = `<table><thead><tr>${[
    "Especie",
    `${base} m³`,
    "Talado",
    "Por talar",
    "Sin trozar",
    "En patio",
    "Despachado",
    "Consumido",
  ]
    .map((h) => `<th>${esc(h)}</th>`)
    .join("")}</tr></thead><tbody>${cierreEsp}</tbody></table>`;

  const cuadre =
    d.cuadre == null
      ? `<p class="muted">${esc("El permiso no tiene especies en su registro: no hay saldo por talar contra qué cuadrar.")}</p>`
      : d.cuadre.cuadra
        ? `<p class="ok">${esc("Cuadra con «Volumen del permiso».")}</p>`
        : `<p class="mal">${esc(`No cuadra con «Volumen del permiso»: ${d.cuadre.diferencias.map((x) => `${x.especie} ${x.campo} ${fmtM3(x.kardexM3)} vs ${fmtM3(x.franjaM3)}`).join("; ")}`)}</p>`;

  const dato = (kk: string, v: string | null | undefined) =>
    v && v.trim() ? `<div><span class="k">${esc(kk)}</span> ${esc(v)}</div>` : "";
  const body = `
    <h1>Kárdex del permiso</h1>
    <p class="sub">${esc(etiquetaPermiso(p))}${nombreEsp ? esc(` · ${nombreEsp}`) : ""} · Libro de Operaciones de Títulos Habilitantes</p>
    <div class="id">
      ${dato("Título habilitante:", p.tituloHabilitante)}
      ${dato("Titular:", p.titular)}
      ${dato(p.esPlantacion ? "Registro / resolución:" : "Resolución:", p.resolucion)}
      ${dato(`${base}:`, `${fmtM3(inicial.baseM3)} m³`)}
      ${dato("Movimientos:", `${r.movimientos} vigentes · ${r.anulados} anulados`)}
      ${dato("Fecha del reporte:", `${fechaConDia(d.hoyKey)} (${formatDateNumeric(d.hoyKey, { soloFecha: true })})`)}
    </div>
    <h2>Movimientos</h2>
    ${tablaKardex}
    ${cuadre}
    <h2>Cierre por especie</h2>
    ${tablaCierre}
    <div class="firma"><div>Titular o regente forestal</div><div>Supervisión</div></div>
    <p class="foot">${esc(
      "Entra = la tala (madera que pasa al monte); Sale = el despacho de trozas y el consumo dentro del TH; el trozado no entra ni sale: pasa del monte al patio. Por talar = base − talado; Sin trozar = talado − trozado; En patio = trozado − despachado como troza − consumido. Las líneas anuladas no cuentan. Fuente: secciones Tala, Trozado, Despacho y Consumo del Libro de Operaciones (RDE 264-2019-MINAGRI-SERFOR-DE).",
    )}</p>
  `;
  return {
    title: `Kárdex del permiso · ${p.nombre}${nombreEsp ? ` · ${nombreEsp}` : ""}`,
    css: CSS_KARDEX,
    body,
  };
}
