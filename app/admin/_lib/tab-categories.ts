/**
 * app/admin/_lib/tab-categories.ts
 *
 * Constantes de configuración de los tabs/módulos del panel admin.
 * Extraído de app/admin/page.tsx (Sesión 2 del refactor — ver
 * docs/refactor-giant-files-plan.md).
 *
 * Contenido:
 *  - `DEMO_DATA_MODULES`  → Módulos con datos de demo y endpoint de limpieza
 *  - `MODULE_INFO`        → Metadata visible (emoji, prioridad, descripción, tip)
 *  - `TabCategory`        → Tipo de la categoría del sidebar
 *  - `BASIC_MODULES`      → 17 módulos básicos del sidebar
 *  - `TIENDA_MODULE`      → Categoría especial Mi Tienda (personalización)
 *  - `CONFIG_MODULE`      → Categoría especial Configuración (siempre visible)
 *  - `TAB_CATEGORIES`     → Composición final usada por el sidebar
 *
 * Las constantes son `as const` cuando aplica para preservar inferencia
 * estrecha de tipos.
 */

import type { ComponentType } from "react";
import {
  Wallet,
  Heart,
  HandCoins,
  Banknote,
  Store,
  Palette,
  SlidersHorizontal,
  Zap,
  BarChart3,
  Gauge,
  Inbox,
  BotMessageSquare,
  Receipt,
  Warehouse,
  BadgePercent,
  PackagePlus,
  ClipboardCheck,
  TimerReset,
  TrendingUp,
  ChefHat,
  Repeat,
  Gift,
  HeartHandshake,
  Radio,
  Share2,
  UserPlus,
  TreePine,
  Leaf,
  Megaphone,
  ClipboardList,
  Truck,
} from "@buleje/design-system/icons";
import type { Tab } from "./tabs.types";

// Modules that ship with auto-seeded demo data and their API cleanup endpoint
export const DEMO_DATA_MODULES: Partial<Record<Tab, { label: string; api?: string }>> = {
  inventario: {
    label: "24 productos de ejemplo cargados al inicio",
    api: "/api/admin/demo-products",
  },
};

// Rich metadata for every module: icon, color, priority, description and a helpful tip
export const MODULE_INFO: Partial<
  Record<Tab, { icon: ComponentType<{ className?: string }>; iconColor: string; priority: "core" | "high" | "medium" | "low"; desc: string; tip: string }>
