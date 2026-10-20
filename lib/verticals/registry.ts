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
  | "belleza"
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
  // Inbox WhatsApp del negocio — universal: toda vertical habla con clientes por WhatsApp
  "whatsapp-inbox",
  /* Cámaras del local o del patio (ADR-411): universal a propósito. Nació para
     el aserradero, pero mirar quién entró de noche no es de un rubro — una
     bodega con una cámara en la puerta usa exactamente la misma pantalla. Si
     viviera sólo en la vertical maderera, el sidebar la ocultaría en silencio
     en todas las demás (el filtro vertical no avisa, simplemente no dibuja). */
  "camaras",
  /* Recursos Humanos (ADR-414): universal por la misma razón que Cámaras — toda
     bodega, restaurante o aserradero tiene gente que marca asistencia y cobra.
     Fuera de este núcleo, el filtro vertical lo ocultaba EN SILENCIO de la barra
     lateral de escritorio (medido 2026-09-14 en un negocio «bodega»), mientras
     el menú del celular, que no aplica este filtro, sí lo mostraba. */
  "rrhh",
  /* Tareas del equipo: herramienta interna de cualquier negocio. La categoría
     «Equipo» sólo la trae a ella; fuera de este núcleo el filtro vertical la
     ocultaba de la barra de escritorio igual que a RRHH (medido 2026-09-14). */
  "tareas",
  /* Plan de la empresa (ADR-497): ficha, socios, FODA, objetivos y políticas
     son de cualquier negocio — bodega, restaurante o aserradero. */
  "planificacion",
  /* Agenda del negocio (ADR-501): trae Tareas y Notas (universales). */
  "administracion",
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
  /* Campañas (Brandon 19-10, plan Pro): mandar una oferta a un grupo de clientes
     (uno por uno o automático) sirve a todo negocio que vende al público. Va a mano
     en cada rubro y NO en CORE_BASE: la maderería vende B2B por cotización. El
     plan sigue mandando (plan-tiers: sólo enterprise/max). */
  "campanas",
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
      // "fiados" ya no es entrada propia del sidebar (colapsada dentro de
      // FinanzasModule, auditoría 2026-08-02) — el destacado apunta a "plata",
      // que es la entrada visible que lleva hasta Fiados en 2 clicks.
      featured: ["vendor-dashboard", "ventas-caja", "inventario", "plata", "marketplace"],
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
        "campanas", // Brandon 19-10: ofertas a clientes por WhatsApp (plan Pro); el plan manda
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
      // "fiados" ya no es entrada propia del sidebar (colapsada dentro de
      // FinanzasModule, auditoría 2026-08-02) — el destacado apunta a "plata".
      featured: ["cotizaciones", "guias-remision", "contratos", "plata", "compras"],
      hidden: ["delivery-partners", "delivery-live", "marketplace-chat"],
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
        "campanas", // Brandon 19-10: ofertas a clientes (plan Pro)
      ],
      // "auditoria" ya no es entrada propia del sidebar (colapsada dentro de
      // SistemaHubModule, auditoría 2026-08-02) — el destacado apunta a
      // "rendimiento", que es la entrada visible del hub.
      featured: ["inventario", "ventas-caja", "lotes-vencimiento", "recetas-medicas", "rendimiento"],
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
        "campanas", // Brandon 19-10: ofertas a clientes (plan Pro)
      ],
      // "fiados" ya no es entrada propia del sidebar (colapsada dentro de
      // FinanzasModule, auditoría 2026-08-02) — el destacado apunta a "plata".
      featured: ["productos", "cotizaciones", "plata", "ventas-caja", "compras"],
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
        "campanas", // Brandon 19-10: ofertas a clientes (plan Pro)
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

  /* Belleza y cuidado personal (ADR-509, Brandon 2026-10-20): tiendas de
     cosmética, cabello y piel — Musa. Ve lo mismo que una bodega (medido con el
     guardián del panel: 0 pares perdidos para un negocio que sale de «bodega»)
     menos Préstamos, que nadie de este rubro usa y cuya vista vive igual en Mi
     Plata. Cotizaciones (venta a salones) y Guías de Remisión (envíos por
     agencia) se quedan. Lo forestal no entra por el rubro: lo prenden sus
     especializaciones. */
  belleza: {
    industry: "belleza",
    label: "Belleza y cuidado personal",
    icon: "Sparkles",
    description: "Tiendas de belleza y cosmética — catálogo con fichas, revendedoras, tienda online y seguimiento de clientas.",
    modules: {
      enabled: ALL_CURRENT.filter((id) => id !== "prestamos"),
      featured: ["productos", "ventas-caja", "clientes", "canales", "metas-logros"],
      hidden: ["prestamos"],
      comingSoon: [],
    },
    branding: {
      sidebarTitle: "Mi Tienda de Belleza",
      customCopy: {
        cliente: "clienta",
        clientes: "clientas",
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
        "rrhh", // ADR-414 — universal; «otro» no hereda CORE_BASE, así que va explícito
        "tareas", // universal, misma razón que rrhh
        "administracion", // ADR-501 — Tareas y Notas viven ahí desde el 18-10
        "campanas", // Brandon 19-10: ofertas a clientes (plan Pro)
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
