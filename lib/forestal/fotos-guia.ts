"use client";

/**
 * Guardar las fotos de una GUÍA de ingreso desde el cliente.
 *
 * Un solo helper para las dos puertas que las suben (la recepción de la guía y
 * el detalle de un ingreso ya cargado — ver `CtpRecepcionTrozas.tsx` y
 * `CtpEntryDetailModal.tsx`): las dos mandan la lista COMPLETA a la misma
 * acción del PATCH (`WoodEntriesDB.fotosGuia`), que la escribe en todas las
 * filas de la GTF. `CtpFotosDelIngreso` ya subió los archivos (sellados, al
 * almacén privado) antes de llamar acá — esto sólo persiste la lista en el libro.
 */

import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { normalizarFotos, type FotoCarga } from "./fotos-carga";

/**
 * De qué guía son las fotos cuando el N° vive en dos permisos (ADR-504). Las
 * dos puertas tienen el ingreso abierto: con `ingresoId` el servidor toma el
 * permiso de ESE ingreso y no responde 409 GUIA_AMBIGUA.
 */
export type PistaDeGuia = { ingresoId?: string; contratoId?: string | null };

/** Devuelve la lista como quedó en el libro (el servidor agrega quién/cuándo si faltaba). */
export async function guardarFotosDeGuia(
  gtfNumber: string,
  fotos: FotoCarga[],
  pista: PistaDeGuia = {},
): Promise<FotoCarga[]> {
  const res = await fetch("/api/admin/forestal/wood-entries", {
    method: "PATCH",
    credentials: "include",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ action: "fotos_guia", gtfNumber, fotos, ...pista }),
  });
  const data = await leerJson<{ fotos?: unknown; error?: string; message?: string }>(res);
  if (!res.ok) {
    throw new Error(data?.message ?? data?.error ?? "No se pudieron guardar las fotos de la guía.");
  }
  return Array.isArray(data?.fotos) ? normalizarFotos(data.fotos) : fotos;
}
