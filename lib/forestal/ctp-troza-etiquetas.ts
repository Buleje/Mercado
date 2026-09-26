"use client";

/**
 * ctp-troza-etiquetas — etiquetas QR imprimibles de las trozas del Libro CTP.
 *
 * El Libro de Títulos Habilitantes (`loth-labels.ts`) ya imprime etiquetas con
 * QR para árboles/trozas de ESE libro; el Libro CTP (donde vive el código de
 * planta) no tenía el mismo botón. Se pega en el rollo y, escaneada en la
 * sierra, abre la ficha de esa pieza sin buscarla en la lista.
 *
 * Qué troza entra: la MISMA regla que decide si se puede consumir (T1,
 * `motivoBloqueo` en `consumo-trozas.ts`) — consumida, despachada, no
 * recepcionada, descarte o madre retrozada no está físicamente en el patio
 * para pegarle un papel encima.
 *
 * El QR lleva la ruta corta `/admin/q/<id>` (`ctp-troza-url.ts`): pide sesión
 * (guard de `/admin/*`), así que una etiqueta pegada en el patio no expone
 * datos de la troza a cualquiera que la escanee con el celular.
 *
 * Cuatro formatos (Brandon 26-09: «QR grande + código de barras»):
 *   - `a4-3x7`: stickers de librería 63,5×38,1 mm (Avery L7160), impresora común.
 *   - `rollo-50x30` / `rollo-100x50`: impresora térmica de rollo, una por página.
 *   - `testa-a6`: la cabeza del rollo, para leer el código DE LEJOS en la pila.
 * Todo va en negro: la térmica imprime sólo negro y el QR/barras no toleran gris.
 *
 * PURO salvo `imprimirEtiquetasDeTrozas` (abre una ventana del navegador).
 */

import { motivoBloqueo, type TrozaConsumible } from "./consumo-trozas";
import { formatDateNumeric, formatWeekday } from "@/lib/format";
import { code128Svg } from "./code128";
import { esc, openCtpReport } from "./ctp-print-shared";
import { PARAM_TROZA, TAB_LIBRO_CTP, urlCortaDeTroza } from "./ctp-troza-url";

export { PARAM_TROZA, urlCortaDeTroza };

/** El sticker más común en librerías de Pucallpa (tipo Avery L7160): 3×7 en A4. */
export const ETIQUETAS_COLUMNAS = 3;
export const ETIQUETAS_FILAS = 7;
export const ETIQUETAS_POR_HOJA = ETIQUETAS_COLUMNAS * ETIQUETAS_FILAS;

export type FormatoEtiqueta = "a4-3x7" | "rollo-50x30" | "rollo-100x50" | "testa-a6";

export interface FormatoEtiquetaInfo {
  id: FormatoEtiqueta;
  nombre: string;
  /** Para qué sirve, en una línea (va en la tarjeta del modal). */
  uso: string;
  anchoMm: number;
  altoMm: number;
  /** Lado del QR impreso. */
  qrMm: number;
  /** Cuántas entran por página (1 = una etiqueta por página). */
  porPagina: number;
}

export const FORMATOS_ETIQUETA: readonly FormatoEtiquetaInfo[] = [
  { id: "a4-3x7", nombre: "Hoja A4 · 21", uso: "Stickers 63×38 mm, impresora común", anchoMm: 63.5, altoMm: 38.1, qrMm: 20, porPagina: ETIQUETAS_POR_HOJA },
  { id: "rollo-50x30", nombre: "Rollo 50×30", uso: "Impresora térmica chica", anchoMm: 50, altoMm: 30, qrMm: 17, porPagina: 1 },
  { id: "rollo-100x50", nombre: "Rollo 100×50", uso: "Térmica ancha, QR de 4 cm", anchoMm: 100, altoMm: 50, qrMm: 40, porPagina: 1 },
  { id: "testa-a6", nombre: "Testa A6", uso: "Para la cabeza del rollo: se lee de lejos", anchoMm: 105, altoMm: 148, qrMm: 45, porPagina: 1 },
];

export const FORMATO_ETIQUETA_DEFAULT: FormatoEtiqueta = "a4-3x7";

export function esFormatoEtiqueta(v: unknown): v is FormatoEtiqueta {
  return FORMATOS_ETIQUETA.some((f) => f.id === v);
}

export function infoFormato(formato: FormatoEtiqueta): FormatoEtiquetaInfo {
  return FORMATOS_ETIQUETA.find((f) => f.id === formato) ?? FORMATOS_ETIQUETA[0]!;
}

