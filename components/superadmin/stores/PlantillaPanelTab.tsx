"use client";

/**
 * PlantillaPanelTab — Superadmin: configurar la plantilla base del Panel Admin.
 *
 * Permite al superadmin definir, para cada módulo del admin del negocio:
 *   - Visibilidad (mostrar/ocultar al primer load)
 *   - Plan mínimo requerido (free / pro / enterprise)
 *   - Etiqueta custom (sobreescribe el nombre default)
 *
 * Storage: localStorage vía `lib/admin-template.ts`. Cambios se propagan por
 * evento custom `buleje:admin-template-changed` para que el panel admin
 * re-lea la config sin refrescar.
 *
 * UX inspirada en `NavegacionTab` (mismo patrón de toggle + counters).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Eye, EyeOff, Sparkles, RotateCcw, CheckCircle2, Crown, Lock, Layers,
  ChevronDown, ChevronRight, Edit3, Save, X, ExternalLink, Zap,
} from "@buleje/design-system/icons";
import {
  ADMIN_MODULE_CATALOG,
  ADMIN_MODULE_CATEGORIES,
  readAdminTemplate,
  writeAdminTemplate,
  resetAdminTemplate,
  type AdminPlan,
  type AdminTemplate,
  type AdminModuleEntry,
} from "@/lib/admin-template";

const PLAN_LABEL: Record<AdminPlan, string> = {
  free: "Gratis",
  pro: "Pro",
  enterprise: "Enterprise",
};

const PLAN_BADGE: Record<AdminPlan, string> = {
  free: "bg-[var(--surface-sunken)] text-[var(--text-secondary)] border border-[var(--rule-base)]",
  pro: "bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30",
  enterprise: "bg-[var(--data-warning)]/10 text-[var(--data-warning)] border border-[var(--data-warning)]/30",
};

interface PresetMode {
  id: "minimo" | "completo" | "enterprise";
  label: string;
  description: string;
  icon: React.ReactNode;
  /** Visibilidad efectiva por módulo. */
  apply: (entry: AdminModuleEntry) => boolean;
}

const PRESET_MODES: PresetMode[] = [
  {
    id: "minimo",
    label: "Mínimo (bodega vecino)",
    description: "Solo lo esencial: Ventas, Pedidos, Inventario, Productos, Mi Plata, Clientes, Config.",
    icon: <Layers className="h-4 w-4" />,
    apply: (e) => ["asistente-ia", "ventas-caja", "pedidos", "inventario", "productos", "plata", "clientes", "config", "plan"].includes(e.id),
  },
  {
    id: "completo",
    label: "Completo (default)",
    description: "Todo lo que viene por defecto en el catálogo (cada módulo decide su propio default).",
    icon: <Sparkles className="h-4 w-4" />,
    apply: (e) => e.defaultVisible,
  },
  {
    id: "enterprise",
    label: "Enterprise (todo)",
    description: "Activa absolutamente todos los módulos disponibles, incluyendo análisis avanzado y sistema.",
    icon: <Crown className="h-4 w-4" />,
    apply: () => true,
  },
];

interface ChangeToast {
  /** Texto principal — qué se cambió. */
  title: string;
  /** Descripción opcional — efecto del cambio. */
  detail?: string;
  /** Variante visual. */
  tone: "success" | "info" | "warning";
  /** ID interno para forzar re-trigger de animación con setState. */
  nonce: number;
}

