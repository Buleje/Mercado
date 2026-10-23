"use client";

/**
 * usePedirCorreccion — manda el pedido de corrección de una guía (ADR-512):
 * primero sube la evidencia (si hay) a los papeles de la guía, casillero
 * «Otros» (queda con la etiqueta `gtf:<N°>` en el Archivo), y después el POST
 * a `RUTA_SOLICITUDES_PANEL`.
 *
 * La evidencia viaja sólo como id (`documentoIds`): el servidor comprueba que
 * el documento sea del negocio; el archivo nunca va en el body del pedido.
 */

import { useCallback, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { MAX_BYTES_DOC_GUIA } from "@/lib/forestal/documentos-guia";
import {
  RUTA_SOLICITUDES_PANEL,
  type CrearCorreccionBody,
  type CrearCorreccionRespuesta,
  type SolicitudCorreccionDTO,
} from "@/lib/soporte/correccion-guia";

const RUTA_DOCS = "/api/admin/forestal/guias/documentos";

export type EnvioCorreccion =
  | { ok: true; solicitud: SolicitudCorreccionDTO }
  | { ok: false; mensaje: string; yaAbierta?: boolean; clave?: string; donde?: "casillero" | "item" };

export function validarEvidencia(f: File | null): string | null {
  if (!f) return null;
  if (!/^image\/|^application\/pdf$/.test(f.type)) return "La evidencia va en foto o PDF.";
  if (f.size > MAX_BYTES_DOC_GUIA) return `El archivo pesa más de ${Math.round(MAX_BYTES_DOC_GUIA / 1024 / 1024)} MB: manda una foto más liviana.`;
  return null;
}

async function subirEvidencia(gtfNumber: string, archivo: File): Promise<{ id: string } | { error: string }> {
  const form = new FormData();
  form.append("gtf", gtfNumber);
  form.append("casillero", "otros");
  form.append("file", archivo);
  const r = await fetch(RUTA_DOCS, { method: "POST", credentials: "include", headers: csrfHeaders(), body: form });
  const j = await leerJson<{ documento?: { id?: string }; message?: string }>(r);
  if (!r.ok || !j?.documento?.id) return { error: j?.message ?? `No se pudo subir la evidencia (${r.status}).` };
  return { id: j.documento.id };
}

export function usePedirCorreccion() {
  const [enviando, setEnviando] = useState(false);

  /** `armar` recibe los ids de la evidencia ya subida y devuelve el body, o null si no pasa. */
  const enviar = useCallback(
    async (o: {
      gtfNumber: string;
      evidencia: File | null;
      armar: (documentoIds: readonly string[]) => CrearCorreccionBody | null;
    }): Promise<EnvioCorreccion | null> => {
      /* Validar ANTES de subir: un pedido con errores no deja un archivo suelto en el Archivo. */
      if (!o.armar([])) return null;
      setEnviando(true);
      try {
        const documentoIds: string[] = [];
        if (o.evidencia) {
          const sub = await subirEvidencia(o.gtfNumber, o.evidencia);
          if ("error" in sub) return { ok: false, mensaje: sub.error };
          documentoIds.push(sub.id);
        }
        const body = o.armar(documentoIds);
        if (!body) return null;
        const r = await fetch(RUTA_SOLICITUDES_PANEL, {
          method: "POST",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(body),
        });
        const j = await leerJson<CrearCorreccionRespuesta & { message?: string }>(r);
        if (r.ok && j && j.ok) return { ok: true, solicitud: j.solicitud };
        if (j && !j.ok && j.codigo === "no_emitida") return { ok: false, mensaje: j.error };
        if (r.status === 409) {
          return { ok: false, yaAbierta: true, mensaje: "Esta guía ya tiene un pedido de corrección abierto: espera la respuesta de la plataforma." };
        }
        if (r.status === 404) return { ok: false, mensaje: "La guía ya no está (¿la anularon?). Recarga la lista." };
        if (j && !j.ok && (j.codigo === "casillero_desconocido" || j.codigo === "item_desconocido")) {
          const donde = j.codigo === "item_desconocido" ? "item" : "casillero";
          const otro = donde === "item" ? "elige otra troza o línea de la lista" : "elige otro casillero de la lista";
          return { ok: false, mensaje: `${j.error}${j.clave ? ` (${j.clave})` : ""}: ${otro}.`, clave: j.clave, donde };
        }
        const msg = j && !j.ok ? (j.error ?? j.message) : null;
        return { ok: false, mensaje: msg ?? `No se pudo mandar el pedido (${r.status}).` };
      } catch (err) {
        console.warn("[pedir-correccion] falló el envío", err);
        return { ok: false, mensaje: "Sin conexión: el pedido no salió. Inténtalo de nuevo." };
      } finally {
        setEnviando(false);
      }
    },
    [],
  );

  return { enviar, enviando };
}
