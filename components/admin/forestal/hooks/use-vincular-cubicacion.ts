"use client";

/**
 * Vincular una cubicación GUARDADA a corridas del libro (ADR-445).
 *
 * No hay ruta nueva: es el mismo `POST /api/admin/forestal/cubicaciones` que
 * guarda desde el cubicador, con el `id` de la guardada (la actualiza) y sus
 * `ctpEntryIds` SUMADOS a los que ya tenía. Como el servidor reescribe el
 * registro entero con lo que llega, se manda la cubicación tal cual —nombre,
 * fecha, precio, cada pieza con su dueño, tipo forzado y observación—: mandar
 * menos borraría lo que no se mandó (memoria `campos-copiados-a-mano-se-quedan-cortos`).
 */

import { useCallback, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";

/** Las corridas a las que ya está atada (lo viejo guardaba un solo id). */
export function corridasDeLaCubicacion(
  c: Pick<CubicacionRegistro, "ctpEntryId" | "ctpEntryIds">,
): string[] {
  return c.ctpEntryIds?.length ? [...c.ctpEntryIds] : c.ctpEntryId ? [c.ctpEntryId] : [];
}

/** El cuerpo del POST: la guardada completa, con las corridas nuevas sumadas. */
export function cuerpoDelVinculo(c: CubicacionRegistro, corridas: readonly string[]) {
  const ids = [...new Set([...corridasDeLaCubicacion(c), ...corridas])];
  return {
    id: c.id,
    /* La versión que se leyó: si otra persona la cambió después, el servidor
       responde 409 en vez de reescribir piezas viejas encima de las nuevas. */
    updatedAt: c.updatedAt,
    nombre: c.nombre,
    fecha: c.fecha,
    cliente: c.cliente ?? null,
    especie: c.especie ?? null,
    notas: c.notas ?? null,
    precioPt: c.precioPt,
    ctpEntryId: c.ctpEntryId ?? ids[0],
    ctpEntryIds: ids,
    gtfNumber: c.gtfNumber ?? null,
    piezas: c.piezas.map((p) => ({
      id: p.id,
      cantidad: p.cantidad,
      espesor: p.espesor,
      ancho: p.ancho,
      largo: p.largo,
      uEspesor: p.uEspesor,
      uAncho: p.uAncho,
      uLargo: p.uLargo,
      especie: p.especie ?? null,
      dueno: p.dueno ?? null,
      duenoParteId: p.duenoParteId ?? null,
      tipo: p.tipo ?? null,
      observacion: p.observacion ?? null,
    })),
  };
}

/** Lo que se dice cuando el servidor responde 409 `cubicacion_desactualizada`. */
export const MENSAJE_DESACTUALIZADA = "Otra persona cambió esta cubicación: vuelve a abrirla.";

/** ¿La respuesta dice que la guardada ya no es la que se leyó? */
export const esDesactualizada = (status: number, j: { error?: string }): boolean =>
  status === 409 && j.error === "cubicacion_desactualizada";

export type ResultadoDelVinculo = "ok" | "desactualizada" | "error";

export function useVincularCubicacion() {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vincular = useCallback(
    async (c: CubicacionRegistro, corridas: readonly string[]): Promise<ResultadoDelVinculo> => {
      setGuardando(true);
      setError(null);
      try {
        const r = await fetch("/api/admin/forestal/cubicaciones", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify(cuerpoDelVinculo(c, corridas)),
        });
        const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
        /* Nunca se reintenta con lo que se tenía: quien llama relee la lista. */
        if (esDesactualizada(r.status, j)) {
          setError(MENSAJE_DESACTUALIZADA);
          return "desactualizada";
        }
        if (!r.ok) throw new Error(j.message ?? j.error ?? `El servidor respondió ${r.status}`);
        /* El día cambia de marca («con cubicación»): la tira y el modal del
           día releen sin el caché de 15-30 s. */
        invalidarCtp();
        return "ok";
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return "error";
      } finally {
        setGuardando(false);
      }
    },
    [],
  );

  return { vincular, guardando, error };
}
