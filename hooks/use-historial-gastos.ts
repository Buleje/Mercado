"use client";

/**
 * use-historial-gastos — los datos del Historial de Gastos y todo lo que se
 * deriva de ellos.
 *
 * El tab hacía el fetch, filtraba, formateaba y dibujaba en un solo archivo, y
 * eso escondía un error caro: los KPIs se leían de la respuesta del servidor
 * mientras la tabla se filtraba en el cliente, así que al tocar un chip de
 * categoría la tabla mostraba una cosa y «Total gastado» seguía diciendo otra.
 * Acá el resumen sale SIEMPRE de la misma lista que se dibuja.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  construirCsv, mesDe, normalizar, periodoADadas, resumirItems,
  type HistorialItem, type KpisServidor, type Orden, type Period,
} from "@/components/admin/compras/historial/shared";

/** Cuántas filas se dibujan de entrada. El resto entra con «Ver más». */
const PAGINA = 60;

export type FiltroEstado = "all" | "pagado" | "pendiente";

export function useHistorialGastos() {
  const [items, setItems] = useState<HistorialItem[]>([]);
  const [kpisServidor, setKpisServidor] = useState<KpisServidor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [period, setPeriod] = useState<Period>("mes");
  const [sourceFilter, setSourceFilter] = useState<"all" | "expense" | "purchase">("all");
  const [estadoFilter, setEstadoFilter] = useState<FiltroEstado>("all");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [orden, setOrden] = useState<Orden>({ campo: "fecha", dir: "desc" });
  const [visibles, setVisibles] = useState(PAGINA);

  const fetchHistorial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = periodoADadas(period, new Date());
      const params = new URLSearchParams();
      if (from) params.set("from", from.toISOString());
      if (to) params.set("to", to.toISOString());
      params.set("source", sourceFilter);

      const res = await fetch(`/api/expenses/historial?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      setKpisServidor(data.kpis ?? null);
    } catch (err) {
      console.warn("[useHistorialGastos] fetch failed", err);
      setError("No se pudo cargar el historial. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  }, [period, sourceFilter]);

  useEffect(() => { fetchHistorial(); }, [fetchHistorial]);

  // Cambiar de filtro y quedarse en la página 4 de la lista anterior no tiene
  // sentido: se vuelve al principio.
  useEffect(() => { setVisibles(PAGINA); }, [period, sourceFilter, estadoFilter, search, categoryFilter]);

  const filtered = useMemo(() => {
    let list = items;
    if (search.trim()) {
      const q = normalizar(search);
      list = list.filter((i) =>
        normalizar(i.description).includes(q) ||
        normalizar(i.category).includes(q) ||
        normalizar(i.supplierName ?? "").includes(q),
      );
    }
    if (categoryFilter) list = list.filter((i) => i.category === categoryFilter);
    if (estadoFilter === "pagado") list = list.filter((i) => i.estadoPago === "pagado");
    if (estadoFilter === "pendiente") list = list.filter((i) => i.estadoPago === "parcial" || i.estadoPago === "pendiente");

    const signo = orden.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (orden.campo) {
        case "amount": return (a.amount - b.amount) * signo;
        case "category": return a.category.localeCompare(b.category, "es-PE") * signo;
        case "source": return a.source.localeCompare(b.source) * signo;
        case "estadoPago": return a.estadoPago.localeCompare(b.estadoPago) * signo;
        default: return (Date.parse(a.fecha) - Date.parse(b.fecha)) * signo;
      }
    });
  }, [items, search, categoryFilter, estadoFilter, orden]);

  const resumen = useMemo(() => resumirItems(filtered), [filtered]);

  /** Filas visibles agrupadas por mes, con el subtotal de cada uno. */
  const grupos = useMemo(() => {
    const page = filtered.slice(0, visibles);
    const out: Array<{ clave: string; label: string; total: number; items: HistorialItem[] }> = [];
    for (const item of page) {
      const { clave, label } = mesDe(item.fecha);
      const ultimo = out[out.length - 1];
      if (ultimo && ultimo.clave === clave) {
        ultimo.items.push(item);
        ultimo.total = Math.round((ultimo.total + item.amount) * 100) / 100;
      } else {
        out.push({ clave, label, total: item.amount, items: [item] });
      }
    }
    return out;
  }, [filtered, visibles]);

  const hayFiltroActivo = Boolean(search.trim() || categoryFilter || estadoFilter !== "all");

  const alternarOrden = useCallback((campo: Orden["campo"]) => {
    setOrden((o) => (o.campo === campo
      ? { campo, dir: o.dir === "desc" ? "asc" : "desc" }
      : { campo, dir: campo === "category" || campo === "source" ? "asc" : "desc" }));
  }, []);

  const limpiarFiltros = useCallback(() => {
    setSearch("");
    setCategoryFilter("");
    setEstadoFilter("all");
  }, []);

  const exportarCsv = useCallback(() => {
    const blob = new Blob([construirCsv(filtered)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historial-gastos-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered, period]);

  return {
    // datos
    items, filtered, grupos, resumen, kpisServidor, loading, error,
    // filtros
    period, setPeriod,
    sourceFilter, setSourceFilter,
    estadoFilter, setEstadoFilter,
    search, setSearch,
    categoryFilter, setCategoryFilter,
    orden, alternarOrden,
    hayFiltroActivo, limpiarFiltros,
    // paginación
    visibles, verMas: () => setVisibles((v) => v + PAGINA), totalFilas: filtered.length,
    // acciones
    recargar: fetchHistorial, exportarCsv,
  };
}
