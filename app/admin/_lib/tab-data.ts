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
  Wand2,
  Lightbulb,
  Trophy,
  Truck,
  Wallet,
  Heart,
  SlidersHorizontal,
  ClipboardCheck,
  TimerReset,
  HandCoins,
  BarChart3,
  Banknote,
  Coins,
  CreditCard,
  Construction,
  Zap,
  ClipboardList,
  ShoppingBag,
  FileCheck,
  FileMinus,
  FileSignature,
  Palette,
  CircleUser,
  Gauge,
  BotMessageSquare,
  TrendingUp,
  Inbox,
  Receipt,
  Activity,
  Shield,
  Globe,
  Warehouse,
  BadgePercent,
  PackagePlus,
  MessageCircle,
  Archive as FolderArchive,
  UserPlus,
  TreePine,
  Layers,
  Wrench,
  Stamp,
  Leaf,
  Megaphone,
  Gift,
  HeartHandshake,
  Repeat,
  Radio,
  Share2,
  CheckSquare,
  StickyNote,
  ChefHat,
} from "@buleje/design-system/icons";
import type { Tab } from "./tabs.types";

// ── 8 módulos consolidados + especiales ──────────────────────────────────────
export const ALL_TABS = [
  { id: "vendor-dashboard" as Tab,    label: "Inicio",              icon: Gauge },
  { id: "asistente-ia" as Tab,        label: "Asistente IA",        icon: BotMessageSquare },
  { id: "ai-command" as Tab,          label: "Comandos IA",         icon: Wand2 },
  { id: "sugerencias-ia" as Tab,      label: "Sugerencias IA",      icon: Lightbulb },
  { id: "metas-logros" as Tab,        label: "Metas & Logros",      icon: Trophy },
  { id: "ventas-caja" as Tab,         label: "Ventas & Caja",       icon: Receipt },
  { id: "inventario" as Tab,          label: "Inventario",          icon: Warehouse },
  { id: "recetas" as Tab,             label: "Recetas",             icon: ChefHat },
  { id: "productos" as Tab,           label: "Promociones & Ofertas", icon: BadgePercent },
  { id: "compras" as Tab,             label: "Compras",             icon: PackagePlus },
  { id: "dropship" as Tab,            label: "Dropshipping",        icon: Truck },
  { id: "plata" as Tab,               label: "Mi Plata",            icon: Wallet },
  { id: "clientes" as Tab,            label: "Mis Clientes",        icon: Heart },
  { id: "leads-funnel" as Tab,        label: "Funnel de Leads",     icon: UserPlus },
  // — CRECIMIENTO (Marketing & Fidelización) — hub único, sub-tabs como accesos directos —
  { id: "campanas" as Tab,            label: "Campañas",            icon: Megaphone },
  { id: "puntos" as Tab,              label: "Puntos & Fidelización", icon: Heart },
  { id: "canales" as Tab,             label: "Canales de Venta",    icon: Share2 },
  { id: "gift-cards-admin" as Tab,    label: "Gift Cards",          icon: Gift },
  { id: "socio-members" as Tab,       label: "Socio Buleje",        icon: HeartHandshake },
  { id: "subscriptions" as Tab,       label: "Bodega al Mes",       icon: Repeat },
  { id: "lives-admin" as Tab,         label: "En Vivo",             icon: Radio },
  // — EQUIPO (huérfanos montados) —
  { id: "tareas" as Tab,              label: "Tareas",              icon: CheckSquare },
  { id: "notas" as Tab,               label: "Notas",               icon: StickyNote },
  // — OPERACIONES —
  { id: "config" as Tab,              label: "Configuración",       icon: SlidersHorizontal },
  { id: "pedidos" as Tab,             label: "Pedidos",             icon: ClipboardCheck },
  { id: "turnos" as Tab,              label: "Turnos de Caja",      icon: TimerReset },
  { id: "fiados" as Tab,              label: "Fiados",              icon: HandCoins },
  // — INTELIGENCIA —
  { id: "analytics-pro" as Tab,       label: "Analytics Pro",       icon: BarChart3 },
  { id: "forecasting" as Tab,         label: "Predicción Demanda",  icon: TrendingUp },
  // — FINANZAS EXTRA —
  { id: "prestamos" as Tab,           label: "Préstamos",           icon: Banknote },
  { id: "adelantos" as Tab,           label: "Adelantos",           icon: Coins },
  { id: "activos" as Tab,             label: "Activos & Maquinaria", icon: Construction },
  { id: "por-cobrar" as Tab,          label: "Por cobrar",          icon: CreditCard },
  { id: "scoring" as Tab,             label: "Scoring crediticio",  icon: Gauge },
  { id: "plan" as Tab,                label: "Plan & Límites",      icon: Zap },

  // — FACTURACIÓN SUNAT —
  { id: "facturacion" as Tab,          label: "Facturación SUNAT",   icon: FileCheck },
  // — DOCUMENTOS COMERCIALES —
  { id: "documentos" as Tab,          label: "Documentación",       icon: FolderArchive },
  { id: "cotizaciones" as Tab,        label: "Cotizaciones",        icon: ClipboardList },
  { id: "guias-remision" as Tab,      label: "Guías de Remisión",   icon: Truck },
  { id: "notas-credito" as Tab,       label: "Notas de Crédito",    icon: FileMinus },
  { id: "contratos" as Tab,           label: "Contratos",           icon: FileSignature },
  // — MARKETPLACE & DELIVERY —
  { id: "marketplace" as Tab,         label: "Marketplace",         icon: ShoppingBag },
  { id: "delivery-partners" as Tab,   label: "Delivery Partners",   icon: Truck },
  { id: "delivery-live" as Tab,       label: "Delivery en Vivo",    icon: Activity },
  { id: "marketplace-chat" as Tab,    label: "Chat Clientes",       icon: MessageCircle },
  { id: "whatsapp-inbox" as Tab,      label: "WhatsApp",            icon: MessageCircle },
  // — MI TIENDA —
  { id: "store-customizer" as Tab,    label: "Identidad y tema",    icon: Palette },
  { id: "pagina-inicio" as Tab,       label: "Mi tienda pública",   icon: Globe },
  // — SISTEMA —
  { id: "rendimiento" as Tab,         label: "Rendimiento",         icon: Gauge },
  { id: "auditoria" as Tab,           label: "Auditoría",           icon: Shield },
  { id: "colas" as Tab,               label: "Colas",               icon: Activity },
  { id: "mi-perfil" as Tab,           label: "Mi Perfil",           icon: CircleUser },
  // — SOPORTE —
  { id: "support-inbox" as Tab,       label: "Soporte",             icon: Inbox },
  // ── ESPECIALIZACIONES (ADR-124 / ADR-125) — solo visibles si el tenant las habilita
  { id: "ctp-libro-operaciones" as Tab, label: "Libro CTP (Forestal)", icon: TreePine },
  { id: "forestal-lotes" as Tab, label: "Lotes de Producción (Forestal)", icon: Layers },
  { id: "loth-libro-operaciones" as Tab, label: "Libro Títulos Hab. (Forestal)", icon: TreePine },
  { id: "forestal-herramientas" as Tab, label: "Herramientas Forestales", icon: Wrench },
  { id: "forestal-tramites" as Tab, label: "Trámites y Oficios (Forestal)", icon: Stamp },
  { id: "cacao-acopio" as Tab, label: "Acopio de Cacao (Agrícola)", icon: Leaf },
] as const;

/** Tipo auxiliar para un elemento del array ALL_TABS */
export type TabItem = typeof ALL_TABS[number];
