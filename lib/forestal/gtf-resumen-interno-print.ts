/**
 * gtf-resumen-interno-print — la hoja A4 del «Resumen interno» de una GTF
 * (Brandon 08-10): minimalista, negro y grises, una raya fina, sin fondos.
 * NO es la guía: no lleva casilleros de SERFOR ni se presenta a nadie; es lo
 * que el titular guarda para saber qué salió, si cuadra, dónde está cada troza
 * y cuánto le queda al permiso (R1-R4, `gtf-resumen-interno`).
 *
 * Usa el armazón de papel del libro (`ctp-documento-print`): misma cabecera,
 * mismo pie corrido, mismo visor. Todo texto que viene de la base pasa por
 * `esc()`; el QR es SVG nuestro (sigue el patrón de verificación interna de
 * siempre, `BSM-GTF|N:…`) y va tal cual.
 *
 * PURO: sin React, sin fetch, sin DOM.
 */

import { cabeceraDoc, documentoHtml, esc, notaDoc, resumenDoc, seccionDoc, tituloDoc, type FichaResumen } from "./ctp-documento-print";
import { fmtM3 } from "./cubicacion-formato";
import { urlVerificarGuiaLoth } from "../tenant-url-publica";
import type { CuadreR2, EstadoTrozaHoy, FilaR1, Rango, ResumenInterno } from "./gtf-resumen-interno";

/** Lo que la hoja necesita de la guía, además del resumen ya calculado. */
export interface GuiaDelResumenImpreso {
  gtfNumber: string;
  gtfDate: string | null;
  titular: string | null;
  /** Código del permiso (título habilitante o registro de plantación). */
  permiso: string | null;
  /** N° de la Lista de trozas que trae la guía (35), si la trae. */
  listaTrozasNro: string | null;
  destino: string | null;
  anulada: string | null;
}

/** Lo mismo que `DocumentoImprimible` del visor (estructural: la lib no importa componentes). */
export interface HojaResumenInterno {
  nombre: string;
  etiqueta: string;
  archivo: string;
  html: string;
  pieCorrido: string;
}

const dia = (iso: string | null | undefined): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};
const m3 = (v: number | null | undefined): string => (v == null ? "—" : fmtM3(v));
const cm = (m: number): string => (m * 100).toFixed(1);
const met = (v: number | null | undefined): string => (v == null ? "—" : v.toFixed(2));
const signo = (v: number): string => (v > 0 ? `+${fmtM3(v)}` : fmtM3(v));
const rango = (r: Rango | null, f: (v: number) => string): string => (r ? `${f(r.min)} · ${f(r.prom)} · ${f(r.max)}` : "—");

const CSS_RESUMEN = `
  .ri-qr { float:right; width:24mm; margin:0 0 2mm 4mm; text-align:center; font-size:6pt; color:var(--gris-suave); }
  .ri-qr svg { width:22mm; height:22mm; display:block; margin:0 auto .5mm; }
  table.ri { width:100%; border-collapse:collapse; margin:1mm 0 2.6mm; font-size:7.4pt; font-variant-numeric:tabular-nums; }
  table.ri th { text-align:left; font-weight:bold; font-size:6.4pt; letter-spacing:.4pt; text-transform:uppercase; color:var(--gris);
                border-bottom:.5pt solid var(--linea); padding:.7mm 1.4mm .7mm 0; }
  table.ri td { padding:.6mm 1.4mm .6mm 0; border-bottom:.4pt solid var(--linea-suave); vertical-align:top; }
  table.ri .r { text-align:right; }
  table.ri .m { font-family:"Courier New",Courier,monospace; }
  table.ri tfoot td { font-weight:bold; border-bottom:none; border-top:.5pt solid var(--linea); }
  table.ri tr { break-inside:avoid; }
  .ri-dif { font-weight:bold; }
`;

function tablaR1(titulo: string, filas: readonly FilaR1[], total: FilaR1): string {
  const fila = (f: FilaR1) =>
    `<tr><td>${esc(f.clave)}</td><td class="r">${f.trozas}</td><td class="r">${m3(f.m3)}</td><td class="r">${esc(rango(f.diametro, cm))}</td><td class="r">${esc(rango(f.largo, (v) => v.toFixed(2)))}</td></tr>`;
  return `<table class="ri"><thead><tr><th>${esc(titulo)}</th><th class="r">Trozas</th><th class="r">m³</th><th class="r">Ø cm (mín · prom · máx)</th><th class="r">Largo m (mín · prom · máx)</th></tr></thead>
  <tbody>${filas.map(fila).join("")}</tbody>
  <tfoot>${fila(total)}</tfoot></table>`;
}

