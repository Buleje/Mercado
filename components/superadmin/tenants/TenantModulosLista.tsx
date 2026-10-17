"use client";

import { Loader2, RotateCcw, Lock, Sparkles } from "@buleje/design-system/icons";
import type { Tab } from "@/app/admin/_lib/tabs.types";
import { planIncludesTab, minTierForTab, PLANS } from "@/lib/billing/plan-tiers";
import { SPEC_GATED_MODULE_IDS } from "@/hooks/use-enabled-specs";
import type { TenantModulos } from "@/components/superadmin/tenants/useTenantModulos";

/** Catálogo de módulos por categoría: interruptor, herencia de la plantilla y techo del plan. */
export function TenantModulosLista({ modulos }: { modulos: TenantModulos }) {
  const { globalTpl, draft, loading, tenantTier, inheritedVisible, isInPlan, grouped, toggle, restoreOne } = modulos;
  return loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-[var(--text-tertiary)]">
            <Loader2 className="h-5 w-5 animate-spin" /> Cargando módulos…
          </div>
  ) : (
          <div className="space-y-4">
            {grouped.length === 0 && (
              <div className="rounded-xl border border-dashed border-[var(--rule-base)] py-10 text-center">
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  Sin módulos que coincidan
                </p>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                  Prueba otro término de búsqueda.
                </p>
              </div>
            )}
            {grouped.map(([category, mods]) => {
              const catVisible = mods.filter(
                (m) => (draft[m.id] ?? inheritedVisible[m.id]) && isInPlan(m.id),
              ).length;
              return (
                <div key={category}>
                  <p className="mb-1.5 flex items-baseline gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
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
                                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-[var(--accent)]"
                                  title="Requiere especialización activa en el tenant"
                                >
                                  <Sparkles className="h-3 w-3" /> Spec
                                </span>
                              )}
                              {!inPlan && minTier && (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-1.5 py-0.5 text-xs font-bold text-[var(--text-tertiary)]"
                                  title={`El plan ${PLANS[tenantTier].label} no incluye este módulo`}
                                >
                                  <Lock className="h-3 w-3" /> Requiere {PLANS[minTier].label}
                                </span>
                              )}
                              {hasOverride && (
                                <span className="inline-flex items-center rounded-full bg-teal-500/15 px-1.5 py-0.5 text-xs font-bold text-teal-700 dark:text-teal-300">
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
                              className={`absolute top-0.5 h-5 w-5 rounded-full bg-[var(--surface-raised)] shadow transition-all ${
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
  );
}
