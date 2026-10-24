"use client";

/**
 * Los datos de Guías de remisión: la lista (el buscador va al servidor, el
 * estado se filtra acá para que cada chip conserve SU conteo), el resumen del
 * mes y las acciones sobre una guía (duplicar, anular, exportar).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { POR_PAGINA, type GuiaRemision, type GuiaStatus, type Resumen } from "./tipos";

export type FiltroEstado = GuiaStatus | "";

export function useGuias() {
  const [guias, setGuias] = useState<GuiaRemision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState<FiltroEstado>("");
  const [page, setPage] = useState(1);
  const [resumen, setResumen] = useState<Resumen | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [busqueda, estado]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (busqueda.trim()) params.set("search", busqueda.trim());
      const res = await fetch(`/api/guias-remision?${params}`);
      if (!res.ok) throw new Error("Error al cargar guías");
      setGuias((await res.json()) as GuiaRemision[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [busqueda]);

  const cargarResumen = useCallback(async () => {
    try {
      const res = await fetch("/api/guias-remision/resumen");
      if (res.ok) setResumen((await res.json()) as Resumen);
    } catch {
      // los indicadores no son críticos
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { cargarResumen(); }, [cargarResumen]);

  const recargar = useCallback(() => { cargar(); cargarResumen(); }, [cargar, cargarResumen]);

  const conteos = useMemo(() => {
    const c: Record<string, number> = { "": guias.length };
    for (const g of guias) c[g.status] = (c[g.status] ?? 0) + 1;
    return c;
  }, [guias]);

  const filtradas = useMemo(() => (estado ? guias.filter((g) => g.status === estado) : guias), [guias, estado]);
  const totalPages = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  /* Anular la única guía de la última página (con un estado elegido) dejaba la tabla vacía con total > 0. */
  useEffect(() => { setPage((p) => Math.min(p, totalPages)); }, [totalPages]);
  const pagina = filtradas.slice((page - 1) * POR_PAGINA, page * POR_PAGINA);

  const patch = async (id: string, body: Record<string, unknown>): Promise<GuiaRemision> => {
    const res = await fetch(`/api/guias-remision/${id}`, {
      method: "PATCH",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("No se pudo completar la acción");
    return (await res.json()) as GuiaRemision;
  };

  const duplicar = async (id: string) => {
    await patch(id, { action: "duplicar" });
    recargar();
  };

  const anular = async (id: string, motivo: string) => {
    const actualizada = await patch(id, { action: "anular", motivo });
    setGuias((prev) => prev.map((g) => (g.id === actualizada.id ? actualizada : g)));
    cargarResumen();
    return actualizada;
  };

  const exportar = () => {
    const params = new URLSearchParams();
    if (estado) params.set("status", estado);
    window.open(`/api/guias-remision/exportar?${params}`, "_blank");
  };

  return {
    guias, loading, error, search, setSearch, estado, setEstado, page, setPage, totalPages, pagina,
    filtradas, conteos, resumen, recargar, duplicar, anular, exportar,
  };
}
