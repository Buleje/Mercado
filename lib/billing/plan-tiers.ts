/**
 * lib/billing/plan-tiers.ts
 *
 * Sistema de tiers del plan vendor de Buleje. FUENTE ÚNICA DE VERDAD —
 * /abrir-tienda, superadmin y el panel del negocio leen de acá.
 *
 * 4 planes (Brandon mayo 2026 — sin tier gratis, charm pricing):
 *
 *   - basico     · S/ 39/mes  · "Estándar" — primer mes 100% off
 *   - pro        · S/ 99/mes  · "Pro"     — 1er mes 50% off
 *   - enterprise · S/ 159/mes · "Enterprise" — 1er mes 50% off
 *   - max        · S/ 199/mes · "Max"     — 1er mes 50% off
 *
 * Anual: 20% descuento sobre 12 meses (≈ 2.4 meses gratis).
 *
 * El id interno (`basico`/`pro`/...) NO cambió por compatibilidad con
 * cientos de archivos que lo referencian. Sólo cambió el LABEL visible
 * ("Básico" → "Estándar") y los precios.
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
  label: "Estándar",
  tagline: "Empezá a vender online sin complicarte",
  monthlyPrice: 39,
  price: "S/ 39",
  period: "/mes",
  firstMonthDiscount: 100, // primer mes gratis (100% off)
  annualDiscount: 20,
  accent: "muted",
  highlights: [
    "Tu tienda online lista en minutos",
    "Hasta 50 productos cargados",
    "Pedidos por WhatsApp y caja registradora",
    "Inventario y clientes con fiados",
    "Primer mes gratis · sin tarjeta",
  ],
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
  tagline: "Para negocios que ya venden y quieren escalar",
  monthlyPrice: 99,
  price: "S/ 99",
  period: "/mes",
  firstMonthDiscount: 50,
  annualDiscount: 20,
  accent: "primary",
  recommended: true,
  highlights: [
    "Productos ilimitados · 3 repartidores propios",
    "Facturación electrónica SUNAT incluida",
    "Compras, cotizaciones y notas de crédito",
    "Promos, fidelización y chat con clientes",
    "Aparece destacado en el marketplace",
  ],
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
  tagline: "Cadenas y operaciones de varias sucursales",
  monthlyPrice: 159,
  price: "S/ 159",
  period: "/mes",
  firstMonthDiscount: 50,
  annualDiscount: 20,
  accent: "indigo",
  highlights: [
    "Hasta 10 sucursales con stock independiente",
    "Forecasting con IA y panel de auditoría",
    "Membresías, gift cards y suscripciones",
    "20 repartidores y 25 admins del panel",
    "API y webhooks para integrar tus sistemas",
  ],
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
  tagline: "Todo desbloqueado · sin límites · soporte 24/7",
  monthlyPrice: 199,
  price: "S/ 199",
  period: "/mes",
  firstMonthDiscount: 50,
  annualDiscount: 25,
  accent: "amber",
  highlights: [
    "Lives streaming + ventas en vivo",
    "White-label completo (tu marca, tu dominio)",
    "IA premium: comandos por voz y sugerencias",
    "Sucursales y repartidores ilimitados",
    "Soporte prioritario 24/7 con tu account manager",
  ],
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
