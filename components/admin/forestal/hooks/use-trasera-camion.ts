"use client";

/**
 * Qué filas del cubicador van en la PARTE TRASERA del camión (Brandon,
 * 2026-10-03): las que quedan a la vista al abrir la compuerta, para llevar
 * el registro de qué se ve atrás.
 *
 * Se guarda APARTE del lote (`<clave>-trasera`, ids de fila) y no como un
 * campo de `PiezaCubicada`: los endpoints de `ctp` y `cubicaciones` validan
 * las piezas con una whitelist, y un campo nuevo o se perdía al guardar o
 * rompía el envío. Una fila borrada simplemente deja de aparecer (se cruza
 * contra el lote al leer) y «Deshacer» la trae de vuelta con su marca.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { ANCHO_CAMION_M_DEFAULT, ANCHO_CAMION_M_MAX, ANCHO_CAMION_M_MIN } from "@/lib/forestal/camion-croquis";

function leerIds(clave: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(clave);
    const arr = raw ? (JSON.parse(raw) as unknown) : null;
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function leerAncho(clave: string): number {
  if (typeof window === "undefined") return ANCHO_CAMION_M_DEFAULT;
  try {
    const n = Number(localStorage.getItem(clave));
    return Number.isFinite(n) && n >= ANCHO_CAMION_M_MIN && n <= ANCHO_CAMION_M_MAX ? n : ANCHO_CAMION_M_DEFAULT;
  } catch {
    return ANCHO_CAMION_M_DEFAULT;
  }
}

export function useTraseraCamion(claveLote: string, filas: readonly PiezaCubicada[]) {
  const claveIds = `${claveLote}-trasera`;
  const claveAncho = `${claveLote}-trasera-ancho`;
  const [ids, setIds] = useState<Set<string>>(() => leerIds(claveIds));
  const [anchoM, setAnchoM] = useState<number>(() => leerAncho(claveAncho));

  useEffect(() => {
    try {
      if (ids.size > 0) localStorage.setItem(claveIds, JSON.stringify([...ids]));
      else localStorage.removeItem(claveIds);
    } catch { /* quota */ }
  }, [ids, claveIds]);
  useEffect(() => {
    try {
      if (anchoM === ANCHO_CAMION_M_DEFAULT) localStorage.removeItem(claveAncho);
      else localStorage.setItem(claveAncho, String(anchoM));
    } catch { /* quota */ }
  }, [anchoM, claveAncho]);

  /** Las piezas de la trasera, en el orden del lote. */
  const piezas = useMemo(() => filas.filter((r) => ids.has(r.id)), [filas, ids]);

  const agregar = useCallback((nuevas: Iterable<string>) => {
    setIds((prev) => {
      const next = new Set(prev);
      for (const id of nuevas) next.add(id);
      return next;
    });
  }, []);
  const quitar = useCallback((fuera: Iterable<string>) => {
    setIds((prev) => {
      const next = new Set(prev);
      for (const id of fuera) next.delete(id);
      return next;
    });
  }, []);
  /** Vacía la trasera de ESTE lote (las marcas de filas que ya no están, también). */
  const vaciar = useCallback(() => setIds(new Set()), []);
  const cambiarAncho = useCallback((m: number) => {
    if (Number.isFinite(m)) setAnchoM(Math.min(ANCHO_CAMION_M_MAX, Math.max(ANCHO_CAMION_M_MIN, m)));
  }, []);

  return { ids, piezas, agregar, quitar, vaciar, anchoM, cambiarAncho };
}
