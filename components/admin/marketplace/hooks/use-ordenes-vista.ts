"use client";

/**
 * Filtros, orden, conteos y selección de la vista Órdenes del Marketplace.
 *
 * Los conteos por estado se cuentan sobre el PERÍODO elegido (no sobre todo el
 * historial): la tarjeta «Pendientes 5» abre 5 filas, no 3 porque las otras dos
 * quedaban fuera de los 30 días. Y «Entregadas» ya no dice «hoy»: contaba las
 * entregadas que se PIDIERON hoy (la lista no trae cuándo se entregó).
 */

import { useMemo, useState } from "react";
import type { MarketplaceOrder, OrderTargetStatus } from "@/components/admin/marketplace/hooks/use-marketplace-orders";
import { SIGUIENTES } from "@/components/admin/marketplace/ordenes/ordenes-util";

export type FiltroEstado = "todos" | "pendiente" | "confirmado" | "preparando" | "en_camino" | "entregado" | "cancelado";
export type FiltroFecha = "hoy" | "7d" | "30d" | "todo";
export type ClaveOrden = "createdAt" | "total" | "status";

const DIA_MS = 24 * 60 * 60 * 1000;

function dentroDelPeriodo(creada: string, fecha: FiltroFecha, ahora: Date): boolean {
  if (fecha === "todo") return true;
  const t = new Date(creada).getTime();
  if (fecha === "hoy") return t >= new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();
  return t >= ahora.getTime() - (fecha === "7d" ? 7 : 30) * DIA_MS;
}

export function useOrdenesVista(orders: readonly MarketplaceOrder[]) {
  const [query, setQuery] = useState("");
  const [estado, setEstado] = useState<FiltroEstado>("todos");
  const [fecha, setFecha] = useState<FiltroFecha>("30d");
  const [sortKey, setSortKey] = useState<ClaveOrden>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

  const delPeriodo = useMemo(() => {
    const ahora = new Date();
    return orders.filter((o) => dentroDelPeriodo(o.createdAt, fecha, ahora));
  }, [orders, fecha]);

  const conteos = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of delPeriodo) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [delPeriodo]);

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pasan = delPeriodo.filter((o) => {
      if (estado !== "todos" && o.status !== estado) return false;
      if (!q) return true;
      return (
        o.customerName.toLowerCase().includes(q) ||
        o.id.slice(-8).toLowerCase().includes(q) ||
        (o.customerPhone ?? "").toLowerCase().includes(q) ||
        (o.customerLocation ?? "").toLowerCase().includes(q)
      );
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return pasan.sort((a, b) => {
      if (sortKey === "createdAt") return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
      if (sortKey === "total") return (a.total - b.total) * dir;
      return a.status.localeCompare(b.status) * dir;
    });
  }, [delPeriodo, estado, query, sortKey, sortDir]);

  function ordenarPor(clave: ClaveOrden) {
    if (sortKey === clave) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(clave);
      setSortDir("desc");
    }
  }

  function limpiar() {
    setQuery("");
    setEstado("todos");
    setFecha("todo");
  }

  function alternar(id: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function alternarTodas() {
    setSeleccion((prev) => (prev.size === filtradas.length ? new Set() : new Set(filtradas.map((o) => o.id))));
  }

  /** Estados a los que pueden ir TODAS las seleccionadas (intersección de transiciones). */
  const destinosEnLote = useMemo<OrderTargetStatus[]>(() => {
    const conjuntos = Array.from(seleccion)
      .map((id) => orders.find((o) => o.id === id))
      .filter((o): o is MarketplaceOrder => !!o)
      .map((o) => new Set(SIGUIENTES[o.status] ?? []));
    if (conjuntos.length === 0) return [];
    return Array.from(conjuntos[0]).filter((s) => conjuntos.every((c) => c.has(s)));
  }, [seleccion, orders]);

  const filtrosActivos = (query.trim() ? 1 : 0) + (estado !== "todos" ? 1 : 0) + (fecha !== "30d" ? 1 : 0);

  return {
    query, setQuery, estado, setEstado, fecha, setFecha,
    sortKey, sortDir, ordenarPor, limpiar, filtrosActivos,
    conteos, delPeriodo, filtradas,
    seleccion, setSeleccion, alternar, alternarTodas, destinosEnLote,
  };
}

export type OrdenesVista = ReturnType<typeof useOrdenesVista>;
