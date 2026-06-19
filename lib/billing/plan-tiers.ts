/**
 * lib/billing/plan-tiers.ts
 *
 * Sistema de tiers del plan vendor de Buleje. FUENTE ÚNICA DE VERDAD —
 * /abrir-tienda, superadmin y el panel del negocio leen de acá.
 *
 * 4 planes (Brandon, sprint mayo 2026 v2 — orientado a calidad +
 * mejores entradas de precios):
 *
 *   - basico     · "Free"     · S/ 0/mes    · siempre gratis, limites estrictos (funnel)
 *   - pro        · "Starter"  · S/ 89/mes   · 1er mes gratis · bodega chica con flujo diario
 *   - enterprise · "Pro"      · S/ 179/mes  · 1er mes 50% off · sweet spot, badge "Mas elegido"
 *   - max        · "Business" · S/ 349/mes  · 1er mes 50% off · multi-sucursal premium
 *
 * Anual: 20-25% descuento sobre 12 meses.
 *
 * IDs internos (`basico`/`pro`/`enterprise`/`max`) MANTENIDOS para no
 * romper ~100 archivos del repo. Solo cambian:
 *   - Labels visibles ("Estandar" → "Free", "Pro" → "Starter", etc.)
 *   - Precios mensuales
 *   - Limites + features
 *   - Tagline + highlights
 *
 * El plan se persiste en localStorage (key `buleje:vendor-plan-tier`).
 * En producción debería leerse del campo `tenant.plan` de la DB y
 * sincronizarse con Stripe — para esta primera iteración el frontend
 * persiste local y dispara evento `buleje-plan-change` para que el
 * sidebar y otras vistas reaccionen sin recargar la página.
 */

import type { Tab } from "@/app/admin/_lib/tabs.types";

export type PlanTier = "basico" | "pro" | "enterprise" | "max";

export const PLAN_ORDER: readonly PlanTier[] = ["basico", "pro", "enterprise", "max"] as const;

export interface PlanDefinition {
  id: PlanTier;
  label: string;
  /** Tagline corto para el selector. */
  tagline: string;
  /** Precio mensual en PEN como número (sin formato). */
  monthlyPrice: number;
  /** Precio formateado para mostrar (ej: "S/ 39"). */
  price: string;
  /** Frecuencia legible (ej: "/mes", "/año"). */
  period: string;
  /** Descuento del primer mes en porcentaje (0..100). 100 = primer mes gratis. */
  firstMonthDiscount: number;
  /** Descuento sobre el plan anual (vs 12× mensual). */
  annualDiscount: number;
  /** Token de color del DS para el accent. */
  accent: "muted" | "primary" | "indigo" | "amber";
  /** Tabs desbloqueados en este plan. Cualquier tab fuera de aquí
   *  se renderea con el badge `Locked` que invita a upgrade. */
  unlockedTabs: ReadonlySet<Tab>;
  /** Features booleanas (gráficos avanzados, IA, etc.) consultables
   *  desde cualquier componente vía `hasFeature(plan, feature)`. */
  features: ReadonlySet<PlanFeature>;
  /** Limits cuantitativos (productos, sucursales, etc.). */
  limits: PlanLimits;
  /** Stripe Price ID para checkout. `null` mientras se regenera. */
  stripePriceId: string | null;
  /** Beneficios destacados (5 max) para mostrar en la card de pricing. */
  highlights: readonly string[];
  /** True si es el plan recomendado (badge "Más elegido"). */
  recommended?: boolean;
}

/** Stripe Price IDs generados por scripts/setup-stripe-plans.mjs (modo TEST).
 *
 *  Regenerados mayo 2026 v2 con precios nuevos:
 *    - Starter (tier "pro"):       S/ 89/mes
 *    - Pro (tier "enterprise"):    S/ 179/mes
 *    - Business (tier "max"):      S/ 349/mes
 *
 *  Para producción: regenerar con STRIPE_SECRET_KEY de live mode y
 *  reemplazar acá (mismos product names → reuso de productos en Stripe).
 *  Free (tier "basico") no necesita price_id porque es gratis. */
export const STRIPE_PRICE_IDS = {
  basico: null,
  pro: "price_1TW0fm8wsdxsjwKCViqixJfF",
  enterprise: "price_1TW0fn8wsdxsjwKCYyZAwdI7",
  max: "price_1TW0fp8wsdxsjwKCE5q7VHL9",
} as const;

export type PlanFeature =
  | "advanced-analytics"
  | "forecasting"
  | "ai-command"
  | "ai-suggestions"
  | "multi-branch"
  | "api-access"
  | "white-label"
  | "live-streaming"
  | "premium-support"
  | "sunat-billing"
  | "gift-cards"
  | "socio-program"
  | "subscriptions";

export interface PlanLimits {
  /** Máximo de productos. `null` = ilimitado. */
  maxProducts: number | null;
  /** Máximo de sucursales. */
  maxBranches: number;
  /** Repartidores propios. */
  maxRiders: number;
  /** Usuarios admin del panel. */
  maxAdminUsers: number;
}

// ── Definición de planes ──────────────────────────────────────────────────