> = {
  "vendor-dashboard": {
    icon: Gauge,
    iconColor: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    priority: "core",
    desc: "Inicio del admin con resumen general y accesos a los dashboards clave del negocio.",
    tip: "Empieza aqui para ver ventas, stock, clientes, compras y marketplace en una sola entrada.",
  },
  "asistente-ia": {
    icon: BotMessageSquare,
    iconColor: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    priority: "core",
    desc: "Dashboard IA, chat con asistente y centro de alertas del negocio.",
    tip: "Empieza aquí cada mañana para tener el pulso del negocio.",
  },
  "ai-command": {
    icon: BotMessageSquare,
    iconColor: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    priority: "medium",
    desc: "Comandos rápidos al asistente IA para ejecutar acciones del negocio.",
    tip: "Dale órdenes naturales y deja que IA haga el trabajo pesado.",
  },
  "sugerencias-ia": {
    icon: BotMessageSquare,
    iconColor: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    priority: "medium",
    desc: "Recomendaciones automáticas de IA sobre el negocio.",
    tip: "Revísalo antes de tomar decisiones importantes.",
  },
  "metas-logros": {
    icon: BotMessageSquare,
    iconColor: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    priority: "medium",
    desc: "Objetivos comerciales y progreso hacia ellos.",
    tip: "Mantén foco en lo que realmente mueve la aguja.",
  },
  "ventas-caja": {
    icon: Receipt,
    iconColor: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    priority: "core",
    desc: "Punto de venta, caja, arqueos, ventas rápidas, offline y comisiones.",
    tip: "Úsalo para cobrar, revisar caja y operar ventas sin salir del panel.",
  },
  inventario: {
    icon: Warehouse,
    iconColor: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
    priority: "core",
    desc: "Stock, movimientos de stock, vencimientos, mermas y alertas de inventario.",
    tip: "Control completo del inventario desde una sola vista.",
  },
  productos: {
    icon: BadgePercent,
    iconColor: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
    priority: "high",
    desc: "Catálogo, categorías, ofertas, cupones e historial de precios.",
    tip: "Gestiona tu catálogo y optimiza precios.",
  },
  compras: {
    icon: PackagePlus,
    iconColor: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
    priority: "high",
    desc: "Pedidos a proveedor, directorio de proveedores y recepción.",
    tip: "Flujo completo de compras desde la cotización hasta la recepción.",
  },
  plata: {
    icon: Wallet,
    iconColor: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    priority: "high",
    desc: "Ingresos, egresos, gastos, ganancias, reportes y exportación.",
    tip: "Visión financiera completa del negocio en un solo módulo.",
  },
  clientes: {
    icon: Heart,
    iconColor: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    priority: "high",
    desc: "CRM, delivery, opiniones y programa de fidelización.",
    tip: "Conoce a tus clientes y personaliza la atención.",
  },
  config: {
    icon: SlidersHorizontal,
    iconColor: "text-slate-500 dark:text-slate-400",
    priority: "core",
    desc: "Usuarios, permisos, plan y configuración de la página web.",
    tip: "Configura esto primero para que todo funcione correctamente.",
  },
  pedidos: {
    icon: ClipboardCheck,
    iconColor: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    priority: "core",
    desc: "Gestiona pedidos recibidos, su estado, asignación y entrega.",
    tip: "Centraliza pedidos de WhatsApp, tienda online y mostrador.",
  },
  plan: {
    icon: Zap,
    iconColor: "text-slate-500 dark:text-slate-400",
    priority: "medium",
    desc: "Tu plan actual, límites y opciones de mejora.",
    tip: "Revisa tu plan para aprovechar al máximo la plataforma.",
  },
  fiados: {
    icon: HandCoins,
    iconColor: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    priority: "high",
    desc: "Control de créditos informales: registro, pagos y saldos pendientes.",
    tip: "Lleva la cuenta de lo que te deben tus clientes de confianza.",
  },
  turnos: {
    icon: TimerReset,
    iconColor: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    priority: "high",
    desc: "Apertura y cierre de turnos con conteo de efectivo.",
    tip: "Control de caja por turno para saber exactamente cuánto entró.",
  },
  prestamos: {
    icon: Banknote,
    iconColor: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    priority: "medium",
    desc: "Préstamos a clientes con cuotas, interés y tabla de amortización.",
    tip: "Gestiona préstamos con calculadora integrada y seguimiento de pagos.",
  },
  "analytics-pro": {
    icon: BarChart3,
    iconColor: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    priority: "high",
    desc: "Métricas del negocio, ventas, conversión y tendencias para tomar decisiones.",
    tip: "Aquí ves la película completa del negocio, no solo la foto del día.",
  },
  forecasting: {
    icon: TrendingUp,
    iconColor: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    priority: "medium",
    desc: "Proyección de demanda y apoyo para reposición inteligente.",
    tip: "Anticípate a quiebres y compras urgentes con datos históricos.",
  },
  rendimiento: {
    icon: Gauge,
    iconColor: "text-slate-400 dark:text-slate-300",
    priority: "medium",
    desc: "Salud técnica, velocidad web, navegador y recursos del sistema.",
    tip: "Útil cuando quieres revisar si el sistema está corriendo fino o pesado.",
  },
  auditoria: {
    icon: Gauge,
    iconColor: "text-slate-400 dark:text-slate-300",
    priority: "medium",
    desc: "Registro de actividad y trazabilidad de cambios dentro del panel.",
    tip: "Te ayuda a saber quién hizo qué y cuándo.",
  },
  "support-inbox": {
    icon: Inbox,
    iconColor: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    priority: "medium",
    desc: "Bandeja unificada de mensajes, WhatsApp y reseñas pendientes.",
    tip: "Úsala para responder soporte sin perderte entre varios frentes.",
  },
  "leads-funnel": {
    icon: UserPlus,
    iconColor: "text-[var(--accent)]",
    priority: "high",
    desc: "Funnel de leads captados (outbound WhatsApp + ads + referidos). Conversión + status workflow.",
    tip: "Cada lead que llena el formulario aparece acá. Movele el status a 'contacted' cuando lo llames.",
  },
  "pagina-inicio": {
    icon: Store,
    iconColor: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    priority: "medium",
    desc: "El contenido público de tu storefront: hero, branding marketplace y promociones del home.",
    tip: "Para colores, logo y tema general, usá 'Identidad y tema'. Para productos/combos/descuentos, usá los módulos dedicados.",
  },
  // ── ENRICH-5: bridges admin para marketplace features ──
  subscriptions: {
    icon: Repeat,
    iconColor: "text-[var(--accent)]",
    priority: "medium",
    desc: "Bodega al Mes: suscripciones recurrentes de canastas mensuales.",
    tip: "Monitorea MRR, churn y canastas programadas.",
  },
  "gift-cards-admin": {
    icon: Gift,
    iconColor: "text-[var(--accent)]",
    priority: "medium",
    desc: "Gift cards vendidas en marketplace. Validar códigos, cancelar o emitir manualmente.",
    tip: "Controla saldo pendiente y gift cards próximas a vencer.",
  },
  "socio-members": {
    icon: HeartHandshake,
    iconColor: "text-[var(--accent)]",
    priority: "medium",
    desc: "Programa Socio Buleje: miembros con precios exclusivos y cashback.",
    tip: "Mide MRR del programa y gestiona ofertas Socio.",
  },
  "lives-admin": {
    icon: Radio,
    iconColor: "text-[var(--data-error-500)]",
    priority: "medium",
    desc: "Transmisiones en vivo para mostrar productos y vender en directo.",
    tip: "Programa lives con productos destacados y mide performance.",
  },
  // ── Crecimiento (Marketing & Fidelización) ──
  campanas: {
    icon: Megaphone,
    iconColor: "text-[var(--accent)]",
    priority: "high",
    desc: "Campañas segmentadas por WhatsApp/email + automatizaciones de marketing.",
    tip: "Crea una campaña desde un segmento en un clic para que tus clientes vuelvan.",
  },
  puntos: {
    icon: Heart,
    iconColor: "text-[var(--accent)]",
    priority: "medium",
    desc: "Programa de puntos y fidelización: acumulación, canje y reglas.",
    tip: "Premia a tus clientes frecuentes para que compren más seguido.",
  },
  canales: {
    icon: Share2,
    iconColor: "text-[var(--accent)]",
    priority: "medium",
    desc: "Canales de venta social: conectá TikTok Shop y Meta (Facebook + Instagram).",
    tip: "Pegá tus Pixel IDs y los eventos se activan en tu tienda para optimizar anuncios.",
  },
  // ── Equipo ──
  tareas: {
    icon: ClipboardList,
    iconColor: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    priority: "medium",
    desc: "Tareas del equipo con prioridad, estado y asignación.",
    tip: "Coordina pendientes del día sin perderlos entre conversaciones.",
  },
  notas: {
    icon: ClipboardList,
    iconColor: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    priority: "low",
    desc: "Notas de turno y recordatorios tipo sticky.",
    tip: "Deja anotado lo importante para el siguiente turno.",
  },
  // ── Dropshipping (ADR-298) ──
  dropship: {
    icon: Truck,
    iconColor: "text-[var(--accent)]",
    priority: "high",
    desc: "Envíos al proveedor automáticos cuando se paga un pedido (el proveedor despacha al cliente).",
    tip: "Para tiendas dropshipping: vinculá productos a proveedores y trackeá los envíos.",
  },
  // ── Recetas (vertical comida — restaurante) ──
  recetas: {
    icon: ChefHat,
    iconColor: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
    priority: "high",
    desc: "Recetas, producción y recetario: define platos, su costo por insumos y descuenta stock al producir.",
    tip: "Para negocios de comida: arma cada plato con sus ingredientes y controlá el costo real.",
  },
};

