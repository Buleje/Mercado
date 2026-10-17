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
 * Dos QR (Brandon, 2026-09-26: «el primero va a trabajar sin internet
 * mostrando información así en texto… otra función, puede ser otro QR
 * pequeño»):
 *   - el GRANDE lleva la ficha escrita (`ficha-texto-troza.ts`): código,
 *     especie, m³, medidas, N° de registro, GTF, titular y permiso. Cualquier
 *     celular la lee sin señal ni cuenta. Lleva lo mismo que la guía impresa,
 *     nunca un DNI o RUC.
 *   - el CHICO lleva la ruta corta `/admin/q/<id>` (`ctp-troza-url.ts`): abre
 *     la troza en el sistema (pide sesión) y es el que se escanea para armar
 *     lotes. El escáner del sistema entiende los dos.
 * Con «Ficha en el QR» apagado queda la etiqueta de antes: un solo QR, el del
 * sistema.
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
import { fmtPt } from "./cubicacion-formato";
import { esc, openCtpReport } from "./ctp-print-shared";
import { PARAM_TROZA, TAB_LIBRO_CTP, urlCortaDeTroza } from "./ctp-troza-url";
import { codigoDeEtiqueta, medidasDeFicha, partesDeMedidas, textoFichaDeTroza } from "./ficha-texto-troza";

export { PARAM_TROZA, codigoDeEtiqueta, urlCortaDeTroza };

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
  /** Lado del QR impreso (el de la ficha, cuando van los dos). */
  qrMm: number;
  /** Lado del QR chico del sistema, cuando la etiqueta lleva la ficha en el grande. */
  qrChicoMm: number;
  /** Cuántas entran por página (1 = una etiqueta por página). */
  porPagina: number;
}

