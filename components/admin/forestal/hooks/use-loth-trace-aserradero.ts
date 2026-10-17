"use client";

/**
 * useLothTraceAserradero — qué pasó en el aserradero con las trozas de los
 * árboles de «Por árbol» (L13).
 *
 * Pide al Libro CTP las piezas que guardan su línea de Trozado (ADR-450), en
 * tandas de `MAX_IDS_ASERRADERO` ids (una consulta por tanda en el servidor,
 * sin N+1). La clave es la lista ordenada: un render que no cambia los ids no
 * vuelve a pedir, y una respuesta vieja cancelada no pisa a la nueva.
 *
 * `porTrozado` es `null` mientras no se sabe (cargando, error o sin Libro CTP):
 * la vista no acusa «sin enlace» de lo que no llegó a preguntar.
 */

import { useEffect, useMemo, useState } from "react";
import {
  MAX_IDS_ASERRADERO,
  piezasPorTrozado,
  type PiezaCtp,
  type RespuestaAserradero,
} from "@/lib/forestal/loth-trace-aserradero";

export type EstadoAserradero = "cargando" | "listo" | "error" | "sin_ctp";

export interface AserraderoDeTrozados {
  estado: EstadoAserradero;
  porTrozado: ReadonlyMap<string, PiezaCtp[]> | null;
  /** Alguna tanda llegó al tope de piezas: a algún árbol le pueden faltar (la vista lo avisa). */
  truncado: boolean;
}

/** Sin árboles trozados no hay nada que preguntar: la MISMA referencia en cada render (no dispara memos). */
const SIN_TROZADOS: AserraderoDeTrozados = { estado: "listo", porTrozado: new Map(), truncado: false };

async function pedirTanda(ids: string[], signal: AbortSignal): Promise<RespuestaAserradero> {
  const r = await fetch(`/api/admin/forestal/loth/aserradero?ids=${encodeURIComponent(ids.join(","))}`, {
    credentials: "include",
    signal,
  });
  if (r.status === 403) return { ctp: false, piezas: [], truncado: false };
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as RespuestaAserradero;
}

export function useLothTraceAserradero(trozadoIds: readonly string[]): AserraderoDeTrozados {
  const clave = useMemo(() => Array.from(new Set(trozadoIds)).sort().join(","), [trozadoIds]);
  const [res, setRes] = useState<{ clave: string; valor: AserraderoDeTrozados } | null>(null);

  useEffect(() => {
    if (!clave) return;
    const ctrl = new AbortController();
    const ids = clave.split(",");
    const tandas: string[][] = [];
    for (let i = 0; i < ids.length; i += MAX_IDS_ASERRADERO) tandas.push(ids.slice(i, i + MAX_IDS_ASERRADERO));
    Promise.all(tandas.map((t) => pedirTanda(t, ctrl.signal)))
      .then((rs) => {
        if (ctrl.signal.aborted) return;
        const sinCtp = rs.some((r) => !r.ctp);
        setRes({
          clave,
          valor: sinCtp
            ? { estado: "sin_ctp", porTrozado: null, truncado: false }
            : { estado: "listo", porTrozado: piezasPorTrozado(rs.flatMap((r) => r.piezas)), truncado: rs.some((r) => r.truncado) },
        });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        console.warn("[loth] no se pudo seguir las trozas al Libro CTP", err);
        setRes({ clave, valor: { estado: "error", porTrozado: null, truncado: false } });
      });
    return () => ctrl.abort();
  }, [clave]);

  if (!clave) return SIN_TROZADOS;
  // Lo guardado de OTRA lista de ids no vale para ésta: se está cargando.
  return res && res.clave === clave ? res.valor : { estado: "cargando", porTrozado: null, truncado: false };
}
