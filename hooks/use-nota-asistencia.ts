"use client";

/**
 * useGuardarNota — la nota del día SIN marca (23-10). Optimista: la hoja la
 * muestra YA y, si el servidor la rechaza, vuelve a como estaba con un aviso.
 * `texto` vacío o `null` = borrar. Un 409 (`dia_marcado`: otra pestaña marcó
 * ese día) recarga la hoja, porque la nota ya vive en la marca.
 */

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import { claveNota } from "@/lib/rrhh/nota-del-dia";
import type { FechaKey, HojaAsistenciaDTO, NotaAsistenciaDTO } from "@/lib/rrhh/tipos";

export type GuardarNota = (colaboradorId: string, fecha: FechaKey, texto: string | null) => Promise<boolean>;

function conNota(hoja: HojaAsistenciaDTO, colaboradorId: string, fecha: FechaKey, nota: NotaAsistenciaDTO | null): HojaAsistenciaDTO {
  const k = claveNota(colaboradorId, fecha);
  const sinEsta = (hoja.notas ?? []).filter((n) => claveNota(n.colaboradorId, n.fecha) !== k);
  return { ...hoja, notas: nota ? [...sinEsta, nota] : sinEsta };
}

export function useGuardarNota(setHoja: Dispatch<SetStateAction<HojaAsistenciaDTO | null>>, recargar: () => void): GuardarNota {
  return useCallback(
    async (colaboradorId, fecha, texto) => {
      const nota = texto?.trim() || null;
      const k = claveNota(colaboradorId, fecha);
      let previa: NotaAsistenciaDTO | null = null;
      setHoja((prev) => {
        if (!prev) return prev;
        previa = prev.notas?.find((n) => claveNota(n.colaboradorId, n.fecha) === k) ?? null;
        const optimista = nota ? { colaboradorId, fecha, nota, autor: previa?.autor ?? "", actualizadaEn: new Date().toISOString() } : null;
        return conNota(prev, colaboradorId, fecha, optimista);
      });
      try {
        const res = nota
          ? await fetch("/api/rrhh/asistencia/nota", {
              method: "PUT",
              headers: csrfHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({ colaboradorId, fecha, nota }),
              credentials: "include",
            })
          : await fetch(`/api/rrhh/asistencia/nota?colaboradorId=${encodeURIComponent(colaboradorId)}&fecha=${fecha}`, {
              method: "DELETE",
              headers: csrfHeaders(),
              credentials: "include",
            });
        if (res.ok) {
          if (nota) {
            const data = (await res.json()) as { nota: NotaAsistenciaDTO };
            setHoja((prev) => (prev ? conNota(prev, colaboradorId, fecha, data.nota) : prev));
          }
          return true;
        }
        const error = (await res.json().catch(() => ({ error: "error_desconocido" }))) as { error?: string; message?: string };
        if (res.status === 409) {
          toast.error(error.message ?? "Ese día ya tiene marca: la nota se escribe en la marca.");
          recargar();
          return false;
        }
        toast.error(error.message ?? "No se pudo guardar la nota");
      } catch {
        toast.error("Sin conexión: la nota no se guardó");
      }
      const restaurar = previa;
      setHoja((prev) => (prev ? conNota(prev, colaboradorId, fecha, restaurar) : prev));
      return false;
    },
    [setHoja, recargar],
  );
}