export const PLAN_BASICO: PlanDefinition = {
  id: "basico",
  label: "Free",
  tagline: "El que recién arranca y quiere probar sin arriesgar un sol",
  monthlyPrice: 0,
  price: "S/ 0",
  period: "/mes",
  firstMonthDiscount: 0, // ya es gratis, no necesita descuento
  annualDiscount: 0,     // anual no aplica a tier gratis
  accent: "muted",
  highlights: [
    "Tienda online básica · sin tarjeta",
    "Hasta 20 productos cargados",
    "Hasta 30 pedidos al mes",
    "Pedidos por WhatsApp + POS básico",
    "Sin compromiso · upgrade cuando quieras",
  ],
  unlockedTabs: new Set<Tab>([
    // Inicio (limitado: solo dashboard + asistente)
    "vendor-dashboard",
    "asistente-ia",
    // Ventas (POS + pedidos basicos)
    "ventas-caja",
    "pedidos",
    // Productos (limitado a 20)
    "productos",
    // Mi tienda (customizer si)
    "store-customizer",
    "pagina-inicio",
    // Finanzas — adelantos a personas por servicios (módulo nuevo ADR-117).
    // En basico para que sea visible/usable desde el free; re-gatear a plan
    // pago si la estrategia comercial lo requiere.
    "adelantos",
    // Activos & Maquinaria — alquiler de equipos (forestal: cargador, oruga,
    // camión). En basico para que sea visible/usable desde el free.
    "activos",
    // Config (siempre)
    "config",
    "plan",
    "mi-perfil",
  ]),
  features: new Set<PlanFeature>([]),
  limits: {
    maxProducts: 20,
    maxBranches: 1,
    maxRiders: 0,
    maxAdminUsers: 1,
  },
  stripePriceId: STRIPE_PRICE_IDS.basico,
};

export const PLAN_PRO: PlanDefinition = {
  id: "pro",
  label: "Starter",
  tagline: "La bodega que ya vende a diario y quiere dejar el cuaderno",
  monthlyPrice: 89,
  price: "S/ 89",
  period: "/mes",
  firstMonthDiscount: 100, // primer mes 100% gratis para Starter
  annualDiscount: 20,
  accent: "primary",
  recommended: false, // el "Mas elegido" pasa a Pro (179)
  highlights: [
    "Productos ilimitados · 1 admin",
    "Inventario, clientes y fiados completos",
    "Yape automatico + pedidos WhatsApp",
    "Tu marca en tu storefront · sin Buleje",
    "Primer mes gratis · sin tarjeta",
  ],
  unlockedTabs: new Set<Tab>([
    // Todo Free
    ...PLAN_BASICO.unlockedTabs,
    // Inventario completo
    "inventario",
    // Clientes + fiados
    "clientes",
    "fiados",
    // Por cobrar — tablero consolidado de cuentas por cobrar (agrega fiados).
    // Acompaña a fiados/plata en el plan Starter.
    "por-cobrar",
    // Documentos basicos (boleta interna, no SUNAT todavia)
    "documentos",
    // Plata basico (ingresos/egresos)
    "plata",
    // Metas/logros + soporte
    "metas-logros",
    "support-inbox",
    "turnos",
  ]),
  features: new Set<PlanFeature>([]),
  limits: {
    maxProducts: null,
    maxBranches: 1,
    maxRiders: 0,
    maxAdminUsers: 1,
  },
  stripePriceId: STRIPE_PRICE_IDS.pro,
};

export const PLAN_ENTERPRISE: PlanDefinition = {
  id: "enterprise",
  label: "Pro",
  tagline: "El negocio establecido que quiere facturar y vender más",
  monthlyPrice: 179,
  price: "S/ 179",
  period: "/mes",
  firstMonthDiscount: 50,
  annualDiscount: 20,
  accent: "indigo",
  recommended: true, // BADGE "MAS ELEGIDO" — el 60% del mercado va aqui
  highlights: [
    "Productos ilimitados · 2 sucursales · 5 admins",
    "Facturacion SUNAT + cotizaciones + guias",
    "Promociones, fidelizacion y chat con clientes",
    "Aparece destacado en el marketplace cross-store",
    "Prestamos, scoring, recetas y compras a proveedor",
  ],
  unlockedTabs: new Set<Tab>([
    // Todo Starter
    ...PLAN_PRO.unlockedTabs,
    // Compras a proveedor
    "compras",
    "contratos",
    "devoluciones-proveedor",
    // Documentos SUNAT
    "cotizaciones",
    "guias-remision",
    "notas-credito",
    "facturacion",
    // Promociones, scoring, prestamos
    "promociones",
    "prestamos",
    "scoring",
    // Recetas + tesoreria
    "recetas",
    "tesoreria",
    // Marketplace destacado
    "marketplace",
    "marketplace-chat",
    "delivery-partners",
    // Analytics basico
    "analytics-pro",
  ]),
  features: new Set<PlanFeature>([
    "sunat-billing",
    "advanced-analytics",
  ]),
  limits: {
    maxProducts: null,
    maxBranches: 2,
    maxRiders: 3,
    maxAdminUsers: 5,
  },
  stripePriceId: STRIPE_PRICE_IDS.enterprise,
};

