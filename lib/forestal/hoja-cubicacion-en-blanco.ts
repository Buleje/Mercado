/**
 * Hoja de cubicación EN BLANCO, con casilla «Lote» (Brandon 30-10, «Lote para
 * la madera suelta»). Es el papel que el cubicador llena con lapicero al pie de
 * la sierra: una fila por medida, y en cada fila el lote de aserrío del que
 * salió la tabla. Al pasarla al Excel (plantilla con la misma columna «Lote»)
 * cada pieza queda en su lote y la Distribución le da a cada línea de
 * producción su volumen exacto (`cubicacion-reparto-por-lote.ts`).
 *
 * Una hoja por lote: con lotes, cada hoja sale con su código, su especie y su
 * permiso ya escritos (y el lote en cada fila, para no copiarlo 25 veces). Sin
 * lotes, una hoja con todo en blanco. Cada hoja lleva el membrete completo del
 * negocio (ADR-514): se entregan sueltas. A4 vertical, una página por hoja.
 *
 * No se registra en ninguna bandeja: es papel para llenar, no un documento emitido.
 */

import { dibujarMembrete } from "@/lib/documentos/membrete-pdf";
import { abrirPdfForestal } from "./membrete-forestal";

export interface HojaCubicacionEnBlanco {
  /** Código del lote de aserrío («29-2026»); vacío = la casilla queda para llenar. */
  lote?: string | null;
  especie?: string | null;
  permiso?: string | null;
}

/** Tope de hojas de una vez: más de esto es un error de selección, no un pedido. */
export const MAX_HOJAS_EN_BLANCO = 30;

/** Alto de fila (mm): entra un número escrito a mano con lapicero. */
const ALTO_FILA = 8.2;
const VERDE: [number, number, number] = [0, 128, 96];

const COLUMNAS = ["N°", "Lote", "Especie", "Cant.", 'Esp. "', 'Anc. "', "Largo '", "Observación"] as const;

/** Las hojas a imprimir: sin lotes, una en blanco; nunca más del tope. */
export function hojasAImprimir(hojas: readonly HojaCubicacionEnBlanco[]): HojaCubicacionEnBlanco[] {
  const limpias = hojas.map((h) => ({
    lote: h.lote?.trim() || null,
    especie: h.especie?.trim() || null,
    permiso: h.permiso?.trim() || null,
  }));
  return limpias.length > 0 ? limpias.slice(0, MAX_HOJAS_EN_BLANCO) : [{ lote: null, especie: null, permiso: null }];
}

/** Una hoja por lote ABIERTO (el que espera la sierra), del más viejo al más nuevo; sin ninguno, una en blanco. */
export function hojasDeLotesAbiertos(
  lotes: readonly { code: string; speciesCommon: string; permiso?: string | null; status: string }[],
): HojaCubicacionEnBlanco[] {
  return lotes
    .filter((l) => l.status === "abierto")
    .map((l) => ({ lote: l.code, especie: l.speciesCommon, permiso: l.permiso ?? null }))
    .sort((a, b) => a.lote.localeCompare(b.lote, "es", { numeric: true }));
}

/** Cuántas filas entran en lo que queda de la página, sin pasar a la siguiente. */
export function filasQueEntran(desdeY: number, altoPagina: number, margenAbajo: number): number {
  const libre = altoPagina - margenAbajo - desdeY - ALTO_FILA /* encabezado */ - 16; /* totales + nota */
  return Math.max(10, Math.floor(libre / ALTO_FILA));
}

export function nombreDeLaHoja(hojas: readonly HojaCubicacionEnBlanco[]): string {
  const con = hojas.filter((h) => h.lote);
  if (con.length === 1) return `hoja-cubicacion-lote-${con[0]!.lote!.replace(/[^\w-]+/g, "-")}.pdf`;
  if (con.length > 1) return `hojas-cubicacion-${con.length}-lotes.pdf`;
  return "hoja-cubicacion-en-blanco.pdf";
}

