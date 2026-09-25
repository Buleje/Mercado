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

import { useCallback, useEffect, useRef, useState } from "react";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { esIsoValido, rangoDeLaSemana } from "@/lib/forestal/semana-de-registro";
import type { DetalleDeJornada } from "@/lib/forestal/detalle-de-jornada";

/** Lo que se produjo en UN día. Sólo viajan los días que tienen algo. */
export interface JornadaDeProduccion {
  /** `YYYY-MM-DD`. */
  dia: string;
  corridas: number;
  m3: number;
  /** Pie tablar — como habla el aserradero. */
  pt: number;
  piezas: number;
  /**
   * Especies, clasificación, dueño… del día, para el panel flotante de la tira
   * (2026-09-14). Sólo en `seccion="produccion"`; opcional porque una respuesta
   * vieja del caché no lo trae, y sin él la tira se ve como antes.
   */
  detalle?: DetalleDeJornada;
}

/** Qué hecho del libro cuenta la tira: lo que salió de la sierra, lo que entró, o lo que se fue con guía. */
export type SeccionDeJornada = "produccion" | "consumo" | "despacho";

function urlDeLaSemana(iso: string, seccion: SeccionDeJornada): string {
  const { desde, hasta } = rangoDeLaSemana(iso);
  return `/api/admin/forestal/ctp?jornadas=1&seccion=${seccion}&semanaDesde=${desde}&semanaHasta=${hasta}`;
}

/**
 * Las jornadas de la semana que contiene `isoDeLaSemana`.
 *
 * Devuelve un mapa día → jornada: la tira dibuja los siete casilleros igual y
 * pregunta por cada uno, así que un `Map` evita un `find` por casillero.
 */
export function useJornadasDeProduccion(
  isoDeLaSemana: string,
  activo = true,
  seccion: SeccionDeJornada = "produccion",
) {
  const [porDia, setPorDia] = useState<Map<string, JornadaDeProduccion>>(new Map());
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * De qué pedido es `porDia` (su url). Al cambiar de semana hay un render en
   * que `porDia` todavía es la semana anterior y el efecto que carga aún no
   * corrió: sin esto, la tira plegada afirmaba «sin corridas anotadas» del día
   * nuevo en ese instante (revisión 23-09). Con esto, `cargando` quiere decir
   * «lo que hay en `porDia` no es de esta semana».
   */
  const [urlLeida, setUrlLeida] = useState<string | null>(null);
  /** El último pedido: una respuesta vieja que llega tarde no pisa la semana nueva. */
  const ultimaRef = useRef<string | null>(null);

  const cargar = useCallback(
    async (iso: string, forzar = false) => {
      if (!esIsoValido(iso)) return;
      const url = urlDeLaSemana(iso, seccion);
      ultimaRef.current = url;
      if (forzar) invalidarCtp("jornadas=1");
      setCargando(true);
      setError(null);
      try {
        const r = await ctpGet<{ jornadas?: JornadaDeProduccion[] }>(url, { ttlMs: 30_000 });
        if (ultimaRef.current !== url) return;
        setPorDia(new Map((r.jornadas ?? []).map((j) => [j.dia, j])));
      } catch (e) {
        if (ultimaRef.current !== url) return;
        /* Que la tira no sepa cuánto se produjo no puede impedir elegir el día:
           se muestra el aviso y los casilleros siguen andando. */
        setError(e instanceof Error ? e.message : String(e));
        setPorDia(new Map());
      } finally {
        if (ultimaRef.current === url) {
          setUrlLeida(url);
          setCargando(false);
        }
      }
    },
    [seccion],
  );
  const urlPedida = esIsoValido(isoDeLaSemana) ? urlDeLaSemana(isoDeLaSemana, seccion) : null;
  const deOtraSemana = activo && urlPedida !== null && urlLeida !== urlPedida;

  useEffect(() => {
    if (!activo) return;
    void cargar(isoDeLaSemana);
  }, [activo, isoDeLaSemana, cargar]);

  return {
    porDia,
    cargando: cargando || deOtraSemana,
    error,
    recargar: () => cargar(isoDeLaSemana, true),
  };
}
