"use client";

/**
 * La GTF de SALIDA de un despacho del Libro CTP lista para imprimir (27-10):
 * la guía ENTERA (todas sus líneas con el mismo N°) y las entradas del
 * talonario, armadas por el servidor (`RUTA_GUIA_SALIDA`). La usan el modal del
 * talonario, «con formato», la hoja SERFOR y el resumen interno del menú ⋯ de
 * la fila de despacho: todos imprimen los mismos valores.
 */

import { useCallback, useEffect, useState } from "react";
import { RUTA_GUIA_SALIDA, type RespuestaGuiaSalida } from "@/lib/forestal/guia-salida-imprimible";

/** El aviso de una guía que todavía no se emitió (409 `SIN_GUIA`). */
export const AVISO_SIN_GUIA = "Emite la guía primero: botón Guía";

/** Un error que ya viene en palabras para la pantalla (los demás —la red caída— se dicen con un genérico). */
export class AvisoGuiaSalida extends Error {}

type CuerpoGuiaSalida = Partial<RespuestaGuiaSalida> & { error?: string; message?: string; code?: string };

/** Pide la guía de salida de un despacho; el error ya viene en palabras para la pantalla. */
export async function leerGuiaSalida(despachoId: string): Promise<RespuestaGuiaSalida> {
  const r = await fetch(`${RUTA_GUIA_SALIDA}?${new URLSearchParams({ despacho: despachoId }).toString()}`, { credentials: "include" });
  const j = (await r.json().catch(() => null)) as CuerpoGuiaSalida | null;
  if (r.status === 409 && (j?.code ?? j?.error) === "SIN_GUIA") throw new AvisoGuiaSalida(AVISO_SIN_GUIA);
  if (!r.ok || !j?.guia || !j.entradas) throw new AvisoGuiaSalida(j?.message ?? j?.error ?? "No se pudo leer la guía de salida. Prueba de nuevo.");
  return { guia: j.guia, entradas: j.entradas };
}

/** La guía de salida de un despacho, con su carga y su error. */
export function useGuiaSalida(despachoId: string) {
  const [datos, setDatos] = useState<RespuestaGuiaSalida | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    let vivo = true;
    setDatos(null);
    setError(null);
    leerGuiaSalida(despachoId)
      .then((d) => {
        if (vivo) setDatos(d);
      })
      .catch((err: unknown) => {
        if (vivo) setError(err instanceof Error ? err.message : "No se pudo leer la guía de salida. Prueba de nuevo.");
      });
    return () => {
      vivo = false;
    };
  }, [despachoId, vuelta]);

  const reintentar = useCallback(() => setVuelta((v) => v + 1), []);
  return { datos, error, cargando: !datos && !error, reintentar };
}
