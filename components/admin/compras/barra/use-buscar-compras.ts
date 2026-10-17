"use client";

/**
 * Lo que trae «Buscar en Compras» (C57) mientras escribes: espera 220 ms a que
 * termines la palabra y corta la consulta anterior si escribes otra (la
 * respuesta vieja no pisa a la nueva). Con menos de 2 letras no pregunta nada,
 * salvo en «Por recibir», que lista todas las órdenes que esperan mercadería.
 */
import { useCallback, useEffect, useState } from "react";
import { MINIMO_CONSULTA, type ModoBusqueda, type ResultadoBusqueda } from "@/lib/compras/buscar-compras";
import { logger } from "@/lib/logger";

export type RespuestaBusqueda = ResultadoBusqueda & { plataOculta: boolean };

const ESPERA_MS = 220;

export function useBuscarCompras(abierto: boolean, consulta: string, modo: ModoBusqueda) {
  const [resultado, setResultado] = useState<RespuestaBusqueda | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const texto = consulta.trim();
  const pregunta = abierto && (modo === "recibir" || texto.length >= MINIMO_CONSULTA);

  useEffect(() => {
    if (!pregunta) {
      setResultado(null);
      setCargando(false);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    setCargando(true);
    const t = window.setTimeout(() => {
      const params = new URLSearchParams({ q: texto, modo });
      fetch(`/api/compras/buscar?${params}`, { signal: ctrl.signal })
        .then(async (r) => {
          if (r.status === 403) throw new Error("Tu rol no puede buscar en Compras. Pídeselo al dueño.");
          if (!r.ok) throw new Error("No pudimos buscar. Revisa tu conexión y prueba de nuevo.");
          return (await r.json()) as RespuestaBusqueda;
        })
        .then((d) => {
          setResultado(d);
          setError(null);
        })
        .catch((err: unknown) => {
          if (ctrl.signal.aborted) return;
          logger.warn("[compras/buscar] fetch failed", { error: String(err) });
          setError(err instanceof Error ? err.message : "No pudimos buscar.");
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setCargando(false);
        });
    }, ESPERA_MS);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [pregunta, texto, modo, vuelta]);

  const reintentar = useCallback(() => setVuelta((v) => v + 1), []);
  return { resultado, cargando, error, reintentar, pregunta };
}
