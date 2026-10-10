/**
 * Los autofiltros y el orden de las columnas de la tabla del patio (y del
 * modal «Sin título declarado»), en UNA lista de definiciones y sin React.
 *
 * Brandon 05-10: «en cada columna tiene que tener su filtro, sea código,
 * largo, etc. Filtro como Excel». Código = «contiene»; Especie / Estado /
 * Guía / Proveedor = casillas (OR adentro, AND entre columnas); Parada, D1,
 * D2, Largo y Volumen = rango min/max, y una pieza SIN el dato no entra en un
 * rango pedido (igual que una celda vacía en Excel).
 *
 * D1 y D2 se filtran por lo que muestra la celda (`medidasDePieza`: la
 * primera fuente que los tenga), nunca por la columna cruda de la guía.
 */

import type { ColumnaFiltro } from "@/lib/admin/filtros-columna";
import { diasParada, ESTADO_META, estadoDeTroza, type OrdenTrozas } from "@/lib/forestal/trozas-patio";
import { medidasDePieza } from "@/lib/forestal/trozas-patio-medidas";
import type { TrozaPatioAPI } from "./hooks/use-trozas-patio";

export type IdColumnaTroza =
  | "especie" | "estado" | "guia" | "proveedor" | "parada" | "d1" | "d2" | "largo" | "volumen";

/** Las columnas que se pueden ordenar con un clic en el título. */
export type CampoOrdenTroza =
  | "codigo" | "especie" | "estado" | "parada" | "d1" | "d2" | "largo" | "volumen" | "guia";

export interface OrdenColumnaTroza {
  by: CampoOrdenTroza;
  dir: "asc" | "desc";
}

/** Un solo estado de orden: el select «Más vieja primero» y el clic en un
 *  título escriben esto, nunca dos controles que compitan. */
export const ORDEN_PRESETS: Record<OrdenTrozas, OrdenColumnaTroza> = {
  antiguedad: { by: "parada", dir: "desc" },
  volumen: { by: "volumen", dir: "desc" },
  codigo: { by: "codigo", dir: "asc" },
  especie: { by: "especie", dir: "asc" },
};

/** El preset que coincide con el orden puesto, o `columna` si es otro. */
export function presetDeOrden(o: OrdenColumnaTroza): OrdenTrozas | "columna" {
  const hallado = (Object.keys(ORDEN_PRESETS) as OrdenTrozas[]).find(
    (k) => ORDEN_PRESETS[k].by === o.by && ORDEN_PRESETS[k].dir === o.dir,
  );
  return hallado ?? "columna";
}

/** Un clic en el título: otra columna arranca ascendente, la misma se invierte. */
export const alternarOrden = (actual: OrdenColumnaTroza, by: CampoOrdenTroza): OrdenColumnaTroza =>
  actual.by === by ? { by, dir: actual.dir === "asc" ? "desc" : "asc" } : { by, dir: "asc" };

export const codigoDe = (t: Pick<TrozaPatioAPI, "codificacion" | "codigoPlanta">): string =>
  t.codificacion ?? t.codigoPlanta ?? "";

const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** «Contiene», sin tildes ni mayúsculas, sobre el código del bosque y el de planta. */
export function coincideCodigo(t: Pick<TrozaPatioAPI, "codificacion" | "codigoPlanta">, q: string): boolean {
  const buscado = plano(q.trim());
  if (!buscado) return true;
  return [t.codificacion, t.codigoPlanta].some((c) => c && plano(c).includes(buscado));
}

/** El catálogo. `estado` va por su etiqueta («Libre»), que es lo que se lee. */
export function columnasTrozas(hoy: Date): ColumnaFiltro<TrozaPatioAPI>[] {
  return [
    { id: "especie", label: "Especie", tipo: "multi", valor: (t) => (t.especieComun ?? "").trim() || "Sin especie" },
    { id: "estado", label: "Estado", tipo: "multi", valor: (t) => ESTADO_META[estadoDeTroza(t)].label },
    { id: "guia", label: "Guía", tipo: "multi", valor: (t) => (t.gtfNumber ?? "").trim() },
    { id: "proveedor", label: "Proveedor", tipo: "multi", valor: (t) => (t.proveedor ?? "").trim() },
    { id: "parada", label: "Parada", tipo: "rango", numero: (t) => diasParada(t, hoy), unidad: "d", paso: 1 },
    { id: "d1", label: "D1", tipo: "rango", numero: (t) => medidasDePieza(t).d1, unidad: "cm", paso: 1 },
    { id: "d2", label: "D2", tipo: "rango", numero: (t) => medidasDePieza(t).d2, unidad: "cm", paso: 1 },
    { id: "largo", label: "Largo", tipo: "rango", numero: (t) => t.largoM, unidad: "m", paso: 0.1 },
    { id: "volumen", label: "Volumen", tipo: "rango", numero: (t) => t.volumenM3, unidad: "m³", paso: 0.01 },
  ];
}

type Clave = number | string | null;

function claveDe(t: TrozaPatioAPI, by: CampoOrdenTroza, hoy: Date): Clave {
  switch (by) {
    case "codigo": return codigoDe(t) || null;
    case "especie": return (t.especieComun ?? "").trim() || null;
    case "estado": return ESTADO_META[estadoDeTroza(t)].label;
    case "parada": return diasParada(t, hoy);
    case "d1": return medidasDePieza(t).d1;
    case "d2": return medidasDePieza(t).d2;
    case "largo": return t.largoM ?? null;
    case "volumen": return t.volumenM3 ?? null;
    case "guia": return (t.gtfNumber ?? "").trim() || null;
  }
}

/** Ordena una copia. Lo que no tiene el dato queda al final, suba o baje el orden. */
export function ordenarTrozas<T extends TrozaPatioAPI>(filas: readonly T[], o: OrdenColumnaTroza, hoy: Date): T[] {
  const signo = o.dir === "asc" ? 1 : -1;
  const claves = new Map<string, Clave>(filas.map((t) => [t.id, claveDe(t, o.by, hoy)]));
  return [...filas].sort((a, b) => {
    const ka = claves.get(a.id) ?? null;
    const kb = claves.get(b.id) ?? null;
    if (ka == null && kb == null) return 0;
    if (ka == null) return 1;
    if (kb == null) return -1;
    const c = typeof ka === "number" && typeof kb === "number"
      ? ka - kb
      : String(ka).localeCompare(String(kb), "es-PE", { numeric: true });
    if (c !== 0) return c * signo;
    /* Mismo valor: la pieza más grande primero, como siempre en el patio. */
    return (b.volumenM3 ?? 0) - (a.volumenM3 ?? 0);
  });
}