export const FORMATOS_ETIQUETA: readonly FormatoEtiquetaInfo[] = [
  { id: "a4-3x7", nombre: "Hoja A4 · 21", uso: "Stickers 63×38 mm, impresora común", anchoMm: 63.5, altoMm: 38.1, qrMm: 20, qrChicoMm: 9, porPagina: ETIQUETAS_POR_HOJA },
  { id: "rollo-50x30", nombre: "Rollo 50×30", uso: "Impresora térmica chica", anchoMm: 50, altoMm: 30, qrMm: 17, qrChicoMm: 8, porPagina: 1 },
  { id: "rollo-100x50", nombre: "Rollo 100×50", uso: "Térmica ancha, QR de 3,8 cm", anchoMm: 100, altoMm: 50, qrMm: 38, qrChicoMm: 12, porPagina: 1 },
  { id: "testa-a6", nombre: "Testa A6", uso: "Para la cabeza del rollo: se lee de lejos", anchoMm: 105, altoMm: 148, qrMm: 45, qrChicoMm: 22, porPagina: 1 },
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

/** Sólo lo que hoy está parado en el patio — la misma regla que Consumos. */
export function trozasEtiquetables<T extends TrozaConsumible>(trozas: readonly T[]): T[] {
  return trozas.filter((t) => motivoBloqueo(t) === null);
}

/**
 * D1 · D2 · largo, las tres siempre y con su nombre, igual que en la ficha del
 * QR (`medidasDeFicha`). Antes salía «Ø mayor×menor» y, sin diámetro, sólo el
 * largo; Brandon (26-09) pidió ver D1, D2 y largo en la troza.
 */
export function medidasEtiqueta(t: Pick<TrozaConsumible, "d1Cm" | "d2Cm" | "diametroCm" | "largoM">): string {
  return medidasDeFicha(t);
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

/** Ancho útil (mm) para el código grande, y su techo en puntos, por formato. */
const CAJA_CODIGO: Record<FormatoEtiqueta, { anchoMm: number; maxPt: number }> = {
  "a4-3x7": { anchoMm: 36, maxPt: 20 },
  "rollo-50x30": { anchoMm: 28, maxPt: 15 },
  "rollo-100x50": { anchoMm: 50, maxPt: 28 },
  /* 100 pt = 35 mm de alto: se lee a 3-4 m y deja lugar a D1·D2 y largo·m³. */
  "testa-a6": { anchoMm: 89, maxPt: 100 },
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
  /** QR grande con la ficha en texto + QR chico del sistema. Default: sí. */
  fichaEnQr?: boolean;
  /** Ventana abierta en el clic (ver `openCtpReport`). */
  ventana?: Window | null;
}

/**
 * Una etiqueta en HTML. Los QR llegan ya dibujados (SVG) para que esto sea
 * puro: `qrSvg` es el grande; con `qrChicoSvg` la etiqueta lleva los dos (el
 * grande con la ficha en texto, el chico con la dirección del sistema).
 */
export function htmlEtiqueta(
  t: TrozaConsumible,
  qrSvg: string,
  opts: { formato: FormatoEtiqueta; barras: boolean; qrChicoSvg?: string },
): string {
  const codigo = codigoDeEtiqueta(t);
  const bosque = (t.codificacion ?? "").trim();
  const { diametros, largo } = partesDeMedidas(t);
  const vol = t.volumenM3 != null && Number.isFinite(Number(t.volumenM3)) ? `${Number(t.volumenM3).toFixed(3)} m³` : "";
  const barras = opts.barras && codigo !== "—" ? code128Svg(codigo) : "";
  /* D1·D2 en una línea y largo·m³ en otra: en una sola, el «…» del sticker se
     comía el largo o los m³. */
  const segunda = [largo, vol].filter(Boolean).join(" · ");
  /* El PT Oxapampa (la cubicación propia, con la que se compra, vende y paga
     flete) va en el pie cuando la troza ya se cubicó: en la etiqueta no entra
     otra línea sin achicar el código. Va antes del permiso para que, si falta
     lugar, el «…» se coma el permiso (que igual está en la ficha del QR). */
  const ptOx = t.oxPt != null && Number.isFinite(Number(t.oxPt)) && Number(t.oxPt) > 0 ? `${fmtPt(Number(t.oxPt))} PT` : null;
  const dos = Boolean(opts.qrChicoSvg);
  return `<div class="etq${dos ? " dos" : ""}">
    <div class="txt">
      <div class="cod" style="font-size:${tamanoCodigoPt(codigo, opts.formato)}pt">${esc(codigo)}</div>
      ${t.codigoPlanta && bosque && bosque !== "-" && bosque !== codigo ? `<div class="cod2">bosque ${esc(bosque)}</div>` : ""}
      <div class="esp">${esc(t.especieComun ?? "Sin especie")}</div>
      <div class="med">${esc(diametros)}</div>
      <div class="med">${esc(segunda)}</div>
    </div>
    ${barras ? `<div class="bar">${barras}</div>` : ""}
    <div class="qr" role="img" aria-label="${dos ? `Ficha de la troza ${esc(codigo)}` : `QR ${esc(codigo)}`}">${qrSvg}</div>
    ${dos ? `<div class="chico" role="img" aria-label="Troza ${esc(codigo)} en el sistema">${opts.qrChicoSvg}</div>` : ""}
    <div class="pie"><span>${esc(t.gtfNumber ?? "sin GTF")}</span>${ptOx ? `<b class="ptox">${esc(ptOx)}</b>` : ""}${t.permiso ? `<span class="perm">${esc(t.permiso)}</span>` : ""}</div>
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
    /* El texto no empuja: con un código del bosque o unas medidas largas, la
       fila crecía y sacaba el pie, las barras y el QR chico de la etiqueta. */
    .txt { grid-area: txt; min-width: 0; min-height: 0; overflow: hidden; display: flex; flex-direction: column; line-height: 1.2; }
    /* Ninguna línea se encoge: si no entran, se corta la de abajo, nunca el código. */
    .txt > * { flex-shrink: 0; }
    .cod { font-weight: 800; line-height: 1; letter-spacing: -.02em; white-space: nowrap; overflow: hidden; }
    .bar { grid-area: bar; width: 100%; min-width: 0; }
    .bar svg { display: block; width: 100%; height: 100%; }
    .cod2 { color: #000; font-family: "Courier New", monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .esp { font-weight: 700; }
    .med { font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .qr { grid-area: qr; width: ${f.qrMm}mm; height: ${f.qrMm}mm; }
    .qr svg { display: block; width: 100%; height: 100%; }
    .chico { grid-area: chico; width: ${f.qrChicoMm}mm; height: ${f.qrChicoMm}mm; justify-self: center; align-self: end; }
    .chico svg { display: block; width: 100%; height: 100%; }
    /* Interlineado corto: con el heredado del reporte el pie del sticker medía
       4,4 mm y le quitaba al QR grande el alto que necesita. */
    .pie { grid-area: pie; display: flex; justify-content: space-between; gap: 2mm; font-family: "Courier New", monospace; line-height: 1.15;
           border-top: .5pt dashed #000; white-space: nowrap; overflow: hidden; }
    .pie span { overflow: hidden; text-overflow: ellipsis; }
    .pie > :first-child, .pie .ptox { white-space: nowrap; flex-shrink: 0; }
    .pie .perm { min-width: 0; }
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
        .etq { padding: 2.2mm 2.6mm; grid-template-columns: 1fr ${f.qrMm}mm; grid-template-rows: minmax(0, 1fr) auto auto;
               grid-template-areas: "txt qr" "bar qr" "pie pie"; column-gap: 1.8mm; row-gap: .8mm; }
        .bar { height: 6mm; align-self: end; }
        .cod2 { font-size: 6.5pt; margin-top: .6mm; }
        .esp { font-size: 8pt; margin-top: auto; }
        .med { font-size: 6.8pt; }
        .pie { font-size: 6.2pt; padding-top: .6mm; }
        /* Con la ficha: el QR chico va bajo el grande, al lado de las barras. */
        .etq.dos { grid-template-areas: "txt qr" "bar chico" "pie pie"; }`;
    case "rollo-50x30":
      return `${comun}
        @page { size: 50mm 30mm; margin: 0; }
        /* Las barras van a lo ancho de toda la etiqueta: en la columna de texto
           (28 mm) un código de 11 caracteres quedaba en módulos de 0,16 mm,
           menos de lo que una térmica de 203 dpi dibuja limpio. */
        .etq { padding: 1.5mm 1.8mm; grid-template-columns: 1fr ${f.qrMm}mm; grid-template-rows: minmax(0, 1fr) auto auto;
               grid-template-areas: "txt qr" "bar bar" "pie pie"; column-gap: 1.2mm; row-gap: .5mm;
               page-break-after: always; break-after: page; }
        .etq:last-child { page-break-after: auto; break-after: auto; }
        @media screen { .etq { display: inline-grid; margin: 0 8px 8px 0; } }
        .bar { height: 4.6mm; }
        .cod2 { display: none; }
        .esp { font-size: 7pt; margin-top: auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .med { font-size: 5.8pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pie { font-size: 5.6pt; padding-top: .4mm; }
        /* Con la ficha no entra una fila más: el pie sube al lado del QR chico,
           encima de las barras (la GTF y el permiso también van en la ficha). */
        .etq.dos { grid-template-areas: "txt qr" "pie chico" "bar chico"; }
        /* En 28 mm no entran la GTF y el permiso: quedaba «001-00… 19-SEC/REG-PL…».
           Va la GTF entera; el permiso está en la ficha del QR grande. */
        .etq.dos .pie { border-top: 0; padding-top: 0; }
        .etq.dos .pie .perm { display: none; }
        .etq.dos .bar { align-self: end; }`;
    case "rollo-100x50":
      return `${comun}
        @page { size: 100mm 50mm; margin: 0; }
        .etq { padding: 3mm 3.4mm; grid-template-columns: 1fr ${f.qrMm}mm; grid-template-rows: minmax(0, 1fr) auto auto;
               grid-template-areas: "txt qr" "bar qr" "pie pie"; column-gap: 3mm; row-gap: 1mm;
               page-break-after: always; break-after: page; }
        .etq:last-child { page-break-after: auto; break-after: auto; }
        @media screen { .etq { display: inline-grid; margin: 0 10px 10px 0; } }
        .bar { height: 10mm; align-self: end; }
        .cod2 { font-size: 8pt; margin-top: .5mm; }
        .esp { font-size: 11pt; margin-top: auto; }
        .med { font-size: 8.5pt; }
        .pie { font-size: 7.5pt; padding-top: .8mm; }
        /* Con la ficha: el QR chico entra entre las barras y el grande. El
           grande es de 38 mm y no 40: con 40 pisaba el pie (medido 26-09). */
        .etq.dos { grid-template-columns: 1fr ${f.qrChicoMm}mm ${f.qrMm}mm; grid-template-areas: "txt txt qr" "bar chico qr" "pie pie pie"; }`;
    case "testa-a6":
      /* Una por hoja A6, todo centrado: el código es lo que se lee a 3-4 m en
         la pila; el QR y las barras, de cerca. */
      return `${comun}
        @page { size: 105mm 148mm; margin: 0; } /* A6; Chrome no reconoce la palabra «A6» */
        .etq { padding: 8mm; grid-template-columns: 1fr; grid-template-rows: auto auto 1fr auto;
               grid-template-areas: "txt" "bar" "qr" "pie"; justify-items: center; row-gap: 3mm; text-align: center;
               page-break-after: always; break-after: page; }
        .etq:last-child { page-break-after: auto; break-after: auto; }
        @media screen { .etq { display: inline-grid; margin: 0 12px 12px 0; vertical-align: top; } }
        .txt { width: 100%; align-items: center; }
        .bar { width: 72mm; height: 14mm; }
        .cod2 { font-size: 11pt; margin-top: 2mm; }
        .esp { font-size: 18pt; margin-top: 3mm; }
        .med { font-size: 11pt; margin-top: 1mm; }
        .qr { align-self: center; }
        .pie { width: 100%; font-size: 9pt; padding-top: 1.5mm; }
        /* Con la ficha: los dos QR lado a lado, el chico abajo a la derecha. */
        .etq.dos { grid-template-columns: 1fr ${f.qrMm}mm ${f.qrChicoMm}mm 1fr; column-gap: 4mm;
                   grid-template-areas: "txt txt txt txt" "bar bar bar bar" ". qr chico ." "pie pie pie pie"; }`;
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
 * La corrección de errores del QR de la ficha según el formato. La ficha pesa
 * ~260 bytes: con «M» sube a la versión 12 (65 módulos) y en el QR de 17-20 mm
 * del sticker y del rollo chico el módulo baja de 0,3 mm. Ahí va «L» (versión
 * 10, 57 módulos). En el rollo ancho y la testa sobra lado y va «M», que
 * tolera la etiqueta más sucia.
 */
export function correccionDeQr(formato: FormatoEtiqueta): { grande: "L" | "M" } {
  return { grande: infoFormato(formato).qrMm >= 30 ? "M" : "L" };
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
  const fichaEnQr = opts.fichaEnQr ?? true;
  const { grande } = correccionDeQr(formato);

  const QR = (await import("qrcode")).default;
  /* SVG y no PNG: en la térmica un PNG de 120 px se reescala y los módulos
     salen borrosos; el vector sale nítido a cualquier tamaño. */
  const svg = (contenido: string, errorCorrectionLevel: "L" | "M") =>
    QR.toString(contenido, { type: "svg", margin: 1, errorCorrectionLevel, color: { dark: "#000000", light: "#ffffff" } });
  const tarjetas = await Promise.all(
    imprimibles.map(async (t) => {
      const url = urlCortaDeTroza(opts.origin, t.id);
      if (!fichaEnQr) return htmlEtiqueta(t, await svg(url, "M"), { formato, barras });
      const [ficha, chico] = await Promise.all([svg(textoFichaDeTroza(t), grande), svg(url, "L")]);
      return htmlEtiqueta(t, ficha, { formato, barras, qrChicoSvg: chico });
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
