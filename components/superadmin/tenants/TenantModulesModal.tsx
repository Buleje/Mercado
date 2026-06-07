"use client";

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

import { useEffect, useMemo, useState } from "react";
import {
  Layers, Loader2, RotateCcw, Lock, Sparkles, CheckCircle2, XCircle,
  Search, Zap, Eye,
} from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import type { TenantRow } from "@/lib/superadmin-types";
import type { Tab } from "@/app/admin/_lib/tabs.types";
import {
  ADMIN_MODULE_CATALOG,
  ADMIN_MODULE_CATEGORIES,
  fetchAdminTemplate,
  type AdminTemplate,
} from "@/lib/admin-template";
import { planIncludesTab, minTierForTab, type PlanTier } from "@/lib/billing/plan-tiers";
import { planIdToTier } from "@/lib/billing/plan-mapping";
import { SPEC_GATED_MODULE_IDS } from "@/hooks/use-enabled-specs";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";
import { csrfHeaders } from "@/lib/csrf-client";

const TIER_LABEL: Record<PlanTier, string> = {
  basico: "Free",
  pro: "Starter",
  enterprise: "Pro",
  max: "Business",
};

interface TenantModulesModalProps {
  tenant: TenantRow;
  onClose: () => void;
  /** Notifica el nuevo count de overrides (para refrescar el badge de la tabla). */
  onSaved?: (count: number) => void;
}