export function PlantillaPanelTab() {
  const [tpl, setTpl] = useState<AdminTemplate | null>(null);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<ChangeToast | null>(null);

  useEffect(() => {
    setTpl(readAdminTemplate());
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((title: string, detail?: string, tone: ChangeToast["tone"] = "success") => {
    setToast({ title, detail, tone, nonce: Date.now() });
  }, []);

  const openAdminPanelInNewTab = useCallback(() => {
    window.open("/admin", "_blank", "noopener,noreferrer");
  }, []);

  const stats = useMemo(() => {
    if (!tpl) return { visible: 0, total: ADMIN_MODULE_CATALOG.length, byPlan: { free: 0, pro: 0, enterprise: 0 } };
    let visible = 0;
    const byPlan: Record<AdminPlan, number> = { free: 0, pro: 0, enterprise: 0 };
    for (const m of ADMIN_MODULE_CATALOG) {
      const ov = tpl.overrides[m.id] ?? {};
      const isVis = ov.visible ?? m.defaultVisible;
      if (isVis) visible++;
      byPlan[ov.plan ?? m.defaultPlan]++;
    }
    return { visible, total: ADMIN_MODULE_CATALOG.length, byPlan };
  }, [tpl]);

  const grouped = useMemo(() => {
    const map = new Map<string, AdminModuleEntry[]>();
    for (const cat of ADMIN_MODULE_CATEGORIES) map.set(cat, []);
    for (const m of ADMIN_MODULE_CATALOG) {
      if (!map.has(m.category)) map.set(m.category, []);
      map.get(m.category)!.push(m);
    }
    return map;
  }, []);

  const updateOverride = useCallback((id: string, patch: { visible?: boolean; plan?: AdminPlan; label?: string }) => {
    const entry = ADMIN_MODULE_CATALOG.find((m) => m.id === id);
    setTpl((prev) => {
      if (!prev) return prev;
      const current = prev.overrides[id] ?? {};
      const nextOv = { ...current, ...patch };
      // Limpia las claves que coincidan con el default — mantiene el override mínimo.
      if (entry) {
        if (nextOv.visible === entry.defaultVisible) delete nextOv.visible;
        if (nextOv.plan === entry.defaultPlan) delete nextOv.plan;
        if (nextOv.label === entry.defaultLabel || nextOv.label === "") delete nextOv.label;
      }
      const nextOverrides = { ...prev.overrides };
      if (Object.keys(nextOv).length === 0) delete nextOverrides[id];
      else nextOverrides[id] = nextOv;
      const next: AdminTemplate = { ...prev, overrides: nextOverrides };
      writeAdminTemplate(next);
      return next;
    });

    // Toast específico según el tipo de cambio
    if (!entry) return;
    const moduleName = entry.defaultLabel;
    if (typeof patch.visible === "boolean") {
      showToast(
        patch.visible ? `${moduleName} ahora es visible` : `${moduleName} ahora está oculto`,
        patch.visible
          ? "Se mostrará en el sidebar de todos los tenants nuevos."
          : "Ya no aparece en el sidebar del panel admin.",
        patch.visible ? "success" : "warning",
      );
    } else if (patch.plan) {
      showToast(
        `${moduleName} ahora requiere plan ${PLAN_LABEL[patch.plan]}`,
        `Los tenants con plan inferior dejarán de verlo.`,
        "info",
      );
    } else if (typeof patch.label === "string") {
      showToast(
        `Etiqueta cambiada`,
        `${moduleName} ahora se muestra como “${patch.label}” en el panel.`,
        "success",
      );
    }
  }, [showToast]);

  const applyPreset = useCallback((preset: PresetMode) => {
    let visibleCount = 0;
    setTpl((prev) => {
      if (!prev) return prev;
      const overrides: AdminTemplate["overrides"] = {};
      for (const m of ADMIN_MODULE_CATALOG) {
        const wantsVisible = preset.apply(m);
        if (wantsVisible) visibleCount++;
        const current = prev.overrides[m.id] ?? {};
        const nextOv = { ...current };
        if (wantsVisible !== m.defaultVisible) nextOv.visible = wantsVisible;
        else delete nextOv.visible;
        if (Object.keys(nextOv).length > 0) overrides[m.id] = nextOv;
      }
      const next: AdminTemplate = { ...prev, overrides };
      writeAdminTemplate(next);
      return next;
    });
    showToast(
      `Preset "${preset.label}" aplicado`,
      `${visibleCount} módulos visibles · Cambios en vivo en todos los paneles admin.`,
      "success",
    );
  }, [showToast]);

  const handleResetAll = useCallback(() => {
    if (!confirm("¿Restaurar la plantilla a los valores de fábrica? Se perderán todos los cambios.")) return;
    resetAdminTemplate();
    setTpl(readAdminTemplate());
    showToast(
      "Plantilla restablecida",
      "Todos los módulos vuelven a su configuración default del catálogo.",
      "info",
    );
  }, [showToast]);

  const startEditLabel = (id: string, currentLabel: string) => {
    setEditingLabel(id);
    setLabelDraft(currentLabel);
  };

  const commitEditLabel = () => {
    if (!editingLabel) return;
    updateOverride(editingLabel, { label: labelDraft.trim() });
    setEditingLabel(null);
    setLabelDraft("");
  };

  const toggleCategory = (cat: string) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  if (!tpl) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-[var(--text-tertiary)]">
        Cargando plantilla…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast — feedback inmediato + CTA "Ver en panel" */}
      {toast && (
        <div
          key={toast.nonce}
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl border bg-[var(--surface-raised)] shadow-[var(--shadow-xl)] animate-in fade-in slide-in-from-bottom-4 duration-200"
          style={{
            borderColor:
              toast.tone === "success" ? "var(--data-success)" :
              toast.tone === "warning" ? "var(--data-warning)" :
              "var(--accent)",
          }}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3 p-4">
            <div
              className="inline-flex items-center justify-center h-9 w-9 rounded-xl shrink-0"
              style={{
                backgroundColor:
                  toast.tone === "success" ? "rgb(from var(--data-success) r g b / 0.12)" :
                  toast.tone === "warning" ? "rgb(from var(--data-warning) r g b / 0.12)" :
                  "rgb(from var(--accent) r g b / 0.12)",
                color:
                  toast.tone === "success" ? "var(--data-success)" :
                  toast.tone === "warning" ? "var(--data-warning)" :
                  "var(--accent)",
              }}
            >
              {toast.tone === "warning" ? (
                <EyeOff className="h-4 w-4" strokeWidth={2.25} />
              ) : (
                <CheckCircle2 className="h-4 w-4" strokeWidth={2.25} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)]">
                {toast.title}
              </p>
              {toast.detail && (
                <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                  {toast.detail}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  <Zap className="h-3 w-3" strokeWidth={2.5} />
                  Aplicado en vivo
                </span>
                <button
                  type="button"
                  onClick={openAdminPanelInNewTab}
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-[var(--accent)] text-white text-xs font-bold hover:bg-[var(--accent)]/90 transition-colors"
                >
                  Ver en panel
                  <ExternalLink className="h-3 w-3" strokeWidth={2.5} />
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors shrink-0"
              aria-label="Cerrar notificación"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Header explicativo + CTA permanente */}
      <header className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Layers className="h-6 w-6 text-[var(--accent)] shrink-0 mt-0.5" strokeWidth={1.75} />
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold text-[var(--text-primary)]">
                Plantilla del Panel Admin
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                Define qué módulos ven los dueños de tienda al cargar su panel admin por primera vez.
                Cambios <strong className="text-[var(--text-primary)]">se aplican en vivo</strong> a todos los tenants abiertos.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openAdminPanelInNewTab}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent)]/90 transition-colors shrink-0"
          >
            <ExternalLink className="h-4 w-4" strokeWidth={2} />
            Abrir panel admin
          </button>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Módulos visibles" value={`${stats.visible} / ${stats.total}`} intent="neutral" />
        <StatCard label="En plan Gratis" value={String(stats.byPlan.free)} intent="neutral" />
        <StatCard label="En plan Pro" value={String(stats.byPlan.pro)} intent="accent" />
        <StatCard label="En Enterprise" value={String(stats.byPlan.enterprise)} intent="warning" />
      </div>

      {/* Presets rápidos */}
      <section>
        <h3 className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
          Presets rápidos
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PRESET_MODES.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset)}
              className="text-left rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/30 transition-colors"
            >
              <div className="flex items-center gap-2 text-[var(--accent)]">
                {preset.icon}
                <span className="text-sm font-bold text-[var(--text-primary)]">{preset.label}</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed">
                {preset.description}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* Lista de módulos por categoría */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Módulos del panel
          </h3>
          <button
            type="button"
            onClick={handleResetAll}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--data-error)] transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restaurar a fábrica
          </button>
        </div>

        <div className="space-y-3">
          {ADMIN_MODULE_CATEGORIES.map((cat) => {
            const items = grouped.get(cat) ?? [];
            if (items.length === 0) return null;
            const isCollapsed = collapsedCats.has(cat);
            const visibleInCat = items.filter((m) => {
              const ov = tpl.overrides[m.id] ?? {};
              return ov.visible ?? m.defaultVisible;
            }).length;

            return (
              <div key={cat} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-[var(--surface-sunken)]/40 border-b border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)]" /> : <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)]" />}
                    <span className="text-sm font-bold text-[var(--text-primary)]">{cat}</span>
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-[var(--text-tertiary)]">
                    {visibleInCat} / {items.length} visibles
                  </span>
                </button>

                {!isCollapsed && (
                  <ul className="divide-y divide-[var(--rule-soft)]">
                    {items.map((m) => {
                      const ov = tpl.overrides[m.id] ?? {};
                      const isVisible = ov.visible ?? m.defaultVisible;
                      const plan: AdminPlan = ov.plan ?? m.defaultPlan;
                      const label = ov.label ?? m.defaultLabel;
                      const isOverridden = Object.keys(ov).length > 0;
                      const isEditing = editingLabel === m.id;

                      return (
                        <li key={m.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3">
                          {/* Visibilidad toggle */}
                          <button
                            type="button"
                            onClick={() => updateOverride(m.id, { visible: !isVisible })}
                            className={`inline-flex items-center justify-center h-9 w-9 rounded-lg shrink-0 transition-colors ${
                              isVisible
                                ? "bg-[var(--data-success)]/10 text-[var(--data-success)] border border-[var(--data-success)]/30"
                                : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] border border-[var(--rule-base)]"
                            }`}
                            aria-label={isVisible ? `Ocultar ${label}` : `Mostrar ${label}`}
                          >
                            {isVisible ? <Eye className="h-4 w-4" strokeWidth={2} /> : <EyeOff className="h-4 w-4" strokeWidth={2} />}
                          </button>

                          {/* Label + descripción */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {isEditing ? (
                                <div className="flex items-center gap-1 flex-1 min-w-0">
                                  <input
                                    type="text"
                                    value={labelDraft}
                                    onChange={(e) => setLabelDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") commitEditLabel();
                                      if (e.key === "Escape") { setEditingLabel(null); setLabelDraft(""); }
                                    }}
                                    autoFocus
                                    className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                                  />
                                  <button
                                    type="button"
                                    onClick={commitEditLabel}
                                    className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-[var(--data-success)] text-white hover:opacity-90"
                                    aria-label="Guardar etiqueta"
                                  >
                                    <Save className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setEditingLabel(null); setLabelDraft(""); }}
                                    className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
                                    aria-label="Cancelar edición"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <span className="text-sm font-bold text-[var(--text-primary)]">{label}</span>
                                  {ov.label && (
                                    <span className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wider text-[var(--accent)]">
                                      custom
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => startEditLabel(m.id, label)}
                                    className="text-[var(--text-tertiary)] hover:text-[var(--accent)]"
                                    aria-label={`Renombrar ${label}`}
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </button>
                                  <span className="font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                                    {m.id}
                                  </span>
                                </>
                              )}
                            </div>
                            <p className="text-xs text-[var(--text-tertiary)] mt-1 leading-relaxed">
                              {m.description}
                            </p>
                          </div>

                          {/* Plan selector */}
                          <div className="flex items-center gap-2 shrink-0">
                            {(["free", "pro", "enterprise"] as AdminPlan[]).map((p) => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => updateOverride(m.id, { plan: p })}
                                className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${
                                  plan === p
                                    ? PLAN_BADGE[p]
                                    : "bg-transparent text-[var(--text-tertiary)] border border-transparent hover:border-[var(--rule-base)]"
                                }`}
                              >
                                {p === "enterprise" && <Crown className="h-3 w-3" />}
                                {p === "pro" && <Sparkles className="h-3 w-3" />}
                                {p === "free" && <Lock className="h-3 w-3 opacity-40" />}
                                {PLAN_LABEL[p]}
                              </button>
                            ))}
                          </div>

                          {/* Indicador de override */}
                          {isOverridden && !isEditing && (
                            <button
                              type="button"
                              onClick={() => updateOverride(m.id, { visible: m.defaultVisible, plan: m.defaultPlan, label: m.defaultLabel })}
                              className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] hover:text-[var(--data-error)] transition-colors shrink-0"
                              title="Restaurar este módulo al default"
                            >
                              <RotateCcw className="h-3 w-3" />
                              reset
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  intent: "neutral" | "warning" | "accent";
}

function StatCard({ label, value, intent }: StatCardProps) {
  const valueColor =
    intent === "warning" ? "text-[var(--data-warning)]" :
    intent === "accent" ? "text-[var(--accent)]" :
    "text-[var(--text-primary)]";
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
        {label}
      </p>
      <p className={`text-xl font-extrabold tabular-nums ${valueColor}`}>{value}</p>
    </div>
  );
}
