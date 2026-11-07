"use client";

/**
 * Los autofiltros de Excel del historial de gastos (Brandon 25-10: «todas las
 * tablas de Mi Plata, como Adelantos»). Corren sobre TODAS las filas que dejan
 * los filtros de arriba (`h.filtered`), ANTES de paginar con «Ver más»: así el
 * total, los KPIs y el CSV cuentan lo que la tabla muestra, no sólo la página.
 */
import { useMemo } from "react";
import { useFiltrosTabla, type ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import { limaDateKey } from "@/lib/utils";
import { ORIGEN_LABELS, ESTADO_PAGO_LABELS, mesDe, resumirItems, type HistorialItem } from "./shared";

const ddmm = (v: number | string) => String(v).slice(0, 10).split("-").reverse().join("/");

export const COLUMNAS_FILTRO_GASTOS: readonly ColumnaFiltro<HistorialItem>[] = [
  { id: "fecha", label: "Fecha", tipo: "fecha", numero: (i) => limaDateKey(i.fecha) || null, formatearValor: ddmm },
  { id: "origen", label: "Origen", tipo: "multi", valor: (i) => ORIGEN_LABELS[i.source] },
  { id: "categoria", label: "Categoría", tipo: "multi", valor: (i) => i.category },
  { id: "descripcion", label: "Descripción", tipo: "texto", valor: (i) => [i.description, i.supplierName ?? ""] },
  { id: "pago", label: "Pago", tipo: "multi", valor: (i) => ESTADO_PAGO_LABELS[i.estadoPago] },
  { id: "monto", label: "Monto", tipo: "rango", numero: (i) => i.amount, paso: 1 },
];

type Grupo = { clave: string; label: string; total: number; gastos: number; items: HistorialItem[] };

/** Las filas de la página agrupadas por mes, con el subtotal de gastos de cada uno. */
export function agruparPorMes(page: readonly HistorialItem[]): Grupo[] {
  const out: Grupo[] = [];
  for (const item of page) {
    const { clave, label } = mesDe(item.fecha);
    const suma = item.clase === "gasto" ? item.amount : 0;
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.clave === clave) {
      ultimo.items.push(item);
      ultimo.total = Math.round((ultimo.total + suma) * 100) / 100;
      if (item.clase === "gasto") ultimo.gastos++;
    } else {
      out.push({ clave, label, total: suma, gastos: item.clase === "gasto" ? 1 : 0, items: [item] });
    }
  }
  return out;
}

export function useFiltrosGastos(filtered: HistorialItem[], visibles: number) {
  const f = useFiltrosTabla(filtered, COLUMNAS_FILTRO_GASTOS);
  const filas = f.filtradas;
  const resumen = useMemo(() => resumirItems(filas), [filas]);
  const grupos = useMemo(() => agruparPorMes(filas.slice(0, visibles)), [filas, visibles]);
  return { f, filas, resumen, grupos, totalFilas: filas.length };
}
