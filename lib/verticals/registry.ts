/**
 * Vertical Registry — Industry → Modules mapping
 *
 * Source of truth para qué módulos del panel admin se muestran/destacan/ocultan
 * según el rubro del tenant (Industry). Consumido por:
 *  - useAdminTabsDerived (filtrado de sidebar)
 *  - AdminSidebar (orden destacado)
 *  - Onboarding wizard (preset + branding inicial)
 *
 * Ver ADR-100 para contexto, alternativas y plan de migración (F1/F2/F3).
 *
 * IDs de módulos = tab IDs definidos en app/admin/_lib/tab-data.ts (35 actuales).
 * Módulos "comingSoon" son IDs no presentes aún — se renderizan como cards
 * deshabilitadas con label "Próximamente" (F2).
 */

import type { Tab } from "@/app/admin/_lib/tabs.types";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type Industry =
  | "bodega"
  | "restaurante"
  | "madereria"
  | "farmacia"
  | "ferreteria"
  | "panaderia"
  | "otro";

export type ModuleId = Tab | string; // string = comingSoon ids no en Tab union aún

export interface VerticalModulesConfig {
  /** IDs visibles en sidebar (se intersectan con permisos RBAC) */
  enabled: ModuleId[];
  /** IDs destacados al tope del sidebar — orden = prioridad descendente */
  featured: ModuleId[];
  /** IDs explícitamente ocultos aunque RBAC permita */
  hidden: ModuleId[];
  /** IDs planeados, render como "Próximamente" (no clickeables) */
  comingSoon: ModuleId[];
}

export interface VerticalBranding {
  /** Override de copy para sidebar/header (ej: "Mi Restaurante" vs "Mi Tienda") */
  sidebarTitle?: string;
  /** Color primario override (hex en token --color-primary) */
  primaryColor?: string;
  /** Diccionario de strings i18n por vertical (ej: "producto" → "plato") */
  customCopy?: Record<string, string>;
}

export interface VerticalConfig {
  industry: Industry;
  /** Etiqueta humana — se muestra en onboarding y selector */
  label: string;
  /** Lucide icon name (se resuelve dinámicamente en UI) */
  icon: string;
  /** Una línea descriptiva para wizard de onboarding */
  description: string;
  modules: VerticalModulesConfig;
  branding?: VerticalBranding;
}

// ─── Module catalog (35 tabs actuales + futuros) ───────────────────────────────

/** Núcleo común a todos los verticales — base mínima de un negocio. */
const CORE_BASE: ModuleId[] = [
  "vendor-dashboard",
  "asistente-ia",
  "ventas-caja",
  "inventario",
  "productos",
  "compras",
  "plata",
  "adelantos",
  "activos",
  "clientes",
  "config",
  "pedidos",
  "turnos",
  "plan",
  "marketplace",
  "rendimiento",
  "mi-perfil",
  "support-inbox",
];

/** Set extendido — todos los tabs actuales (35). */
const ALL_CURRENT: ModuleId[] = [
  ...CORE_BASE,
  "ai-command",
  "sugerencias-ia",
  "metas-logros",
  "fiados",
  "analytics-pro",
  "forecasting",
  "prestamos",
  "facturacion",
  "cotizaciones",
  "guias-remision",
  "notas-credito",
  "contratos",
  "delivery-partners",
  "delivery-live",
  "marketplace-chat",
  "canales",
  "store-customizer",
  "pagina-inicio",
  "auditoria",
  "colas",
];

// ─── Registry ──────────────────────────────────────────────────────────────────