export type TabCategory = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  tabs: Tab[];
  /**
   * Si true, la categoría SIEMPRE se renderiza como grupo desplegable en el
   * sidebar — aunque tenga un solo tab visible. Por default una categoría de
   * 1 tab colapsa a enlace directo (ej. Ventas). Las especializaciones lo
   * fuerzan para que "Agricultura" muestre su header aunque solo tenga Cacao.
   */
  alwaysGroup?: boolean;
};

// ── Sidebar modules v6 — reorganized by FUNCTIONAL AREA (2026-04-18) ────────
//
// Antes (v5): metáforas ambiguas — "Cobrar", "Crecer", "Conocer". El dueño
// no sabía dónde buscar (¿"plata" está en Cobrar o en Conocer?).
//
// Ahora (v6): nombres FUNCIONALES directos — el dueño lee el label y sabe
// exactamente qué hay adentro. Agrupación por AREA DE NEGOCIO, no por
// outcome ni metáfora.
//
// 7 categorías (Miller's Law 7±2):
//   01 Inicio              → Dashboard + IA
//   02 Ventas              → POS, pedidos, facturación, documentos de venta
//   03 Compras             → Pedidos a proveedor, contratos
//   04 Productos e inventario → Catálogo + stock
//   05 Clientes            → CRM, fiados, préstamos, chat, soporte
//   06 Gráficos            → Analytics, forecast, rendimiento, finanzas
//   07 Marketplace         → Tienda online, delivery, subs, gift cards, socio, lives
//
// Mi Tienda (personalización) + Config quedan como módulos separados.
export const BASIC_MODULES: TabCategory[] = [
  // ── 01 · INICIO ──────────────────────────────────
  // Lo primero que ve el dueño al entrar. Overview + IA + metas.
  {
    id: "inicio",
    label: "Inicio",
    icon: Gauge,
    // "asistente-ia" abre AsistenteIAHubModule, que YA contiene Chat / Comandos /
    // Sugerencias como sub-tabs internas (consolidacion 3->1). Antes el sidebar
    // listaba los 3 ids (asistente-ia/ai-command/sugerencias-ia) → 3 enlaces que
    // abrian el MISMO hub. Ahora una sola entrada "Asistente IA"; las otras 2
    // siguen accesibles desde la barra de sub-tabs del hub.
    tabs: [
      "vendor-dashboard",
      "asistente-ia",
      "metas-logros",
    ],
  },

  // ── 02 · VENTAS ──────────────────────────────────
  // POS + pedidos + el hub de Documentos. "documentos" abre DocumentosHubModule,
  // que ya contiene Facturación SUNAT / Cotizaciones / Guías / Notas / Contratos
  // / Drive como sub-tabs (compresión 2026-06-16: 1 entrada en vez de 6).
  {
    id: "ventas",
    label: "Ventas",
    icon: Receipt,
    tabs: [
      "ventas-caja",
      "pedidos",
      "documentos",
    ],
  },

  // ── 03 · COMPRAS ─────────────────────────────────
  // Pedidos a proveedor. (contratos → hub de Documentos en Ventas.)
  {
    id: "compras",
    label: "Compras",
    icon: PackagePlus,
    // "dropship" se auto-oculta por el filtro vertical: solo aparece en tiendas
    // dropshipping (vertical "otro", que lo tiene en enabled). El gate semántico
    // real es Settings.dropshipEnabled (el módulo lo respeta). ADR-298.
    tabs: [
      "compras",
      "dropship",
    ],
  },

  // ── 04 · PRODUCTOS E INVENTARIO ──────────────────
  // El catálogo + el stock. Lo físico del negocio.
  {
    id: "productos-inventario",
    label: "Productos e inventario",
    icon: Warehouse,
    // "recetas" se auto-oculta por el filtro vertical: solo aparece en negocios
    // de comida (vertical "restaurante", que lo tiene en modules.enabled). Para
    // bodega/otros NO está en su enabled → oculto. Era un módulo huérfano (1446
    // LOC, /api/recetas) que ruteaba pero no estaba en ningún menú. Brandon 2026-06-21.
    tabs: [
      "productos",
      "inventario",
      "recetas",
    ],
  },

  // ── 05 · CLIENTES ────────────────────────────────
  // CRM (con Leads dentro) + Mensajes. "marketplace-chat" abre MensajesHubModule
  // (chat + soporte). leads → sub-tab de CRM. (Créditos/préstamos en Finanzas.)
  {
    id: "clientes",
    label: "Clientes",
    icon: Heart,
    tabs: [
      "clientes",
      "whatsapp-inbox",
      "marketplace-chat",
    ],
  },

  // ── 05b · CRECIMIENTO (Marketing & Fidelización) ──
  // Hub único que reúne TODO lo que hace volver al cliente. Antes estaba
  // disperso y/o invisible: campañas/puntos/segmentos/RFM eran huérfanos (sin
  // entrada en el sidebar) y los 4 programas (gift cards, socio, suscripciones,
  // lives) vivían enterrados como sub-tabs del Marketplace. Ahora UNA categoría
  // visible cuyos accesos directos abren el CrecimientoHubModule en su sub-tab.
  // (segmentos y RFM quedan como sub-tabs internos del hub, a 1 click.)
  {
    id: "crecimiento",
    label: "Crecimiento",
    icon: Megaphone,
    tabs: [
      "campanas",
      "puntos",
      "gift-cards-admin",
      "socio-members",
      "subscriptions",
      "lives-admin",
    ],
  },

  // ── 06 · FINANZAS ────────────────────────────────
  // "plata" abre FinanzasModule (P&L, gastos, flujo, tesorería + Fiados,
  // Préstamos, Adelantos, Activos, Por cobrar, Scoring como sub-tabs).
  // Estos 7 son ACCESOS DIRECTOS clave desde el sidebar: el dueño llega de un
  // click a "lo que le deben" (Por cobrar/Fiados/Préstamos) y a su capital
  // (Adelantos/Activos) + Scoring crediticio, sin entrar al hub a buscar la
  // sub-tab. P&G, Gastos, Flujo, Tesorería y Reportes viven dentro del
  // dashboard de Mi Plata (su barra de sub-tabs interna). Brandon 2026-06-19.
  {
    id: "finanzas",
    label: "Finanzas",
    icon: Wallet,
    tabs: [
      "plata",
      "por-cobrar",
      "fiados",
      "prestamos",
      "adelantos",
      "activos",
      "scoring",
    ],
  },

  // ── 07 · GRÁFICOS ────────────────────────────────
  // Visión estratégica: analytics + forecast (ambos abren AnalisisHubModule).
  // (rendimiento técnico movido a la categoría Sistema.)
  {
    id: "graficos",
    label: "Análisis",
    icon: BarChart3,
    // "analytics-pro" abre AnalisisHubModule (Analytics Pro + Predicción + Inteligencia).
    tabs: [
      "analytics-pro",
    ],
  },

  // ── 07 · MARKETPLACE ─────────────────────────────
  // "marketplace" abre MarketplaceModule (tienda + comisiones + cupones +
  // Suscripciones/Gift Cards/Socio/Lives como sub-tabs). Delivery aparte.
  {
    id: "marketplace-ops",
    label: "Marketplace",
    icon: Store,
    tabs: [
      "marketplace",
      // Canales de venta social (TikTok Shop + Meta pixel + GA4). Vive bajo el
      // super-grupo "Canales" del sidebar (la categoría "crecimiento" no se
      // renderiza en el sidebar curado; acá SÍ aparece). Brandon 2026-07-03.
      "canales",
      "delivery-partners",
      "delivery-live",
    ],
  },

  // ── 09 · EQUIPO ──────────────────────────────────
  // Herramientas operativas internas (tareas + notas de turno). Estaban
  // construidas y sanas pero huérfanas (sin entrada en el sidebar vivo). Abren
  // el EquipoHubModule en su sub-tab. Brandon 2026-06-21.
  {
    id: "equipo",
    label: "Equipo",
    icon: ClipboardList,
    tabs: [
      "tareas",
      "notas",
    ],
  },
];