/** La troza como llega del patio, con lo que sabe de sus etiquetas (ADR-436). */
export type TrozaEtiquetable = TrozaConsumible & {
  etiquetadaEn?: string | null;
  etiquetasImpresas?: number;
};

const n = (v: number | null | undefined, dp: number): string | null =>
  v == null || !Number.isFinite(Number(v)) ? null : Number(v).toFixed(dp);

/** Sólo lo que hoy está parado en el patio — la misma regla que Consumos. */
export function trozasEtiquetables<T extends TrozaConsumible>(trozas: readonly T[]): T[] {
  return trozas.filter((t) => motivoBloqueo(t) === null);
}

/**
 * Ø mayor × Ø menor · largo, con lo que haya — nunca 0 donde falta el dato
 * (en Blas los diámetros vienen vacíos en la mitad de las trozas).
 */
export function medidasEtiqueta(t: Pick<TrozaConsumible, "d1Cm" | "d2Cm" | "largoM">): string {
  const d1 = n(t.d1Cm, 0);
  const d2 = n(t.d2Cm, 0);
  const largo = n(t.largoM, 2);
  if (!d1 && !d2 && !largo) return "";
  if (!d1 || !d2) {
    const unico = d1 ?? d2;
    /* Sin diámetro no se imprime «Ø — cm»: 77 de 84 trozas de Blas no lo
       traen y la etiqueta entera se llenaba de guiones. */
    return unico ? `Ø ${unico} cm · L ${largo ?? "—"} m` : `L ${largo} m`;
  }
  const mayor = Math.max(Number(d1), Number(d2));
  const menor = Math.min(Number(d1), Number(d2));
  return `Ø ${mayor}×${menor} cm · L ${largo ?? "—"} m`;
}

/** La URL larga de la ficha (la que abre `/admin/q/<id>` al redirigir). */
export function urlFichaDeTroza(origin: string, trozaId: string): string {
  const u = new URL("/admin", origin);
  u.searchParams.set("tab", TAB_LIBRO_CTP);
  u.searchParams.set("vista", "trozas");
  u.searchParams.set(PARAM_TROZA, trozaId);
  return u.toString();
}

/** La troza que pide la URL al llegar (por ejemplo, escaneando el QR de una etiqueta). */
export function trozaDeUrl(): string | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get(PARAM_TROZA)?.trim();
  return v ? v : null;
}

/**
 * Escribe o borra `?troza=` con `replace` (no agrega una entrada al
 * historial): abrir/cerrar la ficha desde la lista es un detalle de la vista,
 * no una navegación — igual que `escribirSeccionEnUrl` en la ficha del permiso.
 */
export function escribirTrozaEnUrl(trozaId: string | null): void {
  try {
    const url = new URL(window.location.href);
    if (trozaId) url.searchParams.set(PARAM_TROZA, trozaId);
    else url.searchParams.delete(PARAM_TROZA);
    window.history.replaceState(null, "", url.toString());
  } catch {
    // history no disponible: la ficha se abre igual, sólo no queda en el link.
  }
}

