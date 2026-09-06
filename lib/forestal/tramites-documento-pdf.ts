"use client";

/**
 * tramites-documento-pdf — un trámite, como PDF de verdad (ADR-364 ronda 2).
 *
 * Hermano simplificado de `ctp-documento-pdf.ts`: ESE fotografía la hoja con
 * casilleros (`.doc-hoja` + `paginar()`, porque una fila de la GTF no se puede
 * cortar al medio sin volverse ilegible). El documento de un trámite es una
 * carta corrida — texto y, cuando corresponde, una tabla simple — así que
 * alcanza con cortar por ALTO FIJO de página: es lo mismo que hace el navegador
 * al imprimir, y el CSS de impresión (`page-break-before` en el anexo) ya
 * ayuda a que el corte caiga en un lugar razonable.
 */

const HOJA_MM = { ancho: 210, alto: 297 };

/**
 * El `<body>` del documento (ya renderizado en un iframe fuera de pantalla),
 * como Blob PDF paginado a A4.
 *
 * `codigo` (Brandon 2026-08-26: "en cada documento tenga un código número de
 * código de Hoja"): se estampa en el pie de CADA hoja del PDF, no sólo en el
 * cuerpo del documento — si un trámite de varias páginas se archiva o se
 * imprime y las hojas se separan físicamente, cada una sigue diciendo de qué
 * documento es. Se estampa aunque sea una sola página: es el dato que
 * reemplaza la vieja marca de agua genérica ("Generado por sistema Buleje
 * CTP"), que no servía para identificar NADA en concreto.
 */
export async function tramiteDocumentoAPdf(doc: Document, codigo?: string): Promise<Blob> {
  const cuerpo = doc.body;
  if (!cuerpo) throw new Error("El documento no tiene contenido que exportar.");

  const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const lienzo = await toCanvas(cuerpo, { pixelRatio: 2, backgroundColor: "#ffffff" });

  const pxPorMm = lienzo.width / HOJA_MM.ancho;
  const altoPaginaPx = HOJA_MM.alto * pxPorMm;
  const paginas = Math.max(1, Math.ceil(lienzo.height / altoPaginaPx));

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });

  for (let i = 0; i < paginas; i++) {
    const desde = i * altoPaginaPx;
    const alto = Math.min(altoPaginaPx, lienzo.height - desde);

    const trozo = doc.createElement("canvas");
    trozo.width = lienzo.width;
    trozo.height = Math.max(1, Math.round(alto));
    const ctx = trozo.getContext("2d");
    if (!ctx) throw new Error("El navegador no pudo preparar la hoja para el PDF.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, trozo.width, trozo.height);
    ctx.drawImage(lienzo, 0, desde, lienzo.width, alto, 0, 0, lienzo.width, alto);

    if (i > 0) pdf.addPage();
    pdf.addImage(trozo.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, HOJA_MM.ancho, alto / pxPorMm, undefined, "FAST");

    const pie = [codigo, `Hoja ${i + 1} de ${paginas}`].filter(Boolean).join(" · ");
    if (pie) {
      pdf.setFontSize(7);
      pdf.setTextColor(120, 120, 120);
      pdf.text(pie, HOJA_MM.ancho / 2, HOJA_MM.alto - 6, { align: "center" });
    }
  }

  return pdf.output("blob");
}

/** Nombre de archivo sin caracteres que rompan una carpeta compartida. */
export function nombreArchivoTramite(nombre: string): string {
  const limpio = nombre.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  return `${limpio || "tramite"}.pdf`;
}
