"use client";

/**
 * ctp-documento-pdf.ts — el documento del libro como PDF de verdad.
 *
 * «Descargar» bajaba un `.html`: se abre en un navegador y se imprime, pero no
 * es un archivo que se adjunte a un correo, se suba al expediente o se mande por
 * WhatsApp sin que del otro lado pregunten qué es eso. Esto produce un PDF A4
 * real, con sus páginas.
 *
 * ── Por qué se rasteriza y no se re-dibuja ───────────────────────────────────
 * La alternativa era escribir un segundo renderizador (pdf-lib dibujando cada
 * casillero a mano). Serían DOS verdades del mismo documento, y la que se
 * imprime y la que se archiva se desincronizarían al primer cambio de una
 * columna — justo en un papel que es declaración jurada. Acá se fotografía la
 * MISMA hoja que el visor está mostrando: lo que se vio es exactamente lo que se
 * archiva, y hay un solo lugar donde cambiar el diseño.
 *
 * ── Y por qué las páginas se cortan con `paginar()` ──────────────────────────
 * Porque son los mismos cortes que hace la impresora: si acá se partiera la
 * imagen cada 273 mm a ojo, una fila de trozas quedaría cortada al medio en el
 * PDF y entera en el papel. El PDF, la vista previa y la impresión cuentan las
 * hojas igual porque las cuenta la misma función.
 *
 * El texto queda como imagen (no se puede seleccionar). Es el precio de la
 * fidelidad; para buscar dentro está el libro, que es la fuente, no el papel.
 */

import { ALTO_UTIL_MM, ANCHO_HOJA_MM, paginar } from "./ctp-documento-print";

/** Margen de `@page` del documento — el mismo que usa `documentoHtml`. */
const MARGEN_MM = 12;
const ANCHO_UTIL_MM = ANCHO_HOJA_MM - MARGEN_MM * 2;
const PX_POR_MM = 96 / 25.4;
/** 2× para que la letra de 6.5 pt no salga con bordes de escalera al imprimir. */
const NITIDEZ = 2;

export interface PdfDocumentoOpts {
  /** Pie de cada página. Sin él, la hoja 3 de un anexo es un papel anónimo. */
  pieCorrido?: string;
}

/**
 * El documento que muestra el visor, como Blob PDF.
 *
 * Recibe el `Document` del iframe —no un HTML suelto— porque lo que se
 * fotografía es la hoja YA renderizada: mismas medidas, mismos saltos.
 */
export async function documentoAPdf(doc: Document, opts: PdfDocumentoOpts = {}): Promise<Blob> {
  const hoja = doc.querySelector<HTMLElement>(".doc-hoja");
  if (!hoja) throw new Error("El documento no tiene hoja que exportar.");

  // Las guías de corte son ayuda de pantalla: en el PDF serían rayas impresas.
  const guias = [...hoja.querySelectorAll<HTMLElement>(".doc-corte")];
  const visibles = guias.map((g) => g.style.display);
  guias.forEach((g) => (g.style.display = "none"));

  try {
    const { hojas, cortes } = paginar(doc);
    const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);

    const lienzo = await toCanvas(hoja, {
      pixelRatio: NITIDEZ,
      backgroundColor: "#ffffff",
      // La hoja de pantalla trae sombra y borde para parecer papel sobre la
      // mesa; en el papel de verdad serían un marco gris impreso.
      style: { boxShadow: "none", border: "none", margin: "0" },
    });

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
    const escala = lienzo.width / (ANCHO_HOJA_MM * PX_POR_MM); // px de lienzo por px CSS
    const pad = MARGEN_MM * PX_POR_MM * escala;

    // Los cortes vienen en px CSS medidos desde el inicio del CONTENIDO; el
    // lienzo incluye el padding de la hoja, así que se desplazan por `pad`.
    const limites = [0, ...cortes.map((c) => c * escala), lienzo.height - pad * 2];
    const anchoTrozo = lienzo.width - pad * 2;

    for (let i = 0; i < hojas; i++) {
      const desde = limites[i];
      // La última página termina donde termina el contenido, no a los 273 mm:
      // estirar la imagen hasta el borde deformaría la hoja final.
      const hasta = Math.min(limites[i + 1] ?? lienzo.height - pad * 2, desde + ALTO_UTIL_MM * PX_POR_MM * escala);
      const alto = Math.max(1, Math.round(hasta - desde));

      const trozo = doc.createElement("canvas");
      trozo.width = Math.round(anchoTrozo);
      trozo.height = alto;
      const ctx = trozo.getContext("2d");
      if (!ctx) throw new Error("El navegador no pudo preparar la hoja para el PDF.");
      // Fondo explícito: sin esto, el JPEG rellena de negro lo transparente.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, trozo.width, trozo.height);
      ctx.drawImage(lienzo, pad, pad + desde, anchoTrozo, alto, 0, 0, anchoTrozo, alto);

      if (i > 0) pdf.addPage();
      pdf.addImage(
        trozo.toDataURL("image/jpeg", 0.94),
        "JPEG",
        MARGEN_MM,
        MARGEN_MM,
        ANCHO_UTIL_MM,
        (alto / escala) / PX_POR_MM,
        undefined,
        "FAST",
      );

      // El pie va como TEXTO del PDF, no como imagen: es lo único que conviene
      // poder buscar y copiar de un legajo de veinte hojas.
      pdf.setFontSize(6.5);
      pdf.setTextColor(110, 116, 122);
      const pie = [opts.pieCorrido, `Hoja ${i + 1} de ${hojas}`].filter(Boolean).join(" · ");
      pdf.text(pie, ANCHO_HOJA_MM / 2, 297 - 6, { align: "center", maxWidth: ANCHO_UTIL_MM });
    }

    return pdf.output("blob");
  } finally {
    guias.forEach((g, i) => (g.style.display = visibles[i]));
  }
}

/** Nombre de archivo sin caracteres que rompan una carpeta compartida. */
export function nombreArchivo(nombre: string, ext: string): string {
  const limpio = nombre.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  return `${limpio || "documento"}.${ext}`;
}
