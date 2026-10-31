"use client";

/**
 * loth-troza-etiquetas — «Imprimir etiquetas» de la sección Trozado del Libro
 * TH (2026-09-28), leíble por la MISMA pistola que ya recibe etiquetas del
 * Libro CTP (ADR-436): mismo encabezado `TROZA <código>`, mismos íconos, misma
 * hoja/rollo/testa. Se agrega acá y no en `loth-labels.ts` porque ese archivo
 * imprime un QR sencillo (`/verificar/<code>`) para las 6 secciones; esto es
 * SOLO Trozado, con el contenido que la recepción del CTP necesita reconocer
 * sin internet: especie común/científica, D1·D2·largo, volumen, árbol de
 * origen, permiso/título habilitante y plan de manejo.
 *
 * Reusa de `ctp-troza-etiquetas.ts` los formatos/CSS de la hoja (genéricos,
 * no dependen de campos del CTP) y de `ficha-texto-troza.ts` el texto de la
 * ficha y sus íconos (single source con el CTP: si el formato cambia ahí,
 * cambia acá también).
 *
 * Etiqueta UNIFICADA (08-10, QR5): el «Etiquetas QR» de Tala/Trozado
 * (`loth-labels.ts`) imprime esta misma, en blanco y negro para la térmica. El
 * QR chico lleva el id de la línea y el código (`/verificar/troza/<id>?c=…`,
 * `lib/tenant-url-publica.ts`) con la base pública del negocio, no la del
 * navegador. Si en el formato el QR chico quedaría con menos de 2 puntos de
 * impresora por módulo, la etiqueta lleva UN solo QR —el del sistema, que
 * también trae el código para la pistola— en el lugar del grande.
 *
 * PURO salvo `imprimirEtiquetasTrozasLoth` (abre la ventana de impresión).
 */

import type { LothEntryDTO } from "./loth-constants";
import { code128Svg } from "./code128";
import { esc, openCtpReport } from "./ctp-print-shared";
import {
  correccionDeQr,
  cssEtiquetas,
  cuerpoEtiquetas,
  FORMATO_ETIQUETA_DEFAULT,
  infoFormato,
  tamanoCodigoPt,
  type FormatoEtiqueta,
} from "./ctp-troza-etiquetas";
import { codigoDeEtiquetaLoth, partesDeMedidasLoth, textoFichaDeTrozaLoth } from "./ficha-texto-troza";
import { fmtM3 } from "./cubicacion-formato";
import { urlVerificarTroza } from "@/lib/tenant-url-publica";
import { obtenerBaseVerificacion } from "@/lib/base-verificacion-cliente";

/** Las líneas de la sección Trozado que tienen algo que imprimir: código de troza o del árbol. */
export function trozasEtiquetablesLoth(entries: readonly LothEntryDTO[]): LothEntryDTO[] {
  return entries.filter(
    (e) => e.section === "trozado" && e.status !== "anulado" && Boolean((e.trozaCode ?? e.treeCode ?? "").trim()),
  );
}

/** Cualquier sección (Tala, Trozado…): las vigentes con código de troza o de árbol. */
export function lineasEtiquetablesLoth(entries: readonly LothEntryDTO[]): LothEntryDTO[] {
  return entries.filter((e) => e.status !== "anulado" && Boolean((e.trozaCode ?? e.treeCode ?? "").trim()));
}

/**
 * Puntos de impresora por formato: las térmicas de rollo son de 203 dpi; la
 * hoja A4 se cuenta a 300 (la impresora de oficina más modesta).
 */
const DPI_DEL_FORMATO: Record<FormatoEtiqueta, number> = {
  "a4-3x7": 300,
  "rollo-50x30": 203,
  "rollo-100x50": 203,
  "testa-a6": 203,
};

/** Por debajo de 2 puntos por módulo la térmica redondea los bordes y el celular no lo lee. */
export const MIN_PUNTOS_POR_MODULO = 2;