export function TenantModulesModal({ tenant, onClose, onSaved }: TenantModulesModalProps) {
  const [globalTpl, setGlobalTpl] = useState<AdminTemplate | null>(null);
  /** Overrides en edición: tabId → visible forzado. Solo lo que difiere de la plantilla. */
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const tenantTier = planIdToTier(tenant.plan);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [tpl, res] = await Promise.all([
          fetchAdminTemplate({ raw: true }),
          fetchSuperadmin(`/api/superadmin/tenants/${tenant.slug}/module-overrides`),
        ]);
        if (!alive) return;
        setGlobalTpl(tpl);
        if (res.ok) {
          const data = (await res.json()) as { overrides: Record<string, { visible: boolean }> };
          const flat: Record<string, boolean> = {};
          for (const [id, ov] of Object.entries(data.overrides ?? {})) {
            if (typeof ov?.visible === "boolean") flat[id] = ov.visible;
          }
          setDraft(flat);
        }
      } catch {
        if (alive) setError("No se pudo cargar la configuración");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [tenant.slug]);

  /** Visible heredado de la plantilla global (sin override del tenant). */
  const inheritedVisible = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const m of ADMIN_MODULE_CATALOG) {
      const ov = globalTpl?.overrides[m.id];
      map[m.id] = ov?.visible ?? m.defaultVisible;
    }
    return map;
  }, [globalTpl]);

  const overrideCount = Object.keys(draft).length;

  /** ¿El módulo está dentro del plan del tenant (o es spec-gated)? */
  const isInPlan = (id: string) =>
    SPEC_GATED_MODULE_IDS.has(id) || planIncludesTab(tenantTier, id as Tab);

  /** Cuántos módulos verá efectivamente esta tienda (switch ON ∩ su plan). */
  const effectiveStats = useMemo(() => {
    let visible = 0;
    let inPlanTotal = 0;
    for (const m of ADMIN_MODULE_CATALOG) {
      if (!isInPlan(m.id)) continue;
      inPlanTotal++;
      if (draft[m.id] ?? inheritedVisible[m.id]) visible++;
    }
    return { visible, inPlanTotal };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, inheritedVisible, tenantTier]);

  /**
   * Activar TODO lo que el plan del tenant permite — Brandon 2026-06-05.
   * Spec-gated quedan fuera (su unlock real es la especialización, no esto).
   * Módulos que la plantilla ya muestra no necesitan override (se heredan).
   */
  const enableAllForPlan = () => {
    setDraft((prev) => {
      const next = { ...prev };
      for (const m of ADMIN_MODULE_CATALOG) {
        if (SPEC_GATED_MODULE_IDS.has(m.id)) continue;
        if (!planIncludesTab(tenantTier, m.id as Tab)) continue;
        if (inheritedVisible[m.id]) delete next[m.id];
        else next[m.id] = true;
      }
      return next;
    });
  };

  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (m: (typeof ADMIN_MODULE_CATALOG)[number]) => {
      if (!q) return true;
      const label = globalTpl?.overrides[m.id]?.label || m.defaultLabel;
      return (
        label.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q)
      );
    };
    const map = new Map<string, typeof ADMIN_MODULE_CATALOG>();
    for (const cat of ADMIN_MODULE_CATEGORIES) map.set(cat, []);
    for (const m of ADMIN_MODULE_CATALOG) {
      if (!matches(m)) continue;
      if (!map.has(m.category)) map.set(m.category, []);
      map.get(m.category)!.push(m);
    }
    return [...map.entries()].filter(([, mods]) => mods.length > 0);
  }, [query, globalTpl]);

  const toggle = (id: string) => {
    const inherited = inheritedVisible[id];
    const effective = draft[id] ?? inherited;
    const next = !effective;
    setDraft((prev) => {
      const copy = { ...prev };
      // Si el nuevo valor coincide con lo heredado, el override sobra.
      if (next === inherited) delete copy[id];
      else copy[id] = next;
      return copy;
    });
  };

  const restoreOne = (id: string) => {
    setDraft((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const save = async (overrides: Record<string, boolean>) => {
    setSaving(true);
    setError("");
    try {
      const body = {
        overrides: Object.fromEntries(
          Object.entries(overrides).map(([id, visible]) => [id, { visible }]),
        ),
      };
      const res = await fetchSuperadmin(
        `/api/superadmin/tenants/${tenant.slug}/module-overrides`,
        {
          method: "PUT",
          headers: csrfHeaders({ "content-type": "application/json" }),
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? `Error HTTP ${res.status}`);
        return;
      }
      onSaved?.(Object.keys(overrides).length);
      onClose();
    } catch {
      setError("Error de red al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title={`Módulos de ${tenant.name}`}
      description={`Plan ${TIER_LABEL[tenantTier]} · forzá módulos ON/OFF solo para esta tienda; el resto hereda la plantilla global.`}
      variant="wide"
    >
      <div className="flex flex-col gap-4 p-4 sm:p-5 overflow-y-auto">
        {/* Barra de estado + acción masiva — Brandon 2026-06-05 */}
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]/60 p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-sm font-bold text-[var(--accent)]">
              <Eye className="h-4 w-4" />
              {effectiveStats.visible}/{effectiveStats.inPlanTotal} visibles
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-raised)] border border-[var(--rule-base)] px-3 py-1 text-sm font-bold text-[var(--text-secondary)]">
              <Layers className="h-4 w-4" />
              {overrideCount === 0
                ? "Hereda plantilla"
                : `${overrideCount} a medida`}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={enableAllForPlan}
              disabled={loading}
              title={`Fuerza visibles TODOS los módulos que el plan ${TIER_LABEL[tenantTier]} incluye`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-extrabold text-white shadow-sm transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              <Zap className="h-3.5 w-3.5" strokeWidth={2.5} />
              Activar todo ({TIER_LABEL[tenantTier]})
            </button>
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">
            El plan {TIER_LABEL[tenantTier]} es el techo: lo que esté fuera del plan no aparece aunque se fuerce. Los cambios pisan la plantilla global solo para esta tienda.
          </p>
          {/* Buscador — hay ~45 módulos, encontrarlos por nombre es más rápido */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar módulo… (ej. inventario, SUNAT, IA)"
              aria-label="Buscar módulo"
              className="h-10 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] pl-10 pr-4 text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 transition-colors"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-red-950/30 px-4 py-2.5 text-sm font-semibold text-[var(--data-error-700)] dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-[var(--text-tertiary)]">
            <Loader2 className="h-5 w-5 animate-spin" /> Cargando módulos…
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.length === 0 && (
              <div className="rounded-xl border-2 border-dashed border-[var(--rule-base)] py-10 text-center">
                <p className="text-sm font-bold text-[var(--text-primary)]">Sin módulos que coincidan</p>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">Probá otro término de búsqueda.</p>
              </div>
            )}
            {grouped.map(([category, mods]) => {
              const catVisible = mods.filter((m) => (draft[m.id] ?? inheritedVisible[m.id]) && isInPlan(m.id)).length;
              return (
              <div key={category}>
                <p className="mb-1.5 flex items-baseline gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  {category}
                  <span className="font-bold tabular-nums normal-case tracking-normal text-[var(--text-tertiary)]/70">
                    {catVisible}/{mods.length} visibles
                  </span>
                </p>
                <div className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
                  {mods.map((m) => {
                    const inherited = inheritedVisible[m.id];
                    const hasOverride = m.id in draft;
                    const effective = draft[m.id] ?? inherited;
                    const isSpec = SPEC_GATED_MODULE_IDS.has(m.id);
                    const inPlan = isSpec || planIncludesTab(tenantTier, m.id as Tab);
                    const minTier = !inPlan ? minTierForTab(m.id as Tab) : null;
                    return (
                      <div
                        key={m.id}
                        className={`flex items-center gap-3 px-3 py-2.5 ${!inPlan ? "opacity-50" : ""}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-bold text-[var(--text-primary)]">
                              {globalTpl?.overrides[m.id]?.label || m.defaultLabel}
                            </span>
                            {isSpec && (
                              <span
                                className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent)]"
                                title="Requiere especialización activa en el tenant"
                              >
                                <Sparkles className="h-3 w-3" /> Spec
                              </span>
                            )}
                            {!inPlan && minTier && (
                              <span
                                className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-tertiary)]"
                                title={`El plan ${TIER_LABEL[tenantTier]} no incluye este módulo`}
                              >
                                <Lock className="h-3 w-3" /> Requiere {TIER_LABEL[minTier]}
                              </span>
                            )}
                            {hasOverride && (
                              <span className="inline-flex items-center rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                                A medida
                              </span>
                            )}
                          </div>
                          <p className="truncate text-xs text-[var(--text-tertiary)]">
                            {hasOverride
                              ? `Forzado ${effective ? "visible" : "oculto"} para esta tienda (plantilla: ${inherited ? "visible" : "oculto"})`
                              : `Heredado de plantilla: ${inherited ? "visible" : "oculto"}`}
                          </p>
                        </div>
                        {hasOverride && (
                          <button
                            type="button"
                            onClick={() => restoreOne(m.id)}
                            title="Volver a heredar de la plantilla"
                            aria-label={`Restaurar ${m.defaultLabel} a la plantilla`}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={effective}
                          aria-label={`${m.defaultLabel}: ${effective ? "visible" : "oculto"}`}
                          disabled={!inPlan}
                          onClick={() => toggle(m.id)}
                          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed ${
                            effective ? "bg-[var(--accent)]" : "bg-[var(--rule-strong)]"
                          }`}
                        >
                          <span
                            aria-hidden
                            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                              effective ? "left-[22px]" : "left-0.5"
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
              );
            })}
          </div>
        )}

        {/* Footer acciones */}
        <div className="sticky bottom-0 -mx-4 sm:-mx-5 -mb-4 sm:-mb-5 flex items-center gap-2 border-t border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 sm:px-5 py-3">
          {overrideCount > 0 && (
            <button
              type="button"
              onClick={() => void save({})}
              disabled={saving || loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-50"
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
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-4 py-2 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-50"
          >
            <XCircle className="h-4 w-4" /> Cancelar
          </button>
          <button
            type="button"
            onClick={() => void save(draft)}
            disabled={saving || loading}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-extrabold text-white shadow-sm transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Guardar
          </button>
        </div>
      </div>
    </AdminModal>
  );
}
