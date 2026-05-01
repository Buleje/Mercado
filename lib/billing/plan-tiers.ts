/**
 * lib/billing/plan-tiers.ts
 *
 * Sistema de tiers del plan vendor de Buleje.
 *
 * 4 planes — cada uno desbloquea progresivamente más tabs/features
 * del panel admin del negocio:
 *
 *   - basico     · S/0/mes  · Lo esencial para vender el día a día
 *   - pro        · S/49/mes · Crece con SUNAT, compras, analytics, marketplace
 *   - enterprise · S/149/mes · Cadenas: forecasting, IA avanzada, multi-sucursal
 *   - max        · S/299/mes · Todo: lives, white-label, IA premium, soporte 24/7
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
  /** Precio formateado (incluye moneda). */
  price: string;
  /** Frecuencia legible (ej: "/mes", "/año"). Vacío en "Gratis". */
  period: string;
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
  /** Stripe Price ID para checkout. `null` para tier gratis (no requiere pago). */
  stripePriceId: string | null;
}

/** Stripe Price IDs generados por scripts/setup-stripe-plans.mjs (modo TEST).
 *  Para producción: regenerar con keys de Live mode y reemplazar acá. */
export const STRIPE_PRICE_IDS = {
  basico: null,
  pro: "price_1TRogN8wsdxsjwKCg37NUz0j",
  enterprise: "price_1TRogO8wsdxsjwKCCRpqTv24",
  max: "price_1TRogQ8wsdxsjwKC9245XlfE",
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
  label: "Básico",
  tagline: "Lo esencial para vender",
  price: "S/ 0",
  period: "/mes",
  accent: "muted",
  unlockedTabs: new Set<Tab>([
    // Inicio (limitado: solo dashboard + asistente)
    "vendor-dashboard",
    "asistente-ia",
    "metas-logros",
    // Ventas (POS + pedidos)
    "ventas-caja",
    "pedidos",
    // Productos & inventario
    "productos",
    "inventario",
    // Clientes (sin préstamos)
    "clientes",
    "fiados",
    // Mi tienda
    "store-customizer",
    "pagina-inicio",
    // Config (siempre)
    "config",
    "plan",
    "mi-perfil",
  ]),
  features: new Set<PlanFeature>([]),
  limits: {
    maxProducts: 50,
    maxBranches: 1,
    maxRiders: 0,
    maxAdminUsers: 1,
  },
  stripePriceId: STRIPE_PRICE_IDS.basico,
};

export const PLAN_PRO: PlanDefinition = {
  id: "pro",
  label: "Pro",
  tagline: "Crece sin frenos",
  price: "S/ 49",
  period: "/mes",
  accent: "primary",
  unlockedTabs: new Set<Tab>([
    // Todo Básico
    ...PLAN_BASICO.unlockedTabs,
    // Compras
    "compras",
    "contratos",
    "devoluciones-proveedor",
    // Ventas pro: SUNAT y documentos
    "cotizaciones",
    "guias-remision",
    "notas-credito",
    "facturacion",
    // Clientes pro: préstamos + chat + soporte
    "prestamos",
    "marketplace-chat",
    "support-inbox",
    // Gráficos básicos
    "analytics-pro",
    "plata",
    // Marketplace ops
    "marketplace",
    "delivery-partners",
    // Promos + scoring + tesoreria
    "promociones",
    "scoring",
    "tesoreria",
    "turnos",
    "recetas",
  ]),
  features: new Set<PlanFeature>([
    "sunat-billing",
    "advanced-analytics",
  ]),
  limits: {
    maxProducts: null,
    maxBranches: 1,
    maxRiders: 3,
    maxAdminUsers: 5,
  },
  stripePriceId: STRIPE_PRICE_IDS.pro,
};

export const PLAN_ENTERPRISE: PlanDefinition = {
  id: "enterprise",
  label: "Enterprise",
  tagline: "Para cadenas y operaciones grandes",
  price: "S/ 149",
  period: "/mes",
  accent: "indigo",
  unlockedTabs: new Set<Tab>([
    // Todo Pro
    ...PLAN_PRO.unlockedTabs,
    // Inicio enterprise: IA avanzada
    "ai-command",
    "sugerencias-ia",
    // Gráficos avanzados + forecasting
    "rendimiento",
    "colas",
    "auditoria",
    "forecasting",
    // Marketplace enterprise
    "delivery-live",
    "subscriptions",
    "gift-cards-admin",
    "socio-members",
  ]),
  features: new Set<PlanFeature>([
    ...PLAN_PRO.features,
    "forecasting",
    "ai-command",
    "ai-suggestions",
    "multi-branch",
    "api-access",
    "subscriptions",
    "gift-cards",
    "socio-program",
  ]),
  limits: {
    maxProducts: null,
    maxBranches: 10,
    maxRiders: 20,
    maxAdminUsers: 25,
  },
  stripePriceId: STRIPE_PRICE_IDS.enterprise,
};

export const PLAN_MAX: PlanDefinition = {
  id: "max",
  label: "Max",
  tagline: "Todo desbloqueado · sin límites",
  price: "S/ 299",
  period: "/mes",
  accent: "amber",
  unlockedTabs: new Set<Tab>([
    // Todo Enterprise + lives streaming exclusivo
    ...PLAN_ENTERPRISE.unlockedTabs,
    "lives-admin",
  ]),
  features: new Set<PlanFeature>([
    ...PLAN_ENTERPRISE.features,
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
