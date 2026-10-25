import { useMemo, useEffect, useCallback } from "react";
import { estadoVisible, TIPO_LABELS } from "@/lib/types/contracts";
import { useFiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import { COLUMNAS_CONTRATOS, ORDEN_CONTRATOS } from "@/components/admin/contratos/columnas-filtro-contratos";
import { useOrdenColumna } from "@/components/admin/shared/use-orden-columna";
import { PER_PAGE } from "./constantes-contratos";
import type { HastaContratosCarga } from "./use-contratos-carga";
export function useContratosVista(previo: HastaContratosCarga) {
  const { contratos, debouncedSearch, filterTipo, filterEstado, page, setPage, setSearch, setDebouncedSearch,
    setFilterTipo, setFilterEstado } = previo;
  // ── Computed ──────────────────────────────────────────────────────────

  const filteredContratos = useMemo(() => {
    let list = contratos;
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(c => c.clienteNombre.toLowerCase().includes(q) || c.numero.toLowerCase().includes(q) || c.descripcion.toLowerCase().includes(q));
    }
    if (filterTipo !== "ALL") list = list.filter(c => c.tipo === filterTipo);
    if (filterEstado !== "ALL") list = list.filter(c => estadoVisible(c) === filterEstado);
    return list;
  }, [contratos, debouncedSearch, filterTipo, filterEstado]);

  // Filtros y orden por columna del encabezado, encima de la búsqueda/tipo/estado de la barra.
  const fCols = useFiltrosTabla(filteredContratos, COLUMNAS_CONTRATOS);
  const ordCols = useOrdenColumna(ORDEN_CONTRATOS);
  const verContratos = ordCols.ordenar(fCols.filtradas);
  const totalPages = Math.max(1, Math.ceil(verContratos.length / PER_PAGE));
  const paginated = verContratos.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  useEffect(() => { setPage(1); }, [debouncedSearch, filterTipo, filterEstado, fCols.facetas]);

  /** Vacía los 3 filtros de golpe (búsqueda, tipo, estado) — el botón «Quitar
   *  filtros» del vacío filtrado. Se limpia `debouncedSearch` directo, sin
   *  esperar los 250ms del debounce. */
  const clearContratosFilters = useCallback(() => {
    setSearch("");
    setDebouncedSearch("");
    setFilterTipo("ALL");
    setFilterEstado("ALL");
  }, []);

  // Stats
  const stats = useMemo(() => {
    const vigentes = contratos.filter(c => estadoVisible(c) === "VIGENTE").length;
    const porVencer = contratos.filter(c => estadoVisible(c) === "POR_VENCER").length;
    const vencidos = contratos.filter(c => estadoVisible(c) === "VENCIDO").length;
    const pendientesFirma = contratos.filter(c => estadoVisible(c) === "PENDIENTE_FIRMA").length;
    // Lo comprometido = lo que sigue en pie. Un contrato anulado o vencido ya no
    // es plata que la bodega deba o vaya a cobrar.
    const montoVigente = contratos
      .filter(c => ["VIGENTE", "POR_VENCER", "PENDIENTE_FIRMA"].includes(estadoVisible(c)))
      .reduce((s, c) => s + (c.monto || 0), 0);

    const byType: Record<string, number> = {};
    contratos.forEach(c => { byType[c.tipo] = (byType[c.tipo] || 0) + 1; });
    const typeData = Object.entries(byType).map(([k, v]) => ({
      name: TIPO_LABELS[k as keyof typeof TIPO_LABELS] || k,
      value: v,
    }));

    const byMonth: Record<string, number> = {};
    contratos.forEach(c => {
      const m = c.createdAt ? c.createdAt.substring(0, 7) : "N/A";
      byMonth[m] = (byMonth[m] || 0) + 1;
    });
    const monthData = Object.entries(byMonth).sort().slice(-6).map(([k, v]) => ({ name: k, contratos: v }));

    // Mezclar monedas en un solo total sería mentir; el panel muestra soles y
    // avisa aparte si hay contratos en dólares.
    const hayDolares = contratos.some(c => c.moneda === "USD" && c.monto > 0);

    return { vigentes, porVencer, vencidos, pendientesFirma, montoVigente, hayDolares, typeData, monthData, total: contratos.length };
  }, [contratos]);

  return { filteredContratos, fCols, ordCols, verContratos, totalPages, paginated, clearContratosFilters,
    stats };
}
export type HastaContratosVista = HastaContratosCarga & ReturnType<typeof useContratosVista>;