/** «jueves 10/09» — cuándo se imprimió la última etiqueta (hora de Lima). */
export function diaDeEtiqueta(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatWeekday(d, { largo: true })} ${formatDateNumeric(d).slice(0, 5)}`;
}

/** «10/09» — para la columna «Etiqueta» de la tabla. */
export function diaCortoDeEtiqueta(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : formatDateNumeric(d).slice(0, 5);
}

export interface ResumenEtiquetado<T extends TrozaEtiquetable = TrozaEtiquetable> {
  /** Las pedidas que hoy están en el patio (las únicas que llevan papel). */
  enPatio: T[];
  /** Pedidas que no están: aserradas, despachadas, sin recibir o no encontradas. */
  fuera: number;
  yaEtiquetadas: T[];
  /** La impresión más reciente entre las ya etiquetadas (ISO). */
  ultimaEtiqueta: string | null;
  sinCodigo: T[];
  /** Códigos de planta de lo pedido que el patio tiene en MÁS de una pieza. */
  repetidos: { codigo: string; piezas: number }[];
  /** Lo que va a la impresora con el filtro elegido. */
  aImprimir: T[];
}

/**
 * Qué pasa si se imprime lo pedido: cuántas van, cuántas ya tenían etiqueta,
 * cuántas no tienen código y qué códigos están repetidos en el patio. `patio`
 * es el patio ENTERO: un código se repite contra piezas que no se pidieron.
 */
export function resumenEtiquetado<T extends TrozaEtiquetable>(
  patio: readonly T[],
  ids: readonly string[],
  opts: { soloSinEtiqueta: boolean },
): ResumenEtiquetado<T> {
  const pedidos = new Set(ids);
  const enPatio = trozasEtiquetables(patio.filter((t) => pedidos.has(t.id)));
  const yaEtiquetadas = enPatio.filter((t) => Boolean(t.etiquetadaEn));
  const ultimaEtiqueta = yaEtiquetadas.reduce<string | null>(
    (max, t) => (t.etiquetadaEn && (!max || t.etiquetadaEn > max) ? t.etiquetadaEn : max),
    null,
  );
  const sinCodigo = enPatio.filter((t) => !(t.codigoPlanta ?? "").trim());

  const porCodigo = new Map<string, number>();
  for (const t of patio) {
    const c = (t.codigoPlanta ?? "").trim().toLowerCase();
    if (c) porCodigo.set(c, (porCodigo.get(c) ?? 0) + 1);
  }
  const vistos = new Set<string>();
  const repetidos: { codigo: string; piezas: number }[] = [];
  for (const t of enPatio) {
    const original = (t.codigoPlanta ?? "").trim();
    const c = original.toLowerCase();
    const piezas = porCodigo.get(c) ?? 0;
    if (c && piezas > 1 && !vistos.has(c)) {
      vistos.add(c);
      repetidos.push({ codigo: original, piezas });
    }
  }

  return {
    enPatio,
    fuera: ids.length - enPatio.length,
    yaEtiquetadas,
    ultimaEtiqueta,
    sinCodigo,
    repetidos,
    aImprimir: opts.soloSinEtiqueta ? enPatio.filter((t) => !t.etiquetadaEn) : enPatio,
  };
}

/** Lo que se lee grande en la etiqueta: la marca de planta, si no la del bosque. */
export function codigoDeEtiqueta(t: Pick<TrozaConsumible, "codigoPlanta" | "codificacion">): string {
  const planta = (t.codigoPlanta ?? "").trim();
  if (planta) return planta;
  const bosque = (t.codificacion ?? "").trim();
  /* «-» es «sin código» en el libro (49 de 160 trozas en Blas). */
  return bosque && bosque !== "-" ? bosque : "—";
}

/** Ancho útil (mm) para el código grande, y su techo en puntos, por formato. */
const CAJA_CODIGO: Record<FormatoEtiqueta, { anchoMm: number; maxPt: number }> = {
  "a4-3x7": { anchoMm: 36, maxPt: 20 },
  "rollo-50x30": { anchoMm: 28, maxPt: 15 },
  "rollo-100x50": { anchoMm: 50, maxPt: 32 },
  "testa-a6": { anchoMm: 89, maxPt: 120 },
};

/**
 * El tamaño (pt) del código para que entre en UNA línea de su caja: «7» en la
 * testa sale enorme, «PQ-2609-004» se achica. 0,64 em por carácter en negrita
 * (conservador: las mayúsculas anchas miden ~0,72, los dígitos 0,56).
 */
export function tamanoCodigoPt(codigo: string, formato: FormatoEtiqueta): number {
  const { anchoMm, maxPt } = CAJA_CODIGO[formato];
  const largo = Math.max(1, [...codigo].length);
  const pt = Math.floor(anchoMm / (largo * 0.64 * 0.3528));
  return Math.max(7, Math.min(maxPt, pt));
}

export interface ImprimirEtiquetasOpts {
  /** `window.location.origin`: así el QR apunta a ESTE tenant, no a uno hardcodeado. */
  origin: string;
  formato?: FormatoEtiqueta;
  /** Código de barras Code128 del código bajo el texto (pistola lectora). */
  barras?: boolean;
  /** Ventana abierta en el clic (ver `openCtpReport`). */
  ventana?: Window | null;
}

/** Una etiqueta en HTML. El QR llega ya dibujado (SVG) para que esto sea puro. */
export function htmlEtiqueta(
  t: TrozaConsumible,
  qrSvg: string,
  opts: { formato: FormatoEtiqueta; barras: boolean },
): string {
  const codigo = codigoDeEtiqueta(t);
  const bosque = (t.codificacion ?? "").trim();
  const medidas = medidasEtiqueta(t);
  const vol = t.volumenM3 != null && Number.isFinite(Number(t.volumenM3)) ? `${Number(t.volumenM3).toFixed(3)} m³` : "";
  const barras = opts.barras && codigo !== "—" ? code128Svg(codigo) : "";
  const detalle = [medidas, vol].filter(Boolean).join(" · ");
  return `<div class="etq">
    <div class="txt">
      <div class="cod" style="font-size:${tamanoCodigoPt(codigo, opts.formato)}pt">${esc(codigo)}</div>
      ${t.codigoPlanta && bosque && bosque !== "-" && bosque !== codigo ? `<div class="cod2">bosque ${esc(bosque)}</div>` : ""}
      <div class="esp">${esc(t.especieComun ?? "Sin especie")}</div>
      ${detalle ? `<div class="med">${esc(detalle)}</div>` : ""}
    </div>
    ${barras ? `<div class="bar">${barras}</div>` : ""}
    <div class="qr" role="img" aria-label="QR ${esc(codigo)}">${qrSvg}</div>
    <div class="pie"><span>${esc(t.gtfNumber ?? "sin GTF")}</span>${t.permiso ? `<span>${esc(t.permiso)}</span>` : ""}</div>
  </div>`;
}

/** El CSS de la hoja: `@page` y la caja de cada etiqueta según el formato. */
export function cssEtiquetas(formato: FormatoEtiqueta): string {
  const f = infoFormato(formato);
  const comun = `
    body { max-width: none; margin: 0; padding: 0; border: 0; border-radius: 0; box-shadow: none; color: #000; }
    @media screen { body { background: #e7e9e8; padding: 12px; } .print-bar { background: #e7e9e8; } }
    .etq { width: ${f.anchoMm}mm; height: ${f.altoMm}mm; overflow: hidden; background: #fff; color: #000;
           display: grid; page-break-inside: avoid; break-inside: avoid; font-family: Arial, "Segoe UI", sans-serif; }
    @media screen { .etq { outline: 1px dashed #9aa5a0; } }
    .txt { grid-area: txt; min-width: 0; display: flex; flex-direction: column; }
    .cod { font-weight: 800; line-height: 1; letter-spacing: -.02em; white-space: nowrap; overflow: hidden; }
    .bar { grid-area: bar; width: 100%; min-width: 0; }
    .bar svg { display: block; width: 100%; height: 100%; }
    .cod2 { color: #000; font-family: "Courier New", monospace; }
    .esp { font-weight: 700; }
    .med { font-variant-numeric: tabular-nums; }
    .qr { grid-area: qr; width: ${f.qrMm}mm; height: ${f.qrMm}mm; }
    .qr svg { display: block; width: 100%; height: 100%; }
    .pie { grid-area: pie; display: flex; justify-content: space-between; gap: 2mm; font-family: "Courier New", monospace;
           border-top: .5pt dashed #000; white-space: nowrap; overflow: hidden; }
    .pie span { overflow: hidden; text-overflow: ellipsis; }
  `;
  switch (formato) {
    case "a4-3x7":
      /* L7160: 3 columnas de 63,5 con 2,5 mm entre ellas; 7 filas de 38,1 sin
         separación. Márgenes = lo que sobra del A4, repartido. */
      return `${comun}
        @page { size: A4; margin: 15.1mm 7.2mm; }
        .hoja { display: grid; grid-template-columns: repeat(${ETIQUETAS_COLUMNAS}, ${f.anchoMm}mm); grid-auto-rows: ${f.altoMm}mm;
                column-gap: 2.5mm; page-break-after: always; break-after: page; }
        .hoja:last-child { page-break-after: auto; break-after: auto; }
        @media screen { .hoja { width: max-content; background: #fff; padding: 15.1mm 7.2mm; margin: 0 auto 12px; } }
        .etq { padding: 2.2mm 2.6mm; grid-template-columns: 1fr ${f.qrMm}mm; grid-template-rows: 1fr auto auto;
               grid-template-areas: "txt qr" "bar qr" "pie pie"; column-gap: 1.8mm; row-gap: .8mm; }
        .bar { height: 6mm; align-self: end; }
        .cod2 { font-size: 6.5pt; margin-top: .6mm; }
        .esp { font-size: 8pt; margin-top: auto; }
        .med { font-size: 6.8pt; }
        .pie { font-size: 6.2pt; padding-top: .6mm; }`;
    case "rollo-50x30":
      return `${comun}
        @page { size: 50mm 30mm; margin: 0; }
        /* Las barras van a lo ancho de toda la etiqueta: en la columna de texto
           (28 mm) un código de 11 caracteres quedaba en módulos de 0,16 mm,
           menos de lo que una térmica de 203 dpi dibuja limpio. */
        .etq { padding: 1.5mm 1.8mm; grid-template-columns: 1fr ${f.qrMm}mm; grid-template-rows: 1fr auto auto;
               grid-template-areas: "txt qr" "bar bar" "pie pie"; column-gap: 1.2mm; row-gap: .5mm;
               page-break-after: always; break-after: page; }
        .etq:last-child { page-break-after: auto; break-after: auto; }
        @media screen { .etq { display: inline-grid; margin: 0 8px 8px 0; } }
        .bar { height: 4.6mm; }
        .cod2 { display: none; }
        .esp { font-size: 7pt; margin-top: auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .med { font-size: 5.8pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pie { font-size: 5.6pt; padding-top: .4mm; }`;
    case "rollo-100x50":
      return `${comun}
        @page { size: 100mm 50mm; margin: 0; }
        .etq { padding: 3mm 3.4mm; grid-template-columns: 1fr ${f.qrMm}mm; grid-template-rows: 1fr auto auto;
               grid-template-areas: "txt qr" "bar qr" "pie pie"; column-gap: 3mm; row-gap: 1mm;
               page-break-after: always; break-after: page; }
        .etq:last-child { page-break-after: auto; break-after: auto; }
        @media screen { .etq { display: inline-grid; margin: 0 10px 10px 0; } }
        .bar { height: 10mm; align-self: end; }
        .cod2 { font-size: 8pt; margin-top: 1mm; }
        .esp { font-size: 12pt; margin-top: auto; }
        .med { font-size: 9pt; }
        .pie { font-size: 7.5pt; padding-top: .8mm; }`;
    case "testa-a6":
      /* Una por hoja A6, todo centrado: el código es lo que se lee a 3-4 m en
         la pila; el QR y las barras, de cerca. */
      return `${comun}
        @page { size: 105mm 148mm; margin: 0; } /* A6; Chrome no reconoce la palabra «A6» */
        .etq { padding: 8mm; grid-template-columns: 1fr; grid-template-rows: auto auto 1fr auto;
               grid-template-areas: "txt" "bar" "qr" "pie"; justify-items: center; row-gap: 4mm; text-align: center;
               page-break-after: always; break-after: page; }
        .etq:last-child { page-break-after: auto; break-after: auto; }
        @media screen { .etq { display: inline-grid; margin: 0 12px 12px 0; vertical-align: top; } }
        .txt { width: 100%; align-items: center; }
        .bar { width: 72mm; height: 14mm; }
        .cod2 { font-size: 11pt; margin-top: 2mm; }
        .esp { font-size: 18pt; margin-top: 3mm; }
        .med { font-size: 11pt; margin-top: 1mm; }
        .qr { align-self: center; }
        .pie { width: 100%; font-size: 9pt; padding-top: 1.5mm; }`;
  }
}

/** El cuerpo de la hoja: en A4, grillas de 21; en rollo/testa, una tras otra. */
export function cuerpoEtiquetas(tarjetas: readonly string[], formato: FormatoEtiqueta): string {
  if (formato !== "a4-3x7") return tarjetas.join("");
  const hojas: string[] = [];
  for (let i = 0; i < tarjetas.length; i += ETIQUETAS_POR_HOJA) {
    hojas.push(`<div class="hoja">${tarjetas.slice(i, i + ETIQUETAS_POR_HOJA).join("")}</div>`);
  }
  return hojas.join("");
}

/**
 * Abre la hoja de etiquetas con QR real (SVG) y, si se pide, código de barras.
 * Devuelve cuántas se imprimieron — 0 si ninguna troza sigue en el patio, para
 * que quien llama lo diga en vez de abrir una hoja vacía.
 */
export async function imprimirEtiquetasDeTrozas(
  trozas: readonly TrozaConsumible[],
  opts: ImprimirEtiquetasOpts,
): Promise<number> {
  const imprimibles = trozasEtiquetables(trozas);
  if (imprimibles.length === 0) return 0;
  const formato = opts.formato ?? FORMATO_ETIQUETA_DEFAULT;
  const barras = opts.barras ?? true;

  const QR = (await import("qrcode")).default;
  const tarjetas = await Promise.all(
    imprimibles.map(async (t) => {
      /* SVG y no PNG: en la térmica un PNG de 120 px se reescala y los módulos
         salen borrosos; el vector sale nítido a cualquier tamaño. */
      const qr = await QR.toString(urlCortaDeTroza(opts.origin, t.id), {
        type: "svg",
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      });
      return htmlEtiqueta(t, qr, { formato, barras });
    }),
  );

  const f = infoFormato(formato);
  openCtpReport({
    title: `Etiquetas de trozas · ${f.nombre} (${imprimibles.length})`,
    css: cssEtiquetas(formato),
    body: cuerpoEtiquetas(tarjetas, formato),
    ventana: opts.ventana,
  });
  return imprimibles.length;
}
