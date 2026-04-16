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
  Trophy,
  BotMessageSquare,
  Receipt,
  Warehouse,
  BadgePercent,
  PackagePlus,
  ClipboardCheck,
  TimerReset,
  TrendingUp,
  Wand2,
  FileText,
} from "lucide-react";
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
    iconColor: "text-emerald-600 dark:text-emerald-400",
    priority: "core",
    desc: "Inicio del admin con resumen general y accesos a los dashboards clave del negocio.",
    tip: "Empieza aqui para ver ventas, stock, clientes, compras y marketplace en una sola entrada.",
  },
  "asistente-ia": {
    icon: BotMessageSquare,
    iconColor: "text-rose-500 dark:text-rose-400",
    priority: "core",
    desc: "Dashboard IA, chat con asistente y centro de alertas del negocio.",
    tip: "Empieza aquí cada mañana para tener el pulso del negocio.",
  },
  "ventas-caja": {
    icon: Receipt,
    iconColor: "text-emerald-600 dark:text-emerald-400",
    priority: "core",
    desc: "Punto de venta, caja, arqueos, ventas rápidas, offline y comisiones.",
    tip: "Úsalo para cobrar, revisar caja y operar ventas sin salir del panel.",
  },
  inventario: {
    icon: Warehouse,
    iconColor: "text-amber-500 dark:text-amber-400",
    priority: "core",
    desc: "Stock, movimientos de stock, vencimientos, mermas y alertas de inventario.",
    tip: "Control completo del inventario desde una sola vista.",
  },
  productos: {
    icon: BadgePercent,
    iconColor: "text-amber-500 dark:text-amber-400",
    priority: "high",
    desc: "Catálogo, categorías, ofertas, cupones e historial de precios.",
    tip: "Gestiona tu catálogo y optimiza precios.",
  },
  compras: {
    icon: PackagePlus,
    iconColor: "text-amber-600 dark:text-amber-400",
    priority: "high",
    desc: "Pedidos a proveedor, directorio de proveedores y recepción.",
    tip: "Flujo completo de compras desde la cotización hasta la recepción.",
  },
  plata: {
    icon: Wallet,
    iconColor: "text-emerald-600 dark:text-emerald-400",
    priority: "high",
    desc: "Ingresos, egresos, gastos, ganancias, reportes y exportación.",
    tip: "Visión financiera completa del negocio en un solo módulo.",
  },
  clientes: {
    icon: Heart,
    iconColor: "text-violet-500 dark:text-violet-400",
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
    iconColor: "text-emerald-500 dark:text-emerald-400",
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
    iconColor: "text-emerald-500 dark:text-emerald-400",
    priority: "high",
    desc: "Control de créditos informales: registro, pagos y saldos pendientes.",
    tip: "Lleva la cuenta de lo que te deben tus clientes de confianza.",
  },
  turnos: {
    icon: TimerReset,
    iconColor: "text-emerald-500 dark:text-emerald-400",
    priority: "high",
    desc: "Apertura y cierre de turnos con conteo de efectivo.",
    tip: "Control de caja por turno para saber exactamente cuánto entró.",
  },
  prestamos: {
    icon: Banknote,
    iconColor: "text-emerald-500 dark:text-emerald-400",
    priority: "medium",
    desc: "Préstamos a clientes con cuotas, interés y tabla de amortización.",
    tip: "Gestiona préstamos con calculadora integrada y seguimiento de pagos.",
  },
  "analytics-pro": {
    icon: BarChart3,
    iconColor: "text-rose-500 dark:text-rose-400",
    priority: "high",
    desc: "Métricas del negocio, ventas, conversión y tendencias para tomar decisiones.",
    tip: "Aquí ves la película completa del negocio, no solo la foto del día.",
  },
  forecasting: {
    icon: TrendingUp,
    iconColor: "text-rose-500 dark:text-rose-400",
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
    iconColor: "text-violet-500 dark:text-violet-400",
    priority: "medium",
    desc: "Bandeja unificada de mensajes, WhatsApp y reseñas pendientes.",
    tip: "Úsala para responder soporte sin perderte entre varios frentes.",
  },
  "pagina-inicio": {
    icon: Store,
    iconColor: "text-teal-500 dark:text-teal-400",
    priority: "medium",
    desc: "Configura la página pública de tu tienda y cómo se presenta afuera.",
    tip: "Piensa en esto como la vidriera digital de tu negocio.",
  },
};

