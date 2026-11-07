/**
 * Etiquetas con QR para los papeles físicos (ADR-516, 31-10).
 *
 * Cada papel subido tiene su código `DOC-000367`. En vez de escribirlo a mano,
 * se imprime una hoja de stickers (A4, 3 columnas × 8 filas = 24 de 70×37 mm, la
 * hoja común de papelería) con el código grande y un QR que abre el papel en el
 * panel desde el celular (`/admin?tab=documentos&doc=<id>`).
 *
 * `maquetarEtiquetas` es pura (posiciones en mm); `generarPdfEtiquetas` dibuja
 * con jspdf + qrcode, que se cargan al usarse (no pesan en el panel).
 */

import { formatoCodigoDocumento } from "./codigo-documento";

export const HOJA_ETIQUETAS = {
  anchoPagina: 210,
  altoPagina: 297,
  columnas: 3,
  filas: 8,
  anchoEtiqueta: 70,
  altoEtiqueta: 37,
} as const;

export const ETIQUETAS_POR_HOJA = HOJA_ETIQUETAS.columnas * HOJA_ETIQUETAS.filas;

export interface PapelParaEtiqueta {
  id: string;
  codigo?: number | null;
  name: string;
  /** Nombre de la carpeta donde está (en chico). */
  carpeta?: string | null;
}

export interface EtiquetaPuesta {
  papel: PapelParaEtiqueta;
  /** Texto del código (`DOC-000367`). */
  codigo: string;
  /** Página (0 = la primera). */
  pagina: number;
  /** Casillero dentro de la hoja (0-23). */
  casillero: number;
  /** Esquina superior izquierda de la etiqueta, en mm. */
  x: number;
  y: number;
}

export interface Maquetado {
  etiquetas: EtiquetaPuesta[];
  /** Hojas necesarias (0 si no hay nada que imprimir). */
  hojas: number;
  /** Papeles sin código: no llevan etiqueta. */
  sinCodigo: number;
}

/** Posición (mm) del casillero `n` (0-23) dentro de su hoja: centrada en la página. */
export function posicionDelCasillero(n: number): { x: number; y: number } {
  const h = HOJA_ETIQUETAS;
  const col = n % h.columnas;
  const fila = Math.floor(n / h.columnas);
  const margenX = (h.anchoPagina - h.columnas * h.anchoEtiqueta) / 2;
  const margenY = (h.altoPagina - h.filas * h.altoEtiqueta) / 2;
  return { x: margenX + col * h.anchoEtiqueta, y: margenY + fila * h.altoEtiqueta };
}

/**
 * Reparte los papeles en la hoja. `empezarEn` (1-24) deja vacíos los casilleros
 * de antes: sirve para reusar una hoja que ya se empezó a gastar.
 */
export function maquetarEtiquetas(papeles: readonly PapelParaEtiqueta[], empezarEn = 1): Maquetado {
  const inicio = Math.min(ETIQUETAS_POR_HOJA, Math.max(1, Math.trunc(empezarEn) || 1)) - 1;
  const etiquetas: EtiquetaPuesta[] = [];
  let sinCodigo = 0;
  for (const papel of papeles) {
    const codigo = formatoCodigoDocumento(papel.codigo);
    if (!codigo) {
      sinCodigo++;
      continue;
    }
    const lugar = inicio + etiquetas.length;
    const casillero = lugar % ETIQUETAS_POR_HOJA;
    etiquetas.push({ papel, codigo, pagina: Math.floor(lugar / ETIQUETAS_POR_HOJA), casillero, ...posicionDelCasillero(casillero) });
  }
  return { etiquetas, hojas: etiquetas.length ? etiquetas[etiquetas.length - 1].pagina + 1 : 0, sinCodigo };
}

/** Lo que abre el QR: el papel en el panel, en el servidor que el celular alcance. */
export function urlDelPapel(origen: string, id: string): string {
  return `${origen.replace(/\/+$/, "")}/admin?tab=documentos&doc=${encodeURIComponent(id)}`;
}

/** Genera el PDF de la hoja de stickers. Devuelve el archivo listo para bajar/imprimir. */
export async function generarPdfEtiquetas(opts: {
  papeles: readonly PapelParaEtiqueta[];
  origen: string;
  empezarEn?: number;
}): Promise<{ blob: Blob; etiquetas: number; hojas: number }> {
  const { etiquetas, hojas } = maquetarEtiquetas(opts.papeles, opts.empezarEn);
  if (etiquetas.length === 0) throw new Error("Ninguno de los papeles tiene código todavía.");
  const [{ jsPDF }, QRCode] = await Promise.all([import("jspdf"), import("qrcode")]);
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const QR_MM = 27;
  const PAD = 3;

  for (const e of etiquetas) {
    if (e.pagina > 0 && e.casillero === 0) doc.addPage();
    // Si la primera hoja se empezó a mitad, jsPDF ya trae la página 1.
    const qr = await QRCode.toDataURL(urlDelPapel(opts.origen, e.papel.id), { errorCorrectionLevel: "M", margin: 0, width: 300 });
    doc.addImage(qr, "PNG", e.x + PAD, e.y + (HOJA_ETIQUETAS.altoEtiqueta - QR_MM) / 2, QR_MM, QR_MM, undefined, "FAST");

    const xt = e.x + PAD + QR_MM + 3;
    const ancho = HOJA_ETIQUETAS.anchoEtiqueta - (xt - e.x) - PAD;
    doc.setTextColor(0);
    doc.setFont("courier", "bold");
    doc.setFontSize(13);
    doc.text(e.codigo, xt, e.y + 11, { maxWidth: ancho });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    const lineas = recortarLineas(doc.splitTextToSize(e.papel.name, ancho) as string[], 2);
    doc.text(lineas, xt, e.y + 17);

    if (e.papel.carpeta) {
      doc.setFontSize(6);
      doc.setTextColor(110);
      const carpeta = recortarLineas(doc.splitTextToSize(e.papel.carpeta, ancho) as string[], 1);
      doc.text(carpeta, xt, e.y + 29);
    }
  }
  return { blob: doc.output("blob"), etiquetas: etiquetas.length, hojas };
}

/** Deja `max` líneas; si sobraban, la última termina en «…». */
export function recortarLineas(lineas: string[], max: number): string[] {
  if (lineas.length <= max) return lineas;
  const corte = lineas.slice(0, max);
  corte[max - 1] = `${corte[max - 1].replace(/\s+\S*$/, "").slice(0, 40)}…`;
  return corte;
}
