/**
 * El autofiltro de cada columna del Kárdex del permiso (Brandon 07-10: «en
 * general ponerlo en todas las tablas del Libro»).
 *
 * Filtrar un kárdex esconde renglones, no recalcula saldos: cada renglón sigue
 * diciendo cómo quedó el permiso (o la especie) DESPUÉS de su movimiento, igual
 * que al filtrar un kárdex en Excel. El desplegable de especie de arriba no es
 * un filtro de filas —elige de QUÉ se lleva el saldo— y por eso se queda.
 */

import type { ColumnaFiltro } from "@/components/admin/shared/filtros-columna";
import { MOVIMIENTO_KARDEX, saldoDeFila, type FilaKardex } from "@/lib/forestal/loth-kardex";
import type { Casillero } from "./loth-kardex-estilos";

const ddmm = (v: number | string) =>
  typeof v === "string" && v.length >= 10 ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : String(v);

export const ETIQUETA_CASILLERO: Record<Casillero, string> = {
  enPieM3: "Por talar",
  taladoSinTrozarM3: "En el monte",
  enPatioM3: "En patio",
};

/**
 * Los filtros de las columnas; los saldos se leen del permiso o de la especie
 * elegida (`clave`). Sin especies en el registro (`sinBase`) no hay «Por talar».
 */
export function filtrosKardex(clave: string | null, sinBase: boolean): ColumnaFiltro<FilaKardex>[] {
  const saldo = (c: Casillero) => (f: FilaKardex) => saldoDeFila(f, clave)?.[c] ?? null;
  return [
    { id: "fecha", label: "Fecha", tipo: "fecha", numero: (f) => f.dia, formatearValor: ddmm },
    { id: "doc", label: "N° o GTF", tipo: "texto", valor: (f) => [String(f.lineNo), f.gtf].filter((x): x is string => !!x) },
    { id: "mov", label: "Movimiento", tipo: "multi", valor: (f) => MOVIMIENTO_KARDEX[f.movimiento].label },
    {
      id: "especie",
      label: "Especie · troza",
      tipo: "texto",
      valor: (f) => [f.especie, f.arbol, f.troza].filter((x): x is string => !!x),
    },
    { id: "entra", label: "Entra m³", tipo: "rango", numero: (f) => f.entraM3, unidad: "m³", paso: 0.001 },
    { id: "sale", label: "Sale m³", tipo: "rango", numero: (f) => f.saleM3, unidad: "m³", paso: 0.001 },
    ...(Object.keys(ETIQUETA_CASILLERO) as Casillero[]).filter((c) => !(sinBase && c === "enPieM3")).map(
      (c): ColumnaFiltro<FilaKardex> => ({
        id: c,
        label: ETIQUETA_CASILLERO[c],
        tipo: "rango",
        numero: saldo(c),
        unidad: "m³",
        paso: 0.001,
      }),
    ),
  ];
}
