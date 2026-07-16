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

/**
 * AdminPlan — alineado 1:1 con `PlanTier` de lib/billing/plan-tiers.ts.
 *
 * IDs internos (no se ven en UI):
 *   basico     → label "Free"      S/ 0
 *   pro        → label "Starter"   S/ 89
 *   enterprise → label "Pro"       S/ 179  (badge "Mas elegido")
 *   max        → label "Business"  S/ 349
 *
 * Antes era `free | pro | enterprise` (3 tiers desincronizados del pricing).
 * Ahora hay 1 sola fuente de verdad: los 4 IDs de PlanTier.
 */
export type AdminPlan = "basico" | "pro" | "enterprise" | "max";

/**
 * Brandon mayo 2026 v7: scope de datos del módulo. Le dice al dueño del
 * negocio si lo que ve viene de su propia tienda, del marketplace cross-store
 * de Buleje, de ambos, o si es configuración del sistema. Se muestra como
 * badge en el sidebar al lado del nombre del módulo.
 */
export type ModuleScope = "tienda" | "marketplace" | "mixto" | "sistema";

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
  /**
   * Scope de datos del módulo. Default "tienda" para mantener compat con
   * entradas que no lo declaran explícitamente — el caller puede tratar
   * undefined como "tienda".
   */
  scope?: ModuleScope;
}

/**
 * Catálogo COMPLETO de módulos del panel admin que el superadmin puede
 * configurar. Cada entrada se proyecta a una fila editable en la UI.
 *
 * Mantener sincronizado con `VALID_TABS` de `app/admin/admin-types.ts`.
 */