/** Puntos de impresora por módulo de un QR de `modulos` de lado (+1 de margen por lado, como se dibuja). */
export function puntosPorModulo(ladoMm: number, modulos: number, dpi: number): number {
  return Math.round(((ladoMm / 25.4) * dpi * 100) / (modulos + 2)) / 100;
}

/**
 * ¿La etiqueta lleva dos QR (ficha + sistema) o uno solo (sistema, en el lugar
 * del grande)? Uno solo cuando el chico quedaría bajo `MIN_PUNTOS_POR_MODULO`.
 */
export function qrsDeLaEtiqueta(formato: FormatoEtiqueta, modulosDelChico: number): {
  dos: boolean;
  puntosChico: number;
} {
  const f = infoFormato(formato);
  const puntosChico = puntosPorModulo(f.qrChicoMm, modulosDelChico, DPI_DEL_FORMATO[formato]);
  return { dos: puntosChico >= MIN_PUNTOS_POR_MODULO, puntosChico };
}

export interface OpcionesEtiquetaLoth {
  /**
   * Base pública del negocio (`lib/tenant-url-publica.ts`). Sin ella se pide al
   * servidor y la hoja ESPERA: nunca se arma con el host del navegador.
   */
  base?: string;
  /** Tala y demás secciones, no sólo Trozado («Etiquetas QR» de la sección). */
  todasLasSecciones?: boolean;
  /**
   * El permiso de CADA línea (su `planId`): con «Todos» o una troza de otro
   * permiso, el pie decía el permiso elegido y no el suyo. Si devuelve `null`
   * (línea sin permiso), cae a `tituloHabilitante`/`planNumber` (`permisoDelPie`).
   */
  permisoDeLinea?: (e: LothEntryDTO) => { tituloHabilitante?: string | null; planNumber?: string | null } | null;
  tituloHabilitante?: string | null;
  planNumber?: string | null;
  formato?: FormatoEtiqueta;
  barras?: boolean;
  /** Ventana abierta EN el clic (ver gotcha de pop-up bloqueado, ADR-436). */
  ventana?: Window | null;
}

/**
 * Una etiqueta en HTML — misma grilla que `htmlEtiqueta` del CTP (los nombres
 * de las clases son genéricos en `cssEtiquetas`), con el contenido del Libro
 * TH: especie común/científica, D1·D2·largo, volumen, árbol, permiso y plan
 * en el pie.
 */
export function htmlEtiquetaLoth(
  e: LothEntryDTO,
  qrSvg: string,
  opts: { formato: FormatoEtiqueta; barras: boolean; tituloHabilitante?: string | null; planNumber?: string | null; qrChicoSvg?: string },
): string {
  const codigo = codigoDeEtiquetaLoth(e);
  const { diametros, largo } = partesDeMedidasLoth(e);
  const vol = e.volumeM3 != null && Number.isFinite(Number(e.volumeM3)) ? `${fmtM3(Number(e.volumeM3))} m³` : "";
  const segunda = [largo, vol].filter(Boolean).join(" · ");
  const barras = opts.barras && codigo !== "—" ? code128Svg(codigo) : "";
  const dos = Boolean(opts.qrChicoSvg);
  const arbol = (e.treeCode ?? "").trim() && e.treeCode !== codigo ? `árbol ${e.treeCode}` : null;
  return `<div class="etq${dos ? " dos" : ""}">
    <div class="txt">
      <div class="cod" style="font-size:${tamanoCodigoPt(codigo, opts.formato)}pt">${esc(codigo)}</div>
      ${arbol ? `<div class="cod2">${esc(arbol)}</div>` : ""}
      <div class="esp">${esc(e.speciesCommon ?? "Sin especie")}</div>
      <div class="med">${esc(diametros)}</div>
      <div class="med">${esc(segunda)}</div>
    </div>
    ${barras ? `<div class="bar">${barras}</div>` : ""}
    <div class="qr" role="img" aria-label="${dos ? `Ficha de la troza ${esc(codigo)}` : `QR ${esc(codigo)}`}">${qrSvg}</div>
    ${dos ? `<div class="chico" role="img" aria-label="Troza ${esc(codigo)} en el sistema">${opts.qrChicoSvg}</div>` : ""}
    <div class="pie"><span>${esc(opts.tituloHabilitante ?? "sin permiso")}</span>${opts.planNumber ? `<b class="ptox">${esc(opts.planNumber)}</b>` : ""}</div>
  </div>`;
}

