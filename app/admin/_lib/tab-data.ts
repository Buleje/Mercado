/**
 * app/admin/_lib/tab-data.ts
 *
 * Datos estáticos de los tabs del panel admin: id, label e icono.
 * Extraído de app/admin/page.tsx (Sprint A del refactor —
 * ver docs/refactor-giant-files-plan.md).
 *
 * Exporta:
 *  - `ALL_TABS`  → Array de todos los módulos del sistema (id + label + icon)
 *  - `TabItem`   → Tipo auxiliar inferido de ALL_TABS
 */

import {
  Brain,
  ShoppingCart,
  Package,
  Tag,
  Truck,
  DollarSign,
  Users,
  Settings,
  ShoppingBasket,
  Activity,
  Landmark,
  Zap,
  FlaskConical,
  ClipboardList,
  FileText,
  Store,
  Palette,
  CircleUser,
  LayoutDashboard,
  MessageCircle,
  TrendingUp,
  Inbox,
  Receipt,
} from "lucide-react";
import type { Tab } from "./tabs.types";

// ── 8 módulos consolidados + especiales ──────────────────────────────────────
export const ALL_TABS = [
  { id: "vendor-dashboard" as Tab,    label: "Mi Panel",            icon: LayoutDashboard },
  { id: "asistente-ia" as Tab,        label: "Asistente IA",        icon: Brain },
  // ventas-caja removido — usar Analytics Pro para métricas de ventas
  { id: "inventario" as Tab,          label: "Inventario",          icon: Package },
  { id: "productos" as Tab,           label: "Productos & Precios", icon: Tag },
  { id: "compras" as Tab,             label: "Compras",             icon: Truck },
  { id: "plata" as Tab,               label: "Mi Plata",            icon: DollarSign },
  { id: "clientes" as Tab,            label: "Mis Clientes",        icon: Users },
  // — OPERACIONES —
  { id: "config" as Tab,              label: "Configuración",       icon: Settings },
  { id: "pedidos" as Tab,             label: "Pedidos",             icon: ShoppingBasket },
  // — INTELIGENCIA —
  { id: "analytics-pro" as Tab,       label: "Analytics Pro",       icon: Activity },
  { id: "forecasting" as Tab,         label: "Predicción Demanda",  icon: TrendingUp },
  // — FINANZAS EXTRA —
  { id: "prestamos" as Tab,           label: "Préstamos",           icon: Landmark },
  { id: "plan" as Tab,                label: "Plan & Límites",      icon: Zap },
  // — PRODUCCIÓN —
  { id: "recetas" as Tab,             label: "Recetas",             icon: FlaskConical },
  // — FACTURACIÓN SUNAT —
  { id: "facturacion" as Tab,          label: "Facturación SUNAT",   icon: Receipt },
  // — DOCUMENTOS COMERCIALES —
  { id: "cotizaciones" as Tab,        label: "Cotizaciones",        icon: ClipboardList },
  { id: "guias-remision" as Tab,      label: "Guías de Remisión",   icon: Truck },
  { id: "notas-credito" as Tab,       label: "Notas de Crédito",    icon: FileText },
  { id: "contratos" as Tab,           label: "Contratos",           icon: FileText },
  // — MARKETPLACE & DELIVERY —
  { id: "marketplace" as Tab,         label: "Marketplace",         icon: Store },
  { id: "delivery-partners" as Tab,   label: "Delivery Partners",   icon: Truck },
  { id: "delivery-live" as Tab,       label: "Delivery en Vivo",    icon: Activity },
  { id: "marketplace-chat" as Tab,    label: "Chat Clientes",       icon: MessageCircle },
  // — MI TIENDA —
  { id: "store-customizer" as Tab,    label: "Mi Tienda",           icon: Palette },
  // — SISTEMA —
  { id: "colas" as Tab,               label: "Colas",               icon: Activity },
  { id: "mi-perfil" as Tab,           label: "Mi Perfil",           icon: CircleUser },
  // — SOPORTE —
  { id: "support-inbox" as Tab,       label: "Soporte",             icon: Inbox },
] as const;

/** Tipo auxiliar para un elemento del array ALL_TABS */
export type TabItem = typeof ALL_TABS[number];
