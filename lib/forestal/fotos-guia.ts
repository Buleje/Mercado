"use client";

/**
 * Guardar las fotos de una GUÍA de ingreso desde el cliente.
 *
 * Un solo helper para las dos puertas que las suben (la recepción de la guía y
 * el detalle de un ingreso ya cargado — ver `CtpRecepcionTrozas.tsx` y
 * `CtpEntryDetailModal.tsx`): las dos mandan la lista COMPLETA a la misma
 * acción del PATCH (`WoodEntriesDB.fotosGuia`), que la escribe en todas las
 * filas de la GTF. `CtpFotosDelIngreso` ya subió los archivos a `/api/upload`
 * antes de llamar acá — esto sólo persiste las URLs en el libro.
 */

import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";

export async function guardarFotosDeGuia(gtfNumber: string, fotos: string[]): Promise<string[]> {
  const res = await fetch("/api/admin/forestal/wood-entries", {
    method: "PATCH",
    credentials: "include",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ action: "fotos_guia", gtfNumber, fotos }),
  });
  const data = await leerJson<{ fotos?: string[]; error?: string; message?: string }>(res);
  if (!res.ok) {
    throw new Error(data?.message ?? data?.error ?? "No se pudieron guardar las fotos de la guía.");
  }
  return data?.fotos ?? fotos;
}
