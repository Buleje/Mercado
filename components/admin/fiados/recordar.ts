/**
 * Recordar por WhatsApp desde cualquier lugar de «Me deben» (tabla de
 * Deudores, ficha del fiado, «Quién te debe», Agenda).
 *
 * Antes cada botón armaba su propio texto («…en Buleje») y nadie anotaba que
 * se le escribió: la bitácora de Cobranza sólo veía los recordatorios que
 * salían de su propia pestaña. Ahora todos usan las plantillas por tramo que
 * el dueño edita en Cobranza y dejan la gestión RECORDATORIO anotada.
 *
 * M36 (auditoría 15-10): antes de abrir WhatsApp se muestra a quién, cuánto
 * debe, el último contacto y el texto (editable); si ya se le escribió hoy,
 * el título lo dice. La gestión guarda el texto que salió.
 */
import { useCallback } from "react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { waLink } from "@/lib/whatsapp-link";
import { formatCurrency } from "@/lib/format";
import { armarMensaje, leerPlantillas } from "@/lib/fiados/plantillas-cobranza";
import { tramoDe, type Gestion } from "@/lib/fiados/gestion-cobranza";
import { notaDelEnvio, recordatoriosDeHoy, ultimaGestionDe, ultimoContactoLeido } from "@/lib/fiados/recordatorio-revisable";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import type { Fiado } from "./tipos";

const DIA_MS = 86_400_000;

/** Días de atraso de un fiado: desde su vencimiento, o desde que se abrió si no tiene fecha. */
export function diasDeAtraso(f: Pick<Fiado, "fechaVence" | "createdAt">, ahora = Date.now()): number {
  const ref = new Date(f.fechaVence ?? f.createdAt).getTime();
  return Math.max(0, Math.floor((ahora - ref) / DIA_MS));
}

export async function anotarRecordatorio(customerId: string, nota = "WhatsApp desde Me deben"): Promise<boolean> {
  try {
    const r = await fetch("/api/fiados/gestiones", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      credentials: "include",
      body: JSON.stringify({ customerId, tipo: "RECORDATORIO", nota }),
    });
    return r.ok;
  } catch (e) {
    logger.error("[fiados] no se pudo anotar el recordatorio", { error: String(e) });
    return false;
  }
}

export interface DatosDelRecordatorio {
  telefono: string;
  nombre: string;
  saldo: number;
  dias: number;
  /** El texto ya armado (Cobranza usa sus plantillas en memoria); si falta, se arma acá. */
  texto?: string;
}

/**
 * Recordar con vista previa: muestra destinatario, deuda y último contacto,
 * deja cambiar el texto y recién ahí abre WhatsApp y anota la gestión con lo
 * que salió. `gestiones` = la bitácora de Cobranza (para el último contacto y
 * el «ya le escribiste hoy»).
 */
export function useRecordarPorWhatsApp(gestiones: readonly Gestion[] = []) {
  const { prompt } = useConfirm();
  return useCallback(
    async (d: DatosDelRecordatorio, onAnotado?: () => void): Promise<void> => {
      const propuesto = d.texto ?? armarMensaje(leerPlantillas()[tramoDe(d.dias)], { nombre: d.nombre, saldo: formatCurrency(d.saldo), dias: d.dias });
      if (!waLink(d.telefono, propuesto)) {
        toast.error("Ese cliente no tiene un celular válido para WhatsApp");
        return;
      }
      const hoy = recordatoriosDeHoy(gestiones).get(d.telefono);
      const texto = await prompt({
        title: hoy ? `Ya le escribiste hoy a ${d.nombre}` : `Recordarle a ${d.nombre}`,
        description: [
          `WhatsApp al ${d.telefono} · debe ${formatCurrency(d.saldo)}${d.dias > 0 ? ` · ${d.dias} ${d.dias === 1 ? "día" : "días"} de atraso` : ""}`,
          ultimoContactoLeido(ultimaGestionDe(gestiones, d.telefono)),
        ].join(". "),
        label: "Mensaje (puedes cambiarlo)",
        inputType: "textarea",
        defaultValue: propuesto,
        required: true,
        intent: hoy ? "warning" : "info",
        confirmLabel: hoy ? "Escribirle otra vez" : "Abrir WhatsApp",
      });
      if (texto == null) return;
      const url = waLink(d.telefono, texto.trim());
      if (!url) return;
      window.open(url, "_blank", "noopener,noreferrer");
      void anotarRecordatorio(d.telefono, notaDelEnvio(texto)).then((ok) => { if (ok) onAnotado?.(); });
    },
    [gestiones, prompt],
  );
}