// ── Módulo Mi Tienda (personalización visual) ─────────────────────────────────
export const TIENDA_MODULE: TabCategory = {
  id: "mi-tienda",
  label: "Mi Tienda",
  icon: Palette,
  tabs: ["store-customizer", "pagina-inicio"],
};

// ── Módulos de Especialización por vertical (ADR-124) ──────────────────────────
// Tabs verticales habilitables por superadmin, agrupados por VERTICAL de negocio
// (Brandon 2026-05-29: separar Forestal de Agricultura — son cosas distintas).
// El render del sidebar SOLO muestra cada tab si:
//   1. allowedTabs lo incluye (rol+plan pasan — spec bypassa plan filter)
//   2. La feature flag de spec está enabled para el tenant
// Cada categoría se auto-oculta si NINGÚN tab suyo está visible (catTabs.length
// === 0 en el sidebar) — así un tenant solo-forestal no ve "Agricultura" y
// viceversa. Mantener sincronizado con lib/specializations.ts (vertical).
export const FORESTAL_MODULE: TabCategory = {
  id: "forestal",
  label: "Forestal",
  icon: TreePine,
  alwaysGroup: true,
  // Cuando gtf-emisor entre al Tab union (ADR-124 Fase futura) se suma acá.
  tabs: ["ctp-libro-operaciones", "forestal-lotes", "loth-libro-operaciones", "forestal-herramientas", "forestal-tramites"],
};