/** Arma el PDF (sin guardarlo): una página por hoja. */
export async function construirHojaCubicacionEnBlanco(entrada: readonly HojaCubicacionEnBlanco[] = []) {
  const hojas = hojasAImprimir(entrada);
  const autoTable = (await import("jspdf-autotable")).default;
  const codigo = (h: HojaCubicacionEnBlanco) => (h.lote ? `Lote ${h.lote}` : null);
  const pdf = await abrirPdfForestal({ tipo: "Hoja de cubicación", codigo: codigo(hojas[0]!) });
  const { doc, margen, ancho, alto } = pdf;
  const util = ancho - margen * 2;

  hojas.forEach((h, i) => {
    let y = pdf.y;
    if (i > 0) {
      doc.addPage();
      y = dibujarMembrete(doc, { ...pdf.m, codigo: codigo(h) });
    }

    /* Casillas de la cabecera: lo que vale para toda la hoja. */
    const casillas: { label: string; valor: string | null; ancho: number }[] = [
      { label: "Fecha", valor: null, ancho: 0.15 },
      { label: "Lote de aserrío", valor: h.lote ?? null, ancho: 0.18 },
      { label: "Especie", valor: h.especie ?? null, ancho: 0.21 },
      { label: "Permiso", valor: h.permiso ?? null, ancho: 0.26 },
      { label: "Cubicó", valor: null, ancho: 0.2 },
    ];
    const altoCasilla = 12;
    let x = margen;
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.3);
    for (const c of casillas) {
      const w = util * c.ancho;
      doc.rect(x, y, w, altoCasilla);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(107, 114, 128);
      doc.text(c.label.toUpperCase(), x + 1.5, y + 3.2);
      if (c.valor) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        /* Achica la letra hasta que entre (mín. 7): cortar el código del lote o el permiso confunde más. */
        const largo = doc.getTextWidth(c.valor);
        if (largo > w - 3) doc.setFontSize(Math.max(7, (10 * (w - 3)) / largo));
        doc.setTextColor(17, 24, 39);
        doc.text(doc.splitTextToSize(c.valor, w - 3)[0] ?? "", x + 1.5, y + altoCasilla - 2.6);
      }
      x += w;
    }

    /* El lote en cada fila, SIEMPRE en una línea: un código largo («MCP-PRUEBA-29»)
       partía en dos, la fila crecía y la grilla entera se iba a la hoja 2 (30-10). */
    const anchoLote = util * 0.13;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const largoLote = h.lote ? doc.getTextWidth(h.lote) : 0;
    const letraLote = largoLote > 0 ? Math.max(5.5, Math.min(9, (9 * (anchoLote - 3.2)) / largoLote)) : 9;

    const inicio = y + altoCasilla + 4;
    const filas = filasQueEntran(inicio, alto, pdf.margenTabla.bottom);
    const body = Array.from({ length: filas }, (_, k) => [String(k + 1), h.lote ?? "", "", "", "", "", "", ""]);
    autoTable(doc, {
      head: [[...COLUMNAS]],
      body,
      startY: inicio,
      margin: { left: margen, right: margen, bottom: pdf.margenTabla.bottom },
      /* «auto» y no «avoid»: si algo no entra, que siga abajo; con «avoid» la hoja 1 quedaba sólo con la cabecera. */
      pageBreak: "auto",
      rowPageBreak: "avoid",
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 1.5, minCellHeight: ALTO_FILA, valign: "middle", lineColor: [170, 170, 170], lineWidth: 0.2 },
      headStyles: { fillColor: VERDE, textColor: 255, minCellHeight: ALTO_FILA, halign: "center" },
      bodyStyles: { textColor: [150, 150, 150] },
      columnStyles: {
        0: { cellWidth: util * 0.06, halign: "center" },
        1: { cellWidth: anchoLote, halign: "center", fontSize: letraLote, overflow: "ellipsize" },
        2: { cellWidth: util * 0.17 },
        3: { cellWidth: util * 0.09 },
        4: { cellWidth: util * 0.09 },
        5: { cellWidth: util * 0.09 },
        6: { cellWidth: util * 0.09 },
      },
    });

    const fin = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? inicio;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(17, 24, 39);
    doc.text("Total piezas: ____________     Pie tablar: ____________     m³: ____________", margen, fin + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);
    doc.text(
      "Lote: el N.º del lote de aserrío de donde salió la tabla (ej. 29-2026); así la producción sale exacta por lote. " +
        "Espesor y ancho en pulgadas, largo en pies.",
      margen,
      fin + 11,
      { maxWidth: util },
    );
  });

  pdf.cerrar();
  return doc;
}

/** Descarga la(s) hoja(s) para imprimir. */
export async function descargarHojaCubicacionEnBlanco(hojas: readonly HojaCubicacionEnBlanco[] = []): Promise<void> {
  const doc = await construirHojaCubicacionEnBlanco(hojas);
  doc.save(nombreDeLaHoja(hojasAImprimir(hojas)));
}
