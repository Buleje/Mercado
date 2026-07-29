"use client";

/**
 * use-ctp-ingresos-prefs — cómo dejó la pestaña Ingresos el operador.
 *
 * El libro se trabaja en tandas: se ordena por volumen, se filtra por un
 * proveedor, se va a Producción a cargar la corrida y se vuelve. Sin esto, al
 * volver estaba todo como el primer día y había que rearmar el filtro cada vez
 * (el shell mantiene el módulo montado, pero un refresh o un cambio de pestaña
 * del navegador lo perdía igual).
 *
 * Lo que NO se persiste: la BÚSQUEDA de texto y el número de página. Volver y
 * encontrar la lista recortada por una búsqueda vieja se lee como "faltan
 * registros"; el orden y las facetas, en cambio, se ven en pantalla (flecha en
 * la columna, badge en Filtros) — están a la vista de quien vuelve.
 */

import { useEffect, useState } from "react";
import type { CtpSort, CtpSortField } from "./use-ctp-ingresos";

const KEY = "buleje:ctp-ingresos-prefs-v1";

export interface CtpIngresosPrefs {
  statusFilter: string;
  facetas: {
    species?: string;
    provider?: string;
    product?: string;
    cites?: boolean;
    late?: boolean;
  };
  sort: CtpSort;
}

const DEFAULTS: CtpIngresosPrefs = {
  statusFilter: "",
  facetas: {},
  sort: { by: "entryDate", dir: "desc" },
};

const SORT_FIELDS: CtpSortField[] = [
  "entryDate",
  "volumeM3",
  "pieces",
  "providerName",
  "speciesCommonName",
  "createdAt",
];

/** Lee lo guardado con desconfianza: es localStorage, puede venir de una versión
 *  vieja o editado a mano. Cualquier cosa rara → el default. */
export function leerPrefs(): CtpIngresosPrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<CtpIngresosPrefs>;
    const by = p.sort?.by;
    return {
      statusFilter: typeof p.statusFilter === "string" ? p.statusFilter : "",
      facetas: p.facetas && typeof p.facetas === "object" ? p.facetas : {},
      sort: {
        by: by && SORT_FIELDS.includes(by) ? by : DEFAULTS.sort.by,
        dir: p.sort?.dir === "asc" ? "asc" : "desc",
      },
    };
  } catch {
    return DEFAULTS;
  }
}

/** Guarda (best-effort) cada vez que cambian. En modo privado falla y no pasa nada. */
export function useGuardarPrefs(prefs: CtpIngresosPrefs): void {
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      // localStorage lleno o bloqueado: sin persistencia, sin bug.
    }
  }, [prefs]);
}

/** Estado inicial leído una sola vez (no en cada render: es I/O sincrónico). */
export function usePrefsIniciales(): CtpIngresosPrefs {
  const [prefs] = useState<CtpIngresosPrefs>(leerPrefs);
  return prefs;
}
