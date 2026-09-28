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

/** Las líneas de la sección Trozado que tienen algo que imprimir: código de troza o del árbol. */
export function trozasEtiquetablesLoth(entries: readonly LothEntryDTO[]): LothEntryDTO[] {
  return entries.filter(
    (e) => e.section === "trozado" && e.status !== "anulado" && Boolean((e.trozaCode ?? e.treeCode ?? "").trim()),
  );
}

export interface OpcionesEtiquetaLoth {
  /** `window.location.origin`: el QR chico apunta al certificado público de ESTE tenant. */
  origin: string;
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

/**
 * Abre la hoja de etiquetas del Libro TH con QR real (SVG): grande con la
 * ficha en texto (se lee sin internet, con el mismo formato del CTP) y chico
 * con el certificado público `/verificar/<código>`. Devuelve cuántas se
 * imprimieron — 0 si ninguna de las líneas pasadas tiene código.
 */
export async function imprimirEtiquetasTrozasLoth(
  entries: readonly LothEntryDTO[],
  opts: OpcionesEtiquetaLoth,
): Promise<number> {
  const imprimibles = trozasEtiquetablesLoth(entries);
  if (imprimibles.length === 0) return 0;
  const formato = opts.formato ?? FORMATO_ETIQUETA_DEFAULT;
  const barras = opts.barras ?? true;
  const { grande } = correccionDeQr(formato);

  const QR = (await import("qrcode")).default;
  const svg = (contenido: string, errorCorrectionLevel: "L" | "M") =>
    QR.toString(contenido, { type: "svg", margin: 1, errorCorrectionLevel, color: { dark: "#000000", light: "#ffffff" } });

  const tarjetas = await Promise.all(
    imprimibles.map(async (e) => {
      const codigo = codigoDeEtiquetaLoth(e);
      const url = `${opts.origin}/verificar/${encodeURIComponent(codigo)}`;
      const [ficha, chico] = await Promise.all([
        svg(textoFichaDeTrozaLoth(e, opts), grande),
        svg(url, "L"),
      ]);
      return htmlEtiquetaLoth(e, ficha, {
        formato,
        barras,
        tituloHabilitante: opts.tituloHabilitante,
        planNumber: opts.planNumber,
        qrChicoSvg: chico,
      });
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
