/**
 * lib/documentos/membrete-imprimir.ts — imprime un papel HTML en una ventana
 * nueva con el membrete del negocio (logo, nombre, RUC, tipo/código/fecha) y el
 * pie con la hora de emisión. Para los papeles que se arman como HTML (cronograma
 * y resumen de un préstamo). Sólo en el navegador.
 *
 * La ventana se abre al instante (el navegador sólo permite abrirla dentro del
 * clic) y se escribe cuando llega el membrete; si el membrete tarda o falla,
 * el papel sale igual con el monograma.
 */

import { membreteDelDocumento } from "@/lib/documentos/membrete-cargar";
import { datosDelMembrete, fechaDelDocumento, type DocumentoMembrete } from "@/lib/documentos/membrete-pdf";
import { escaparHtml, membreteHtml } from "@/lib/documentos/membrete-html";
import { logger } from "@/lib/logger";

export interface HojaImpresa extends DocumentoMembrete {
  /** El `<title>` de la ventana (nombre sugerido al guardar como PDF). */
  titulo: string;
  /** CSS propio del cuerpo (sin hex: el papel va en blanco). */
  estilos?: string;
  /** El cuerpo ya escapado. */
  cuerpo: string;
  /** Si el negocio no tiene nombre registrado. */
  nombreRespaldo?: string | null;
}

export async function imprimirHoja(h: HojaImpresa): Promise<void> {
  const w = window.open("", "_blank");
  if (!w) return;
  let cab = { estilos: "", cabecera: "", pie: "" };
  try {
    const m = await membreteDelDocumento();
    const datos = datosDelMembrete({ ...m, nombre: m.nombre ?? h.nombreRespaldo ?? null }, { fecha: fechaDelDocumento(new Date().toISOString()), tipo: h.tipo, codigo: h.codigo, extra: h.extra });
    if (h.fecha) datos.fecha = h.fecha;
    cab = membreteHtml(datos);
  } catch (err) {
    logger.warn("[documentos] el membrete no cargó para imprimir", { error: String(err) });
  }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escaparHtml(h.titulo)}</title>
<style>
@media print{@page{margin:1.5cm}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
body{font-family:Helvetica,Arial,sans-serif;color:rgb(31 41 51);padding:20px}
${cab.estilos}
${h.estilos ?? ""}
</style></head><body>${cab.cabecera}${h.cuerpo}${cab.pie}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 300);
}