function tablaR2(c: CuadreR2): string {
  const dif = (d: number | null) => (d == null ? "—" : Math.abs(d) < 0.001 ? "0" : signo(d));
  const difT = (d: number | null) => (d == null ? "—" : d === 0 ? "0" : d > 0 ? `+${d}` : String(d));
  const fuente = c.declarado.fuente === "serfor" ? "Declara la guía (ficha de SERFOR)" : "Declara la guía (su registro)";
  return `<table class="ri"><thead><tr><th></th><th class="r">Trozas</th><th class="r">m³</th><th class="r">Dif. trozas</th><th class="r">Dif. m³</th></tr></thead><tbody>
    <tr><td>${esc(fuente)}</td><td class="r">${c.declarado.trozas ?? "—"}</td><td class="r">${m3(c.declarado.m3)}</td><td class="r">—</td><td class="r">—</td></tr>
    <tr><td>Suma de sus trozas</td><td class="r">${c.suma.trozas}</td><td class="r">${m3(c.suma.m3)}</td><td class="r ri-dif">${difT(c.difSumaTrozas)}</td><td class="r ri-dif">${dif(c.difSumaM3)}</td></tr>
    <tr><td>Libro TH (despacho, medido con su trozado)${c.libro.sinMedida > 0 ? ` · ${c.libro.sinMedida} sin medida` : ""}</td><td class="r">${c.libro.trozas}</td><td class="r">${m3(c.libro.m3)}</td><td class="r ri-dif">${difT(c.difLibroTrozas)}</td><td class="r ri-dif">${dif(c.difLibroM3)}</td></tr>
  </tbody></table>`;
}

const ESTADO: Record<EstadoTrozaHoy, string> = {
  aserrada: "Aserrada",
  salio_entera: "Salió entera del CTP",
  recibida: "Recibida en el CTP",
  despachada: "Despachada",
  sin_despacho: "Sin despacho en el libro",
};

/**
 * La hoja entera. `qrSvg` = el SVG ya armado (el llamador lo genera con
 * `qrcode`, que es asíncrono); vacío = sin QR.
 */