export const AGRICULTURA_MODULE: TabCategory = {
  id: "agricultura",
  label: "Agricultura",
  icon: Leaf,
  alwaysGroup: true, // 1 solo tab (Cacao) pero igual muestra header "Agricultura"
  tabs: ["cacao-acopio"],
};

// ── Módulo Config (siempre visible desde dropdown de usuario) ────────────────
export const CONFIG_MODULE: TabCategory = {
  id: "config",
  label: "Configuración",
  icon: SlidersHorizontal,
  // auditoria queda también acá (dropdown de Config, vía de acceso en Modo Fácil)
  // además de en SISTEMA_MODULE (categoría sidebar, Modo Avanzado).
  tabs: ["config", "plan", "auditoria"],
};

// ── Módulo Sistema (técnico) — rendimiento + auditoría + colas ───────────────
// Las 3 entradas abren SistemaHubModule (cada una en su sub-tab). Antes vivían
// dispersas: rendimiento en Análisis, auditoría en Config, colas sin sidebar.
export const SISTEMA_MODULE: TabCategory = {
  id: "sistema",
  label: "Sistema",
  icon: Gauge,
  alwaysGroup: true,
  tabs: ["rendimiento", "auditoria", "colas"],
};

// ── TAB_CATEGORIES: composición final del sidebar ────────────────────────────
// (Config y Plan se acceden desde el dropdown de usuario, no desde el sidebar)
//
// Orden 2026-05-28:
// 1. BASIC_MODULES (inicio → ventas → compras → productos → clientes → finanzas → marketplace)
// 2. FORESTAL_MODULE + AGRICULTURA_MODULE — ANTES de Mi Tienda. Razón: el footer
//    fijo del sidebar tapaba el último item del nav scrollable en viewports
//    estándar (1080p). Las especializaciones están activas para tenants que las
//    habilitan; ponerlas arriba las hace descubribles sin scroll. Cada una
//    auto-oculta si vacía (tenant solo-forestal no ve Agricultura y viceversa).
// 3. TIENDA_MODULE — al final (configuración visual, menos frecuente).
// Orden 2026-08-02 (Brandon: "categorías más ordenadas y manejables"): las
// categorías se agrupan en SECCIONES con encabezado en el sidebar
// (`SECTION_BEFORE` en AdminSidebar), y una sección sólo se lee como bloque si
// sus categorías van seguidas. Antes el orden las intercalaba —"Equipo" caía
// después de "Marketplace"— así que ningún encabezado agrupaba algo contiguo.
//
//   Inicio            (sin encabezado: es el punto de entrada)
//   Operaciones       ventas · compras · productos-inventario
//   Clientes          clientes · crecimiento
//   Gestión           finanzas · graficos · equipo
//   Canales           marketplace-ops · mi-tienda
//   Especializaciones forestal · agricultura
//   Sistema           sistema
const byId = (id: string) => BASIC_MODULES.find((c) => c.id === id)!;

