"use client";

/**
 * La ficha de una cubicación guardada del Cubicador de madera, lista para
 * imprimirse en la cabecera de su hoja. Se lee UNA vez al abrir el papel (no
 * con cada tarjeta de Guardadas). Las de la cuenta (trozas) no tienen ficha.
 */
import { useEffect, useState } from "react";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { logger } from "@/lib/logger";
import { esIdDeLaCuenta, lineasDeFichaParaPapel } from "./papel-cubicador";

type Linea = { etiqueta: string; valor: string };

/**
 * `null` mientras se lee: el botón de imprimir espera (24-10, medido: con el
 * clic en el primer instante la hoja salía SIN la ficha, porque la lectura
 * llegaba 150-200 ms después de dibujarse el botón).
 */
export function useFichaDelPapel(id: string | null, activo: boolean): Linea[] | null {
  const [leida, setLeida] = useState<{ id: string; lineas: Linea[] } | null>(null);

  useEffect(() => {
    if (!activo || !id || esIdDeLaCuenta(id)) return;
    const ac = new AbortController();
    fetch("/api/admin/forestal/cubicaciones", { credentials: "include", signal: ac.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ cubicaciones?: CubicacionRegistro[] }>) : null))
      .then((j) => {
        const c = j?.cubicaciones?.find((x) => x.id === id);
        if (!ac.signal.aborted) setLeida({ id, lineas: c ? lineasDeFichaParaPapel({ ...c, gtfNumber: c.gtfNumber }) : [] });
      })
      /* Sin ficha la hoja sale igual, con su código. */
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        logger.warn("[papel] no se pudo leer la ficha de la cubicación", { error: String(err) });
        setLeida({ id, lineas: [] });
      });
    return () => ac.abort();
  }, [id, activo]);

  if (!activo || !id || esIdDeLaCuenta(id)) return [];
  return leida && leida.id === id ? leida.lineas : null;
}
