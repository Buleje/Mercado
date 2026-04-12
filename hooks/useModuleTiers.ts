"use client";

import { useState, useCallback, useMemo } from "react";

// ── Tipos ────────────────────────────────────────────────────────────────────

export type ModuleTier = "principal" | "intermedio" | "avanzado";

export const TIER_LABELS: Record<ModuleTier, { label: string; description: string; emoji: string; color: string }> = {
  principal: {
    label: "Principal",
    description: "Lo básico para operar tu bodega día a día",
    emoji: "🟢",
    color: "text-emerald-600 dark:text-emerald-400",
  },
  intermedio: {
    label: "Intermedio",
    description: "Más herramientas para crecer tu negocio",
    emoji: "🟡",
    color: "text-amber-600 dark:text-amber-400",
  },
  avanzado: {
    label: "Avanzado",
    description: "Todo lo disponible — para expertos",
    emoji: "🔵",
    color: "text-blue-600 dark:text-blue-400",
  },
};

// ── Asignación de módulos a tiers ────────────────────────────────────────────
// Principal: lo mínimo para operar la bodega
// Intermedio: herramientas de crecimiento
// Avanzado: todo, incluyendo lo técnico y IA avanzada

export const MODULE_TIER_MAP: Record<string, ModuleTier> = {
  // Principal — operaciones básicas del día a día
  "asistente-ia": "principal",
  "ventas-caja": "principal",
  "inventario": "principal",
  "productos": "principal",
  "compras": "principal",
  "plata": "principal",
  "clientes": "principal",
  "config": "principal",

  // Intermedio — herramientas de crecimiento
  "fiados": "intermedio",
  "prestamos": "intermedio",
  "recetas": "intermedio",
  "turnos": "intermedio",
  "cotizaciones": "intermedio",
  "guias-remision": "intermedio",
  "notas-credito": "intermedio",
  "contratos": "intermedio",
  "declaracion-inventario": "intermedio",

  // Avanzado — herramientas especializadas
  "analytics-bi": "avanzado",
  "analytics-pro": "avanzado",
  "rendimiento": "avanzado",
  "sistema": "avanzado",
  "seguridad": "avanzado",
  "catalogo-tienda": "avanzado",
  "comunicaciones": "avanzado",
  "delivery-partners": "avanzado",
  "devoluciones-calidad": "avanzado",
  "encuestas-soporte": "avanzado",
  "facturacion": "avanzado",
  "fidelizacion": "avanzado",
  "gastos-activos": "avanzado",
  "logistica": "avanzado",
  "marketplace": "avanzado",
  "precios-promos": "avanzado",
  "proveedores": "avanzado",
  "proyecciones": "avanzado",
  "proyectos-tareas": "avanzado",
  "reportes-doc": "avanzado",
  "reposicion": "avanzado",
  "rrhh": "avanzado",
  "tesoreria": "avanzado",
  "ventas-marketing": "avanzado",
  "alertas-autom": "avanzado",
  "ai-command": "avanzado",
  "agenda-utilidades": "avanzado",
  "crm-completo": "avanzado",
  "metas-logros": "avanzado",
  "panel-principal": "avanzado",
  "sugerencias-ia": "avanzado",
};

// ── Tier order for comparison ────────────────────────────────────────────────

const TIER_ORDER: Record<ModuleTier, number> = {
  principal: 0,
  intermedio: 1,
  avanzado: 2,
};

// ── Storage key ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "buleje-module-tier";
const OVERRIDES_KEY = "buleje-module-tier-overrides";

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useModuleTiers() {
  const [tier, setTierState] = useState<ModuleTier>(() => {
    if (typeof window === "undefined") return "avanzado";
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "principal" || saved === "intermedio" || saved === "avanzado") {
        return saved;
      }
    } catch { /* ignore */ }
    return "avanzado";
  });

  const [overrides, setOverridesState] = useState<Record<string, ModuleTier>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem(OVERRIDES_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  // Save to localStorage
  const setTier = useCallback((newTier: ModuleTier) => {
    setTierState(newTier);
    try {
      localStorage.setItem(STORAGE_KEY, newTier);
    } catch { /* ignore */ }
  }, []);

  // Check if a module is visible for the current tier (with overrides)
  const isModuleVisible = useCallback((moduleId: string): boolean => {
    const moduleTier = overrides[moduleId] || MODULE_TIER_MAP[moduleId];
    if (!moduleTier) return true; // Unknown modules are always visible
    return TIER_ORDER[moduleTier] <= TIER_ORDER[tier];
  }, [tier, overrides]);

  // Get tier for a specific module (with overrides)
  const getModuleTier = useCallback((moduleId: string): ModuleTier => {
    return overrides[moduleId] || MODULE_TIER_MAP[moduleId] || "avanzado";
  }, [overrides]);

  // Set custom tier for a specific module
  const setModuleTier = useCallback((moduleId: string, newTier: ModuleTier) => {
    const defaultTier = MODULE_TIER_MAP[moduleId];
    setOverridesState(prev => {
      const next = { ...prev };
      if (newTier === defaultTier) {
        delete next[moduleId]; // Remove override if it matches default
      } else {
        next[moduleId] = newTier;
      }
      try { localStorage.setItem(OVERRIDES_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Reset all customizations
  const resetOverrides = useCallback(() => {
    setOverridesState({});
    try { localStorage.removeItem(OVERRIDES_KEY); } catch { /* ignore */ }
  }, []);

  // Stats
  const stats = useMemo(() => {
    const allModules = Object.keys(MODULE_TIER_MAP);
    const visible = allModules.filter(id => isModuleVisible(id));
    return {
      total: allModules.length,
      visible: visible.length,
      hidden: allModules.length - visible.length,
    };
  }, [isModuleVisible]);

  return {
    tier,
    setTier,
    isModuleVisible,
    getModuleTier,
    setModuleTier,
    resetOverrides,
    overrides,
    stats,
  };
}
