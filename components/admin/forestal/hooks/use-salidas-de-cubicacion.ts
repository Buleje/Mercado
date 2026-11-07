"use client";

/**
 * Anotar, corregir o quitar un viaje de la madera de una cubicación guardada
 * (Brandon 28-10). `PATCH /api/admin/forestal/cubicaciones?id=` con
 * `{ salida }` (sin `id` = nuevo, con `id` = reemplaza) o `{ quitarSalida }`;
 * responde la guardada entera ya actualizada. No mueve plata ni el Libro.
 */
import { useCallback, useState } from "react";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import type { SalidaEntrada } from "@/lib/forestal/cubicacion-salidas";
import { jsonPost, pedir, type Resultado } from "./use-cubicaciones-trozas";

type Cuerpo = { salida: SalidaEntrada } | { quitarSalida: string };

const leerGuardada = (j: unknown): CubicacionRegistro | null => ((j ?? {}) as { cubicacion?: CubicacionRegistro }).cubicacion ?? null;

/** Sin estado: lo usa también «Guardar» después de guardar el lote. */
export function mandarSalida(id: string, cuerpo: Cuerpo): Promise<Resultado<CubicacionRegistro | null>> {
  return pedir(`/api/admin/forestal/cubicaciones?id=${encodeURIComponent(id)}`, jsonPost("PATCH", cuerpo), leerGuardada);
}

/** Lo que sale mal, en una frase (el servidor ya la trae en `message`). */
export async function anotarSalida(id: string, entrada: SalidaEntrada): Promise<{ ok: true; cubicacion: CubicacionRegistro } | { ok: false; mensaje: string }> {
  const r = await mandarSalida(id, { salida: entrada });
  if (r.ok && r.data) return { ok: true, cubicacion: r.data };
  return { ok: false, mensaje: r.ok ? "el servidor no devolvió la cubicación" : r.mensaje };
}

export function useSalidasDeCubicacion(id: string, onGuardada: (c: CubicacionRegistro) => void) {
  /** Lo que se está mandando: «viaje» o el id del viaje que se quita. */
  const [enviando, setEnviando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mandar = useCallback(async (cuerpo: Cuerpo, que: string): Promise<boolean> => {
    setEnviando(que);
    setError(null);
    const r = await mandarSalida(id, cuerpo);
    setEnviando(null);
    if (!r.ok || !r.data) {
      setError(r.ok ? "No se pudo: el servidor no devolvió la cubicación." : r.mensaje);
      return false;
    }
    onGuardada(r.data);
    return true;
  }, [id, onGuardada]);

  const anotar = useCallback((entrada: SalidaEntrada) => mandar({ salida: entrada }, "viaje"), [mandar]);
  const quitar = useCallback((salidaId: string) => mandar({ quitarSalida: salidaId }, salidaId), [mandar]);
  return { enviando, error, setError, anotar, quitar };
}