export const ADMIN_MODULE_CATALOG: AdminModuleEntry[] = [
  // ── Free (basico) — solo lo basico para arrancar ─────────────────
  { id: "asistente-ia",   defaultLabel: "Asistente IA",       category: "Inteligencia",  defaultVisible: true,  defaultPlan: "basico",     description: "Dashboard IA y chat con asistente.", scope: "tienda" },
  { id: "ventas-caja",    defaultLabel: "Ventas y Caja",      category: "Operaciones",   defaultVisible: true,  defaultPlan: "basico",     description: "POS basico (limite 30 ventas/mes en Free).", scope: "tienda" },
  { id: "pedidos",        defaultLabel: "Pedidos",            category: "Operaciones",   defaultVisible: true,  defaultPlan: "basico",     description: "Gestion de pedidos y delivery.", scope: "mixto" },
  { id: "productos",      defaultLabel: "Productos",          category: "Catálogo",      defaultVisible: true,  defaultPlan: "basico",     description: "Catalogo (limite 20 productos en Free).", scope: "mixto" },
  { id: "store-customizer",   defaultLabel: "Identidad y tema",   category: "Marketplace",defaultVisible: false, defaultPlan: "basico",     description: "Editor visual de la tienda online (identidad y tema).", scope: "tienda" },
  { id: "pagina-inicio",      defaultLabel: "Mi tienda pública",  category: "Marketplace",defaultVisible: true,  defaultPlan: "basico",     description: "Página pública de la tienda: hero, secciones y catálogo.", scope: "tienda" },

  // ── Starter (pro) — bodega con flujo diario, S/ 89 ──────────────
  { id: "inventario",     defaultLabel: "Inventario",         category: "Inventario",    defaultVisible: true,  defaultPlan: "pro",        description: "Stock, kardex, vencimientos y mermas.", scope: "tienda" },
  { id: "clientes",       defaultLabel: "Clientes",           category: "CRM",           defaultVisible: true,  defaultPlan: "pro",        description: "CRM, fidelizacion y segmentacion.", scope: "mixto" },
  { id: "fiados",         defaultLabel: "Fiados",             category: "CRM",           defaultVisible: true,  defaultPlan: "pro",        description: "Creditos informales y saldos pendientes.", scope: "tienda" },
  { id: "plata",          defaultLabel: "Mi Plata",           category: "Finanzas",      defaultVisible: true,  defaultPlan: "pro",        description: "Ingresos, egresos, ganancias y reportes basicos.", scope: "tienda" },
  { id: "turnos",         defaultLabel: "Turnos",             category: "Operaciones",   defaultVisible: false, defaultPlan: "pro",        description: "Apertura/cierre de turnos con conteo.", scope: "tienda" },
  { id: "metas-logros",   defaultLabel: "Metas y logros",     category: "CRM",           defaultVisible: false, defaultPlan: "pro",        description: "Gamificacion y metas comerciales.", scope: "tienda" },
  { id: "documentos",     defaultLabel: "Documentos",         category: "Documentos",    defaultVisible: true,  defaultPlan: "pro",        description: "Boletas internas y comprobantes simples.", scope: "tienda" },

  // ── Pro (enterprise) — bodega establecida, S/ 179, badge "Mas elegido" ──
  { id: "compras",                defaultLabel: "Compras",            category: "Operaciones", defaultVisible: true,  defaultPlan: "enterprise", description: "Pedidos a proveedor y recepcion.", scope: "tienda" },
  { id: "contratos",              defaultLabel: "Contratos",          category: "Documentos",  defaultVisible: false, defaultPlan: "enterprise", description: "Contratos comerciales.", scope: "tienda" },
  { id: "devoluciones-proveedor", defaultLabel: "Devoluciones",       category: "Operaciones", defaultVisible: false, defaultPlan: "enterprise", description: "Devoluciones a proveedor.", scope: "tienda" },
  { id: "cotizaciones",           defaultLabel: "Cotizaciones",       category: "Documentos",  defaultVisible: false, defaultPlan: "enterprise", description: "Cotizaciones a clientes.", scope: "tienda" },
  { id: "guias-remision",         defaultLabel: "Guias de remision",  category: "Documentos",  defaultVisible: false, defaultPlan: "enterprise", description: "Guias de transporte SUNAT.", scope: "tienda" },
  { id: "notas-credito",          defaultLabel: "Notas de credito",   category: "Documentos",  defaultVisible: false, defaultPlan: "enterprise", description: "Notas de credito SUNAT.", scope: "tienda" },
  { id: "facturacion",            defaultLabel: "Facturacion SUNAT",  category: "Documentos",  defaultVisible: true,  defaultPlan: "enterprise", description: "Facturacion electronica SUNAT.", scope: "tienda" },
  { id: "promociones",            defaultLabel: "Promociones",        category: "Marketing",   defaultVisible: false, defaultPlan: "enterprise", description: "Cupones, descuentos y combos.", scope: "mixto" },
  { id: "prestamos",              defaultLabel: "Prestamos",          category: "Finanzas",    defaultVisible: false, defaultPlan: "enterprise", description: "Prestamos a clientes con cuotas e interes.", scope: "tienda" },
  { id: "scoring",                defaultLabel: "Scoring crediticio", category: "Finanzas",    defaultVisible: false, defaultPlan: "enterprise", description: "Puntaje crediticio por cliente.", scope: "tienda" },
  { id: "recetas",                defaultLabel: "Recetas",            category: "Producción",  defaultVisible: false, defaultPlan: "enterprise", description: "Recetas con ingredientes y costos.", scope: "tienda" },
  { id: "tesoreria",              defaultLabel: "Tesoreria",          category: "Finanzas",    defaultVisible: false, defaultPlan: "enterprise", description: "Flujo de caja y reportes financieros.", scope: "tienda" },
  { id: "marketplace",            defaultLabel: "Marketplace",        category: "Marketplace", defaultVisible: false, defaultPlan: "enterprise", description: "Vender destacado en el marketplace cross-tenant.", scope: "marketplace" },
  { id: "marketplace-chat",       defaultLabel: "Chat marketplace",   category: "Marketplace", defaultVisible: false, defaultPlan: "enterprise", description: "Conversaciones cross-vendor.", scope: "marketplace" },
  { id: "whatsapp-inbox",         defaultLabel: "WhatsApp",           category: "CRM",         defaultVisible: true,  defaultPlan: "basico",     description: "Inbox del WhatsApp del negocio: conversaciones y respuesta desde el panel.", scope: "tienda" },
  { id: "delivery-partners",      defaultLabel: "Repartidores",       category: "Marketplace", defaultVisible: false, defaultPlan: "enterprise", description: "Red de repartidores propia.", scope: "mixto" },
  { id: "analytics-pro",          defaultLabel: "Analytics Pro",      category: "Inteligencia",defaultVisible: false, defaultPlan: "enterprise", description: "Analytics con cohortes.", scope: "mixto" },
  { id: "support-inbox",          defaultLabel: "Soporte clientes",   category: "CRM",         defaultVisible: false, defaultPlan: "enterprise", description: "Inbox de tickets de tus clientes.", scope: "tienda" },

  // ── Business (max) — cadenas premium, S/ 349 ─────────────────────
  { id: "ai-command",         defaultLabel: "Centro de IA",       category: "Inteligencia",  defaultVisible: false, defaultPlan: "max",        description: "Comandos y prompts personalizados.", scope: "tienda" },
  { id: "sugerencias-ia",     defaultLabel: "Sugerencias IA",     category: "Inteligencia",  defaultVisible: false, defaultPlan: "max",        description: "Recomendaciones automaticas para tu negocio.", scope: "tienda" },
  { id: "forecasting",        defaultLabel: "Forecasting",        category: "Inteligencia",  defaultVisible: false, defaultPlan: "max",        description: "Pronostico de ventas con IA.", scope: "mixto" },
  { id: "rendimiento",        defaultLabel: "Rendimiento",        category: "Sistema",       defaultVisible: false, defaultPlan: "max",        description: "Performance + auditoria del panel.", scope: "sistema" },
  { id: "auditoria",          defaultLabel: "Auditoria",          category: "Sistema",       defaultVisible: false, defaultPlan: "max",        description: "Log auditable de acciones del staff.", scope: "sistema" },
  { id: "colas",              defaultLabel: "Colas y workers",    category: "Sistema",       defaultVisible: false, defaultPlan: "max",        description: "Monitoreo de jobs en background.", scope: "sistema" },
  { id: "delivery-live",      defaultLabel: "Delivery en vivo",   category: "Marketplace",   defaultVisible: false, defaultPlan: "max",        description: "Mapa GPS de motorizados.", scope: "marketplace" },
  { id: "lives-admin",        defaultLabel: "Lives streaming",    category: "Marketplace",   defaultVisible: false, defaultPlan: "max",        description: "Ventas en vivo por streaming.", scope: "marketplace" },
  { id: "subscriptions",      defaultLabel: "Suscripciones",      category: "Marketplace",   defaultVisible: false, defaultPlan: "max",        description: "Bodega al Mes y planes recurrentes.", scope: "tienda" },
  { id: "gift-cards-admin",   defaultLabel: "Gift cards",         category: "Marketplace",   defaultVisible: false, defaultPlan: "max",        description: "Vender y canjear gift cards.", scope: "tienda" },
  { id: "socio-members",      defaultLabel: "Socio Buleje",       category: "Marketplace",   defaultVisible: false, defaultPlan: "max",        description: "Programa de socios premium.", scope: "marketplace" },

  // ── Especialización + módulos recientes (2026-05-29) ──────────────
  // cacao/forestal: el unlock REAL es la feature flag de la spec
  // (/superadmin/especializaciones). Acá solo se controla visibilidad/orden/
  // label CUANDO la spec está activa — si la spec está OFF, el tab no aparece
  // igual (gating en sidebar + TabRouter).
  { id: "adelantos",              defaultLabel: "Adelantos",                      category: "Finanzas",    defaultVisible: false, defaultPlan: "enterprise", description: "Adelantos a personas liquidados por entregas.", scope: "tienda" },
  { id: "leads-funnel",           defaultLabel: "Funnel de Leads",                category: "CRM",         defaultVisible: false, defaultPlan: "enterprise", description: "Embudo de prospectos y conversion.", scope: "mixto" },
  { id: "cacao-acopio",           defaultLabel: "Acopio de Cacao",                category: "Producción",  defaultVisible: true,  defaultPlan: "pro",        description: "Acopio y beneficio de cacao (especializacion agricola — requiere spec ON).", scope: "tienda" },
  { id: "ctp-libro-operaciones",  defaultLabel: "Libro CTP (Forestal)",           category: "Producción",  defaultVisible: true,  defaultPlan: "pro",        description: "Libro de operaciones CTP forestal (especializacion — requiere spec ON).", scope: "tienda" },
  { id: "loth-libro-operaciones", defaultLabel: "Libro Titulos Hab. (Forestal)",  category: "Producción",  defaultVisible: true,  defaultPlan: "pro",        description: "Libro de titulos habilitantes forestal (especializacion — requiere spec ON).", scope: "tienda" },
  { id: "forestal-herramientas",  defaultLabel: "Herramientas Forestales",        category: "Producción",  defaultVisible: true,  defaultPlan: "pro",        description: "Cubicador de madera por voz (pie tablar + m3) y utilidades forestales (especializacion — requiere spec ON).", scope: "tienda" },

  // ── Sistema (siempre core, free y arriba) ─────────────────────────
  { id: "config",             defaultLabel: "Configuracion",      category: "Sistema",       defaultVisible: true,  defaultPlan: "basico",     description: "Usuarios, permisos y configuracion general.", scope: "sistema" },
  { id: "plan",               defaultLabel: "Mi plan",            category: "Sistema",       defaultVisible: true,  defaultPlan: "basico",     description: "Plan actual y opciones de upgrade.", scope: "sistema" },
  { id: "mi-perfil",          defaultLabel: "Mi perfil",          category: "Sistema",       defaultVisible: true,  defaultPlan: "basico",     description: "Datos del bodeguero.", scope: "sistema" },
];

