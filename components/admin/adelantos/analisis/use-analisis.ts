"use client";

/**
 * Pide el análisis ya sumado (`GET /api/adelantos/analisis`). `version` es la
 * lista del módulo: cuando el módulo recarga (se dio o se cobró algo), cambia
 * de identidad y el análisis se vuelve a pedir, sin cablear nada en el módulo.
 * Una respuesta vieja que llega tarde no pisa a la nueva (AbortController).
 * `listo` = el módulo terminó su carga: antes no se pide (sería una vuelta de más).
 */
import { useCallback, useEffect, useState } from "react";
import type { AnalisisAdelantos } from "@/lib/adelantos/analisis";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";

export type RespuestaAnalisis = AnalisisAdelantos & { truncado: boolean };

export function useAnalisisAdelantos(version: unknown, listo: boolean): {
  datos: RespuestaAnalisis | null;
  cargando: boolean;
  error: boolean;
  reintentar: () => void;
} {
  const [datos, setDatos] = useState<RespuestaAnalisis | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!listo) return;
    const ctl = new AbortController();
    setCargando(true);
    fetch("/api/adelantos/analisis", { credentials: "include", cache: "no-store", signal: ctl.signal })
      .then(async (res) => {
        const json = res.ok ? await leerJson<RespuestaAnalisis>(res) : null;
        if (ctl.signal.aborted) return;
        if (!json || !Array.isArray(json.monedas)) throw new Error(`HTTP ${res.status}`);
        setDatos(json);
        setError(false);
      })
      .catch((err: unknown) => {
        if (ctl.signal.aborted) return;
        logger.error("[adelantos/analisis] no se pudo leer", { error: String(err) });
        setError(true);
      })
      .finally(() => {
        if (!ctl.signal.aborted) setCargando(false);
      });
    return () => ctl.abort();
  }, [version, intento, listo]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { datos, cargando, error, reintentar };
}
