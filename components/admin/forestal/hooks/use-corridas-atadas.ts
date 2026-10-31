"use client";

/**
 * Las corridas a las que una cubicación guardada YA está atada, con lo que
 * declararon (ADR-445, revisión 27-09).
 *
 * Sin esto, «Agregar cubicación» cuadraba sólo contra las corridas del día
 * elegido: una cubicación de 3,2 m³ ya atada al lunes cuadraba contra los
 * 3,2 m³ del martes y se ataba también ahí — 3,2 m³ de piezas «respaldando»
 * 6,4 m³ declarados. El cuadre tiene que ser contra TODO lo que quedaría atado.
 *
 * Las del mismo día ya vienen en `conocidas`. Las de otros días se buscan: el
 * día de cada una (`?entryId=`) y después esos días con sus paquetes, en UNA
 * consulta (`resumenJornadas=1&paquetes=1`) — la misma forma que el resto del
 * modal, así el cuadre es la misma función.
 *
 * Una corrida que ya no existe (404) o que el resumen no trae (anulada) no
 * declara nada: no entra al cuadre. Cualquier otro error traba el vínculo.
 */

import { useEffect, useMemo, useState } from "react";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import type { CorridaDelDia } from "@/lib/forestal/piezas-del-dia";
import { leerJornadasConPaquetes } from "./use-jornadas-con-paquetes";

interface Estado {
  clave: string;
  corridas: CorridaDelDia[];
  error: string | null;
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function diaDeLaCorrida(id: string): Promise<string | null> {
  try {
    const r = await ctpGet<{ entry?: { entryDate?: string | null } }>(
      `/api/admin/forestal/ctp?entryId=${encodeURIComponent(id)}`,
      { ttlMs: 30_000 },
    );
    return r.entry?.entryDate?.slice(0, 10) ?? null;
  } catch (e) {
    /* Borrada: no declara nada. Otro error sí se dice. */
    if (/\b404\b/.test(mensaje(e))) return null;
    throw e;
  }
}

export function useCorridasAtadas(ids: readonly string[], conocidas: readonly CorridaDelDia[]) {
  const deAca = useMemo(() => new Map(conocidas.map((c) => [c.id, c])), [conocidas]);
  const deFuera = useMemo(
    () => [...new Set(ids)].filter((id) => !deAca.has(id)).sort(),
    [ids, deAca],
  );
  const clave = deFuera.join(",");
  const [estado, setEstado] = useState<Estado>({ clave: "", corridas: [], error: null });

  useEffect(() => {
    if (!clave) return;
    let vivo = true;
    void (async () => {
      try {
        const buscadas = clave.split(",");
        const dias = [
          ...new Set(
            (await Promise.all(buscadas.map(diaDeLaCorrida))).filter((d): d is string => !!d),
          ),
        ];
        const datos = dias.length > 0 ? await leerJornadasConPaquetes(dias) : null;
        const set = new Set(buscadas);
        if (vivo)
          setEstado({
            clave,
            corridas: (datos?.detalle ?? []).filter((c) => set.has(c.id)),
            error: null,
          });
      } catch (e) {
        if (vivo) setEstado({ clave, corridas: [], error: mensaje(e) });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [clave]);

  const listo = !clave || estado.clave === clave;
  const corridas = useMemo(
    () => [
      ...ids.map((id) => deAca.get(id)).filter((c): c is CorridaDelDia => !!c),
      ...(listo && clave ? estado.corridas : []),
    ],
    [ids, deAca, listo, clave, estado.corridas],
  );
  return {
    /** Todas las corridas atadas que existen, de este día y de otros. */
    corridas,
    cargando: !listo,
    error: listo && clave ? estado.error : null,
  };
}