type PermisoDelPie = { tituloHabilitante?: string | null; planNumber?: string | null };

/**
 * El permiso del pie de una etiqueta. Con el de la línea resuelto, sólo lo
 * suyo: un campo vacío NO se rellena con el del permiso por el que está
 * filtrado el libro (es otro permiso: el mismo error que se quería evitar).
 * Sin permiso de la línea, el del libro.
 */
export function permisoDelPie(suyo: PermisoDelPie | null, libro: PermisoDelPie): PermisoDelPie {
  const p = suyo ?? libro;
  return { tituloHabilitante: p.tituloHabilitante ?? null, planNumber: p.planNumber ?? null };
}

/**
 * Abre la hoja de etiquetas del Libro TH con QR real (SVG): grande con la
 * ficha en texto (se lee sin internet, con el mismo formato del CTP) y chico
 * con el certificado público `/verificar/troza/<id>?c=<código>`. Devuelve
 * cuántas se imprimieron — 0 si ninguna de las líneas pasadas tiene código.
 */
export async function imprimirEtiquetasTrozasLoth(
  entries: readonly LothEntryDTO[],
  opts: OpcionesEtiquetaLoth,
): Promise<number> {
  const imprimibles = opts.todasLasSecciones ? lineasEtiquetablesLoth(entries) : trozasEtiquetablesLoth(entries);
  if (imprimibles.length === 0) return 0;
  const formato = opts.formato ?? FORMATO_ETIQUETA_DEFAULT;
  const barras = opts.barras ?? true;
  const { grande } = correccionDeQr(formato);
  const base = opts.base ?? (await obtenerBaseVerificacion());

  const QR = (await import("qrcode")).default;
  const svg = (contenido: string, errorCorrectionLevel: "L" | "M") =>
    QR.toString(contenido, { type: "svg", margin: 1, errorCorrectionLevel, color: { dark: "#000000", light: "#ffffff" } });

  const tarjetas = await Promise.all(
    imprimibles.map(async (e) => {
      const codigo = codigoDeEtiquetaLoth(e);
      /* La troza despachada se imprime «como su trozado»: el QR va a SU línea de trozado. */
      const url = urlVerificarTroza(base, { lineaId: e.trozado?.lineaId ?? e.id, codigo });
      const { dos } = qrsDeLaEtiqueta(formato, QR.create(url, { errorCorrectionLevel: "L" }).modules.size);
      const permiso = permisoDelPie(opts.permisoDeLinea?.(e) ?? null, opts);
      const datos = { formato, barras, ...permiso };
      if (!dos) return htmlEtiquetaLoth(e, await svg(url, grande), datos);
      const [ficha, chico] = await Promise.all([svg(textoFichaDeTrozaLoth(e, permiso), grande), svg(url, "L")]);
      return htmlEtiquetaLoth(e, ficha, { ...datos, qrChicoSvg: chico });
    }),
  );

  const f = infoFormato(formato);
  openCtpReport({
    title: `Etiquetas de trozas · Libro TH · ${f.nombre} (${imprimibles.length})`,
    css: cssEtiquetas(formato),
    body: cuerpoEtiquetas(tarjetas, formato),
    ventana: opts.ventana,
  });
  return imprimibles.length;
}