export type TabCategory = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  tabs: Tab[];
};

// ── Sidebar modules — organized by business workflow ────────────────────────
// Group 1: Daily operations (what you use every day)
// Group 2: Inventory & catalog (product management)
// Group 3: Money & clients (financial + CRM)
// Group 4: Growth & channels (marketplace, analytics)
// Group 5: Documents & production (back-office)
export const BASIC_MODULES: TabCategory[] = [
  {
    id: "inicio",
    label: "Inicio",
    icon: Gauge,
    tabs: ["vendor-dashboard"],
  },
  // ─── CENTRO IA ────────────────────────────────
  {
    id: "dashboard",
    label: "Centro IA",
    icon: Wand2,
    tabs: ["ai-command", "sugerencias-ia"],
  },
  // ─── CHAT IA ─────────────────────────────────
  {
    id: "chat-ia",
    label: "Chat IA",
    icon: BotMessageSquare,
    tabs: ["asistente-ia"],
  },
  // ─── METAS & LOGROS ──────────────────────────────
  {
    id: "metas",
    label: "Metas y Logros",
    icon: Trophy,
    tabs: ["metas-logros"],
  },
  // ─── VENTAS & OPERACIONES ──────────────────────
  {
    id: "ventas",
    label: "Ventas y Caja",
    icon: Receipt,
    tabs: ["ventas-caja", "pedidos"],
  },

  // ─── PRODUCTOS & STOCK ────────────────────────
  {
    id: "productos",
    label: "Promociones y Ofertas",
    icon: BadgePercent,
    tabs: ["productos"],
  },
  {
    id: "inventario",
    label: "Inventario",
    icon: Warehouse,
    tabs: ["inventario"],
  },
  {
    id: "compras",
    label: "Compras",
    icon: PackagePlus,
    tabs: ["compras"],
  },

  // ─── DINERO & CLIENTES ────────────────────────
  {
    id: "finanzas",
    label: "Finanzas",
    icon: Wallet,
    tabs: ["plata", "facturacion", "forecasting"],
  },
  {
    id: "clientes",
    label: "Clientes y Créditos",
    icon: Heart,
    tabs: ["clientes", "fiados", "prestamos"],
  },

  // ─── CANALES & CRECIMIENTO ────────────────────
  {
    id: "marketplace-ops",
    label: "Marketplace",
    icon: Store,
    tabs: ["marketplace", "delivery-partners", "delivery-live"],
  },
  // ─── COMUNICACIÓN ────────────────────────────
  {
    id: "comunicacion",
    label: "Comunicación",
    icon: BotMessageSquare,
    tabs: ["marketplace-chat"],
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: BarChart3,
    tabs: ["analytics-pro"],
  },

  // ─── DOCS ─────────────────────────────────────
  {
    id: "documentos",
    label: "Documentos",
    icon: FileText,
    tabs: ["cotizaciones", "guias-remision", "notas-credito", "contratos"],
  },

  {
    id: "sistema",
    label: "Sistema",
    icon: Gauge,
    tabs: ["support-inbox", "rendimiento", "colas", "auditoria"],
  },
];

// ── Módulo Mi Tienda (personalización visual) ─────────────────────────────────
export const TIENDA_MODULE: TabCategory = {
  id: "mi-tienda",
  label: "Mi Tienda",
  icon: Palette,
  tabs: ["store-customizer", "pagina-inicio"],
};

// ── Módulo Config (siempre visible desde dropdown de usuario) ────────────────
export const CONFIG_MODULE: TabCategory = {
  id: "config",
  label: "Configuración",
  icon: SlidersHorizontal,
  tabs: ["config", "plan", "auditoria"],
};

// ── TAB_CATEGORIES: composición final del sidebar ────────────────────────────
// (Config y Plan se acceden desde el dropdown de usuario, no desde el sidebar)
export const TAB_CATEGORIES: TabCategory[] = [...BASIC_MODULES, TIENDA_MODULE];

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
  "marketplace-chat",
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
