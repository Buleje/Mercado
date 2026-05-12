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
  ChevronDown, ChevronRight, Edit3, Save, X, ExternalLink, Palette,
  AlertCircle, Loader2,
} from "@buleje/design-system/icons";
import {
  ADMIN_MODULE_CATALOG,
  ADMIN_MODULE_CATEGORIES,
  fetchAdminTemplate,
  saveAdminTemplate,
  type AdminPlan,
  type AdminTemplate,
  type AdminModuleEntry,
  type DefaultSidebarStyle,
} from "@/lib/admin-template";

const EMPTY_TPL: AdminTemplate = { overrides: {}, order: [], defaultSidebarStyle: "buleje", version: 2 };

// ─── Catálogo de estilos de sidebar para tenants nuevos ────────────────────
interface SidebarStyleOption {
  id: DefaultSidebarStyle;
  label: string;
  description: string;
  /** Gradient/color preview para el swatch visual. */
  swatch: string;
  /** Color de acento de marca del estilo. */
  accentHex: string;
  /** Indica si requiere configuración custom posterior. */
  requiresCustom?: boolean;
}

const SIDEBAR_STYLE_OPTIONS: SidebarStyleOption[] = [
  {
    id: "buleje",
    label: "Buleje",
    description: "Editorial slate · teal de marca · íconos limpios. Default recomendado.",
    swatch: "linear-gradient(135deg, #0b1f2b 0%, #00B4A6 100%)",
    accentHex: "#00B4A6",
  },
  {
    id: "ejecutivo",
    label: "Ejecutivo",
    description: "Oscuro elegante con ámbar. Compacto y profesional.",
    swatch: "linear-gradient(135deg, #18181b 0%, #F59E0B 100%)",
    accentHex: "#F59E0B",
  },
  {
    id: "sereno",
    label: "Sereno",
    description: "Claro y descansado. Ideal para sesiones largas.",
    swatch: "linear-gradient(135deg, #f0f9ff 0%, #0EA5E9 100%)",
    accentHex: "#0EA5E9",
  },
  {
    id: "vibrante",
    label: "Vibrante",
    description: "Cristal con rosa. Para tiendas de moda y belleza.",
    swatch: "linear-gradient(135deg, #fff1f2 0%, #F43F5E 100%)",
    accentHex: "#F43F5E",
  },
  {
    id: "personalizado",
    label: "Personalizado",
    description: "El cliente lo configura desde su panel admin (Personalizar navegación).",
    swatch: "linear-gradient(135deg, #71717a 0%, #d4d4d8 50%, #71717a 100%)",
    accentHex: "#71717a",
    requiresCustom: true,
  },
];

// Labels visibles — los IDs internos (basico/pro/enterprise/max) mapean a
// los nombres comerciales aprobados por Brandon: Free / Starter / Pro / Business.
const PLAN_LABEL: Record<AdminPlan, string> = {
  basico: "Free · S/ 0",
  pro: "Starter · S/ 89",
  enterprise: "Pro · S/ 179",
  max: "Business · S/ 349",
};