/**
 * Lookup rápido tabId → scope, derivado del catálogo. Útil para el sidebar
 * del admin (mostrar badge) sin tener que recorrer el array entero.
 */
export const MODULE_SCOPE_BY_ID: Record<string, ModuleScope> = (() => {
  const map: Record<string, ModuleScope> = {};
  for (const m of ADMIN_MODULE_CATALOG) {
    map[m.id] = m.scope ?? "tienda";
  }
  // ── Tabs adicionales que NO viven en el catálogo del superadmin pero
  // sí en el sidebar del admin del tenant (ALL_TABS en app/admin/_lib/tab-data).
  // Brandon mayo 2026 v7: estos también necesitan scope para el badge.
  const extra: Record<string, ModuleScope> = {
    "vendor-dashboard": "mixto",
    "leads-funnel": "tienda",
    "pagina-inicio": "tienda",
    "chat-ia": "tienda",
  };
  return { ...map, ...extra };
})();

/**
 * Metadatos visuales del scope para usar en UI (sidebar badge, header chip).
 */
export const MODULE_SCOPE_META: Record<
  ModuleScope,
  { label: string; shortLabel: string; bgClass: string; textClass: string; dotClass: string }
> = {
  tienda: {
    label: "Tu tienda",
    shortLabel: "Tienda",
    bgClass: "bg-[var(--accent-soft)]",
    textClass: "text-[var(--accent)]",
    dotClass: "bg-[var(--accent)]",
  },
  marketplace: {
    label: "Marketplace",
    shortLabel: "Mkt",
    bgClass: "bg-[#a78bfa]/12",
    textClass: "text-[#7c3aed]",
    dotClass: "bg-[#7c3aed]",
  },
  mixto: {
    label: "Tienda + Marketplace",
    shortLabel: "Ambos",
    bgClass: "bg-gradient-to-r from-[var(--accent-soft)] to-[#a78bfa]/15",
    textClass: "text-[var(--text-primary)]",
    dotClass: "bg-gradient-to-r from-[var(--accent)] to-[#7c3aed]",
  },
  sistema: {
    label: "Sistema",
    shortLabel: "Sistema",
    bgClass: "bg-[var(--surface-sunken)]",
    textClass: "text-[var(--text-tertiary)]",
    dotClass: "bg-[var(--text-tertiary)]",
  },
};

