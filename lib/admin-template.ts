/**
 * lib/admin-template.ts — Plantilla base del Panel Admin (configurable por superadmin).
 *
 * Permite al superadmin definir DEFAULTS para todos los tenants nuevos:
 *   - Visibilidad por módulo (mostrar/ocultar)
 *   - Orden de módulos
 *   - Etiquetas custom (renombrar "Pedidos" → "Comandas", etc.)
 *   - Plan tier requerido (free / pro / enterprise) por módulo
 *
 * Storage: localStorage (cliente). Cambios visibles inmediatamente en próximos
 * load del panel admin. Próxima fase: migrar a API + tabla `AdminTemplate` en
 * Prisma con scope global o por-tenant.
 *
 * Patrón clonado de `lib/nav-visibility.ts` (mismo enfoque, distinto dominio).
 */

export type AdminPlan = "free" | "pro" | "enterprise";

export interface AdminModuleEntry {
  /** Tab id (debe coincidir con `Tab` en `app/admin/admin-types.ts`). */
  id: string;
  /** Etiqueta default (puede sobreescribirse por el superadmin). */
  defaultLabel: string;
  /** Categoría visual (p. ej. "Operaciones", "Finanzas"). */
  category: string;
  /** Visible por default al primer load. */
  defaultVisible: boolean;
  /** Plan mínimo requerido — si el tenant tiene plan menor, queda oculto. */
  defaultPlan: AdminPlan;
  /** Descripción breve para el panel del superadmin. */
  description: string;
}

/**
 * Catálogo COMPLETO de módulos del panel admin que el superadmin puede
 * configurar. Cada entrada se proyecta a una fila editable en la UI.
 *
 * Mantener sincronizado con `VALID_TABS` de `app/admin/admin-types.ts`.
 */
