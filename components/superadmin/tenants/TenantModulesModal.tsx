"use client";

import { Layers, Loader2, RotateCcw, CheckCircle2, XCircle, Search, Zap, Eye } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import type { TenantRow } from "@/lib/superadmin-types";
import { PLANS } from "@/lib/billing/plan-tiers";
import { useTenantModulos } from "@/components/superadmin/tenants/useTenantModulos";
import { TenantModulosLista } from "@/components/superadmin/tenants/TenantModulosLista";

/**
 * TenantModulesModal — módulos del panel admin A MEDIDA para UN tenant.
 *
 * Feynman: la plantilla global (/superadmin/plantilla) es el menú para todos;
 * acá el superadmin arma la "dieta especial" de UNA tienda: fuerza módulos
 * ON/OFF y eso pisa la plantilla solo para este tenant. Lo que no se toca
 * sigue heredando. El PLAN sigue siendo el techo: un módulo fuera del plan
 * del tenant no aparece aunque se fuerce (business ve todo, pro lo suyo).
 *
 * Abierto desde la columna "Módulos" de la vista lista en /superadmin/tenants.
 */

interface TenantModulesModalProps {
  tenant: TenantRow;
  onClose: () => void;
  /** Notifica el nuevo count de overrides (para refrescar el badge de la tabla). */
  onSaved?: (count: number) => void;
}


export function TenantModulesModal({ tenant, onClose, onSaved }: TenantModulesModalProps) {
  const modulos = useTenantModulos(tenant, onClose, onSaved);
  const { loading, saving, error, tenantTier, overrideCount, effectiveStats, enableAllForPlan, query, setQuery, draft, save } = modulos;

  return (
    <AdminModal
      open
      onClose={onClose}
      title={`Módulos de ${tenant.name}`}
      description={`Plan ${PLANS[tenantTier].label} · fuerza módulos ON/OFF solo para esta tienda; el resto hereda la plantilla global.`}
      variant="wide"
    >
      <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4 sm:px-6">
        {/* Barra de estado + acción masiva — Brandon 2026-06-05 */}
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]/60 p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-[var(--accent)]">
              <Eye className="h-4 w-4" />
              {effectiveStats.visible}/{effectiveStats.inPlanTotal} visibles
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-raised)] border border-[var(--rule-base)] px-3 py-1 text-sm font-bold text-[var(--text-secondary)]">
              <Layers className="h-4 w-4" />
              {overrideCount === 0 ? "Hereda plantilla" : `${overrideCount} a medida`}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={enableAllForPlan}
              disabled={loading}
              title={`Fuerza visibles TODOS los módulos que el plan ${PLANS[tenantTier].label} incluye`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-extrabold text-white shadow-sm transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              <Zap className="h-3.5 w-3.5" strokeWidth={2.5} />
              Activar todo ({PLANS[tenantTier].label})
            </button>
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">
            El plan {PLANS[tenantTier].label} es el techo: lo que esté fuera del plan no aparece
            aunque se fuerce. Los cambios pisan la plantilla global solo para esta tienda.
          </p>
          {/* Buscador — hay ~45 módulos, encontrarlos por nombre es más rápido */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar módulo… (ej. inventario, SUNAT, IA)"
              aria-label="Buscar módulo"
              className="h-10 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-10 pr-4 text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 transition-colors"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-red-950/30 px-4 py-2.5 text-sm font-semibold text-[var(--data-error-700)] dark:text-red-300">
            {error}
          </div>
        )}

        <TenantModulosLista modulos={modulos} />

        {/* Footer acciones */}
        <div className="sticky bottom-0 -mx-4 sm:-mx-5 -mb-4 sm:-mb-5 flex items-center gap-2 border-t border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 sm:px-5 py-3">
          {overrideCount > 0 && (
            <button
              type="button"
              onClick={() => void save({})}
              disabled={saving || loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-50"
              title="Eliminar todos los overrides — la tienda vuelve a la plantilla global"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Restaurar plantilla
            </button>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-4 min-h-10 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-50"
          >
            <XCircle className="h-4 w-4" /> Cancelar
          </button>
          <button
            type="button"
            onClick={() => void save(draft)}
            disabled={saving || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 min-h-10 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Guardar
          </button>
        </div>
      </div>
    </AdminModal>
  );
}