export const VERTICAL_REGISTRY: Record<Industry, VerticalConfig> = {
  bodega: {
    industry: "bodega",
    label: "Bodega / Minimarket",
    icon: "Store",
    description: "Bodegas, minimarkets, abarrotes — venta diaria + fiados + delivery.",
    modules: {
      enabled: ALL_CURRENT,
      featured: ["vendor-dashboard", "ventas-caja", "inventario", "fiados", "marketplace"],
      hidden: [],
      comingSoon: [],
    },
    branding: {
      sidebarTitle: "Mi Bodega",
    },
  },

  restaurante: {
    industry: "restaurante",
    label: "Restaurante / Cafetería",
    icon: "UtensilsCrossed",
    description: "Restaurantes, cafés, comida rápida — recetas + comandas + KDS.",
    modules: {
      enabled: [
        ...CORE_BASE,
        "metas-logros",
        "fiados",
        "delivery-partners",
        "delivery-live",
        "marketplace-chat",
        "store-customizer",
        "pagina-inicio",
        "auditoria",
        "colas",
        "recetas",        // futuro — Receta model ya existe
      ],
      featured: ["recetas", "ventas-caja", "inventario", "mesas", "comandas", "cocina-kds"],
      hidden: ["cotizaciones", "guias-remision", "notas-credito", "contratos", "prestamos"],
      comingSoon: ["mesas", "comandas", "cocina-kds", "menu-digital-qr"],
    },
    branding: {
      sidebarTitle: "Mi Restaurante",
      customCopy: {
        producto: "plato",
        productos: "carta",
        inventario: "stock cocina",
      },
    },
  },

  madereria: {
    industry: "madereria",
    label: "Maderería / Construcción",
    icon: "TreePine",
    description: "Madereras, ferreterías mayoristas — cotizaciones B2B + guías + cubicaje.",
    modules: {
      enabled: [
        ...CORE_BASE,
        "fiados",
        "prestamos",
        "facturacion",
        "cotizaciones",
        "guias-remision",
        "notas-credito",
        "contratos",
        "analytics-pro",
        "auditoria",
      ],
      featured: ["cotizaciones", "guias-remision", "contratos", "fiados", "compras"],
      hidden: ["delivery-partners", "delivery-live", "marketplace-chat", "metas-logros"],
      comingSoon: ["pietaje", "calculadora-cubicaje", "lotes-madera"],
    },
    branding: {
      sidebarTitle: "Mi Maderería",
      customCopy: {
        producto: "pieza",
        ventas: "ventas B2B",
      },
    },
  },

  farmacia: {
    industry: "farmacia",
    label: "Farmacia / Botica",
    icon: "Pill",
    description: "Farmacias, boticas — control FEFO estricto + recetas médicas + DIGEMID.",
    modules: {
      enabled: [
        ...CORE_BASE,
        "fiados",
        "facturacion",
        "analytics-pro",
        "forecasting",
        "auditoria",
        "store-customizer",
        "pagina-inicio",
      ],
      featured: ["inventario", "ventas-caja", "lotes-vencimiento", "recetas-medicas", "auditoria"],
      hidden: ["cotizaciones", "contratos", "marketplace-chat"],
      comingSoon: [
        "lotes-vencimiento",       // Batch model ya existe — solo UI
        "recetas-medicas",
        "sustancias-controladas",
        "digemid-reportes",
      ],
    },
    branding: {
      sidebarTitle: "Mi Farmacia",
      customCopy: {
        cliente: "paciente",
        producto: "medicamento",
      },
    },
  },

  ferreteria: {
    industry: "ferreteria",
    label: "Ferretería",
    icon: "Wrench",
    description: "Ferreterías retail + mayoristas — catálogo extenso + cotizaciones + fiados.",
    modules: {
      enabled: [
        ...CORE_BASE,
        "fiados",
        "prestamos",
        "facturacion",
        "cotizaciones",
        "guias-remision",
        "notas-credito",
        "contratos",
        "analytics-pro",
        "forecasting",
        "store-customizer",
        "pagina-inicio",
      ],
      featured: ["productos", "cotizaciones", "fiados", "ventas-caja", "compras"],
      hidden: ["delivery-live", "marketplace-chat"],
      comingSoon: ["mayorista-pricing", "kits-bundles", "garantias-tracking"],
    },
    branding: {
      sidebarTitle: "Mi Ferretería",
    },
  },

  panaderia: {
    industry: "panaderia",
    label: "Panadería / Pastelería",
    icon: "Croissant",
    description: "Panaderías, pastelerías — recetas + producción por lote + venta directa.",
    modules: {
      enabled: [
        ...CORE_BASE,
        "metas-logros",
        "fiados",
        "delivery-partners",
        "store-customizer",
        "pagina-inicio",
        "recetas",
      ],
      featured: ["recetas", "ventas-caja", "inventario", "produccion-lote", "compras"],
      hidden: ["cotizaciones", "guias-remision", "contratos", "prestamos"],
      comingSoon: ["produccion-lote", "merma-horneo", "pre-pedidos-evento"],
    },
    branding: {
      sidebarTitle: "Mi Panadería",
      customCopy: {
        producto: "producto horneado",
      },
    },
  },

  otro: {
    industry: "otro",
    label: "Otro rubro",
    icon: "Building2",
    description: "Negocio genérico — base mínima, activa módulos según necesites.",
    modules: {
      enabled: [
        "vendor-dashboard",
        "asistente-ia",
        "ventas-caja",
        "inventario",
        "productos",
        "clientes",
        "config",
        "pedidos",
        "marketplace",
        "mi-perfil",
        "support-inbox",
        "plan",
        "compras",
        "dropship", // ADR-298 — tiendas dropshipping (gate real = Settings.dropshipEnabled)
      ],
      featured: [],
      hidden: [],
      comingSoon: [],
    },
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Devuelve el config para un industry. Fallback a "otro" si el valor no existe
 * (defensive — en caso de tenant antiguo con industry NULL/legacy).
 */
export function getVerticalConfig(industry: Industry | null | undefined): VerticalConfig {
  if (!industry) return VERTICAL_REGISTRY.otro;
  return VERTICAL_REGISTRY[industry] ?? VERTICAL_REGISTRY.otro;
}

/**
 * Filtra una lista de tab IDs según el vertical: oculta los `hidden` y los que
 * no están en `enabled`. Devuelve los visibles ordenados con `featured` primero.
 *
 * El consumidor (useAdminTabsDerived) intersecta ESTO con los permisos RBAC,
 * no al revés — RBAC siempre gana en restricciones.
 */
export function filterTabsForVertical(
  industry: Industry | null | undefined,
  allTabIds: string[],
): { visible: string[]; comingSoon: string[] } {
  const cfg = getVerticalConfig(industry);
  const enabledSet = new Set(cfg.modules.enabled.map(String));
  const hiddenSet = new Set(cfg.modules.hidden.map(String));
  const featured = cfg.modules.featured.map(String);

  const visible = allTabIds.filter((id) => enabledSet.has(id) && !hiddenSet.has(id));

  // Ordenar: featured primero (preservando su orden), luego el resto
  const featuredOrdered = featured.filter((id) => visible.includes(id));
  const rest = visible.filter((id) => !featured.includes(id));

  return {
    visible: [...featuredOrdered, ...rest],
    comingSoon: cfg.modules.comingSoon.map(String),
  };
}

/**
 * Lista de todos los industries soportados — para selectores de UI.
 */
export const SUPPORTED_INDUSTRIES: ReadonlyArray<Industry> = Object.keys(
  VERTICAL_REGISTRY,
) as Industry[];
