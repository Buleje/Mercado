"use client";

/**
 * use-planta-ubicacion — en qué cancha del aserradero está apilada cada carga.
 *
 * ⚠️ La ubicación del Mapa de Planta es **por GUÍA, no por troza**: el operador
 * arrastra la carga entera a una zona, porque así llega y así se apila. Para una
 * pieza, entonces, la respuesta honesta es «tu carga está en la cancha X» — y
 * así hay que decirlo en pantalla, no «esta troza está en X», que prometería una
 * precisión que el dato no tiene.
 *
 * Falla en silencio a propósito: no saber dónde está apilada una carga no puede
 * romper la pantalla del patio, que sirve igual sin eso.
 */

import { useEffect, useState } from "react";
import { ctpGet } from "@/lib/forestal/ctp-fetch";

interface Respuesta {
  zonas?: { id: string; nombre: string | null; tipo: string }[];
  asignaciones?: Record<string, string>;
}

export interface UbicacionDeCarga {
  zonaId: string;
  nombre: string;
  tipo: string;
}

/** `woodEntryId → cancha`. Vacío mientras carga o si el mapa no está armado. */
export function usePlantaUbicacion(): Record<string, UbicacionDeCarga> {
  const [mapa, setMapa] = useState<Record<string, UbicacionDeCarga>>({});

  useEffect(() => {
    let vivo = true;
    ctpGet<Respuesta>("/api/admin/forestal/ctp/planta")
      .then((r) => {
        if (!vivo) return;
        const porId = new Map((r.zonas ?? []).map((z) => [z.id, z]));
        const out: Record<string, UbicacionDeCarga> = {};
        for (const [entryId, zonaId] of Object.entries(r.asignaciones ?? {})) {
          const z = porId.get(zonaId);
          /* Una asignación a una zona borrada no se muestra: decir el id crudo
             de una cancha que ya no existe es peor que no decir nada. */
          if (z) out[entryId] = { zonaId, nombre: z.nombre ?? "Zona sin nombre", tipo: z.tipo };
        }
        setMapa(out);
      })
      .catch(() => { /* sin mapa de planta la pestaña funciona igual */ });
    return () => { vivo = false; };
  }, []);

  return mapa;
}
