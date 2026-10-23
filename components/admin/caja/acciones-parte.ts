"use client";

/**
 * Sacar el parte del día de la pantalla: imprimir (hoja térmica de 80 mm),
 * bajar el CSV de movimientos y mandarlo por WhatsApp. Las cifras vienen del
 * servidor (`ParteDelDia`); estas funciones sólo abren la ventana o el link.
 */
import type { ParteDelDia } from "@/lib/caja/parte-del-dia";
import { descargarTexto, movimientosACsv, textoParteWhatsApp } from "@/lib/caja/parte-exportar";
import { htmlReporteDeCaja } from "@/lib/caja/reporte-impreso";
import { formatCurrency, formatDateLong, formatTime } from "@/lib/format";
import { diaLocal } from "@/lib/fechas/dia-local";
import type { Membrete } from "@/lib/admin/membrete";
import { cabeceraTicketHtml, imprimirAlCargar } from "@/lib/documentos/hoja-negocio";
import type { CashRegister } from "./tipos";

/** Abre la hoja en una ventana chica y lanza la impresión (el HTML ya viene escapado). */
export function abrirHojaImpresa(html: string): boolean {
  const w = window.open("", "_blank", "width=420,height=600");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  imprimirAlCargar(w); // espera el logo del negocio
  return true;
}

/** El parte de la caja con el logo y el nombre del negocio (80 mm: logo chico + nombre). */
export function htmlParteConNegocio(caja: CashRegister, textos: { fecha: string; hora: string }, parte: ParteDelDia | null, membrete?: Membrete | null, negocio?: string): string {
  const cab = membrete ? cabeceraTicketHtml(membrete, { ancho: 80 }) : null;
  return htmlReporteDeCaja(caja, textos, formatCurrency, parte, membrete?.nombre ?? negocio, cab);
}

export function imprimirParte(caja: CashRegister, parte: ParteDelDia | null, negocio?: string, membrete?: Membrete | null): boolean {
  /* El HTML sale de una función pura que escapa TODO lo que viene de la base
     (F4, revisión de seguridad: un medio de pago con `<img onerror>` se ejecutaba). */
  return abrirHojaImpresa(htmlParteConNegocio(caja, { fecha: formatDateLong(new Date()), hora: formatTime(caja.openedAt) }, parte, membrete, negocio));
}

export function exportarMovimientosCsv(caja: CashRegister): void {
  const csv = movimientosACsv(caja.movements, (iso) => formatTime(iso));
  descargarTexto(csv, `caja-${diaLocal(caja.openedAt)}.csv`);
}

/** WhatsApp sin número: el dueño elige el chat (su propio número, el grupo de la familia…). */
export function enviarParteWhatsApp(parte: ParteDelDia): void {
  const texto = textoParteWhatsApp(parte, formatCurrency, formatDateLong(parte.abiertaEn));
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
}
