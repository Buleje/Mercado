/**
 * lib/documentos/inspeccion-pdf.ts — la hoja «Para inspección» de Esenciales
 * (Brandon 24-10): membrete del negocio (ADR-514), un recuadro con el QR que
 * abre esas carpetas en línea y un índice por carpeta con cada papel y su
 * semáforo de vencimiento. A4, jsPDF + `qrcode` (los mismos del fotocheck y la
 * hoja de despacho). Sólo en el navegador.
 *
 * La clave del enlace NUNCA se imprime: la hoja la lleva un tercero.
 */

import type { CellHookData } from "jspdf-autotable";
import { abrirPapel } from "@/lib/documentos/membrete-papel";
import { dibujarPies, emitidoEnLima, fechaDelDocumento, PALETA, recortar, tinte, type Rgb } from "@/lib/documentos/membrete-pdf";
import { contarHoja, resumenDeLaHoja, type CarpetaDeLaHoja, type EstadoVence } from "@/lib/documentos/inspeccion-indice";

/** Semáforo con contraste AA sobre blanco (texto) y su tinte para el fondo de la celda. */
const SEMAFORO: Record<EstadoVence, { color: Rgb; texto: string }> = {
  vencido: { color: [185, 28, 28], texto: "Vencido" },
  "por-vencer": { color: [180, 83, 9], texto: "Por vencer" },
  vigente: { color: [21, 128, 61], texto: "Vigente" },
  "sin-fecha": { color: PALETA.terciario, texto: "Sin fecha" },
};

export interface HojaInspeccion {
  carpetas: CarpetaDeLaHoja[];
  enlace: string;
  /** ISO: hasta cuándo abre el QR. */
  venceEnlace: string;
  conClave: boolean;
  /** Si después del índice van los papeles completos (se dice en la hoja). */
  conPapeles: boolean;
}

const fechaCorta = (iso: string | null): string => {
  const f = fechaDelDocumento(iso);
  // «jueves 23/10/2026» → «23/10/2026» en la tabla (la columna es angosta).
  return f ? f.replace(/^\D+\s/, "") : "—";
};