export function hojaResumenInterno(g: GuiaDelResumenImpreso, r: ResumenInterno, qrSvg = ""): HojaResumenInterno {
  const numero = g.gtfNumber;
  const d = r.donde;
  const fichas: FichaResumen[] = [
    { k: "Trozas", v: String(r.totalR1.trozas) },
    { k: "Volumen", v: m3(r.totalR1.m3), u: "m³" },
    { k: "Cuadre", v: r.cuadre.cuadra ? "Cuadra" : "Revisar", tono: r.cuadre.cuadra ? undefined : "aviso" },
    { k: "En el CTP", v: d.conCtp ? `${d.recibidas} de ${d.filas.length}` : "Sin dato" },
    ...(r.saldo ? [{ k: "Saldo del permiso", v: m3(r.saldo.saldoDespues), u: "m³", tono: r.saldo.saldoDespues < 0 ? ("mal" as const) : undefined }] : []),
  ];

  const filasR3 = d.filas
    .map(
      (f) => `<tr><td class="r">${f.n}</td><td class="m">${esc(f.codigoGuia)}</td><td class="m">${esc(f.codigo)}</td><td>${esc(f.arbol ?? "—")}</td><td>${esc(f.especie ?? "—")}</td>
      <td class="r">${met(f.d1M)}</td><td class="r">${met(f.d2M)}</td><td class="r">${met(f.largoM)}</td><td class="r">${m3(f.m3)}</td>
      <td>${esc(ESTADO[f.estado])}</td><td class="r">${dia(f.despachada)}</td><td class="r">${dia(f.recibida)}</td><td class="r">${dia(f.aserrada ?? f.salioEntera)}</td></tr>`,
    )
    .join("");

  const s = r.saldo;
  const r4 = s
    ? `<table class="ri"><thead><tr><th></th><th class="r">m³</th></tr></thead><tbody>
        <tr><td>Autorizado del permiso</td><td class="r">${m3(s.autorizado)}</td></tr>
        <tr><td>Movilizado antes de esta guía</td><td class="r">${m3(s.antes)}</td></tr>
        <tr><td><b>Saldo antes</b></td><td class="r"><b>${m3(s.saldoAntes)}</b></td></tr>
        <tr><td>Esta guía${s.estaDesdeLaGuia ? " (suma de sus trozas: el libro no la tiene)" : " (libro)"}</td><td class="r">${m3(s.estaGuia)}</td></tr>
        <tr><td><b>Saldo después</b></td><td class="r"><b>${m3(s.saldoDespues)}</b></td></tr>
      </tbody></table>${s.posteriores > 0 ? `<p class="doc-sub">Después salieron ${s.posteriores} guía${s.posteriores === 1 ? "" : "s"} más del mismo permiso: no entran en este saldo.</p>` : ""}`
    : `<p class="doc-sub">Sin saldo: la guía no está atada a un permiso con volumen autorizado.</p>`;

  const cuerpo = `
    ${cabeceraDoc({
      emisor: g.titular?.trim() || "Titular del permiso",
      meta: [g.permiso ? `Permiso ${g.permiso}` : "", g.destino ? `Destino: ${g.destino}` : ""],
      tipo: "Resumen interno de la GTF",
      numero,
      numeroNota: `Emitida el ${dia(g.gtfDate)}${g.listaTrozasNro ? ` · Lista de trozas N° ${g.listaTrozasNro}` : ""}`,
    })}
    ${qrSvg ? `<div class="ri-qr">${qrSvg}ver trozas</div>` : ""}
    ${tituloDoc("Resumen interno", "Documento de gestión del titular · no reemplaza a la GTF ni a su lista de trozas")}
    ${g.anulada ? `<p class="doc-sello rojo">GUÍA ANULADA<i>${esc(g.anulada)}</i></p>` : ""}
    ${resumenDoc(fichas)}
    ${seccionDoc("R1 · Por especie y por árbol", "Ø = promedio de las dos puntas")}
    ${tablaR1("Especie", r.porEspecie, r.totalR1)}
    ${tablaR1("Árbol", r.porArbol, r.totalR1)}
    ${seccionDoc("R2 · Cuadre", "Lo que declara la guía · la suma de sus trozas · el libro")}
    ${tablaR2(r.cuadre)}
    ${seccionDoc("R3 · Dónde está cada troza hoy", d.conCtp ? `${d.despachadas} despachadas · ${d.recibidas} recibidas · ${d.aserradas} aserradas` : "Sin datos del Libro CTP")}
    <table class="ri"><thead><tr><th class="r">N°</th><th>Código en la guía</th><th>Código único</th><th>Árbol</th><th>Especie</th>
      <th class="r">D1 m</th><th class="r">D2 m</th><th class="r">L m</th><th class="r">m³</th><th>Hoy</th><th class="r">Despacho</th><th class="r">Recibida</th><th class="r">Aserrada</th></tr></thead>
      <tbody>${filasR3}</tbody></table>
    ${seccionDoc("R4 · Saldo del permiso", g.permiso ?? "")}
    ${r4}
    ${notaDoc("Cifras del Libro TH y del Libro CTP al momento de imprimir. Los m³ de cada despacho son los de su línea de Trozado.")}
  `;
  const pieCorrido = `Resumen interno · GTF ${numero}`;
  return {
    nombre: "Resumen interno",
    etiqueta: `R1-R4 · ${r.totalR1.trozas} trozas`,
    archivo: `Resumen interno GTF ${numero}`,
    pieCorrido,
    html: documentoHtml({ titulo: `Resumen interno GTF ${numero}`, css: CSS_RESUMEN, cuerpo, pieCorrido }),
  };
}

/** La cadena del QR de verificación interna: el MISMO patrón que la hoja de siempre. */
export function qrResumenInterno(g: { gtfNumber: string; titularName: string | null; tituloHabilitante: string | null; gtfDate: string | null }, volumenM3: number): string {
  return `BSM-GTF|N:${g.gtfNumber}|TIT:${g.titularName ?? ""}|TH:${g.tituloHabilitante ?? ""}|VOL:${volumenM3.toFixed(4)}m3|F:${dia(g.gtfDate)}`;
}

/**
 * Lo que lleva el QR de la hoja (08-10): con la guía ya despachada en el Libro y
 * la base pública del negocio, la dirección de la lista pública de la guía
 * (`/verificar/guia/<línea>`, sin DNI ni teléfonos), la misma que la hoja de
 * despacho; si no hay línea o no llegó la base, la cadena de verificación
 * interna de siempre (jamás una dirección armada con el origin del navegador).
 */
export function contenidoQrResumen(
  g: Parameters<typeof qrResumenInterno>[0],
  volumenM3: number,
  publico: { base: string | null; lineaDespachoId: string | null },
): string {
  if (publico.base && publico.lineaDespachoId) return urlVerificarGuiaLoth(publico.base, publico.lineaDespachoId);
  return qrResumenInterno(g, volumenM3);
}
