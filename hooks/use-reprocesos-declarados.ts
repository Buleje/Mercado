"use client";

/**
 * Los reprocesos que el Libro YA tiene, para cruzarlos contra los sugeridos.
 *
 * Vive en un hook porque lo consume la distribución del **cubicador**, que no
 * es el Libro: si la especialización del Libro está apagada o el usuario no
 * tiene permiso, el endpoint responde 403 y acá eso NO es un error de pantalla
 * — simplemente no se marca nada. Una herramienta de cubicación no puede
 * romperse porque otro módulo esté apagado.
 *
 * Ventana corta a propósito (30 días): un reproceso del mes pasado casi nunca
 * es el que se está distribuyendo hoy, y marcar la fila con eso sería enseñar a
 * ignorar la marca.
 */
import { useCallback, useEffect, useState } from "react";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { cruzarReprocesosDeclarados, type DeclaradoDelPar } from "@/lib/forestal/reproceso-cruce";
import type { ReprocesoDeclarado } from "@/lib/forestal/reprocesos-declarados";

const VACIO = new Map<string, DeclaradoDelPar>();

export function useReprocesosDeclarados(dias = 30): {
  porPar: Map<string, DeclaradoDelPar>;
  dias: number;
  /** Volver a leer: se llama al declarar uno para que la fila lo diga en el acto. */
  recargar: () => void;
} {
  const [porPar, setPorPar] = useState<Map<string, DeclaradoDelPar>>(VACIO);
  const [token, setToken] = useState(0);

  useEffect(() => {
    let vivo = true;
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
    ctpGet<{ reprocesos: ReprocesoDeclarado[] }>(
      `/api/admin/forestal/ctp/reproceso/declarados?from=${encodeURIComponent(desde)}&limite=500`,
    )
      .then((j) => {
        if (!vivo) return;
        setPorPar(cruzarReprocesosDeclarados(Array.isArray(j?.reprocesos) ? j.reprocesos : []));
      })
      .catch(() => {
        /* 403 (Libro apagado), 401 o red caída: sin marcas, la sección funciona
           igual. No se loguea: es un camino esperado, no una falla. */
        if (vivo) setPorPar(VACIO);
      });
    return () => { vivo = false; };
    /* `token` fuerza la relectura tras declarar; la URL lleva un `from` con la
       hora, así que nunca choca con la caché de `ctpGet`. */
  }, [dias, token]);

  return { porPar, dias, recargar: useCallback(() => setToken((t) => t + 1), []) };
}
