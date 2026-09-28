"use client";

/**
 * use-propuesta-lotes — «Lotes que puedes armar» (2026-09-27).
 *
 * Pide las propuestas al servidor (la elegibilidad es suya: `motivoNoElegible`)
 * y crea uno o varios lotes. `crear` LANZA con el mensaje del servidor; quien
 * llama decide cómo mostrarlo.
 *
 * `refrescarCon`: cuando cambia (la vista recargó su patio), se vuelve a pedir.
 * `ctpGet` reusa la promesa en vuelo, así que la recarga de la vista y la de acá
 * no duplican red.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import type {
  PropuestaDeLote,
  PropuestasDelPatio,
  ResultadoCrearLotes,
} from "@/lib/forestal/propuesta-de-lotes";

export type { ResultadoCrearLotes };

export const URL_PROPUESTAS_LOTES = "/api/admin/forestal/lotes-aserrio/propuestas";

export interface EstadoPropuestaLotes {
  datos: PropuestasDelPatio | null;
  error: string | null;
  recargar: () => Promise<void>;
  crear: (propuestas: readonly PropuestaDeLote[]) => Promise<ResultadoCrearLotes>;
}

export function usePropuestaLotes(refrescarCon?: unknown): EstadoPropuestaLotes {
  const [datos, setDatos] = useState<PropuestasDelPatio | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* Sólo escribe el último pedido: una carga vieja no pisa la vigente. */
  const pedidoRef = useRef(0);

  const recargar = useCallback(async () => {
    const pedido = ++pedidoRef.current;
    try {
      const r = await ctpGet<PropuestasDelPatio>(URL_PROPUESTAS_LOTES);
      if (pedido !== pedidoRef.current) return;
      setDatos(r);
      setError(null);
    } catch (e) {
      if (pedido !== pedidoRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar, refrescarCon]);

  const crear = useCallback(
    async (propuestas: readonly PropuestaDeLote[]): Promise<ResultadoCrearLotes> => {
      const r = await fetch(URL_PROPUESTAS_LOTES, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          /* Los ids de lo que se vio: el servidor sólo acota con ellos. */
          propuestas: propuestas.map((p) => ({ especie: p.especie, permiso: p.permiso, trozaIds: p.trozaIds })),
        }),
      });
      const json = (await r.json().catch(() => ({}))) as Partial<ResultadoCrearLotes> & {
        message?: string;
        error?: string;
      };
      /* Escribió o no, el patio pudo cambiar: el caché del módulo ya miente. */
      invalidarCtp("/forestal/");
      if (!r.ok) {
        await recargar();
        throw new Error(json.message ?? json.error ?? `El servidor respondió ${r.status}`);
      }
      await recargar();
      return { creados: json.creados ?? [], noCreados: json.noCreados ?? [] };
    },
    [recargar],
  );

  return { datos, error, recargar, crear };
}