/** Categorías ordenadas tal como aparecen en la UI del superadmin. */
export const ADMIN_MODULE_CATEGORIES = [
  "Inteligencia",
  "Operaciones",
  "Inventario",
  "Catálogo",
  "Finanzas",
  "CRM",
  "Marketing",
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

/**
 * Mapeo de DefaultSidebarStyle → preset visual aplicado al AdminSidebar
 * de cada tenant. El SidebarConfigurator del tenant usa los mismos pares
 * (theme + accent), así que persistir esto en localStorage del tenant es
 * compatible con su UI de personalización.
 *
 * "personalizado" se omite intencionalmente — significa "respetá la
 * config local del cliente".
 */
export interface SidebarStylePreset {
  /** SidebarTheme — debe coincidir con valores de @/components/admin/shared/SidebarConfigurator. */
  theme: "buleje" | "light" | "dark";
  /** AccentColor — uno de los 6 colores predefinidos del configurador. */
  accent: "teal" | "amber" | "sky" | "rose" | "emerald" | "violet";
}

export const SIDEBAR_STYLE_PRESETS: Record<
  Exclude<DefaultSidebarStyle, "personalizado">,
  SidebarStylePreset
> = {
  buleje: { theme: "buleje", accent: "teal" },
  ejecutivo: { theme: "dark", accent: "amber" },
  sereno: { theme: "light", accent: "sky" },
  vibrante: { theme: "light", accent: "rose" },
};

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

// ─── API-backed persistence (fuente de verdad: PlatformSetting global) ──────
// localStorage queda como cache warm para el primer paint; la fuente de
// verdad cross-browser/cross-tenant es la DB vía /api/admin-template.

const API_ENDPOINT = "/api/platform/admin-template";

/**
 * Lee la plantilla desde la DB (vía /api/admin-template). Actualiza el
 * localStorage como cache + dispara el evento de cambio para que los
 * consumers reactivos (admin sidebars, overlay) re-renderen.
 * Si la red falla, devuelve la versión cacheada en localStorage.
 */
// Dedup in-flight + TTL corto: useAdminTemplateOverlay lo usan ~6 componentes
// del admin (sidebar, scope badge, tabs derived…) → antes cada mount disparaba
// su /api/platform/admin-template (6× por carga). El cambio de plantilla se
// propaga por el evento EVENT_NAME (no por re-fetch), así que un cache corto es
// seguro y el reload (módulo nuevo) siempre trae fresco. Perf 2026-05-29.
let _templateInFlight: Promise<AdminTemplate> | null = null;
let _templateCache: { at: number; tpl: AdminTemplate } | null = null;
const _TEMPLATE_TTL = 5000;

/**
 * @param opts.raw — true: plantilla global PURA (sin merge per-tenant). La usa
 *   el editor del superadmin (/superadmin/plantilla) para no editar sobre una
 *   plantilla mergeada con el override de un tenant. Bypasea el cache
 *   in-memory y NO escribe localStorage (no contaminar el cache del admin).
 */
export async function fetchAdminTemplate(opts?: { raw?: boolean }): Promise<AdminTemplate> {
  if (typeof window === "undefined") return EMPTY_TEMPLATE;

  if (opts?.raw) {
    try {
      const res = await fetch(`${API_ENDPOINT}?raw=1`, { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { template?: Partial<AdminTemplate> };
      return {
        overrides: data.template?.overrides ?? {},
        order: data.template?.order ?? [],
        defaultSidebarStyle: data.template?.defaultSidebarStyle ?? "buleje",
        version: data.template?.version ?? SCHEMA_VERSION,
      };
    } catch {
      return readAdminTemplate();
    }
  }

  if (_templateCache && Date.now() - _templateCache.at < _TEMPLATE_TTL) return _templateCache.tpl;
  if (_templateInFlight) return _templateInFlight;

  _templateInFlight = (async () => {
    try {
      const res = await fetch(API_ENDPOINT, { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { template?: Partial<AdminTemplate> };
      const tpl: AdminTemplate = {
        overrides: data.template?.overrides ?? {},
        order: data.template?.order ?? [],
        defaultSidebarStyle: data.template?.defaultSidebarStyle ?? "buleje",
        version: data.template?.version ?? SCHEMA_VERSION,
      };
      _templateCache = { at: Date.now(), tpl };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tpl));
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: tpl }));
      } catch {
        // silencioso
      }
      return tpl;
    } catch {
      return readAdminTemplate();
    } finally {
      _templateInFlight = null;
    }
  })();
  return _templateInFlight;
}

