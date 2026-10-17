/**
 * Recordar por WhatsApp desde cualquier lugar de «Me deben» (tabla de
 * Deudores, ficha del fiado, «Quién te debe»).
 *
 * Antes cada botón armaba su propio texto («…en Buleje») y nadie anotaba que
 * se le escribió: la bitácora de Cobranza sólo veía los recordatorios que
 * salían de su propia pestaña. Ahora todos usan las plantillas por tramo que
 * el dueño edita en Cobranza y dejan la gestión RECORDATORIO anotada.
 */
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { waLink } from "@/lib/whatsapp-link";
import { formatCurrency } from "@/lib/format";
import { armarMensaje, leerPlantillas } from "@/lib/fiados/plantillas-cobranza";
import { tramoDe } from "@/lib/fiados/gestion-cobranza";
import type { Fiado } from "./tipos";

const DIA_MS = 86_400_000;

/** Días de atraso de un fiado: desde su vencimiento, o desde que se abrió si no tiene fecha. */
export function diasDeAtraso(f: Pick<Fiado, "fechaVence" | "createdAt">, ahora = Date.now()): number {
  const ref = new Date(f.fechaVence ?? f.createdAt).getTime();
  return Math.max(0, Math.floor((ahora - ref) / DIA_MS));
}

export async function anotarRecordatorio(customerId: string): Promise<boolean> {
  try {
    const r = await fetch("/api/fiados/gestiones", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      credentials: "include",
      body: JSON.stringify({ customerId, tipo: "RECORDATORIO", nota: "WhatsApp desde Me deben" }),
    });
    return r.ok;
  } catch (e) {
    logger.error("[fiados] no se pudo anotar el recordatorio", { error: String(e) });
    return false;
  }
}

/** Abre WhatsApp con el monto y deja anotado el recordatorio en la bitácora. */
export function recordarPorWhatsApp(d: { telefono: string; nombre: string; saldo: number; dias: number }, onAnotado?: () => void): void {
  const plantillas = leerPlantillas();
  const texto = armarMensaje(plantillas[tramoDe(d.dias)], { nombre: d.nombre, saldo: formatCurrency(d.saldo), dias: d.dias });
  const url = waLink(d.telefono, texto);
  if (!url) {
    toast.error("Ese cliente no tiene un celular válido para WhatsApp");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
  void anotarRecordatorio(d.telefono).then((ok) => { if (ok) onAnotado?.(); });
}