export const ADMIN_MODULE_CATALOG: AdminModuleEntry[] = [
  // ── Core / Operaciones ────────────────────────────────────────────
  { id: "asistente-ia",   defaultLabel: "Asistente IA",       category: "Inteligencia",  defaultVisible: true,  defaultPlan: "free",       description: "Dashboard IA y chat con asistente." },
  { id: "ventas-caja",    defaultLabel: "Ventas y Caja",      category: "Operaciones",   defaultVisible: true,  defaultPlan: "free",       description: "POS, turnos y cierre de caja." },
  { id: "pedidos",        defaultLabel: "Pedidos",            category: "Operaciones",   defaultVisible: true,  defaultPlan: "free",       description: "Gestión de pedidos y delivery." },
  { id: "inventario",     defaultLabel: "Inventario",         category: "Inventario",    defaultVisible: true,  defaultPlan: "free",       description: "Stock, kardex, vencimientos y mermas." },
  { id: "productos",      defaultLabel: "Productos",          category: "Catálogo",      defaultVisible: true,  defaultPlan: "free",       description: "Catálogo, categorías y precios." },
  { id: "compras",        defaultLabel: "Compras",            category: "Operaciones",   defaultVisible: true,  defaultPlan: "free",       description: "Pedidos a proveedor y recepción." },
  { id: "plata",          defaultLabel: "Mi Plata",           category: "Finanzas",      defaultVisible: true,  defaultPlan: "free",       description: "Ingresos, egresos, ganancias y reportes." },
  { id: "clientes",       defaultLabel: "Clientes",           category: "CRM",           defaultVisible: true,  defaultPlan: "free",       description: "CRM, fidelización y segmentación." },

  // ── Crédito / Confianza ───────────────────────────────────────────
  { id: "fiados",         defaultLabel: "Fiados",             category: "CRM",           defaultVisible: true,  defaultPlan: "free",       description: "Créditos informales y saldos pendientes." },
  { id: "prestamos",      defaultLabel: "Préstamos",          category: "Finanzas",      defaultVisible: false, defaultPlan: "pro",        description: "Préstamos a clientes con cuotas e interés." },
  { id: "scoring",        defaultLabel: "Scoring crediticio", category: "Finanzas",      defaultVisible: false, defaultPlan: "pro",        description: "Puntaje crediticio por cliente." },

  // ── Producción ────────────────────────────────────────────────────
  { id: "recetas",        defaultLabel: "Recetas",            category: "Producción",    defaultVisible: false, defaultPlan: "pro",        description: "Recetas con ingredientes y costos." },
  { id: "turnos",         defaultLabel: "Turnos",             category: "Operaciones",   defaultVisible: false, defaultPlan: "free",       description: "Apertura/cierre de turnos con conteo." },

  // ── Documentos ────────────────────────────────────────────────────
  { id: "cotizaciones",          defaultLabel: "Cotizaciones",       category: "Documentos",    defaultVisible: false, defaultPlan: "pro",        description: "Cotizaciones a clientes." },
  { id: "guias-remision",        defaultLabel: "Guías de remisión",  category: "Documentos",    defaultVisible: false, defaultPlan: "pro",        description: "Guías de transporte SUNAT." },
  { id: "notas-credito",         defaultLabel: "Notas de crédito",   category: "Documentos",    defaultVisible: false, defaultPlan: "pro",        description: "Notas de crédito SUNAT." },
  { id: "contratos",             defaultLabel: "Contratos",          category: "Documentos",    defaultVisible: false, defaultPlan: "pro",        description: "Contratos comerciales." },
  { id: "devoluciones-proveedor", defaultLabel: "Devoluciones",      category: "Operaciones",   defaultVisible: false, defaultPlan: "pro",        description: "Devoluciones a proveedor." },

  // ── Marketing & Marketplace ──────────────────────────────────────
  { id: "marketplace",        defaultLabel: "Marketplace",        category: "Marketplace",   defaultVisible: false, defaultPlan: "pro",        description: "Vender en el marketplace cross-tenant." },
  { id: "delivery-partners",  defaultLabel: "Repartidores",       category: "Marketplace",   defaultVisible: false, defaultPlan: "pro",        description: "Red de repartidores propia." },
  { id: "delivery-live",      defaultLabel: "Delivery en vivo",   category: "Marketplace",   defaultVisible: false, defaultPlan: "pro",        description: "Mapa GPS de motorizados." },
  { id: "marketplace-chat",   defaultLabel: "Chat marketplace",   category: "Marketplace",   defaultVisible: false, defaultPlan: "pro",        description: "Conversaciones cross-vendor." },
  { id: "store-customizer",   defaultLabel: "Personalizar tienda",category: "Marketplace",   defaultVisible: false, defaultPlan: "free",       description: "Editor visual de la tienda online." },
  { id: "sugerencias-ia",     defaultLabel: "Sugerencias IA",     category: "Inteligencia",  defaultVisible: false, defaultPlan: "pro",        description: "Recomendaciones automáticas para tu negocio." },
  { id: "metas-logros",       defaultLabel: "Metas y logros",     category: "CRM",           defaultVisible: false, defaultPlan: "free",       description: "Gamificación y metas comerciales." },

  // ── Avanzado / Enterprise ─────────────────────────────────────────
  { id: "analytics-pro",      defaultLabel: "Analytics Pro",      category: "Inteligencia",  defaultVisible: false, defaultPlan: "enterprise", description: "Analytics avanzado con cohortes y forecasting." },
  { id: "ai-command",         defaultLabel: "Centro de IA",       category: "Inteligencia",  defaultVisible: false, defaultPlan: "enterprise", description: "Comandos y prompts personalizados." },
  { id: "colas",              defaultLabel: "Colas y workers",    category: "Sistema",       defaultVisible: false, defaultPlan: "enterprise", description: "Monitoreo de jobs en background." },

  // ── Sistema (siempre core) ────────────────────────────────────────
  { id: "config",             defaultLabel: "Configuración",      category: "Sistema",       defaultVisible: true,  defaultPlan: "free",       description: "Usuarios, permisos y configuración general." },
  { id: "plan",               defaultLabel: "Mi plan",            category: "Sistema",       defaultVisible: true,  defaultPlan: "free",       description: "Plan actual y opciones de upgrade." },
];

