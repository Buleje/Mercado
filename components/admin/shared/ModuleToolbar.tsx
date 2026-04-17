"use client";

import { Search } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
 * ModuleToolbar — Barra de herramientas estandarizada para módulos admin.
 *
 * Secciones (de izquierda a derecha):
 *   - Búsqueda (input con icono)
 *   - Filtros (chips o dropdowns, render libre)
 *   - Spacer
 *   - Contador de resultados
 *   - Acciones (botones)
 * ═══════════════════════════════════════════════════════════════════════════ */

interface ModuleToolbarProps {
  /** Configuración del campo de búsqueda */
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  };

  /** Filtros (chips, dropdowns, render libre) */
  filters?: React.ReactNode;

  /** Acciones a la derecha (botones) */
  actions?: React.ReactNode;

  /** Contador de resultados */
  resultCount?: number;
}

export default function ModuleToolbar({
  search,
  filters,
  actions,
  resultCount,
}: ModuleToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search input */}
      {search && (
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder ?? "Buscar..."}
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-[var(--rule-base)] dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 outline-none transition-all"
          />
        </div>
      )}

      {/* Filters */}
      {filters}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Result count */}
      {resultCount !== undefined && (
        <span className="text-xs text-gray-400">
          {resultCount} resultados
        </span>
      )}

      {/* Actions */}
      {actions && (
        <div className="flex items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
