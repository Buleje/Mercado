"use client";

import { useState } from "react";
import { X, Search } from "@buleje/design-system/icons";
import { cn, limaDateKey } from "@/lib/utils";
import type { FiltroEstado } from "@/hooks/use-filtros-ordenes-compra";
import type { OrdenesCompra } from "@/components/admin/ordenes-compra/hooks/use-ordenes-compra";

/** Alto y tipografía de los controles de la fila (48 px, 14 px). */
const CAMPO =
  "h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

type Periodo = "todo" | "mes" | "mes-pasado" | "7" | "30" | "elegir";

/** Rango [desde, hasta] (YYYY-MM-DD, día de Lima) de cada atajo. */
function rangoDe(p: Exclude<Periodo, "todo" | "elegir">, hoy = limaDateKey()): [string, string] {
  const [a, m] = hoy.split("-").map(Number);
  const dia = (d: Date) => d.toISOString().slice(0, 10);
  if (p === "mes") return [`${hoy.slice(0, 7)}-01`, hoy];
  if (p === "mes-pasado") {
    const ini = new Date(Date.UTC(a, m - 2, 1));
    const fin = new Date(Date.UTC(a, m - 1, 0));
    return [dia(ini), dia(fin)];
  }
  const ini = new Date(`${hoy}T12:00:00Z`);
  ini.setUTCDate(ini.getUTCDate() - (Number(p) - 1));
  return [dia(ini), hoy];
}

const PERIODOS: { id: Periodo; label: string }[] = [
  { id: "todo", label: "Todas las fechas" },
  { id: "mes", label: "Este mes" },
  { id: "mes-pasado", label: "Mes pasado" },
  { id: "7", label: "Últimos 7 días" },
  { id: "30", label: "Últimos 30 días" },
  { id: "elegir", label: "Elegir fechas…" },
];

/**
 * La fila de filtros de Órdenes de compra, pegada a la tabla (patrón del panel,
 * 10-10): buscador · estado · proveedor · período. Antes eran dos bandas (una
 * tarjeta con buscador, dos fechas en mm/dd/yyyy, proveedor y orden; y debajo
 * los chips de estado). El orden de la lista va en los títulos de la tabla.
 */
export default function OcBuscador({ oc }: { oc: OrdenesCompra }) {
  const { orders, loading, suppliers, f, kpis } = oc;
  /* «Elegir fechas» sin fechas puestas todavía: los dos campos tienen que aparecer igual. */
  const [eligiendo, setEligiendo] = useState(false);
  if (loading || orders.length === 0) return null;

  const periodo: Periodo = (() => {
    if (!f.desde && !f.hasta) return eligiendo ? "elegir" : "todo";
    for (const p of ["mes", "mes-pasado", "7", "30"] as const) {
      const [d, h] = rangoDe(p);
      if (f.desde === d && f.hasta === h && !eligiendo) return p;
    }
    return "elegir";
  })();
  const elegirPeriodo = (p: Periodo) => {
    setEligiendo(p === "elegir");
    if (p === "todo") { f.setDesde(""); f.setHasta(""); return; }
    if (p === "elegir") return;
    const [d, h] = rangoDe(p);
    f.setDesde(d);
    f.setHasta(h);
  };

  /* Estados con cero se esconden (salvo el elegido): «Parciales 0 · Recibidas 0» no filtra nada. */
  const chips: { id: FiltroEstado; label: string; count: number }[] = [
    { id: "todas", label: "Todas", count: kpis.total },
    { id: "pendiente", label: "Pendientes", count: kpis.counts.pendiente },
    { id: "parcial", label: "Parciales", count: kpis.counts.parcial },
    { id: "recibido", label: "Recibidas", count: kpis.counts.recibido },
    { id: "cancelado", label: "Canceladas", count: kpis.counts.cancelado },
  ];
  const visibles = chips.filter((c) => c.id === "todas" || c.count > 0 || f.estado === c.id);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[12rem] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
        <input
          value={f.busqueda}
          onChange={(e) => f.setBusqueda(e.target.value)}
          placeholder="Proveedor o producto"
          aria-label="Buscar órdenes de compra"
          className={cn(CAMPO, "w-full pl-9 pr-10")}
        />
        {f.busqueda && (
          <button
            type="button"
            onClick={() => f.setBusqueda("")}
            aria-label="Borrar búsqueda"
            className="absolute right-0 top-1/2 inline-flex h-12 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      <div role="group" aria-label="Estado de la orden" className="flex flex-wrap items-center gap-1.5">
        {visibles.map((c) => {
          const activo = f.estado === c.id;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={activo}
              onClick={() => f.setEstado(c.id)}
              className={cn(
                "inline-flex h-12 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors",
                activo
                  ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--surface-raised)]"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)]",
              )}
            >
              {c.label}
              <span className="tabular-nums opacity-80">{c.count}</span>
            </button>
          );
        })}
      </div>
      <select
        value={f.proveedorId ?? ""}
        onChange={(e) => f.setProveedorId(e.target.value || null)}
        aria-label="Filtrar por proveedor"
        className={cn(CAMPO, "min-w-0 flex-1 cursor-pointer sm:w-48 sm:flex-none")}
      >
        <option value="">Todos los proveedores</option>
        {/* Un proveedor que no está en tu lista (borrado, o de otra tienda: 10-10, las automáticas de main
            apuntan a uno de `demo`) igual se nombra: si no, el select decía «Todos» con el filtro puesto. */}
        {f.proveedorId && !suppliers.some((s) => s.id === f.proveedorId) && (
          <option value={f.proveedorId}>{orders.find((o) => o.supplierId === f.proveedorId)?.supplierName ?? "Otro proveedor"}</option>
        )}
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>{s.name}{s.ruc ? ` (${s.ruc})` : ""}</option>
        ))}
      </select>
      <select
        value={periodo}
        onChange={(e) => elegirPeriodo(e.target.value as Periodo)}
        aria-label="Fecha de la orden"
        className={cn(CAMPO, "min-w-0 flex-1 cursor-pointer sm:w-40 sm:flex-none")}
      >
        {PERIODOS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      {periodo === "elegir" && (
        <>
          <input type="date" lang="es-PE" value={f.desde} max={f.hasta || undefined} onChange={(e) => f.setDesde(e.target.value)} aria-label="Desde" title="Desde" className={CAMPO} />
          <input type="date" lang="es-PE" value={f.hasta} min={f.desde || undefined} onChange={(e) => f.setHasta(e.target.value)} aria-label="Hasta" title="Hasta" className={CAMPO} />
        </>
      )}
      {f.hayFiltros && (
        <button
          type="button"
          onClick={() => { setEligiendo(false); f.limpiar(); }}
          className="inline-flex h-12 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
        >
          <X className="h-4 w-4" aria-hidden /> Limpiar
          <span className="sr-only">filtros</span>
        </button>
      )}
    </div>
  );
}