/** Categorías ordenadas tal como aparecen en la UI del superadmin. */
export const ADMIN_MODULE_CATEGORIES = [
  "Inteligencia",
  "Operaciones",
  "Inventario",
  "Catálogo",
  "Finanzas",
  "CRM",
  "Producción",
  "Documentos",
  "Marketplace",
  "Sistema",
] as const;

// ─── Tipos de configuración ──────────────────────────────────────────────────

/** Override por módulo: visible, plan mínimo, label custom. */
export interface ModuleOverride {
  visible?: boolean;
  plan?: AdminPlan;
  label?: string;
}

/** Mapa completo: tabId → override. */
export type AdminTemplateOverrides = Record<string, ModuleOverride>;

/** Estilo por defecto del sidebar que hereda cada tenant nuevo. */
export type DefaultSidebarStyle = "buleje" | "ejecutivo" | "sereno" | "vibrante" | "personalizado";

export interface AdminTemplate {
  /** Override por módulo. */
  overrides: AdminTemplateOverrides;
  /** Orden custom de tab ids (si vacío, usa orden del catálogo). */
  order: string[];
  /** Estilo por defecto del sidebar para nuevos tenants. */
  defaultSidebarStyle?: DefaultSidebarStyle;
  /** Versión del schema — para migrar configs viejos. */
  version: number;
}

const STORAGE_KEY = "buleje-admin-template";
const EVENT_NAME = "buleje:admin-template-changed";
const SCHEMA_VERSION = 2;

const EMPTY_TEMPLATE: AdminTemplate = {
  overrides: {},
  order: [],
  defaultSidebarStyle: "buleje",
  version: SCHEMA_VERSION,
};

// ─── Read / Write ────────────────────────────────────────────────────────────

export function readAdminTemplate(): AdminTemplate {
  if (typeof window === "undefined") return EMPTY_TEMPLATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_TEMPLATE;
    const parsed = JSON.parse(raw) as Partial<AdminTemplate>;
    return {
      overrides: parsed.overrides ?? {},
      order: parsed.order ?? [],
      defaultSidebarStyle: parsed.defaultSidebarStyle ?? "buleje",
      version: parsed.version ?? SCHEMA_VERSION,
    };
  } catch {
    return EMPTY_TEMPLATE;
  }
}

export function writeAdminTemplate(tpl: AdminTemplate): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...tpl, version: SCHEMA_VERSION }));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: tpl }));
  } catch {
    // localStorage lleno o privacy mode — silencioso.
  }
}

export function resetAdminTemplate(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: EMPTY_TEMPLATE }));
  } catch {
    // silencioso
  }
}

// ─── Resolución efectiva ────────────────────────────────────────────────────

/** Devuelve la lista de módulos en el orden y configuración efectiva (catálogo + overrides). */
export function resolveAdminModules(tpl: AdminTemplate = readAdminTemplate()): Array<
  AdminModuleEntry & { visible: boolean; plan: AdminPlan; label: string }
> {
  const ordered = tpl.order.length > 0
    ? [...tpl.order, ...ADMIN_MODULE_CATALOG.filter((m) => !tpl.order.includes(m.id)).map((m) => m.id)]
    : ADMIN_MODULE_CATALOG.map((m) => m.id);

  return ordered
    .map((id) => {
      const entry = ADMIN_MODULE_CATALOG.find((m) => m.id === id);
      if (!entry) return null;
      const ov = tpl.overrides[id] ?? {};
      return {
        ...entry,
        visible: ov.visible ?? entry.defaultVisible,
        plan: ov.plan ?? entry.defaultPlan,
        label: ov.label ?? entry.defaultLabel,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);
}

/** Suscríbete a cambios de template. */
export function onAdminTemplateChange(handler: (tpl: AdminTemplate) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<AdminTemplate>).detail;
    if (detail) handler(detail);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
