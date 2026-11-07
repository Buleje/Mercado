"use client";

import { Clock, AlertTriangle, CheckSquare, Download, Mail, X, MessageSquare } from "@buleje/design-system/icons";
import type { TenantRow, PlanId } from "@/lib/superadmin-types";
import { etiquetaDePlan, precioMensualDePlan } from "@/lib/billing/plan-tiers";
import type { TenantsSeleccion } from "@/components/superadmin/tenants/useTenantsSeleccion";

/** Valores de `Tenant.plan` en orden de la escalera (Free → Starter → Pro → Business). */
const PLANES_GUARDADOS: PlanId[] = ["free", "pro", "business", "enterprise"];

interface TenantsBulkBarProps {
  seleccion: TenantsSeleccion;
  sortedFinal: TenantRow[];
  tenants: TenantRow[];
  showToast: (msg: string, ok?: boolean) => void;
}

/** Barra flotante de acciones masivas sobre las tiendas seleccionadas. */
export function TenantsBulkBar({ seleccion, sortedFinal, tenants, showToast }: TenantsBulkBarProps) {
  const { selectedIds, setSelectedIds, handleBulkExport, setBulkMessageOpen, bulkSetPlan, bulkExtendTrial, bulkSuspend, clearSelection } = seleccion;
  return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-2xl border-2 border-[var(--accent)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)] px-4 py-2.5">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-primary)] pr-2 border-r border-[var(--rule-soft)]">
            <CheckSquare className="h-4 w-4 text-[var(--accent)]" />
            {selectedIds.size} seleccionado{selectedIds.size === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => {
              // Seleccionar todos los visibles
              const allIds = new Set(sortedFinal.map((t) => t.id));
              setSelectedIds(allIds);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            Seleccionar visibles ({sortedFinal.length})
          </button>
          <button
            type="button"
            onClick={handleBulkExport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--accent)] bg-primary/10 hover:brightness-110 transition-all"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </button>
          <button
            type="button"
            onClick={() => setBulkMessageOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--accent)] bg-primary/10 hover:brightness-110 transition-all"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Mensaje
          </button>
          {/* Acciones masivas (D2): plan · trial · suspender */}
          <select
            aria-label="Cambiar plan de la selección"
            defaultValue=""
            onChange={(e) => { const v = e.target.value as PlanId; if (v) { void bulkSetPlan(v); e.currentTarget.value = ""; } }}
            className="h-8 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-xs font-bold text-[var(--text-secondary)]"
          >
            <option value="">Plan…</option>
            {PLANES_GUARDADOS.map((p) => (
              <option key={p} value={p}>→ {etiquetaDePlan(p)} · S/ {precioMensualDePlan(p)}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void bulkExtendTrial()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-[var(--accent-600)] transition-colors"
          >
            <Clock className="h-3.5 w-3.5" />
            Trial +14d
          </button>
          <button
            type="button"
            onClick={() => void bulkSuspend()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--data-error-600)] hover:bg-[var(--data-error-50)] transition-colors"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Suspender
          </button>
          <button
            type="button"
            onClick={() => {
              const emails = tenants
                .filter((t) => selectedIds.has(t.id) && t.ownerEmail)
                .map((t) => t.ownerEmail)
                .join(",");
              if (emails) {
                window.location.href = `mailto:?bcc=${emails}`;
              } else {
                showToast("Los tenants seleccionados no tienen email registrado", false);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <Mail className="h-3.5 w-3.5" />
            Email
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
            title="Cerrar selección"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
  );
}
