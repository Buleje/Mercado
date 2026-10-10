"use client";

import { useEffect, useRef } from "react";
import { Search, ChevronDown, RefreshCw, LayoutGrid, List, Bomb, Grid3x3, Square, CheckSquare, TrendingUp } from "@buleje/design-system/icons";
import { useRouter } from "next/navigation";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import type { SortField, SortDir, ViewMode } from "@/components/superadmin/tenants/types";

const inputCls =
  "bg-[var(--surface-canvas)] border border-[var(--rule-base)] text-[var(--text-primary)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40";
const selectCls = `appearance-none ${inputCls} pr-8 text-[var(--text-secondary)] cursor-pointer`;

interface TenantsToolbarProps {
  search: string;
  setSearch: (v: string) => void;
  sortField: SortField;
  sortDir: SortDir;
  onSortChange: (field: SortField, dir: SortDir) => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  bulkMode: boolean;
  onToggleBulk: () => void;
  loading: boolean;
  onReload: () => void;
  onNuclear: () => void;
}

/** Barra fija de la lista de tiendas: buscador (atajo «/»), orden, vista y acciones. */
export function TenantsToolbar({
  search, setSearch, sortField, sortDir, onSortChange, viewMode, setViewMode,
  bulkMode, onToggleBulk, loading, onReload, onNuclear,
}: TenantsToolbarProps) {
  const router = useRouter();
  // Brandon 2026-05-21 high-impact: keyboard shortcut "/" focusea search
  // (Linear/Notion/GitHub pattern). Power-user UX: el superadmin trabaja
  // sobre N tenants y necesita filtrar rápido sin tocar el mouse.
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement | null;
      // Ignorar si ya está tipeando en un input/textarea/contenteditable
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) return;
      e.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Lo de uso constante a la vista (buscar, ordenar, vista, selección); lo ocasional, en el menú.
  const acciones: MenuAccion[] = [
    { id: "crecimiento", label: "Ver crecimiento", icon: TrendingUp, onSelect: () => router.push("/superadmin/tenants/growth") },
    { id: "actualizar", label: "Actualizar la lista", icon: RefreshCw, onSelect: onReload, busy: loading, disabled: loading },
    { id: "reinicio", label: "Mantenimiento: reinicio total", hint: "Acción destructiva, pide confirmación", icon: Bomb, tone: "danger", onSelect: onNuclear },
  ];
  const claseVista = (activa: boolean) =>
    `p-1.5 rounded-xl transition-colors ${activa ? "bg-[var(--surface-raised)] text-[var(--accent)] shadow-sm" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`;

  return (
    <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-[var(--surface-canvas)]/85 backdrop-blur-md border-b border-[var(--rule-soft)] flex flex-wrap items-center gap-2 sm:gap-3">
      {/* Buscador: atajo «/» desde cualquier parte de la página. */}
      <div className="relative order-first basis-full sm:basis-auto flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)] pointer-events-none" />
        <input
          ref={searchInputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Busca por nombre, correo, teléfono o RUC…"
          aria-label="Buscar negocios por nombre, correo, teléfono o RUC (atajo: tecla /)"
          className="w-full h-10 pl-10 pr-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] placeholder:font-normal focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition-colors"
        />
        <kbd
          aria-hidden
          className="hidden lg:inline-flex absolute right-2 top-1/2 -translate-y-1/2 items-center justify-center h-6 px-1.5 rounded border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] pointer-events-none"
        >
          /
        </kbd>
      </div>

      <div className="relative shrink-0">
        <select
          value={`${sortField}-${sortDir}`}
          onChange={(e) => {
            const [field, dir] = e.target.value.split("-") as [SortField, SortDir];
            onSortChange(field, dir);
          }}
          className={`${selectCls} h-10 pl-3 text-sm font-semibold`}
          aria-label="Orden"
        >
          <option value="createdAt-desc">Recientes ↓</option>
          <option value="createdAt-asc">Antiguos ↑</option>
          <option value="name-asc">Nombre A→Z</option>
          <option value="name-desc">Nombre Z→A</option>
          <option value="ordersThisMonth-desc">+ Pedidos</option>
          <option value="ordersThisMonth-asc">− Pedidos</option>
          <option value="plan-asc">Por plan</option>
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)] pointer-events-none" />
      </div>

      {/* Vista: tabla · tarjetas · compacta (se recuerda) */}
      <div className="flex items-center bg-[var(--surface-sunken)] rounded-xl p-1 shrink-0" role="group" aria-label="Vista">
        <button type="button" onClick={() => setViewMode("table")} title="Vista tabla" aria-label="Vista tabla" aria-pressed={viewMode === "table"} className={claseVista(viewMode === "table")}>
          <List className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => setViewMode("cards")} title="Vista tarjetas" aria-label="Vista tarjetas" aria-pressed={viewMode === "cards"} className={claseVista(viewMode === "cards")}>
          <LayoutGrid className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => setViewMode("compact")} title="Vista compacta: más tiendas en menos espacio" aria-label="Vista compacta" aria-pressed={viewMode === "compact"} className={claseVista(viewMode === "compact")}>
          <Grid3x3 className="w-4 h-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={onToggleBulk}
        title={bulkMode ? "Salir del modo selección" : "Modo selección"}
        className={`inline-flex items-center justify-center h-10 w-10 shrink-0 rounded-xl border-2 transition-colors ${
          bulkMode
            ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
            : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
        }`}
        aria-label={bulkMode ? "Salir de selección" : "Activar selección"}
        aria-pressed={bulkMode}
      >
        {bulkMode ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
      </button>

      <ActionMenu label="Más acciones" actions={acciones} soloIcono size="md" />
    </div>
  );
}
