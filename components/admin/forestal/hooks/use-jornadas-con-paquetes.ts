"use client";

/**
 * Las jornadas de producción con sus paquetes (`?resumenJornadas=1&paquetes=1`):
 * el resumen de siempre y, al lado, cada corrida con su escuadría, código y
 * piezas. Lo usan el modal del día («Ver qué salió ese día») y el Anexo 04 de
 * los días marcados — UNA consulta, no un pedido por corrida.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import type { DuenosPorDia, ResumenDeJornadas } from "@/lib/forestal/resumen-de-jornadas";
import type { CorridaDelDia } from "@/lib/forestal/piezas-del-dia";

export type JornadasConPaquetes = ResumenDeJornadas & { detalle: CorridaDelDia[] };

/** El mismo `ttl` que el resumen: dos aperturas seguidas no vuelven a pedir. */
const TTL_MS = 15_000;

export function urlJornadasConPaquetes(dias: readonly string[], duenos: DuenosPorDia = {}): string {
  const clave = [...dias].sort().join(",");
  /* Elegir otro dueño es otro detalle: va en la clave del pedido. */
  const filtro = Object.keys(duenos).length > 0 ? `&duenos=${encodeURIComponent(JSON.stringify(duenos))}` : "";
  return `/api/admin/forestal/ctp?resumenJornadas=1&paquetes=1&dias=${clave}${filtro}`;
}

export function leerJornadasConPaquetes(dias: readonly string[], duenos: DuenosPorDia = {}): Promise<JornadasConPaquetes> {
  return ctpGet<JornadasConPaquetes>(urlJornadasConPaquetes(dias, duenos), { ttlMs: TTL_MS });
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Leer las jornadas y releerlas después de editar.
 *
 * La relectura es SILENCIOSA: no borra lo que se ve mientras llega (la tabla
 * no parpadea al guardar una escuadría) y, si falla, deja lo de antes con el
 * aviso de que puede estar viejo. La guarda `ultima` descarta una respuesta que
 * llega tarde: sin ella, la lectura de apertura podía pisar la relectura de
 * después de guardar.
 */
export function useJornadasConPaquetes(dias: readonly string[]) {
  const url = urlJornadasConPaquetes(dias);
  const [datos, setDatos] = useState<JornadasConPaquetes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [releyendo, setReleyendo] = useState(false);
  const ultima = useRef(0);

  const leer = useCallback(
    async (silenciosa: boolean) => {
      const n = ++ultima.current;
      if (silenciosa) setReleyendo(true);
      else {
        setDatos(null);
        setError(null);
      }
      try {
        const r = await ctpGet<JornadasConPaquetes>(url, { ttlMs: TTL_MS });
        if (n !== ultima.current) return;
        setDatos(r);
        setError(null);
      } catch (e) {
        if (n === ultima.current) setError(mensaje(e));
      } finally {
        if (n === ultima.current) setReleyendo(false);
      }
    },
    [url],
  );

  useEffect(() => {
    void leer(false);
    return () => {
      /* Desmontado o con otro día: lo que llegue de este pedido ya no manda. */
      ultima.current += 1;
    };
  }, [leer]);

  /** Después de escribir: sin caché, sin borrar lo que se ve. */
  const recargar = useCallback(() => {
    invalidarCtp("resumenJornadas");
    return leer(true);
  }, [leer]);

  return { datos, error, releyendo, recargar };
}