/**
 * Encabezado de sección que se dibuja ANTES de esta categoría.
 *
 * Single source: lo leen el sidebar de escritorio y el drawer móvil. Vivía
 * dentro de AdminSidebar, así que el drawer agrupaba por CATEGORÍA (14
 * encabezados) mientras el escritorio agrupaba por SECCIÓN (6) — el mismo menú
 * con dos organizaciones distintas según el ancho de pantalla.
 *
 * "Inicio" no lleva encabezado a propósito: es el punto de entrada, no un grupo.
 */
export const SECTION_BEFORE: Record<string, string> = {
  ventas: "Operaciones",
  clientes: "Clientes",
  finanzas: "Gestión",
  "marketplace-ops": "Canales",
  forestal: "Especializaciones",
  sistema: "Sistema",
};

export const TAB_CATEGORIES: TabCategory[] = [
  byId("inicio"),
  // Operaciones — lo que pasa cada día en el mostrador y el almacén
  byId("ventas"),
  byId("compras"),
  byId("productos-inventario"),
  // Clientes — quién compra y qué lo hace volver
  byId("clientes"),
  byId("crecimiento"),
  // Gestión — la plata, los números y el equipo
  byId("finanzas"),
  byId("graficos"),
  byId("equipo"),
  // Canales — por dónde vende
  byId("marketplace-ops"),
  TIENDA_MODULE,
  // Especializaciones por vertical
  FORESTAL_MODULE,
  AGRICULTURA_MODULE,
  // Sistema
  SISTEMA_MODULE,
];