export const PLAN_MAX: PlanDefinition = {
  id: "max",
  label: "Business",
  tagline: "Cadenas, mayoristas y productores con varios locales",
  monthlyPrice: 349,
  price: "S/ 349",
  period: "/mes",
  firstMonthDiscount: 50,
  annualDiscount: 25,
  accent: "amber",
  highlights: [
    "Sucursales, repartidores y admins ilimitados",
    "Forecasting IA + sugerencias automaticas",
    "Lives streaming + ventas en vivo",
    "Membresias, gift cards y suscripciones",
    "Soporte 24/7 por WhatsApp con account manager",
  ],
  unlockedTabs: new Set<Tab>([
    // Todo Pro (S/179)
    ...PLAN_ENTERPRISE.unlockedTabs,
    // IA avanzada
    "ai-command",
    "sugerencias-ia",
    // Performance avanzado + auditoria
    "rendimiento",
    "colas",
    "auditoria",
    "forecasting",
    // Marketplace premium
    "delivery-live",
    "subscriptions",
    "gift-cards-admin",
    "socio-members",
    // Lives streaming exclusivo
    "lives-admin",
  ]),
  features: new Set<PlanFeature>([
    ...PLAN_ENTERPRISE.features,
    "forecasting",
    "ai-command",
    "ai-suggestions",
    "multi-branch",
    "api-access",
    "subscriptions",
    "gift-cards",
    "socio-program",
    "white-label",
    "live-streaming",
    "premium-support",
  ]),
  limits: {
    maxProducts: null,
    maxBranches: 999,
    maxRiders: 999,
    maxAdminUsers: 999,
  },
  stripePriceId: STRIPE_PRICE_IDS.max,
};

export const PLANS: Record<PlanTier, PlanDefinition> = {
  basico: PLAN_BASICO,
  pro: PLAN_PRO,
  enterprise: PLAN_ENTERPRISE,
  max: PLAN_MAX,
};

// ── Helpers ────────────────────────────────────────────────────────────────

export const STORAGE_KEY = "buleje:vendor-plan-tier";
export const PLAN_CHANGE_EVENT = "buleje-plan-change";

const DEFAULT_PLAN: PlanTier = "basico";

/** Lee el plan actual del localStorage. SSR-safe (devuelve default). */
export function getCurrentPlan(): PlanTier {
  if (typeof window === "undefined") return DEFAULT_PLAN;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && (PLAN_ORDER as readonly string[]).includes(raw)) {
      return raw as PlanTier;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_PLAN;
}

/** Cambia el plan y dispara `buleje-plan-change` para que el sidebar
 *  y otras vistas reaccionen sin recargar la página. */
export function setCurrentPlan(plan: PlanTier): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, plan);
  } catch {
    /* ignore quota */
  }
  window.dispatchEvent(
    new CustomEvent<{ plan: PlanTier }>(PLAN_CHANGE_EVENT, {
      detail: { plan },
    }),
  );
}

/** True si el plan tiene desbloqueado el tab. */
export function planIncludesTab(plan: PlanTier, tab: Tab): boolean {
  return PLANS[plan].unlockedTabs.has(tab);
}

/** True si el plan tiene la feature. */
export function planHasFeature(plan: PlanTier, feature: PlanFeature): boolean {
  return PLANS[plan].features.has(feature);
}

/** Tier mínimo que desbloquea el tab — útil para mostrar "Disponible desde Pro". */
export function minTierForTab(tab: Tab): PlanTier | null {
  for (const tier of PLAN_ORDER) {
    if (PLANS[tier].unlockedTabs.has(tab)) return tier;
  }
  return null;
}

/** Tier mínimo que desbloquea la feature. */
export function minTierForFeature(feature: PlanFeature): PlanTier | null {
  for (const tier of PLAN_ORDER) {
    if (PLANS[tier].features.has(feature)) return tier;
  }
  return null;
}

// ── Pricing helpers (Brandon mayo 2026) ──────────────────────────────────

/** Formatea un número como S/ X. */
export function formatPEN(n: number): string {
  return `S/ ${Math.round(n)}`;
}

/** Precio del primer mes aplicando `firstMonthDiscount`. */
export function firstMonthPrice(plan: PlanDefinition): number {
  if (plan.firstMonthDiscount >= 100) return 0;
  return Math.round(plan.monthlyPrice * (1 - plan.firstMonthDiscount / 100));
}

/** Precio anual con descuento (12 meses × precio − descuento%). */
export function annualPrice(plan: PlanDefinition): number {
  return Math.round(plan.monthlyPrice * 12 * (1 - plan.annualDiscount / 100));
}

/** Equivalente mensual del plan anual (para mostrar "≈ S/ X /mes"). */
export function monthlyEquivalentAnnual(plan: PlanDefinition): number {
  return Math.round(annualPrice(plan) / 12);
}

/** Cuánto ahorra el usuario en un año vs pagar mensual. */
export function annualSavings(plan: PlanDefinition): number {
  return Math.round(plan.monthlyPrice * 12 - annualPrice(plan));
}
