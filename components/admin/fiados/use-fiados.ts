"use client";

/**
 * Datos de «Me deben»: la lista de fiados del negocio y cómo se filtra,
 * ordena y pagina la tabla de Deudores.
 *
 * Se trae la lista COMPLETA una vez (GET /api/fiados ya filtraba en memoria)
 * y el buscador y los chips de estado filtran acá. Antes el filtro iba al
 * servidor y la lista filtrada alimentaba también Resumen y Análisis: con el
 * chip «Pagado» puesto en Deudores, el Resumen decía «te deben S/ 0».
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { tenantCacheKey } from "@/lib/tenant-cache";
import { PER_PAGE, type ColumnaOrden, type Densidad, type Fiado, type FiadoStatus } from "./tipos";

function leerDensidad(): Densidad {
  try {
    const v = localStorage.getItem(tenantCacheKey("table-density"));
    return v === "compact" || v === "wide" ? v : "normal";
  } catch {
    return "normal";
  }
}

export function useFiados() {
  const [fiados, setFiados] = useState<Fiado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FiadoStatus | "">("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<ColumnaOrden>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [densidad, setDensidadState] = useState<Densidad>(leerDensidad);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchFiados = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fiados");
      if (!res.ok) throw new Error("No se pudieron cargar los fiados");
      setFiados((await res.json()) as Fiado[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchFiados(); }, [fetchFiados]);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const filtrados = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return fiados.filter((f) => {
      if (statusFilter && f.status !== statusFilter) return false;
      if (!q) return true;
      return f.customerId.toLowerCase().includes(q)
        || (f.customerName ?? "").toLowerCase().includes(q)
        || (f.descripcion ?? "").toLowerCase().includes(q);
    });
  }, [fiados, statusFilter, debouncedSearch]);

  const ordenados = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtrados].sort((a, b) => {
      switch (sortBy) {
        case "name": return ((a.customerName || a.customerId) > (b.customerName || b.customerId) ? 1 : -1) * dir;
        case "total": return (a.total - b.total) * dir;
        case "saldo": return (a.saldo - b.saldo) * dir;
        case "fecha": return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
        default: return 0;
      }
    });
  }, [filtrados, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(ordenados.length / PER_PAGE));
  const paginated = ordenados.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const toggleSort = (col: ColumnaOrden) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("asc"); }
  };

  const setDensidad = useCallback((d: Densidad) => {
    setDensidadState(d);
    try { localStorage.setItem(tenantCacheKey("table-density"), d); } catch { /* sin persistencia: la tabla funciona igual */ }
  }, []);

  return {
    fiados, loading, error, fetchFiados,
    search, setSearch, statusFilter, setStatusFilter,
    filtrados, paginated, page, setPage, totalPages,
    sortBy, sortDir, toggleSort,
    densidad, setDensidad,
  };
}

export type EstadoFiados = ReturnType<typeof useFiados>;