export async function armarHojaInspeccion(h: HojaInspeccion): Promise<{ bytes: ArrayBuffer; paginas: number }> {
  const QR = (await import("qrcode")).default;
  const emitido = new Date();
  const papel = await abrirPapel({
    tipo: "Papeles para inspección",
    fecha: fechaDelDocumento(emitido.toISOString()),
  });
  const { doc, margen, ancho, mb } = papel;
  const color = (c: Rgb) => doc.setTextColor(c[0], c[1], c[2]);

  // ── Recuadro del QR ──
  const LADO = 40;
  const alto = LADO + 8;
  const y0 = papel.y;
  doc.setDrawColor(PALETA.regla[0], PALETA.regla[1], PALETA.regla[2]);
  doc.setLineWidth(0.3);
  const fondo = tinte(mb.acento, 0.94);
  doc.setFillColor(fondo[0], fondo[1], fondo[2]);
  doc.roundedRect(margen, y0, ancho, alto, 2, 2, "FD");
  const qr = await QR.toDataURL(h.enlace, { margin: 1, width: 480, errorCorrectionLevel: h.enlace.length > 220 ? "L" : "M" });
  doc.addImage(qr, "PNG", margen + ancho - LADO - 4, y0 + 4, LADO, LADO);

  const xt = margen + 6;
  const anchoTexto = ancho - LADO - 16;
  let yt = y0 + 9;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  color(mb.acento);
  doc.text("Míralos en línea", xt, yt);
  yt += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  color(PALETA.tinta);
  doc.text("Escanea el código con la cámara del celular o entra a:", xt, yt);
  yt += 4.5;
  doc.setFontSize(7.5);
  color(PALETA.secundario);
  const url = doc.splitTextToSize(h.enlace, anchoTexto) as string[];
  doc.text(url.slice(0, 3), xt, yt);
  yt += Math.min(url.length, 3) * 3.4 + 2.5;
  doc.setFontSize(9);
  color(PALETA.tinta);
  doc.setFont("helvetica", "bold");
  doc.text(`Abre hasta el ${emitidoEnLima(new Date(h.venceEnlace))} (hora de Lima)`, xt, yt);
  doc.setFont("helvetica", "normal");
  if (h.conClave) {
    yt += 4.5;
    doc.text("Pide la clave a quien te entregó esta hoja.", xt, yt);
  }
  papel.y = y0 + alto + 8;

  // ── Resumen + leyenda ──
  const cuenta = contarHoja(h.carpetas);
  papel.linea(
    `${h.carpetas.length} carpeta${h.carpetas.length === 1 ? "" : "s"} · ${resumenDeLaHoja(cuenta)}`,
    { tam: 10, negrita: true },
  );
  let xl = margen;
  const yl = papel.y - 1;
  doc.setFontSize(8);
  for (const e of ["vencido", "por-vencer", "vigente", "sin-fecha"] as const) {
    const s = SEMAFORO[e];
    doc.setFillColor(s.color[0], s.color[1], s.color[2]);
    doc.circle(xl + 1.4, yl - 1, 1.4, "F");
    color(PALETA.secundario);
    const t = e === "por-vencer" ? "Vence en 30 días o menos" : e === "sin-fecha" ? "Sin fecha de vencimiento" : s.texto;
    doc.text(t, xl + 4, yl);
    xl += doc.getTextWidth(t) + 10;
  }
  papel.y += 4;
  if (h.conPapeles) papel.linea("Después de este índice van los papeles completos, en el mismo orden.", { tam: 8.5, color: PALETA.secundario });
  papel.y += 2;

  // ── Índice por carpeta ──
  h.carpetas.forEach((c, i) => {
    papel.espacio(26);
    papel.linea(recortar(doc, `${i + 1}. ${c.nombre}`, ancho), { tam: 11.5, negrita: true, color: PALETA.tinta, alto: 5 });
    const donde = c.ruta.length ? `En ${c.ruta.join(" › ")}` : "En la raíz del Archivo";
    papel.linea(recortar(doc, donde, ancho), { tam: 8, color: PALETA.terciario, alto: 4.5 });
    if (c.papeles.length === 0) {
      papel.linea("Sin papeles a la vista en esta carpeta.", { tam: 9, color: PALETA.secundario });
    } else {
      papel.tabla({
        head: [["N.°", "Papel", "Tipo", "Subido", "Vence", "Estado"]],
        body: c.papeles.map((p, n) => [String(n + 1), p.nombre, p.tipo, fechaCorta(p.subido), fechaCorta(p.vence), SEMAFORO[p.estado].texto]),
        columnStyles: {
          0: { cellWidth: 10, halign: "right" },
          2: { cellWidth: 34 },
          3: { cellWidth: 22 },
          4: { cellWidth: 22 },
          5: { cellWidth: 24, fontStyle: "bold" },
        },
        didParseCell: (d: CellHookData) => {
          if (d.section !== "body" || d.column.index !== 5) return;
          const p = c.papeles[d.row.index];
          if (!p) return;
          const s = SEMAFORO[p.estado].color;
          d.cell.styles.textColor = [s[0], s[1], s[2]];
          const t = tinte(s, 0.88);
          d.cell.styles.fillColor = [t[0], t[1], t[2]];
        },
      });
    }
    const notas = [
      c.enSubcarpetas > 0 ? `${c.enSubcarpetas} papel${c.enSubcarpetas === 1 ? "" : "es"} más en sus subcarpetas (no van en el enlace).` : null,
      c.ocultos > 0 ? `${c.ocultos} papel${c.ocultos === 1 ? "" : "es"} con permisos restringidos no se muestra${c.ocultos === 1 ? "" : "n"}.` : null,
    ].filter((x): x is string => !!x);
    for (const n of notas) papel.linea(n, { tam: 8, color: PALETA.terciario, alto: 4.5 });
    papel.y += 3;
  });

  dibujarPies(doc, mb, { emitido });
  return { bytes: doc.output("arraybuffer"), paginas: doc.getNumberOfPages() };
}

/** Une la hoja con el expediente (los papeles completos) en un solo PDF para imprimir de una. */
export async function unirConExpediente(hoja: ArrayBuffer, expediente: ArrayBuffer): Promise<{ bytes: Uint8Array; paginas: number }> {
  const { PDFDocument } = await import("pdf-lib");
  const [salida, exp] = await Promise.all([PDFDocument.load(hoja), PDFDocument.load(expediente)]);
  const paginas = await salida.copyPages(exp, exp.getPageIndices());
  for (const p of paginas) salida.addPage(p);
  return { bytes: await salida.save(), paginas: salida.getPageCount() };
}