/** Invalida el cache in-memory del template (llamar tras guardar cambios). */
export function invalidateAdminTemplateCache(): void {
  _templateCache = null;
  _templateInFlight = null;
}

export interface SaveResult {
  ok: boolean;
  template?: AdminTemplate;
  error?: string;
  /** Issues de validación cuando el server respondió 400. */
  issues?: Array<{ path: (string | number)[]; message: string }>;
}

/**
 * Persiste la plantilla en DB vía PUT /api/admin-template (requiere sesión
 * de superadmin). En éxito: refresca el cache localStorage y dispara el
 * evento para que los admin paneles abiertos re-renderen al instante.
 */
export async function saveAdminTemplate(tpl: AdminTemplate): Promise<SaveResult> {
  if (typeof window === "undefined") return { ok: false, error: "SSR" };
  try {
    const { csrfHeaders } = await import("@/lib/csrf-client");
    const res = await fetch(API_ENDPOINT, {
      method: "PUT",
      headers: csrfHeaders({ "content-type": "application/json" }),
      credentials: "same-origin",
      body: JSON.stringify({
        overrides: tpl.overrides,
        order: tpl.order,
        defaultSidebarStyle: tpl.defaultSidebarStyle ?? "buleje",
        version: SCHEMA_VERSION,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      template?: AdminTemplate;
      issues?: SaveResult["issues"];
    };
    if (!res.ok) {
      return { ok: false, error: data.error ?? `HTTP ${res.status}`, issues: data.issues };
    }
    const saved = data.template ?? tpl;
    // Refresca el cache in-memory con lo guardado (no servir el TTL viejo).
    _templateCache = { at: Date.now(), tpl: saved };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: saved }));
    } catch {
      // silencioso
    }
    return { ok: true, template: saved };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network-error" };
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