const PLAN_BADGE: Record<AdminPlan, string> = {
  basico: "bg-[var(--surface-sunken)] text-[var(--text-secondary)] border border-[var(--rule-base)]",
  pro: "bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30",
  enterprise: "bg-[var(--data-warning-500)]/10 text-[var(--data-warning-500)] border border-[var(--data-warning-500)]/30",
  max: "bg-[var(--data-success-50,#ecfdf5)] text-[var(--data-success-700,#047857)] border border-[var(--data-success-500)]/30",
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
  // savedTpl es la última versión confirmada por la DB. Comparándolo contra
  // `tpl` decidimos si hay borrador sin guardar.
  const [savedTpl, setSavedTpl] = useState<AdminTemplate | null>(null);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<ChangeToast | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchAdminTemplate().then((remote) => {
      if (!alive) return;
      setTpl(remote);
      setSavedTpl(remote);
    });
    return () => { alive = false; };
  }, []);

  const dirty = useMemo(() => {
    if (!tpl || !savedTpl) return false;
    return JSON.stringify(tpl) !== JSON.stringify(savedTpl);
  }, [tpl, savedTpl]);

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
    if (!tpl) return { visible: 0, total: ADMIN_MODULE_CATALOG.length, byPlan: { basico: 0, pro: 0, enterprise: 0, max: 0 } };
    let visible = 0;
    const byPlan: Record<AdminPlan, number> = { basico: 0, pro: 0, enterprise: 0, max: 0 };
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
      return next;
    });

    // Toast específico según el tipo de cambio (cambio en borrador, no en vivo).
    if (!entry) return;
    const moduleName = entry.defaultLabel;
    if (typeof patch.visible === "boolean") {
      showToast(
        patch.visible ? `${moduleName} marcado como visible` : `${moduleName} marcado como oculto`,
        "Pulsa “Guardar cambios” para que los admins de los negocios lo vean.",
        patch.visible ? "success" : "warning",
      );
    } else if (patch.plan) {
      showToast(
        `${moduleName} ahora requiere plan ${PLAN_LABEL[patch.plan]}`,
        "Pulsa “Guardar cambios” para aplicar al resto de tenants.",
        "info",
      );
    } else if (typeof patch.label === "string") {
      showToast(
        `Etiqueta cambiada`,
        `${moduleName} se mostrará como “${patch.label}” cuando guardes.`,
        "success",
      );
    }
  }, [showToast]);

  const setDefaultSidebarStyle = useCallback((style: DefaultSidebarStyle) => {
    const opt = SIDEBAR_STYLE_OPTIONS.find((s) => s.id === style);
    setTpl((prev) => (prev ? { ...prev, defaultSidebarStyle: style } : prev));
    if (opt) {
      showToast(
        `Estilo "${opt.label}" seleccionado`,
        opt.requiresCustom
          ? "Los nuevos clientes verán el sidebar default. Pulsa “Guardar cambios” para aplicar."
          : "Los nuevos clientes heredarán este diseño. Pulsa “Guardar cambios” para aplicar.",
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
      return next;
    });
    showToast(
      `Preset "${preset.label}" aplicado`,
      `${visibleCount} módulos marcados como visibles · Pulsa “Guardar cambios” para aplicar.`,
      "success",
    );
  }, [showToast]);

  const handleResetAll = useCallback(() => {
    if (!confirm("¿Restaurar la plantilla a los valores de fábrica? Tendrás que pulsar “Guardar cambios” para que se aplique.")) return;
    setTpl(EMPTY_TPL);
    showToast(
      "Plantilla restablecida (borrador)",
      "Todos los módulos vuelven a sus defaults del catálogo. Pulsa “Guardar cambios” para aplicar.",
      "info",
    );
  }, [showToast]);

  const handleSave = useCallback(async () => {
    if (!tpl || saving) return;
    setSaving(true);
    setSaveError(null);
    const result = await saveAdminTemplate(tpl);
    setSaving(false);
    if (!result.ok) {
      const detail = result.issues?.length
        ? `${result.issues.length} validaciones fallaron — revisá la consola.`
        : (result.error ?? "Error desconocido");
      setSaveError(detail);
      showToast("No se pudo guardar", detail, "warning");
      if (result.issues) console.error("admin-template validation issues:", result.issues);
      return;
    }
    const saved = result.template ?? tpl;
    setSavedTpl(saved);
    setTpl(saved);
    setLastSavedAt(new Date());
    showToast(
      "Plantilla guardada",
      "Los admins de los negocios verán los cambios al recargar su panel.",
      "success",
    );
  }, [tpl, saving, showToast]);

  const handleDiscard = useCallback(() => {
    if (!savedTpl) return;
    if (!confirm("¿Descartar los cambios sin guardar?")) return;
    setTpl(savedTpl);
    setSaveError(null);
    showToast("Cambios descartados", "Volviste a la última versión guardada.", "info");
  }, [savedTpl, showToast]);

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
    <div className="space-y-6 pb-28">
      {/* Toast — feedback inmediato + CTA "Ver en panel" */}
      {toast && (
        <div
          key={toast.nonce}
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl border bg-[var(--surface-raised)] shadow-[var(--shadow-xl)] animate-in fade-in slide-in-from-bottom-4 duration-[var(--dur-fast)]"
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
                  <AlertCircle className="h-3 w-3" strokeWidth={2.5} />
                  Borrador · sin guardar
                </span>
                <button
                  type="button"
                  onClick={openAdminPanelInNewTab}
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-[var(--accent-600,var(--accent))] text-white text-xs font-bold hover:bg-[var(--accent)]/90 transition-colors"
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

      {/* Header editorial v2 — banner premium con gradient + stats row integrada
          y pill "en vivo" pulsante para reforzar el cambio real-time. */}
      <header className="relative overflow-hidden rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-28 -right-20 h-72 w-72 rounded-full bg-[var(--accent)]/[0.12] blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 -left-12 h-56 w-56 rounded-full bg-[var(--accent)]/[0.06] blur-3xl"
        />
        <div className="relative flex items-start justify-between gap-5 flex-wrap">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-[var(--accent)] to-[var(--accent-600,var(--accent))] text-white shadow-lg shadow-[var(--accent)]/35 shrink-0">
              <Layers className="h-6 w-6" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2">
                <span aria-hidden className="inline-block h-[3px] w-8 rounded-full bg-[var(--accent)]" />
                Configuración global · Plantilla
              </p>
              <h2 className="text-[clamp(1.5rem,3vw,2.25rem)] font-extrabold tracking-tight text-[var(--text-primary)] leading-[1.05]">
                Plantilla del{" "}
                <span className="italic font-serif text-[var(--accent)]">Panel Admin.</span>
              </h2>
              <p className="text-sm sm:text-base text-[var(--text-secondary)] mt-3 leading-relaxed max-w-2xl">
                Define qué módulos y qué <strong className="text-[var(--text-primary)]">estilo de sidebar</strong> heredan los dueños de tienda al abrir su negocio. Los cambios se propagan a todos los tenants abiertos.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            {dirty ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700,var(--data-warning-500))] px-3 py-1.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider border border-[var(--data-warning-500)]/30">
                <AlertCircle className="h-3 w-3" strokeWidth={2.5} />
                Borrador sin guardar
              </span>
            ) : saving ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] px-3 py-1.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider border border-[var(--accent)]/30">
                <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} />
                Guardando…
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-success-50,var(--accent-soft))] text-[var(--data-success-700,var(--accent))] px-3 py-1.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider">
                <span aria-hidden className="relative inline-flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--data-success-500,var(--accent))] opacity-70 animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--data-success-600,var(--accent))]" />
                </span>
                En producción
              </span>
            )}
            <button
              type="button"
              onClick={openAdminPanelInNewTab}
              className="inline-flex items-center gap-1.5 h-11 px-5 rounded-full bg-[var(--accent-600,var(--accent))] text-white text-sm font-extrabold hover:gap-2 hover:shadow-lg hover:shadow-[var(--accent)]/30 transition-all"
            >
              <ExternalLink className="h-4 w-4" strokeWidth={2.25} />
              Abrir panel admin
            </button>
          </div>
        </div>

        {/* Stats inline en el header — antes vivían como cards separados abajo */}
        <div className="relative mt-6 pt-6 border-t border-[var(--rule-soft)] grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Modulos visibles", value: `${stats.visible}`, total: `/ ${stats.total}`, accent: false },
            { label: "Free (S/ 0)",     value: String(stats.byPlan.basico), accent: false },
            { label: "Starter (S/ 89)", value: String(stats.byPlan.pro), accent: true },
            { label: "Pro (S/ 179)",    value: String(stats.byPlan.enterprise), accent: false, warning: true },
            { label: "Business (S/ 349)", value: String(stats.byPlan.max), accent: false, success: true },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-[var(--surface-canvas)] border border-[var(--rule-soft)] px-4 py-3">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1.5">
                {s.label}
              </p>
              <p className="text-2xl font-extrabold tabular-nums tracking-tight leading-none">
                <span
                  className={
                    s.accent ? "text-[var(--accent)]" :
                    s.warning ? "text-[var(--data-warning-700)]" :
                    (s as { success?: boolean }).success ? "text-[var(--data-success-600,#059669)]" :
                    "text-[var(--text-primary)]"
                  }
                >
                  {s.value}
                </span>
                {s.total && <span className="ml-1 text-base text-[var(--text-tertiary)]">{s.total}</span>}
              </p>
            </div>
          ))}
        </div>
      </header>

      {/* Estilo por defecto del sidebar v2 — cards con preview realista del
          sidebar (header tinted + 4 items con dots) en vez de 3 barritas. */}
      <section className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 sm:p-8">
        <div className="flex items-start gap-3 mb-6">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
            <Palette className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
              Apariencia · Sidebar
            </p>
            <h3 className="text-lg sm:text-xl font-extrabold text-[var(--text-primary)] tracking-tight">
              Estilo por defecto del sidebar
            </h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1.5 leading-relaxed max-w-2xl">
              Cuando un nuevo cliente abre su tienda, su panel admin arranca con este diseño. Cada tenant puede luego personalizarlo desde <em className="not-italic font-semibold text-[var(--text-primary)]">&quot;Personaliza tu navegación&quot;</em>.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          {SIDEBAR_STYLE_OPTIONS.map((opt) => {
            const isActive = (tpl.defaultSidebarStyle ?? "buleje") === opt.id;
            // Detecta si el swatch es claro u oscuro para decidir texto de los mock items.
            const isLight = opt.id === "sereno" || opt.id === "vibrante" || opt.id === "personalizado";
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDefaultSidebarStyle(opt.id)}
                aria-pressed={isActive}
                className={[
                  "group relative text-left rounded-2xl border-2 p-3 transition-all overflow-hidden",
                  isActive
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-md shadow-[var(--accent)]/15"
                    : "border-[var(--rule-soft)] bg-[var(--surface-canvas)] hover:border-[var(--accent)]/60 hover:-translate-y-1 hover:shadow-lg",
                ].join(" ")}
              >
                {/* Badge "Por defecto" cuando está activo */}
                {isActive && (
                  <span className="absolute -top-2 -right-2 z-10 inline-flex items-center gap-1 rounded-full bg-[var(--accent-600,var(--accent))] text-white text-[length:var(--ts-2xs)] font-extrabold px-2 py-0.5 shadow-md uppercase tracking-wider">
                    <CheckCircle2 className="h-3 w-3" strokeWidth={3} />
                    Default
                  </span>
                )}

                {/* Mini-mockup realista del sidebar: header tinted con accent
                    + 4 items con dot indicador + 1 item activo destacado. */}
                <div
                  aria-hidden
                  className="relative h-28 w-full rounded-xl mb-3 ring-1 ring-inset ring-black/5 dark:ring-white/10 overflow-hidden flex"
                  style={{ background: opt.swatch }}
                >
                  {/* Columna sidebar */}
                  <div
                    className="w-[40%] h-full flex flex-col gap-1.5 p-2"
                    style={{
                      background: isLight ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.25)",
                      backdropFilter: "blur(8px)",
                    }}
                  >
                    {/* Logo bar */}
                    <div
                      className="h-2 w-8 rounded-full"
                      style={{ background: isLight ? "rgba(15,23,42,0.85)" : "rgba(255,255,255,0.95)" }}
                    />
                    {/* Items con dots */}
                    {[0, 1, 2, 3].map((i) => {
                      const isActiveItem = i === 1;
                      return (
                        <div key={i} className="flex items-center gap-1">
                          <span
                            className="h-1.5 w-1.5 rounded-full shrink-0"
                            style={{
                              background: isActiveItem ? opt.accentHex : (isLight ? "rgba(15,23,42,0.4)" : "rgba(255,255,255,0.4)"),
                            }}
                          />
                          <span
                            className="h-1 rounded-full"
                            style={{
                              width: i === 0 ? "26px" : i === 1 ? "22px" : i === 2 ? "20px" : "16px",
                              background: isActiveItem
                                ? opt.accentHex
                                : (isLight ? "rgba(15,23,42,0.55)" : "rgba(255,255,255,0.55)"),
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  {/* Área principal — bloque con header y card */}
                  <div className="flex-1 h-full p-2 flex flex-col gap-1.5">
                    <div
                      className="h-2 w-2/3 rounded-full"
                      style={{ background: isLight ? "rgba(15,23,42,0.85)" : "rgba(255,255,255,0.95)" }}
                    />
                    <div
                      className="h-1 w-1/2 rounded-full"
                      style={{ background: isLight ? "rgba(15,23,42,0.4)" : "rgba(255,255,255,0.45)" }}
                    />
                    <div className="mt-auto flex gap-1">
                      <div
                        className="h-6 flex-1 rounded"
                        style={{ background: isLight ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.15)" }}
                      />
                      <div
                        className="h-6 w-6 rounded"
                        style={{ background: opt.accentHex, opacity: 0.85 }}
                      />
                    </div>
                  </div>
                </div>

                {/* Header del card: label + dot accent */}
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 rounded-full ring-2"
                    style={{
                      background: opt.accentHex,
                      // @ts-expect-error: CSS var
                      "--tw-ring-color": "var(--surface-raised)",
                    }}
                  />
                  <p className="text-sm font-extrabold text-[var(--text-primary)] truncate">{opt.label}</p>
                  {opt.requiresCustom && (
                    <span className="inline-flex items-center text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      · custom
                    </span>
                  )}
                </div>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] leading-snug line-clamp-2">
                  {opt.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Presets rápidos v2 — cards con icon pill + counter de módulos
          calculados en runtime para feedback inmediato del impacto. */}
      <section>
        <div className="flex items-baseline justify-between gap-3 mb-4">
          <div>
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
              Atajos · deshabilitados
            </p>
            <h3 className="text-lg sm:text-xl font-extrabold text-[var(--text-tertiary)] tracking-tight">
              Presets rápidos
            </h3>
          </div>
          <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] hidden sm:block max-w-md text-right">
            Brandon mayo 2026 v2 — ahora los módulos se habilitan automáticamente según el plan que tenga cada negocio. Sin override manual.
          </p>
        </div>

        {/* Banner explicativo del cambio (reemplaza la accion de los presets) */}
        <div className="mb-4 rounded-xl border-2 border-dashed border-[var(--accent)]/30 bg-[var(--accent-soft)]/40 px-4 py-3 flex items-start gap-3">
          <span
            aria-hidden
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white"
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-[var(--text-primary)] leading-tight">
              Sin atajos manuales · habilitado por plan del negocio
            </p>
            <p className="mt-1 text-[length:var(--ts-xs)] text-[var(--text-secondary)] leading-relaxed">
              Cuando un cliente elige un plan en <code className="font-mono text-[var(--accent)]">/abrir-tienda</code>, los módulos correspondientes se activan automáticamente.
              Free (S/0) ve lo básico · Starter (S/89) suma inventario y fiados · Pro (S/179) suma SUNAT y marketplace · Business (S/349) desbloquea todo.
              Los presets de abajo quedaron deshabilitados para evitar overrides accidentales.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {PRESET_MODES.map((preset) => {
            const moduleCount = ADMIN_MODULE_CATALOG.filter(preset.apply).length;
            return (
              <button
                key={preset.id}
                type="button"
                disabled
                aria-disabled="true"
                title="Atajos deshabilitados — los modulos se habilitan por plan del negocio"
                className="group text-left rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]/50 p-5 cursor-not-allowed opacity-55 grayscale-[0.4]"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <span
                    aria-hidden
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-canvas)] text-[var(--text-tertiary)]"
                  >
                    {preset.icon}
                  </span>
                  <span className="inline-flex items-baseline gap-1 rounded-full bg-[var(--surface-canvas)] border border-[var(--rule-soft)] px-2.5 py-1">
                    <span className="text-base font-extrabold tabular-nums text-[var(--text-tertiary)] leading-none">
                      {moduleCount}
                    </span>
                    <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
                      módulos
                    </span>
                  </span>
                </div>
                <p className="text-base font-extrabold tracking-tight text-[var(--text-tertiary)] leading-tight line-through decoration-1">
                  {preset.label}
                </p>
                <p className="mt-1.5 text-sm text-[var(--text-tertiary)] leading-relaxed">
                  {preset.description}
                </p>
                <span className="mt-3 inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                  <Lock className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                  Deshabilitado
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Lista de módulos por categoría v2 — headers más fuertes, progress bar
          mini por categoría, plan badges con icon, hover destacado por row. */}
      <section>
        <div className="flex items-end justify-between gap-3 mb-4">
          <div>
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
              Catálogo
            </p>
            <h3 className="text-lg sm:text-xl font-extrabold text-[var(--text-primary)] tracking-tight">
              Módulos del panel
            </h3>
          </div>
          <button
            type="button"
            onClick={handleResetAll}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:border-[var(--data-error-500)]/40 transition-all"
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
            const visiblePct = (visibleInCat / items.length) * 100;

            return (
              <div key={cat} className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-3.5 bg-[var(--surface-sunken)]/60 border-b-2 border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      aria-hidden
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-raised)] border border-[var(--rule-soft)] text-[var(--text-secondary)] shrink-0"
                    >
                      {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </span>
                    <span className="text-sm sm:text-base font-extrabold text-[var(--text-primary)] tracking-tight">{cat}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {/* Progress bar mini */}
                    <div className="hidden sm:block w-24 h-1.5 rounded-full bg-[var(--rule-base)] overflow-hidden">
                      <span
                        className="block h-full rounded-full bg-[var(--accent)] transition-[width]"
                        style={{ width: `${visiblePct}%` }}
                      />
                    </div>
                    <span className="inline-flex items-baseline gap-1 text-[length:var(--ts-2xs)] font-extrabold tabular-nums">
                      <span className="text-[var(--accent)]">{visibleInCat}</span>
                      <span className="text-[var(--text-tertiary)]">/ {items.length}</span>
                      <span className="text-[var(--text-tertiary)] uppercase tracking-wider ml-1">visibles</span>
                    </span>
                  </div>
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
                        <li
                          key={m.id}
                          className={`flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-5 py-3.5 transition-colors hover:bg-[var(--surface-sunken)]/30 ${
                            !isVisible ? "opacity-65" : ""
                          }`}
                        >
                          {/* Visibilidad toggle — switch real más visible */}
                          <button
                            type="button"
                            onClick={() => updateOverride(m.id, { visible: !isVisible })}
                            role="switch"
                            aria-checked={isVisible}
                            aria-label={isVisible ? `Ocultar ${label}` : `Mostrar ${label}`}
                            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 transition-colors ${
                              isVisible
                                ? "bg-[var(--accent-600,var(--accent))] border-[var(--accent-600,var(--accent))]"
                                : "bg-[var(--surface-sunken)] border-[var(--rule-base)]"
                            }`}
                          >
                            <span
                              className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-md transition-transform ${
                                isVisible ? "translate-x-5" : "translate-x-0.5"
                              }`}
                            >
                              {isVisible ? (
                                <Eye className="h-2.5 w-2.5 text-[var(--accent)]" strokeWidth={3} />
                              ) : (
                                <EyeOff className="h-2.5 w-2.5 text-[var(--text-tertiary)]" strokeWidth={3} />
                              )}
                            </span>
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
                                    className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-[var(--data-success-500)] text-white hover:opacity-90"
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

                          {/* Plan selector — 4 tiers alineados con pricing real */}
                          <div className="flex items-center gap-2 shrink-0 flex-wrap">
                            {(["basico", "pro", "enterprise", "max"] as AdminPlan[]).map((p) => (
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
                                {p === "max" && <Crown className="h-3 w-3" />}
                                {p === "enterprise" && <Sparkles className="h-3 w-3" />}
                                {p === "pro" && <Sparkles className="h-3 w-3 opacity-60" />}
                                {p === "basico" && <Lock className="h-3 w-3 opacity-40" />}
                                {PLAN_LABEL[p]}
                              </button>
                            ))}
                          </div>

                          {/* Indicador de override */}
                          {isOverridden && !isEditing && (
                            <button
                              type="button"
                              onClick={() => updateOverride(m.id, { visible: m.defaultVisible, plan: m.defaultPlan, label: m.defaultLabel })}
                              className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors shrink-0"
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

      {/* Sticky save bar — barra inferior fija con estado del borrador.
          Aparece SIEMPRE al pie para que Brandon nunca pierda de vista el
          botón "Guardar cambios". Cuando no hay cambios queda en modo
          informativo ("En producción · sin cambios pendientes"). */}
      <div className="fixed bottom-0 inset-x-0 z-40 border-t-2 border-[var(--rule-base)] bg-[var(--surface-raised)]/95 backdrop-blur-md shadow-[var(--shadow-lg)]">
        <div className="max-w-(--breakpoint-2xl) mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {saveError ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-[var(--data-error-500)]/10 text-[var(--data-error-700,var(--data-error-500))] px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider border border-[var(--data-error-500)]/30">
                <AlertCircle className="h-3.5 w-3.5" strokeWidth={2.5} />
                Error: {saveError}
              </span>
            ) : dirty ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700,var(--data-warning-500))] px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider border border-[var(--data-warning-500)]/30">
                <AlertCircle className="h-3.5 w-3.5" strokeWidth={2.5} />
                Tenés cambios sin guardar
              </span>
            ) : saving ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider border border-[var(--accent)]/30">
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />
                Guardando…
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-[var(--data-success-50,var(--accent-soft))] text-[var(--data-success-700,var(--accent))] px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider">
                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                En producción · sin cambios pendientes
              </span>
            )}
            {lastSavedAt && (
              <span className="hidden sm:inline text-xs text-[var(--text-tertiary)]">
                Último guardado: {lastSavedAt.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDiscard}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-1.5 h-11 px-4 rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--rule-strong,var(--rule-base))] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCcw className="h-4 w-4" />
              Descartar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-1.5 h-11 px-5 rounded-full bg-[var(--accent-600,var(--accent))] text-white text-sm font-extrabold shadow-md shadow-[var(--accent)]/30 hover:shadow-lg hover:shadow-[var(--accent)]/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : <Save className="h-4 w-4" strokeWidth={2.5} />}
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// StatCard removed — los stats ahora viven integrados en el header v2.
