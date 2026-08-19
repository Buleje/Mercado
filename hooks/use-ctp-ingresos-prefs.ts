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

/**
 * Una clave POR PESTAÑA (ADR-352).
 *
 * La bandeja y el archivo son el mismo componente con distinto filtro de
 * recepción, y compartían estas preferencias. Consecuencia real, reportada con
 * captura: alguien filtró «Pendiente» en Ingresos, entró a «GTF ingresadas» —
 * donde todo está validado por definición— y la tabla salió vacía con «Ninguna
 * guía coincide con el filtro». La guía recepcionada estaba ahí; el filtro
 * heredado la escondía.
 */
const KEY_BASE = "buleje:ctp-ingresos-prefs-v1";
export type VistaPrefs = "pendiente" | "cerrada" | "todas";
const claveDe = (vista: VistaPrefs) => (vista === "todas" ? KEY_BASE : `${KEY_BASE}:${vista}`);

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

/**
 * El archivo abre por lo último RECIBIDO y sin filtro de estado (ADR-351/352):
 * son guías ya recibidas, filtrarlas por «pendiente» las esconde todas.
 */
const DEFAULTS_ARCHIVO: CtpIngresosPrefs = {
  statusFilter: "",
  facetas: {},
  sort: { by: "fechaRecepcion", dir: "desc" },
};

const SORT_FIELDS: CtpSortField[] = [
  "entryDate",
  "fechaRecepcion",
  "volumeM3",
  "pieces",
  "providerName",
  "speciesCommonName",
  "createdAt",
];

/** Lee lo guardado con desconfianza: es localStorage, puede venir de una versión
 *  vieja o editado a mano. Cualquier cosa rara → el default. */
export function leerPrefs(vista: VistaPrefs = "todas"): CtpIngresosPrefs {
  const base = vista === "cerrada" ? DEFAULTS_ARCHIVO : DEFAULTS;
  if (typeof window === "undefined") return base;
  try {
    const raw = localStorage.getItem(claveDe(vista));
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<CtpIngresosPrefs>;
    const by = p.sort?.by;
    const statusFilter = typeof p.statusFilter === "string" ? p.statusFilter : "";
    return {
      /* En el archivo, «pendiente» no puede quedar puesto: una guía recibida
         está validada, así que ese filtro deja la lista vacía y parece que la
         guía no se guardó. */
      statusFilter: vista === "cerrada" && statusFilter === "pendiente" ? "" : statusFilter,
      facetas: p.facetas && typeof p.facetas === "object" ? p.facetas : {},
      sort: {
        by: by && SORT_FIELDS.includes(by) ? by : base.sort.by,
        dir: p.sort?.dir === "asc" ? "asc" : "desc",
      },
    };
  } catch {
    return base;
  }
}

/** Guarda (best-effort) cada vez que cambian. En modo privado falla y no pasa nada. */
export function useGuardarPrefs(prefs: CtpIngresosPrefs, vista: VistaPrefs = "todas"): void {
  useEffect(() => {
    try {
      localStorage.setItem(claveDe(vista), JSON.stringify(prefs));
    } catch {
      // localStorage lleno o bloqueado: sin persistencia, sin bug.
    }
  }, [prefs, vista]);
}

/** Estado inicial leído una sola vez (no en cada render: es I/O sincrónico). */
export function usePrefsIniciales(vista: VistaPrefs = "todas"): CtpIngresosPrefs {
  const [prefs] = useState<CtpIngresosPrefs>(() => leerPrefs(vista));
  return prefs;
}
