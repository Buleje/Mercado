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
  Brain,
  ShoppingCart,
  Package,
  Tag,
  Truck,
  DollarSign,
  Users,
  CreditCard,
  Clock,
  FlaskConical,
  Landmark,
  Shield,
  RotateCcw,
  FileText,
  Store,
  Palette,
  Settings,
} from "lucide-react";
import type { Tab } from "./tabs.types";

// Modules that ship with auto-seeded demo data and their API cleanup endpoint
export const DEMO_DATA_MODULES: Partial<Record<Tab, { label: string; api?: string }>> = {
  inventario: {
    label: "24 productos de ejemplo cargados al inicio",
    api: "/api/admin/demo-products",
  },
};

// Rich metadata for every module: emoji, priority, description and a helpful tip
export const MODULE_INFO: Partial<
  Record<Tab, { emoji: string; priority: "core" | "high" | "medium" | "low"; desc: string; tip: string }>
> = {
  "asistente-ia": {
    emoji: "🧠",
    priority: "core",
    desc: "Dashboard IA, chat con asistente y centro de alertas del negocio.",
    tip: "Empieza aquí cada mañana para tener el pulso del negocio.",
  },
  "ventas-caja": {
    emoji: "🖥️",
    priority: "core",
    desc: "Punto de venta, caja registradora, arqueo, pedidos y cuentas por cobrar.",
    tip: "Todo lo que necesitas para operar el mostrador en un solo lugar.",
  },
  inventario: {
    emoji: "📦",
    priority: "core",
    desc: "Stock, Kardex, vencimientos, mermas y alertas de inventario.",
    tip: "Control completo del inventario desde una sola vista.",
  },
  productos: {
    emoji: "🏪",
    priority: "high",
    desc: "Catálogo, categorías, ofertas, cupones e historial de precios.",
    tip: "Gestiona tu catálogo y optimiza precios.",
  },
  compras: {
    emoji: "📋",
    priority: "high",
    desc: "Pedidos a proveedor, directorio de proveedores y recepción.",
    tip: "Flujo completo de compras desde la cotización hasta la recepción.",
  },
  plata: {
    emoji: "💵",
    priority: "high",
    desc: "Ingresos, egresos, gastos, ganancias, reportes y exportación.",
    tip: "Visión financiera completa del negocio en un solo módulo.",
  },
  clientes: {
    emoji: "👥",
    priority: "high",
    desc: "CRM, delivery, opiniones y programa de fidelización.",
    tip: "Conoce a tus clientes y personaliza la atención.",
  },
  config: {
    emoji: "⚙️",
    priority: "core",
    desc: "Usuarios, permisos, plan y configuración de la página web.",
    tip: "Configura esto primero para que todo funcione correctamente.",
  },
  pedidos: {
    emoji: "🛒",
    priority: "core",
    desc: "Gestiona pedidos recibidos, su estado, asignación y entrega.",
    tip: "Centraliza pedidos de WhatsApp, tienda online y mostrador.",
  },
  plan: {
    emoji: "⚡",
    priority: "medium",
    desc: "Tu plan actual, límites y opciones de mejora.",
    tip: "Revisa tu plan para aprovechar al máximo la plataforma.",
  },
  fiados: {
    emoji: "💰",
    priority: "high",
    desc: "Control de créditos informales: registro, pagos y saldos pendientes.",
    tip: "Lleva la cuenta de lo que te deben tus clientes de confianza.",
  },
  turnos: {
    emoji: "⏱️",
    priority: "high",
    desc: "Apertura y cierre de turnos con conteo de efectivo.",
    tip: "Control de caja por turno para saber exactamente cuánto entró.",
  },
  recetas: {
    emoji: "🍳",
    priority: "medium",
    desc: "Recetas de producción con ingredientes y control de lotes.",
    tip: "Calcula costos de producción y descuenta stock automáticamente.",
  },
  prestamos: {
    emoji: "🏦",
    priority: "medium",
    desc: "Préstamos a clientes con cuotas, interés y tabla de amortización.",
    tip: "Gestiona préstamos con calculadora integrada y seguimiento de pagos.",
  },
};

export type TabCategory = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  tabs: Tab[];
};

// ── 17 módulos básicos del sidebar ──────────────────────────────────────────
export const BASIC_MODULES: TabCategory[] = [
  {
    id: "asistente-ia",
    label: "IA & Analítica",
    icon: Brain,
    tabs: ["asistente-ia", "analytics-pro"],
  },
  {
    id: "ventas-caja",
    label: "Ventas & Caja",
    icon: ShoppingCart,
    tabs: ["ventas-caja", "pedidos"],
  },
  {
    id: "inventario",
    label: "Inventario",
    icon: Package,
    tabs: ["inventario"],
  },
  {
    id: "productos",
    label: "Productos & Precios",
    icon: Tag,
    tabs: ["productos"],
  },
  {
    id: "compras-mod",
    label: "Compras",
    icon: Truck,
    tabs: ["compras"],
  },
  {
    id: "plata",
    label: "Mi Plata",
    icon: DollarSign,
    tabs: ["plata"],
  },
  {
    id: "clientes",
    label: "Mis Clientes",
    icon: Users,
    tabs: ["clientes"],
  },
  {
    id: "fiados",
    label: "Fíados",
    icon: CreditCard,
    tabs: ["fiados"],
  },
  {
    id: "turnos",
    label: "Turnos",
    icon: Clock,
    tabs: ["turnos"],
  },
  {
    id: "recetas",
    label: "Recetas",
    icon: FlaskConical,
    tabs: ["recetas"],
  },
  {
    id: "prestamos",
    label: "Préstamos",
    icon: Landmark,
    tabs: ["prestamos"],
  },
  {
    id: "auditoria",
    label: "Auditoría",
    icon: Shield,
    tabs: ["auditoria"],
  },
  {
    id: "devoluciones-proveedor",
    label: "Devoluciones",
    icon: RotateCcw,
    tabs: ["devoluciones-proveedor"],
  },
  {
    id: "tesoreria",
    label: "Tesorería",
    icon: Landmark,
    tabs: ["tesoreria"],
  },
  {
    id: "promociones",
    label: "Promociones",
    icon: Tag,
    tabs: ["promociones"],
  },
  {
    id: "scoring",
    label: "Scoring Crédito",
    icon: Shield,
    tabs: ["scoring"],
  },
  {
    id: "documentos",
    label: "Documentos",
    icon: FileText,
    tabs: ["cotizaciones", "guias-remision", "notas-credito", "contratos"],
  },
  {
    id: "marketplace-ops",
    label: "Marketplace",
    icon: Store,
    tabs: ["marketplace", "delivery-partners", "delivery-live"],
  },
];

// ── Módulo Mi Tienda (personalización visual) ─────────────────────────────────
export const TIENDA_MODULE: TabCategory = {
  id: "mi-tienda",
  label: "Mi Tienda",
  icon: Palette,
  tabs: ["store-customizer"],
};

// ── Módulo Config (siempre visible desde dropdown de usuario) ────────────────
export const CONFIG_MODULE: TabCategory = {
  id: "config",
  label: "Configuración",
  icon: Settings,
  tabs: ["config", "plan"],
};

// ── TAB_CATEGORIES: composición final del sidebar ────────────────────────────
// (Config y Plan se acceden desde el dropdown de usuario, no desde el sidebar)
export const TAB_CATEGORIES: TabCategory[] = [...BASIC_MODULES, TIENDA_MODULE];
