"use client";

/**
 * use-jornadas-produccion — qué se produjo cada día de una semana.
 *
 * Alimenta la tira de días del modal «Producir sin lote»: cada casillero tiene
 * que poder decir si ese día YA tiene producción anotada y cuánta, porque el
 * parte de la sierra llega tarde y sin ese dato la misma jornada se carga dos
 * veces —o se anota el lunes lo que fue del sábado.
 *
 * Se pide una semana por vez, por `ctpGet` (mismo caché que el resto del libro):
 * ir y volver entre dos semanas no paga dos viajes.
 */

import { useCallback, useEffect, useState } from "react";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { esIsoValido, rangoDeLaSemana } from "@/lib/forestal/semana-de-registro";

/** Lo que se produjo en UN día. Sólo viajan los días que tienen algo. */
export interface JornadaDeProduccion {
  /** `YYYY-MM-DD`. */
  dia: string;
  corridas: number;
  m3: number;
  /** Pie tablar — como habla el aserradero. */
  pt: number;
  piezas: number;
}

function urlDeLaSemana(iso: string): string {
  const { desde, hasta } = rangoDeLaSemana(iso);
  return `/api/admin/forestal/ctp?jornadas=1&semanaDesde=${desde}&semanaHasta=${hasta}`;
}

/**
 * Las jornadas de la semana que contiene `isoDeLaSemana`.
 *
 * Devuelve un mapa día → jornada: la tira dibuja los siete casilleros igual y
 * pregunta por cada uno, así que un `Map` evita un `find` por casillero.
 */
export function useJornadasDeProduccion(isoDeLaSemana: string, activo = true) {
  const [porDia, setPorDia] = useState<Map<string, JornadaDeProduccion>>(new Map());
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(
    async (iso: string, forzar = false) => {
      if (!esIsoValido(iso)) return;
      const url = urlDeLaSemana(iso);
      if (forzar) invalidarCtp("jornadas=1");
      setCargando(true);
      setError(null);
      try {
        const r = await ctpGet<{ jornadas?: JornadaDeProduccion[] }>(url, { ttlMs: 30_000 });
        setPorDia(new Map((r.jornadas ?? []).map((j) => [j.dia, j])));
      } catch (e) {
        /* Que la tira no sepa cuánto se produjo no puede impedir elegir el día:
           se muestra el aviso y los casilleros siguen andando. */
        setError(e instanceof Error ? e.message : String(e));
        setPorDia(new Map());
      } finally {
        setCargando(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!activo) return;
    void cargar(isoDeLaSemana);
  }, [activo, isoDeLaSemana, cargar]);

  return {
    porDia,
    cargando,
    error,
    recargar: () => cargar(isoDeLaSemana, true),
  };
}
