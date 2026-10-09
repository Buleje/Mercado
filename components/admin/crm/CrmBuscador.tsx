"use client";

import { AdminTooltip } from "@/components/admin/shared/AdminTooltip";
import { Search, X, RefreshCw } from "@buleje/design-system/icons";
import type { Crm } from "@/components/admin/crm/use-crm";
import { BotonIndicadores } from "@/components/admin/arqueo/KpisCuadre";
import CrmBarra from "@/components/admin/crm/CrmBarra";

/** Cabecera del CRM en una fila: buscador, cantidad, recargar, indicadores, «Nuevo cliente» y «Más». Pieza de CRMTab: recibe `useCrm` entero. */
export default function CrmBuscador({ crm, indicadores }: {
  crm: Crm;
  /** El botón «Indicadores ▾» vive en esta fila (cabecera en una fila); el panel, arriba. */
  indicadores: { abierto: boolean; alternar: () => void; controla: string };
}) {
  const { search, setSearch, load, filtered } = crm;
  return (
    <>
      {/* ── Toolbar estandar ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Busqueda — full-width en móvil (fila propia), flex-1 en desktop */}
        <div className="relative w-full sm:flex-1 sm:w-auto min-w-[200px] sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Nombre o teléfono..."
            className="w-full pl-10 pr-9 h-11 sm:h-auto sm:py-2.5 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] focus:border-[var(--text-primary)] focus:ring-2 focus:ring-[var(--rule-base)] outline-none transition-all"
          />
          {search && (
            <button aria-label="Quitar" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-3.5 w-3.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]" />
            </button>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Resultado count */}
        <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">
          {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
        </span>

        {/* Acciones */}
        <AdminTooltip content="Recargar clientes desde la base de datos">
          <button onClick={load} aria-label="Actualizar" className="p-2 rounded-xl bg-[var(--surface-sunken)] hover:bg-[var(--rule-soft)] transition-colors">
            <RefreshCw className="h-4 w-4 text-[var(--text-secondary)]" />
          </button>
        </AdminTooltip>
        <BotonIndicadores abierto={indicadores.abierto} onAlternar={indicadores.alternar} controla={indicadores.controla} />
        <CrmBarra crm={crm} />
      </div>
    </>
  );
}
