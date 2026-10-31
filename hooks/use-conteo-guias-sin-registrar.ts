"use client";

/**
 * use-conteo-guias-sin-registrar — la pastilla «N guías sin registrar» (ADR-446
 * ronda 2, 2026-09-28) sin pagar el costo de la propuesta entera.
 *
 * `useGuiasSinRegistrar({ cargarAlMontar: true })` pedía `?pendientes=1`, que
 * arma la tanda completa (qué corrida cubre cada línea) SÓLO para mostrar un
 * número al entrar a Despacho: medido en Blas, 3,4 s. Este hook pide
 * `?contar=1` — el mismo KV de anexos y los mismos despachos vivos, sin
 * `estadoDelLibro` ni `proponerTanda` — y deja que el modal (que sí necesita
 * la propuesta) la pida recién al abrirse.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { leerJson } from "@/lib/errores/sin-dato";
import { URL_GUIAS_A_DESPACHO } from "./guias-sin-registrar-pedidos";

export interface ConteoGuiasSinRegistrar {
  guias: number;
  totalM3: number;
}

export function useConteoGuiasSinRegistrar(cargarAlMontar: boolean) {
  const [conteo, setConteo] = useState<ConteoGuiasSinRegistrar | null>(null);
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`${URL_GUIAS_A_DESPACHO}?contar=1`, { credentials: "include", cache: "no-store" });
      const j = await leerJson<{ guias?: number; totalM3?: number }>(r);
      if (!vivo.current || !r.ok || !j) return;
      setConteo({ guias: j.guias ?? 0, totalM3: j.totalM3 ?? 0 });
    } catch {
      // Sin conteo liviano: la pastilla espera a que se abra el modal (`cargar` completo).
    }
  }, []);

  useEffect(() => {
    if (cargarAlMontar) void cargar();
  }, [cargarAlMontar, cargar]);

  return { conteo, cargar };
}
