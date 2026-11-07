"use client";

/**
 * useLothAprovechamientoHechos — lo que la banda «Aprovechamiento» necesita y
 * el balance del plan no tiene: lo recibido en el CTP, las trozas en patio
 * con los días de la más vieja y el avance semana a semana. Sale de la
 * Extracción del plan (`GET loth/extraccion?planId=`, ADR-454), la misma
 * lectura de la vista «Extracción».
 *
 *   · Sin movimientos en el libro (`activo` falso) no pregunta: todo es cero.
 *   · Sólo aplica el ÚLTIMO pedido: cambiar de plan dos veces seguidas no deja
 *     la respuesta vieja pisando a la nueva.
 *   · `reloadSignal` relee tras una tala o un despacho, como el balance.
 */

import { useEffect, useState } from "react";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import { HECHOS_VACIOS, hechosDeExtraccion, type HechosAprovechamiento } from "@/lib/forestal/loth-aprovechamiento-cadena";
import { leerExtraccion } from "../loth-extraccion-shared";

export interface EstadoHechos {
  hechos: HechosAprovechamiento | null;
  estado: "cargando" | "error" | null;
}

export function useLothAprovechamientoHechos(planId: string | null, activo: boolean, reloadSignal?: number): EstadoHechos {
  const [leido, setLeido] = useState<{ clave: string; hechos: HechosAprovechamiento | null; error: boolean } | null>(null);
  const clave = planId && activo ? `${planId}:${reloadSignal ?? 0}` : null;

  useEffect(() => {
    if (!planId || !clave) return;
    const ac = new AbortController();
    (async () => {
      try {
        const r = await fetch(`/api/admin/forestal/loth/extraccion?planId=${encodeURIComponent(planId)}`, {
          credentials: "include",
          signal: ac.signal,
        });
        const ex = r.ok ? leerExtraccion(await leerJson<unknown>(r)) : null;
        if (ac.signal.aborted) return;
        if (!ex) {
          logger.warn("[loth-aprovechamiento] la extracción del plan no llegó", { status: r.status });
          setLeido({ clave, hechos: null, error: true });
          return;
        }
        setLeido({ clave, hechos: hechosDeExtraccion(ex), error: false });
      } catch (err) {
        if (ac.signal.aborted) return;
        logger.warn("[loth-aprovechamiento] no se pudo leer la extracción del plan", { error: String(err) });
        setLeido({ clave, hechos: null, error: true });
      }
    })();
    return () => ac.abort();
  }, [planId, clave]);

  if (!clave) return { hechos: HECHOS_VACIOS, estado: null };
  /* Releyendo el MISMO plan (tras una tala), las cifras de antes se quedan hasta
     que llegue la nueva; la lectura de otro plan no vale: se espera la suya. */
  const mismoPlan = leido != null && leido.clave.startsWith(`${planId}:`);
  if (!leido || (leido.clave !== clave && !(mismoPlan && leido.hechos))) return { hechos: null, estado: "cargando" };
  return leido.error ? { hechos: null, estado: "error" } : { hechos: leido.hechos, estado: null };
}