// ── Modo Fácil vs Avanzado ──────────────────────────────────────────────────
// Modo Fácil: solo las secciones esenciales del día a día.
// Modo Avanzado: todo visible (Documentos, Analytics Pro, Finanzas avanzadas, Sistema).
export const EASY_MODE_TABS: ReadonlySet<Tab> = new Set<Tab>([
  // Inicio
  "vendor-dashboard",
  // Centro IA
  "ai-command", "sugerencias-ia", "asistente-ia",
  // Metas y Logros
  "metas-logros",
  // Ventas y Caja
  "ventas-caja", "pedidos",
  // Productos
  "productos",
  // Inventario
  "inventario",
  // Compras
  "compras",
  // Clientes y Créditos
  "clientes", "fiados", "prestamos",
  // Marketplace
  "marketplace", "delivery-partners", "delivery-live",
  // Comunicación
  "marketplace-chat", "whatsapp-inbox",
  // Mi Tienda
  "store-customizer", "pagina-inicio",
  // Config (siempre visible)
  "config", "plan", "mi-perfil",
]);

// Tabs que solo se muestran en Modo Avanzado (no incluidos en EASY_MODE_TABS):
// - analytics-pro                    → Analytics Pro
// - plata, facturacion, forecasting  → Finanzas
// - cotizaciones, guias-remision, notas-credito, contratos → Documentos
// - support-inbox, rendimiento, colas, auditoria           → Sistema
