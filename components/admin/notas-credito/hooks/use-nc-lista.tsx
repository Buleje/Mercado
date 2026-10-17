import { useEffect, useCallback, useMemo } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "@buleje/design-system/icons";
import { type NotaCredito, type SortField, PER_PAGE, baseDeLosItems } from "@/components/admin/notas-credito/nc-compartido";
import { useNcEstado } from "@/components/admin/notas-credito/hooks/use-nc-estado";
import { useNcSelector } from "@/components/admin/notas-credito/hooks/use-nc-selector";

/** Carga de la lista, filtros, orden, selección y CSV. Parte de `useNotasCredito`. */
export function useNcLista(previo: ReturnType<typeof useNcEstado> & ReturnType<typeof useNcSelector>) {
  const {
    notas, setNotas, setLoading, setError, search, debouncedSearch, setDebouncedSearch, statusFilter,
    page, setPage, checkedIds, setCheckedIds, sortField, setSortField, sortDir, setSortDir, dateFrom,
    dateTo, minAmount, maxAmount, form, autoMonto, selectedVenta,
  } = previo;
  // ── Main list logic ───────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search, setDebouncedSearch]);

  const fetchNotas = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      const res = await fetch(`/api/notas-credito?${params}`);
      if (!res.ok) throw new Error("Error al cargar notas de cr\u00e9dito");
      const data: NotaCredito[] = await res.json();
      setNotas(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally { setLoading(false); }
  }, [statusFilter, debouncedSearch, setError, setLoading, setNotas]);

  useEffect(() => { fetchNotas(); }, [fetchNotas]);

  // ── Computed values ───────────────────────────────────────────────────────
  const montoNum = parseFloat(form.monto) || 0;
  // Monto sin tocar desde los ítems elegidos → la nota va por lo devuelto CON IGV (exacto, 09-10).
  const totalConIgv = selectedVenta && autoMonto > 0 && form.monto === baseDeLosItems(autoMonto)
    ? Math.round(autoMonto * 100) / 100
    : null;
  // Al céntimo, como lo guarda el servidor (la tasa la decide él).
  const computedIgv = totalConIgv !== null ? Math.round((totalConIgv - montoNum) * 100) / 100 : Math.round(montoNum * 18) / 100;
  const computedTotal = totalConIgv ?? montoNum + computedIgv;

  const filteredNotas = useMemo(() => {
    let list = [...notas];
    if (dateFrom) list = list.filter(nc => nc.createdAt.slice(0, 10) >= dateFrom);
    if (dateTo) list = list.filter(nc => nc.createdAt.slice(0, 10) <= dateTo);
    if (minAmount) list = list.filter(nc => nc.total >= parseFloat(minAmount));
    if (maxAmount) list = list.filter(nc => nc.total <= parseFloat(maxAmount));
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "numero") cmp = a.numero.localeCompare(b.numero);
      else if (sortField === "total") cmp = a.total - b.total;
      else if (sortField === "createdAt") cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      else if (sortField === "status") cmp = a.status.localeCompare(b.status);
      return sortDir === "desc" ? -cmp : cmp;
    });
    return list;
  }, [notas, dateFrom, dateTo, minAmount, maxAmount, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredNotas.length / PER_PAGE));
  const paginated = filteredNotas.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  useEffect(() => { setPage(1); }, [search, statusFilter, dateFrom, dateTo, minAmount, maxAmount, setPage]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-[var(--text-tertiary)]" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />;
  };

  // ── Bulk operations ───────────────────────────────────────────────────────
  const allChecked = paginated.length > 0 && paginated.every(nc => checkedIds.has(nc.id));
  const someChecked = checkedIds.size > 0;
  const toggleCheck = (id: string) => setCheckedIds(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleAll = () => { if (allChecked) setCheckedIds(new Set()); else setCheckedIds(new Set(paginated.map(nc => nc.id))); };

  const exportCSV = () => {
    const items = someChecked ? filteredNotas.filter(nc => checkedIds.has(nc.id)) : filteredNotas;
    const header = "Número,Motivo,Codigo,Monto,IGV,Total,Status,Fecha\n";
    const rows = items.map(nc => `${nc.numero},"${nc.motivoDesc}",${nc.motivoCodigo},${nc.monto},${nc.igv},${nc.total},${nc.status},${nc.createdAt.slice(0, 10)}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `notas-credito-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return {
    fetchNotas, montoNum, totalConIgv, computedIgv, computedTotal, filteredNotas, totalPages, paginated, toggleSort,
    SortIcon, allChecked, someChecked, toggleCheck, toggleAll, exportCSV,
  };
}
