/**
 * use-uso-del-lote — qué parte del lote del cubicador se usa en Resúmenes y en
 * la Distribución (Brandon 2026-10-27). Las reglas viven en
 * `lib/forestal/cubicacion-uso.ts`; acá sólo se lee y se guarda.
 *
 * Mismo almacenamiento que el lote: `slugKey("-uso")`, al lado de
 * `slugKey()` (el lote) en el navegador. Se lee en el inicializador, nunca en
 * un efecto que pueda correr después de uno que guarda ([[cubicador-madera]]).
 * Otra pestaña que cambie la elección llega por el evento `storage`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  armarUsoGuardado,
  leerUsoGuardado,
  usoVigente,
  type FueraDelLote,
  type UsoGuardado,
} from "@/lib/forestal/cubicacion-uso";
import { slugKey } from "@/lib/forestal/sembrar-reparto";

export const claveUsoDelLote = (): string => slugKey("-uso");

function leer(): UsoGuardado | null {
  if (typeof window === "undefined") return null;
  try {
    return leerUsoGuardado(localStorage.getItem(claveUsoDelLote()));
  } catch {
    return null;
  }
}

export interface UsoDelLote {
  /** Lo que queda fuera para ESTE lote (`{}` = todo). */
  fuera: FueraDelLote;
  /** Guarda una elección nueva (`{}` borra lo guardado). */
  guardar: (fuera: FueraDelLote) => void;
}

export function useUsoDelLote(rows: readonly PiezaCubicada[]): UsoDelLote {
  const [guardado, setGuardado] = useState<UsoGuardado | null>(leer);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === claveUsoDelLote()) setGuardado(leer());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const fuera = useMemo(() => usoVigente(guardado, rows), [guardado, rows]);

  const guardar = useCallback(
    (nuevo: FueraDelLote) => {
      const g = armarUsoGuardado(nuevo, rows);
      try {
        if (g) localStorage.setItem(claveUsoDelLote(), JSON.stringify(g));
        else localStorage.removeItem(claveUsoDelLote());
      } catch {
        /* quota: vale para esta pantalla, se pierde al recargar */
      }
      setGuardado(g);
      /* El `storage` del navegador sólo llega a las OTRAS pestañas: éste es para
         los demás lectores de ESTA (Resúmenes relee con cualquier clave del lote). */
      try {
        window.dispatchEvent(new StorageEvent("storage", { key: claveUsoDelLote() }));
      } catch {
        /* sin StorageEvent: se ve al recargar */
      }
    },
    [rows],
  );

  return { fuera, guardar };
}

/**
 * Lo que la Distribución ya pasó al Libro: bloques con lote creado (ADR-464) y
 * líneas marcadas «Distribuido». Cambiar la parte que se usa vuelve a repartir
 * en pantalla, pero lo declarado no se toca: hay que decirlo antes.
 */
export function leerLoQueYaEstaEnElLibro(): { bloques: number; lineas: number } {
  if (typeof window === "undefined") return { bloques: 0, lineas: 0 };
  const lista = (clave: string): unknown[] => {
    try {
      const v: unknown = JSON.parse(localStorage.getItem(clave) ?? "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  const bloques = lista(slugKey("-rolliza")).filter(
    (b) => Boolean(b) && typeof b === "object" && Boolean((b as { loteId?: unknown }).loteId),
  ).length;
  return { bloques, lineas: lista(slugKey("-rolliza-marcas")).length };
}
