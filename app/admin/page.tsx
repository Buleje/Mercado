"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { useNotifications } from "@/hooks/use-notifications";
import { useOnboarding } from "@/hooks/use-onboarding";
import { useSwipe } from "@/hooks/use-swipe";
import { OnboardingTour } from "@/components/admin/OnboardingTour";
import {
  Trash2, Check, X, AlertTriangle,
  Users, Star, LogOut, ShoppingBasket, ShoppingCart,
  Loader2, Truck, FileText, Settings, Menu, Store,
  MapPin, Clock, Phone, ExternalLink, Search,
  Eye, EyeOff, ChevronRight, Activity,
  Brain,
  Package, Printer, FlaskConical,
  DollarSign, Layers, Sun, Moon, Download,
  Cake, Shield, ChevronDown, ChevronUp,
  CheckCircle, Bike, UserCheck, SlidersHorizontal, Sparkles,
  Maximize2, Minimize2, Zap, Tag, RefreshCw, CreditCard, Landmark,
  ClipboardList, Power, RotateCcw,
  Lightbulb, Target,
} from "lucide-react";
import type { DbOrder, OrderStatus, StoreMode } from "@/lib/jsondb";
import { googleMapsUrl } from "@/lib/order-utils";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/theme-context";
import { MODULE_PERMISSIONS } from "@/lib/module-permissions";
import {
  fetchAllOrders,
  parseGps,
  formatDate,
  haversineKm,
  getOrderTimeline,
} from "@/lib/admin-helpers";
import { AdminStatsMobile, AdminStatsDesktop } from "@/components/admin/AdminStats";
import { ShortcutsModal, ClearDataModal } from "@/components/admin/AdminModals";

// Lazy-load heavy admin tabs for better initial load performance
const TabSpinner = () => (
  <div className="space-y-6 animate-pulse">
    {/* Header skeleton */}
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-xl bg-gray-200 dark:bg-gray-700" />
      <div>
        <div className="h-5 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-3 w-60 bg-gray-200 dark:bg-gray-700 rounded mt-2" />
      </div>
    </div>
    {/* KPI cards skeleton */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
      ))}
    </div>
    {/* Table skeleton */}
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-3 sm:p-6 space-y-3">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="flex items-center gap-4">
          <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          </div>
          <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        </div>
      ))}
    </div>
    {/* Secondary content skeleton */}
    <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
  </div>
);
// ── Unified Module Imports (8 consolidated modules) ──
const AsistenteIAModule = dynamic(() => import("@/components/admin/unified/AsistenteIAModule"), { loading: TabSpinner });
const POSCajaModule = dynamic(() => import("@/components/admin/unified/POSCajaModule"), { loading: TabSpinner });
const InventarioAlmacenesModule = dynamic(() => import("@/components/admin/unified/InventarioAlmacenesModule"), { loading: TabSpinner });
const CatalogoTiendaModule = dynamic(() => import("@/components/admin/unified/CatalogoTiendaModule"), { loading: TabSpinner });
const ComprasModule = dynamic(() => import("@/components/admin/unified/ComprasModule"), { loading: TabSpinner });
const FinanzasModule = dynamic(() => import("@/components/admin/unified/FinanzasModule"), { loading: TabSpinner });
const CRMClientesModule = dynamic(() => import("@/components/admin/unified/CRMClientesModule"), { loading: TabSpinner });
const AnalyticsProModule = dynamic(() => import("@/components/admin/unified/AnalyticsProModule"), { loading: TabSpinner });
const AICommandModule = dynamic(() => import("@/components/admin/unified/AICommandModule"), { loading: TabSpinner });
const SugerenciasIAModule = dynamic(() => import("@/components/admin/unified/SugerenciasIAModule"), { loading: TabSpinner });
const MetasLogrosModule = dynamic(() => import("@/components/admin/unified/MetasLogrosModule"), { loading: TabSpinner });
const MarketplaceModule = dynamic(() => import("@/components/admin/unified/MarketplaceModule"), { loading: TabSpinner });
const DeliveryPartnersModule = dynamic(() => import("@/components/admin/unified/DeliveryPartnersModule"), { loading: TabSpinner });

// ── Módulos adicionales ──
const AuditTrailModule = dynamic(() => import("@/components/admin/AuditTrailModule"), { loading: TabSpinner });
const DevolucionesProveedorModule = dynamic(() => import("@/components/admin/DevolucionesProveedorModule"), { loading: TabSpinner });
const FiadosModule = dynamic(() => import("@/components/admin/FiadosModule"), { loading: TabSpinner });
const TurnosModule = dynamic(() => import("@/components/admin/TurnosModule"), { loading: TabSpinner });
const RecetasModule = dynamic(() => import("@/components/admin/RecetasModule"), { loading: TabSpinner });
const PrestamosModule = dynamic(() => import("@/components/admin/PrestamosModule"), { loading: TabSpinner });
const TreasuryDashboard = dynamic(() => import("@/components/admin/TreasuryDashboard"), { loading: TabSpinner });
const PromocionesModule = dynamic(() => import("@/components/admin/PromocionesModule"), { loading: TabSpinner });
const ScoringCrediticioTab = dynamic(() => import("@/components/admin/ScoringCrediticioTab"), { loading: TabSpinner });

// ── Módulos de documentos ──
const CotizacionesModule = dynamic(() => import("@/components/admin/CotizacionesModule"), { loading: TabSpinner });
const GuiasRemisionModule = dynamic(() => import("@/components/admin/GuiasRemisionModule"), { loading: TabSpinner });
const NotasCreditoModule = dynamic(() => import("@/components/admin/NotasCreditoModule"), { loading: TabSpinner });
const ContratosModule = dynamic(() => import("@/components/admin/ContratosModule"), { loading: TabSpinner });
// DeclaracionInventarioModule movido dentro del módulo Inventario (tab "Declaración")

import SSEListener from "@/components/admin/SSEListener";
import NotificationBell from "@/components/notifications/NotificationBell";
import AdminCommandPalette from "@/components/admin/shared/AdminCommandPalette";

// Changelog + Export
const ChangelogModal = dynamic(() => import("@/components/admin/ChangelogModal"), { ssr: false });

const TeamTab        = dynamic(() => import("@/components/admin/TeamTab"),        { loading: TabSpinner });
const PlanTab        = dynamic(() => import("@/components/admin/PlanTab"),        { loading: TabSpinner });
const SettingsModule = dynamic(() => import("@/components/admin/SettingsModule"), { loading: TabSpinner });

// Utility components (not tab modules)
const GlobalSearch = dynamic(() => import("@/components/admin/GlobalSearch"), { ssr: false });
const AlertCenter = dynamic(() => import("@/components/admin/AlertCenter"), { ssr: false });
const AIFloatingButton = dynamic(() => import("@/components/admin/AIFloatingButton"), { ssr: false });
// LeafletMap moved to SettingsModule
const CierreDiarioModal = dynamic(() => import("@/components/cierre-diario/CierreDiarioModal"), { ssr: false });
const MorningSummaryModal = dynamic(() => import("@/components/admin/MorningSummaryModal"), { ssr: false });

// ── 8 módulos consolidados + pedidos + plan ──
type Tab =
  | "asistente-ia"        // Asistente IA (dashboard + chat + alertas)
  | "ventas-caja"         // Ventas & Caja
  | "inventario"          // Inventario
  | "productos"           // Productos & Precios
  | "compras"             // Compras
  | "plata"               // Mi Plata (finanzas)
  | "clientes"            // Mis Clientes
  | "config"              // Configuración
  // Tabs especiales mantenidos
  | "pedidos"
  | "plan"
  // Nuevos módulos avanzados
  | "analytics-pro"
  | "ai-command"
  // Módulos adicionales
  | "fiados"
  | "turnos"
  | "recetas"
  | "prestamos"
  // Módulos de documentos
  | "cotizaciones"
  | "guias-remision"
  | "notas-credito"
  | "contratos"
  // Módulos nuevos
  | "auditoria"
  | "devoluciones-proveedor"
  | "tesoreria"
  | "promociones"
  | "scoring"
  | "sugerencias-ia"
  | "metas-logros"
  // Módulos de operaciones de marketplace y delivery
  | "marketplace"
  | "delivery-partners";

// Old tab IDs → consolidated module IDs for localStorage migration
// Maps all legacy tab IDs from previous 14-module and 28-module layouts to new 8-module layout
const TAB_MIGRATION: Record<string, Tab> = {
  // → Asistente IA (absorbe dashboard, agentes, changelog)
  dashboard: "asistente-ia", "dashboard-ejecutivo": "asistente-ia", "panel-principal": "asistente-ia",
  agentes: "asistente-ia", changelog: "asistente-ia",
  // → Ventas & Caja
  pos: "ventas-caja", caja: "ventas-caja", "pos-caja": "ventas-caja", "arqueo-caja": "ventas-caja",
  "ventas-marketing": "ventas-caja", marketing: "ventas-caja", "forecast-ventas": "ventas-caja",
  "metricas-conversion": "ventas-caja", referidos: "ventas-caja",
  // → Inventario
  inventario: "inventario", kardex: "inventario", lotes: "inventario",
  "inventario-fisico": "inventario", mermas: "inventario", almacenes: "inventario",
  "inventario-almacenes": "inventario", ubicaciones: "inventario", transferencias: "inventario",
  "auto-reorden": "inventario", "reorden-dinamico": "inventario",
  prediccion: "inventario", reposicion: "inventario",
  // → Productos & Precios
  "categorias-editor": "productos", "combos-editor": "productos", combos: "productos",
  kits: "productos", "catalogo-tienda": "productos",
  "precios-promos": "productos", benchmark: "productos", "historial-precios": "productos",
  promociones: "productos", cupones: "productos", "ab-tests": "productos",
  // → Compras
  compras: "compras", "plan-compras": "compras", "aprobacion-compras": "compras",
  contratos: "compras", cotizaciones: "compras", recepcion: "compras",
  proveedores: "compras", "portal-proveedor": "compras", evaluaciones: "compras",
  "calidad-proveedor": "compras", "pagos-proveedor": "compras",
  // → Mi Plata (finanzas, analytics, reportes)
  pl: "plata", "balance-general": "plata", "flujo-caja": "plata",
  presupuestos: "plata", "presupuesto-real": "plata", "break-even": "plata",
  rentabilidad: "plata", margenes: "plata", finanzas: "plata",
  tesoreria: "plata", "proyeccion-liquidez": "plata", cheques: "plata",
  conciliacion: "plata", "centro-cobros": "plata", "cuentas-cobrar": "plata",
  facturacion: "plata", "e-facturacion": "plata", impuestos: "plata", cuentas: "plata",
  gastos: "plata", "centros-costo": "plata", seguros: "plata",
  activos: "plata", "gastos-activos": "plata",
  reportes: "plata", "reportes-auto": "plata", "importar-exportar": "plata", documentos: "plata",
  "reportes-documentos": "plata",
  "analytics-bi": "plata", bi: "plata", "mapa-calor": "plata", "abc-analysis": "plata",
  pareto: "plata", "bcg-matrix": "plata", "analisis-cesta": "plata", "kpi-personalizado": "plata",
  proyecciones: "plata", simulador: "plata", estacionalidad: "plata", "comparador-periodos": "plata",
  // → Mis Clientes (CRM, delivery, fidelizacion, logistica)
  crm: "clientes", "cliente-360": "clientes", segmentos: "clientes",
  "segmentos-auto": "clientes", clv: "clientes", clientes: "clientes",
  "crm-clientes": "clientes", visitantes: "clientes",
  fidelizacion: "clientes", "programa-puntos": "clientes", "wish-lists": "clientes",
  "encuestas-soporte": "clientes", nps: "clientes", encuestas: "clientes",
  soporte: "clientes", resenas: "clientes",
  delivery: "clientes", logistica: "clientes",
  entregas: "clientes", "rutas-delivery": "clientes", "delivery-horarios": "clientes",
  "seguimiento-envios": "clientes", "costos-envio": "clientes", flota: "clientes",
  "logistica-devoluciones": "clientes", "devoluciones-calidad": "clientes",
  devoluciones: "clientes", "devoluciones-avanzadas": "clientes", calidad: "clientes", anomalias: "clientes",
  // → Configuración (seguridad, sistema, RRHH, comunicaciones, tareas, agenda)
  usuarios: "config", "usuarios-admin": "config", "permisos-roles": "config", "logs-seguridad": "config",
  actividad: "config", cumplimiento: "config",
  "salud-sistema": "config", "backup-restaurar": "config", webhooks: "config",
  sistema: "config", configuracion: "config", equipo: "config", seguridad: "config",
  rrhh: "config", nomina: "config", sucursales: "config",
  comunicaciones: "config", "hub-comunicaciones": "config",
  chat: "config", "plantillas-mensaje": "config", notificaciones: "config",
  proyectos: "config", tareas: "config", kanban: "config",
  metas: "config", "tablero-metas": "config", "proyectos-tareas": "config",
  "alertas-automatizacion": "config", "alertas-automaticas": "config",
  recordatorios: "config", flujos: "config", "reglas-negocio": "config",
  "agenda-utilidades": "config", calendario: "config",
  "notas-rapidas": "config", "filtros-guardados": "config",
  "pagina-inicio": "config",
  // Especiales
  pedidos: "pedidos",
  plan: "plan",
  // Módulos nuevos
  sugerencias: "sugerencias-ia",
  metas: "metas-logros",
  auditoria: "auditoria",
  "devoluciones-proveedor": "devoluciones-proveedor",
  scoring: "scoring",
  // Marketplace & Delivery
  marketplace: "marketplace",
  "marketplace-tienda": "marketplace",
  "marketplace-productos": "marketplace",
  "marketplace-ordenes": "marketplace",
  "marketplace-comisiones": "marketplace",
  delivery: "delivery-partners",
  "delivery-partners": "delivery-partners",
  repartidores: "delivery-partners",
  asignaciones: "delivery-partners",
  // Módulos adicionales
  fiados: "fiados",
  turnos: "turnos",
  recetas: "recetas",
  prestamos: "prestamos",
};

// Modules that ship with auto-seeded demo data and their API cleanup endpoint
const DEMO_DATA_MODULES: Partial<Record<Tab, { label: string; api?: string }>> = {
  "inventario": { label: "24 productos de ejemplo cargados al inicio", api: "/api/admin/demo-products" },
};

// Rich metadata for every module: emoji, priority, description and a helpful tip
const MODULE_INFO: Partial<Record<Tab, { emoji: string; priority: "core" | "high" | "medium" | "low"; desc: string; tip: string }>> = {
  "asistente-ia":  { emoji: "🧠", priority: "core",   desc: "Dashboard IA, chat con asistente y centro de alertas del negocio.",     tip: "Empieza aquí cada mañana para tener el pulso del negocio." },
  "ventas-caja":   { emoji: "🖥️", priority: "core",   desc: "Punto de venta, caja registradora, arqueo, pedidos y cuentas por cobrar.", tip: "Todo lo que necesitas para operar el mostrador en un solo lugar." },
  "inventario":    { emoji: "📦", priority: "core",   desc: "Stock, Kardex, vencimientos, mermas y alertas de inventario.",           tip: "Control completo del inventario desde una sola vista." },
  "productos":     { emoji: "🏪", priority: "high",   desc: "Catálogo, categorías, ofertas, cupones e historial de precios.",         tip: "Gestiona tu catálogo y optimiza precios." },
  "compras":       { emoji: "📋", priority: "high",   desc: "Pedidos a proveedor, directorio de proveedores y recepción.",            tip: "Flujo completo de compras desde la cotización hasta la recepción." },
  "plata":         { emoji: "💵", priority: "high",   desc: "Ingresos, egresos, gastos, ganancias, reportes y exportación.",          tip: "Visión financiera completa del negocio en un solo módulo." },
  "clientes":      { emoji: "👥", priority: "high",   desc: "CRM, delivery, opiniones y programa de fidelización.",                   tip: "Conoce a tus clientes y personaliza la atención." },
  "config":        { emoji: "⚙️", priority: "core",   desc: "Usuarios, permisos, plan y configuración de la página web.",             tip: "Configura esto primero para que todo funcione correctamente." },
  "pedidos":       { emoji: "🛒", priority: "core",   desc: "Gestiona pedidos recibidos, su estado, asignación y entrega.",           tip: "Centraliza pedidos de WhatsApp, tienda online y mostrador." },
  "plan":          { emoji: "⚡", priority: "medium", desc: "Tu plan actual, límites y opciones de mejora.",                          tip: "Revisa tu plan para aprovechar al máximo la plataforma." },
  "fiados":        { emoji: "💰", priority: "high",   desc: "Control de créditos informales: registro, pagos y saldos pendientes.",  tip: "Lleva la cuenta de lo que te deben tus clientes de confianza." },
  "turnos":        { emoji: "⏱️", priority: "high",   desc: "Apertura y cierre de turnos con conteo de efectivo.",                   tip: "Control de caja por turno para saber exactamente cuánto entró." },
  "recetas":       { emoji: "🍳", priority: "medium", desc: "Recetas de producción con ingredientes y control de lotes.",            tip: "Calcula costos de producción y descuenta stock automáticamente." },
  "prestamos":     { emoji: "🏦", priority: "medium", desc: "Préstamos a clientes con cuotas, interés y tabla de amortización.",     tip: "Gestiona préstamos con calculadora integrada y seguimiento de pagos." },
  "sugerencias-ia": { emoji: "💡", priority: "high" as const,   desc: "Combos, cross-sell y recomendaciones personalizadas por cliente.", tip: "La IA analiza tus ventas y te dice qué ofrecer." },
  "metas-logros":   { emoji: "🏆", priority: "medium" as const, desc: "Metas de ventas, clientes y logros desbloqueados.", tip: "Configura tus objetivos y celebra cada logro." },
};

type TabCategory = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tabs: Tab[];
};

// ── 7 módulos básicos + config ──────────────────────────────────────────────
const BASIC_MODULES: TabCategory[] = [
  {
    id: "asistente-ia",
    label: "IA & Analítica",
    icon: Brain,
    tabs: ["asistente-ia", "analytics-pro", "ai-command", "sugerencias-ia", "metas-logros"],
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
    tabs: ["marketplace", "delivery-partners"],
  },
];

// ── Módulo Config (siempre visible) ──────────────────────────────────────────
const CONFIG_MODULE: TabCategory = {
  id: "config",
  label: "Configuración",
  icon: Settings,
  tabs: ["config", "plan"],
};

// No PRO modules — all modules available to all plans

// ── TAB_CATEGORIES: todos los módulos ──
const TAB_CATEGORIES: TabCategory[] = [
  ...BASIC_MODULES,
  CONFIG_MODULE,
];

const STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};
const STATUS_COLORS: Record<OrderStatus, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  confirmado: "bg-blue-100 text-blue-700",
  en_camino: "bg-purple-100 text-purple-700",
  entregado: "bg-emerald-100 text-emerald-700",
  cancelado: "bg-red-100 text-red-500",
};

// ── Helpers imported from @/lib/admin-helpers ────────────────────────────────
// CustomersTab + ReviewsTab removed — replaced by CRMClientesModule

// ── Orders Tab ────────────────────────────────────────────────────────────────
function OrdersTab() {
  const [orders, setOrders] = useState<DbOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [storeLat, setStoreLat] = useState<number | null>(null);
  const [storeLon, setStoreLon] = useState<number | null>(null);

  // Detail modal
  const [detailOrder, setDetailOrder] = useState<DbOrder | null>(null);

  // Archive modal (Cancelados + Entregados)
  const [showArchive, setShowArchive] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveDateFrom, setArchiveDateFrom] = useState("");
  const [archiveDateTo, setArchiveDateTo] = useState("");

  // Delete confirmation modal
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Internal admin notes
  const [adminNote, setAdminNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Rejection templates
  const REJECTION_TEMPLATES = [
    "Producto agotado temporalmente",
    "Dirección fuera de zona de cobertura",
    "Monto mínimo no alcanzado",
    "Error en datos del pedido",
    "Cliente solicitó cancelación",
    "Pago no verificado",
  ];
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Bulk selection
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [bulkStatusTarget, setBulkStatusTarget] = useState<OrderStatus | "">("");
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [ordPage, setOrdPage] = useState(1);
  const ORD_PER_PAGE = 20;

  // FEATURE 1: Delivery driver assignment
  const DRIVERS = ["Juan", "María", "Carlos", "Delivery 1", "Delivery 2", "Delivery 3"];
  const [deliveryDriver, setDeliveryDriver] = useState("");
  const [customDriver, setCustomDriver] = useState("");
  const [savingDriver, setSavingDriver] = useState(false);
  const [filterByDelivery, setFilterByDelivery] = useState(false);
  const [selectedDriverFilter, setSelectedDriverFilter] = useState("");

  // FEATURE 2: Advanced filters
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterStatuses, setFilterStatuses] = useState<Set<OrderStatus>>(new Set());
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<"" | "yape" | "efectivo">("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterAmountMin, setFilterAmountMin] = useState("");
  const [filterAmountMax, setFilterAmountMax] = useState("");
  const [filterCustomerSearch, setFilterCustomerSearch] = useState("");
  const [filterHasDebt, setFilterHasDebt] = useState(false);
  const [filterHasAdminNotes, setFilterHasAdminNotes] = useState(false);

  // FEATURE 3: Batch print
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  useScrollLock(!!detailOrder || showArchive || !!confirmDeleteId || showAdvancedFilters || showPrintPreview);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const orders = await fetchAllOrders();
      setOrders(orders);
    } catch {
      setLoadError("Error al cargar pedidos. Verifica tu conexión.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    fetch("/api/settings").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.businessLat) setStoreLat(d.businessLat);
      if (d?.businessLon) setStoreLon(d.businessLon);
    }).catch(() => {});
  }, []);

  const updateStatus = async (id: string, status: OrderStatus) => {
    const res = await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    // Open WhatsApp notification link only if not auto-sent
    if (res.ok) {
      const data = await res.json();
      if (data.whatsappLink && !data.whatsappSent) {
        window.open(data.whatsappLink, "_blank", "noopener,noreferrer");
      }
    }
  };

  const patchOrder = async (id: string, patch: Partial<DbOrder>) => {
    await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setOrders(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o));
    setDetailOrder(prev => prev?.id === id ? { ...prev, ...patch } : prev);
  };

  const saveDeliveryDriver = async (orderId: string) => {
    const driver = customDriver.trim() || deliveryDriver;
    if (!driver) return;
    setSavingDriver(true);
    await patchOrder(orderId, { deliveryDriver: driver } as Partial<DbOrder>);
    setDeliveryDriver("");
    setCustomDriver("");
    setSavingDriver(false);
  };

  const driverColor = (name: string): string => {
    const colors = ["#ef4444", "#f97316", "#f59e0b", "#65a30d", "#14b8a6", "#0ea5e9", "#3b82f6", "#8b5cf6", "#ec4899"];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
  };

  const clearAdvancedFilters = () => {
    setFilterStatuses(new Set());
    setFilterPaymentMethod("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterAmountMin("");
    setFilterAmountMax("");
    setFilterCustomerSearch("");
    setFilterHasDebt(false);
    setFilterHasAdminNotes(false);
  };

  const activeFiltersCount = (
    filterStatuses.size +
    (filterPaymentMethod ? 1 : 0) +
    (filterDateFrom ? 1 : 0) +
    (filterDateTo ? 1 : 0) +
    (filterAmountMin ? 1 : 0) +
    (filterAmountMax ? 1 : 0) +
    (filterCustomerSearch ? 1 : 0) +
    (filterHasDebt ? 1 : 0) +
    (filterHasAdminNotes ? 1 : 0)
  );

  const verifyYape = (id: string) => patchOrder(id, { status: "confirmado" });

  const rejectYape = async (id: string) => {
    if (!confirm("¿Rechazar este pedido? El Yape es inválido y se eliminará el pedido.")) return;
    await fetch(`/api/orders/${id}`, { method: "DELETE" });
    setOrders(prev => prev.filter(o => o.id !== id));
    setDetailOrder(prev => prev?.id === id ? null : prev);
  };

  const markDeudaPaid = (id: string) => patchOrder(id, { deuda: false });

  const saveAdminNote = async (orderId: string) => {
    if (!adminNote.trim()) return;
    setSavingNote(true);
    const o = orders.find(x => x.id === orderId);
    const existingNotes = (o as (typeof o) & { adminNotes?: string })?.adminNotes ?? "";
    const ts = new Date().toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    const updated = existingNotes ? `${existingNotes}\n[${ts}] ${adminNote.trim()}` : `[${ts}] ${adminNote.trim()}`;
    await patchOrder(orderId, { adminNotes: updated } as Partial<DbOrder>);
    setAdminNote("");
    setSavingNote(false);
  };

  const executeReject = async () => {
    if (!showRejectModal) return;
    const reason = rejectReason.trim() || "Pedido cancelado";
    await patchOrder(showRejectModal, { status: "cancelado", adminNotes: reason } as Partial<DbOrder>);
    setShowRejectModal(null);
    setRejectReason("");
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    await fetch(`/api/orders/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    load();
  };

  const toggleOrderSelect = (id: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearOrderSelection = () => setSelectedOrderIds(new Set());

  const executeBulkStatus = async () => {
    if (!bulkStatusTarget || selectedOrderIds.size === 0) return;
    setBulkUpdating(true);
    try {
      await fetch("/api/orders/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedOrderIds), status: bulkStatusTarget }),
      });
    } catch { /* ignore */ }
    setBulkUpdating(false);
    clearOrderSelection();
    setBulkStatusTarget("");
    load();
  };

  // Active orders (exclude entregado / cancelado)
  let activeOrders = orders.filter(o => o.status !== "entregado" && o.status !== "cancelado");
  
  // Apply advanced filters
  if (filterStatuses.size > 0) {
    activeOrders = activeOrders.filter(o => filterStatuses.has(o.status));
  }
  if (filterPaymentMethod) {
    activeOrders = activeOrders.filter(o => o.paymentMethod === filterPaymentMethod);
  }
  if (filterDateFrom) {
    activeOrders = activeOrders.filter(o => o.createdAt.slice(0, 10) >= filterDateFrom);
  }
  if (filterDateTo) {
    activeOrders = activeOrders.filter(o => o.createdAt.slice(0, 10) <= filterDateTo);
  }
  if (filterAmountMin) {
    activeOrders = activeOrders.filter(o => o.total >= parseFloat(filterAmountMin));
  }
  if (filterAmountMax) {
    activeOrders = activeOrders.filter(o => o.total <= parseFloat(filterAmountMax));
  }
  if (filterCustomerSearch) {
    const q = filterCustomerSearch.toLowerCase();
    activeOrders = activeOrders.filter(o => 
      o.customer.name.toLowerCase().includes(q) || 
      (o.customer.phone ?? "").includes(q)
    );
  }
  if (filterHasDebt) {
    activeOrders = activeOrders.filter(o => o.deuda === true);
  }
  if (filterHasAdminNotes) {
    activeOrders = activeOrders.filter(o => (o as DbOrder & { adminNotes?: string }).adminNotes);
  }

  // Filter by delivery driver
  if (filterByDelivery && selectedDriverFilter) {
    activeOrders = activeOrders.filter(o => {
      const driver = (o as DbOrder & { deliveryDriver?: string }).deliveryDriver;
      return driver === selectedDriverFilter;
    });
  }

  const ordTotalPages = Math.max(1, Math.ceil(activeOrders.length / ORD_PER_PAGE));
  const safeOrdPage = Math.min(ordPage, ordTotalPages);
  const paginatedOrders = activeOrders.slice((safeOrdPage - 1) * ORD_PER_PAGE, safeOrdPage * ORD_PER_PAGE);
  const archivedOrders = orders.filter(o => o.status === "entregado" || o.status === "cancelado");

  // Archive search + date filters
  const filteredArchive = archivedOrders.filter(o => {
    const q = archiveSearch.toLowerCase();
    const matchSearch = !q || o.customer.name.toLowerCase().includes(q) || (o.customer.phone ?? "").includes(q);
    const date = o.createdAt.slice(0, 10);
    const matchFrom = !archiveDateFrom || date >= archiveDateFrom;
    const matchTo = !archiveDateTo || date <= archiveDateTo;
    return matchSearch && matchFrom && matchTo;
  });

  const total = activeOrders.reduce((s, o) => s + o.total, 0);
  // eslint-disable-next-line react-hooks/purity -- Date.now() is intentionally used for urgency calculation on each render
  const nowMs = Date.now();

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-foreground">Pedidos</h2>
          <p className="text-sm text-gray-500 dark:text-muted">{activeOrders.length} activos · S/{total.toFixed(2)} total</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilterByDelivery(prev => !prev)}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
              filterByDelivery
                ? "text-white bg-primary"
                : "text-gray-600 dark:text-muted bg-gray-100 dark:bg-accent hover:bg-gray-200"
            )}
          >
            <Bike className="h-4 w-4" />
            Por delivery
          </button>
          <button
            onClick={() => setShowAdvancedFilters(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors relative"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros avanzados
            {activeFiltersCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-white text-xs font-bold rounded-full flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors"
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
          <button
            onClick={() => setShowArchive(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors"
          >
            <FileText className="h-4 w-4" />
            Cancelados y Entregados
            {archivedOrders.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-gray-300 text-gray-700 dark:text-foreground text-xs font-bold">{archivedOrders.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* Delivery driver filter */}
      {filterByDelivery && (
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/30 rounded-xl p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">Filtrar por delivery:</p>
            <select
              value={selectedDriverFilter}
              onChange={(e) => setSelectedDriverFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-blue-300 dark:border-blue-700 text-sm font-semibold text-blue-700 dark:text-blue-300 bg-white dark:bg-card outline-none focus:border-primary"
            >
              <option value="">Todos los deliverys</option>
              {Array.from(new Set(
                orders
                  .map(o => (o as DbOrder & { deliveryDriver?: string }).deliveryDriver)
                  .filter(Boolean)
              )).sort().map(driver => (
                <option key={driver} value={driver}>{driver}</option>
              ))}
            </select>
            {selectedDriverFilter && (
              <button
                onClick={() => setSelectedDriverFilter("")}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline"
              >
                Limpiar
              </button>
            )}
          </div>
          {selectedDriverFilter && (
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
              Mostrando {activeOrders.length} pedido{activeOrders.length !== 1 ? "s" : ""} de {selectedDriverFilter}
            </p>
          )}
        </div>
      )}

      {loadError && (
        <div className="mb-3 flex items-center gap-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{loadError}</span>
          <button onClick={() => { setLoadError(null); load(); }} className="text-xs font-bold text-red-600 hover:text-red-800 underline">Reintentar</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 flex items-center gap-4">
              <div className="h-5 w-5 bg-gray-200 dark:bg-surface rounded shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-surface rounded w-1/4" />
                <div className="h-3 bg-gray-200 dark:bg-surface rounded w-1/2" />
              </div>
              <div className="h-6 w-20 bg-gray-200 dark:bg-surface rounded-full" />
            </div>
          ))}
        </div>
      ) : activeOrders.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl">
          No hay pedidos activos
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedOrders.map((o) => {
            // ── Urgency indicator based on order age ──
            const orderAgeMs = nowMs - new Date(o.createdAt).getTime();
            const orderAgeHours = orderAgeMs / (1000 * 60 * 60);
            const isUrgent2h = orderAgeHours >= 2;
            const isUrgent1h = !isUrgent2h && orderAgeHours >= 1;
            const urgencyBorder = isUrgent2h
              ? "border-l-4 border-l-red-500"
              : isUrgent1h
                ? "border-l-4 border-l-orange-400"
                : "";

            return (
            <div key={o.id} className={cn("bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-sm overflow-hidden", urgencyBorder, selectedOrderIds.has(o.id) && "ring-2 ring-primary")}>
              <div
                className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-surface transition-colors"
                onClick={() => setDetailOrder(o)}
              >
                {/* Bulk checkbox */}
                <input type="checkbox" checked={selectedOrderIds.has(o.id)}
                  onClick={e => e.stopPropagation()} onChange={() => toggleOrderSelect(o.id)}
                  className="rounded border-gray-300 text-primary focus:ring-primary shrink-0 self-start mt-1" />
                {/* Left: customer info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900 dark:text-foreground">{o.customer.name}</span>
                    {o.customer.phone && <span className="text-xs font-mono text-gray-400 dark:text-muted">{o.customer.phone}</span>}
                    <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold", STATUS_COLORS[o.status])}>
                      {STATUS_LABELS[o.status]}
                    </span>
                    {isUrgent2h && (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400 animate-pulse">
                        {"\u26A0"} +2h
                      </span>
                    )}
                    {isUrgent1h && (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400">
                        {"\u23F0"} +1h
                      </span>
                    )}
                    {o.paymentMethod && (
                      <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold",
                        o.paymentMethod === "yape" ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700"
                      )}>
                        {o.paymentMethod === "yape" ? "Yape" : "Efectivo"}
                      </span>
                    )}
                    {o.paymentMethod === "efectivo" && o.deuda && (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600">
                        💰 Deuda pendiente
                      </span>
                    )}
                    {(() => {
                      const driver = (o as DbOrder & { deliveryDriver?: string }).deliveryDriver;
                      if (!driver) return null;
                      const color = driverColor(driver);
                      return (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold text-white"
                          style={{ backgroundColor: color }}
                        >
                          <Bike className="h-3 w-3" /> {driver}
                        </span>
                      );
                    })()}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-muted mt-0.5 truncate">{o.customer.location}</p>
                  {(() => {
                    if (storeLat === null || storeLon === null) return null;
                    const gps = parseGps(o.customer.location);
                    if (!gps) return null;
                    const km = haversineKm(storeLat, storeLon, gps.lat, gps.lon);
                    const label = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
                    return <span className="inline-flex items-center gap-1 text-xs text-blue-500 font-semibold"><MapPin className="h-3 w-3 shrink-0" />{label}</span>;
                  })()}
                  <p className="text-xs text-gray-400 dark:text-muted mt-0.5">{formatDate(o.createdAt)} · {o.items.length} producto{o.items.length !== 1 ? "s" : ""} · <span className="font-bold text-primary">S/{o.total.toFixed(2)}</span></p>
                </div>

                {/* Right: controls "— stop propagation so clicks here don't open modal */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end" onClick={(e) => e.stopPropagation()}>
                  {o.paymentMethod === "yape" && o.status === "pendiente" && (
                    <>
                      <button
                        onClick={() => verifyYape(o.id)}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors border border-emerald-200"
                        title="Confirmar Yape como válido"
                      >
                        <Check className="h-4 w-4" /> Confirmar Yape
                      </button>
                      <button
                        onClick={() => rejectYape(o.id)}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors border border-red-200"
                        title="Rechazar Yape (pago falso)"
                      >
                        <X className="h-4 w-4" /> Falso
                      </button>
                    </>
                  )}
                  {o.paymentMethod === "efectivo" && o.deuda && (
                    <button
                      onClick={() => markDeudaPaid(o.id)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors border border-blue-200"
                      title="Marcar deuda como cobrada"
                    >
                      <Check className="h-4 w-4" /> Cobrado
                    </button>
                  )}
                  <a
                    href={googleMapsUrl(o.customer.location)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg text-gray-400 dark:text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors"
                    title="Ver en Google Maps"
                  >
                    <MapPin className="h-4 w-4" />
                  </a>
                  <select
                    value={o.status}
                    onChange={(e) => updateStatus(o.id, e.target.value as OrderStatus)}
                    className="text-xs font-semibold rounded-lg border border-gray-200 dark:border-card-border px-2 py-2 outline-none focus:border-primary text-gray-700 dark:text-foreground bg-white dark:bg-card"
                  >
                    {(Object.keys(STATUS_LABELS) as OrderStatus[]).map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setConfirmDeleteId(o.id)}
                    className="p-2 rounded-lg text-gray-400 dark:text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* ── Order Detail Modal ──────────────────────────────────────────────── */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setDetailOrder(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-card-border shrink-0">
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-foreground text-lg">Detalle del pedido</h3>
                <p className="text-xs text-gray-400 dark:text-muted mt-0.5">{detailOrder.customer.name} · {formatDate(detailOrder.createdAt)}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => window.open(`/api/invoices/${detailOrder.id}`, "_blank", "noopener,noreferrer")}
                  className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                  title="Imprimir ticket / Boleta"
                >
                  <Printer className="h-4 w-4" />
                </button>
                <button onClick={() => setDetailOrder(null)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
              <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1">
                {/* Visual Timeline */}
                <div className="bg-linear-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-xl p-4 border border-blue-100 dark:border-blue-900/30">
                  <p className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wide mb-3">Estado del Pedido</p>
                  <div className="flex items-center justify-between gap-2 relative">
                    {/* Connecting line */}
                    <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200 dark:bg-gray-700" style={{ zIndex: 0 }} />
                    {getOrderTimeline(detailOrder).map((step) => {
                      const Icon = step.icon;
                      const isCanceled = step.status === "cancelado";
                      return (
                        <div key={step.status} className="flex flex-col items-center gap-1.5 relative" style={{ flex: isCanceled ? 0.7 : 1, zIndex: 1 }}>
                          {/* Icon circle */}
                          <div
                            className={cn(
                              "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                              step.completed
                                ? "bg-emerald-500 border-emerald-500 text-white"
                                : step.current && !isCanceled
                                ? "bg-blue-500 border-blue-500 text-white animate-pulse"
                                : step.current && isCanceled
                                ? "bg-red-500 border-red-500 text-white"
                                : "bg-white dark:bg-card border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500"
                            )}
                          >
                            <Icon className="h-5 w-5" />
                          </div>
                          {/* Label */}
                          <div className="text-center">
                            <p
                              className={cn(
                                "text-xs font-bold",
                                step.completed
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : step.current && !isCanceled
                                  ? "text-blue-700 dark:text-blue-400"
                                  : step.current && isCanceled
                                  ? "text-red-700 dark:text-red-400"
                                  : "text-gray-500 dark:text-gray-500"
                              )}
                            >
                              {step.label}
                            </p>
                            {step.timestamp && (
                              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{step.timestamp}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* FEATURE 1: Delivery Driver Assignment */}
                <div className="bg-linear-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 rounded-xl p-4 border border-purple-100 dark:border-purple-900/30">
                  <p className="text-xs font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wide mb-3">Asignar Delivery</p>
                  {(() => {
                    const currentDriver = (detailOrder as DbOrder & { deliveryDriver?: string }).deliveryDriver;
                    if (currentDriver) {
                      const color = driverColor(currentDriver);
                      return (
                        <div className="flex items-center gap-2 mb-3">
                          <span
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold text-white"
                            style={{ backgroundColor: color }}
                          >
                            <UserCheck className="h-4 w-4" /> {currentDriver}
                          </span>
                          <button
                            onClick={() => patchOrder(detailOrder.id, { deliveryDriver: "" } as Partial<DbOrder>)}
                            className="text-xs text-purple-600 hover:text-purple-800 underline"
                          >
                            Cambiar
                          </button>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  <div className="space-y-2">
                    <select
                      value={deliveryDriver}
                      onChange={(e) => setDeliveryDriver(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-purple-200 dark:border-purple-700 text-sm text-gray-900 dark:text-foreground bg-white dark:bg-card outline-none focus:border-primary"
                    >
                      <option value="">Seleccionar delivery...</option>
                      {DRIVERS.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={customDriver}
                        onChange={(e) => setCustomDriver(e.target.value)}
                        placeholder="O escribe nombre personalizado..."
                        className="flex-1 px-3 py-2 rounded-lg border border-purple-200 dark:border-purple-700 text-sm text-gray-900 dark:text-foreground bg-white dark:bg-card outline-none focus:border-primary"
                      />
                      <button
                        onClick={() => saveDeliveryDriver(detailOrder.id)}
                        disabled={savingDriver || (!deliveryDriver && !customDriver.trim())}
                        className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {savingDriver ? "..." : "Asignar"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Customer */}
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Cliente</p>
                  <p className="font-bold text-gray-900 dark:text-foreground">{detailOrder.customer.name}</p>
                  {detailOrder.customer.phone && (
                    <p className="text-sm text-gray-500 dark:text-muted flex items-center gap-1.5">
                      <Phone className="h-4 w-4 shrink-0" /> {detailOrder.customer.phone}
                    </p>
                  )}
                </div>
                {/* Location */}
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Dirección</p>
                  <div className="flex items-start gap-2">
                    <p className="text-sm text-gray-700 dark:text-foreground flex-1">{detailOrder.customer.location}</p>
                    <a
                      href={googleMapsUrl(detailOrder.customer.location)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 p-1 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"
                      title="Abrir en Google Maps"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                  {detailOrder.customer.reference && (
                    <p className="text-xs text-gray-500 dark:text-muted">Ref: {detailOrder.customer.reference}</p>
                  )}
                </div>
                {/* Payment */}
                {detailOrder.paymentMethod && (
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Pago</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold",
                        detailOrder.paymentMethod === "yape" ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700"
                      )}>
                        {detailOrder.paymentMethod === "yape" ? "Yape" : "Efectivo"}
                      </span>
                      {detailOrder.yapeOperationNumber && (
                        <span className="text-gray-500 dark:text-muted font-mono text-xs">Nº Op. {detailOrder.yapeOperationNumber}</span>
                      )}
                      {detailOrder.paymentMethod === "efectivo" && detailOrder.deuda && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600">💰 Deuda pendiente</span>
                      )}
                      {detailOrder.paymentMethod === "efectivo" && detailOrder.deuda === false && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">✓ Cobrado</span>
                      )}
                    </div>
                    {detailOrder.paymentMethod === "yape" && detailOrder.status === "pendiente" && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => verifyYape(detailOrder.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors border border-emerald-200"
                        >
                          <Check className="h-4 w-4" /> Confirmar Yape
                        </button>
                        <button
                          onClick={() => rejectYape(detailOrder.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors border border-red-200"
                        >
                          <X className="h-4 w-4" /> Yape falso
                        </button>
                      </div>
                    )}
                    {detailOrder.paymentMethod === "efectivo" && detailOrder.deuda && (
                      <button
                        onClick={() => markDeudaPaid(detailOrder.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors border border-blue-200 mt-1"
                      >
                        <Check className="h-4 w-4" /> Marcar como cobrado
                      </button>
                    )}
                  </div>
                )}
                {/* Customer Notes */}
                {detailOrder.notes && (
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Notas del cliente</p>
                    <p className="text-sm text-gray-600 dark:text-muted italic">{detailOrder.notes}</p>
                  </div>
                )}
                {/* Admin Internal Notes */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Notas internas del equipo</p>
                  {(detailOrder as DbOrder & { adminNotes?: string }).adminNotes && (
                    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
                      <pre className="text-xs text-amber-800 dark:text-amber-300 whitespace-pre-wrap font-sans">{(detailOrder as DbOrder & { adminNotes?: string }).adminNotes}</pre>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      value={adminNote}
                      onChange={e => setAdminNote(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && saveAdminNote(detailOrder.id)}
                      placeholder="Agregar nota interna..."
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-900 dark:text-foreground outline-none focus:border-primary"
                    />
                    <button
                      onClick={() => saveAdminNote(detailOrder.id)}
                      disabled={savingNote || !adminNote.trim()}
                      className="px-3 py-2 rounded-lg bg-amber-100 text-amber-700 text-xs font-bold hover:bg-amber-200 transition-colors disabled:opacity-50"
                    >
                      {savingNote ? "..." : "Guardar"}
                    </button>
                  </div>
                </div>
                {/* Quick Reject with Template */}
                {detailOrder.status !== "cancelado" && detailOrder.status !== "entregado" && (
                  <button
                    onClick={() => { setShowRejectModal(detailOrder.id); setRejectReason(""); }}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-red-50 text-red-600 text-sm font-bold hover:bg-red-100 transition-colors border border-red-200"
                  >
                    <X className="h-4 w-4" />
                    Rechazar pedido (con motivo)
                  </button>
                )}
                {/* Items */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Productos</p>
                  <div className="rounded-xl border border-gray-100 dark:border-card-border divide-y divide-gray-100 overflow-hidden">
                    {detailOrder.items.map((item, i) => (
                      <div key={i} className="flex justify-between items-center px-3 py-2 text-sm">
                        <span className="text-gray-700 dark:text-foreground">{item.quantity}× {item.name} <span className="text-gray-400 dark:text-muted">({item.unit})</span></span>
                        <span className="font-semibold text-gray-900 dark:text-foreground">S/{(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                    {/* Discount breakdown */}
                    {((detailOrder.couponDiscount ?? 0) > 0 || (detailOrder.discountAmount ?? 0) > 0) && (() => {
                      const subtotal = detailOrder.items.reduce((s, i) => s + i.price * i.quantity, 0);
                      return (
                        <>
                          <div className="flex justify-between items-center px-3 py-2 text-sm bg-gray-50/60 dark:bg-surface/40">
                            <span className="text-gray-500 dark:text-muted">Subtotal</span>
                            <span className="text-gray-700 dark:text-foreground">S/{subtotal.toFixed(2)}</span>
                          </div>
                          {(detailOrder.discountAmount ?? 0) > 0 && (
                            <div className="flex justify-between items-center px-3 py-2 text-sm bg-emerald-50/60 dark:bg-emerald-900/10">
                              <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                                Descuento promo{detailOrder.appliedPromoId ? ` (${detailOrder.appliedPromoId})` : ""}
                              </span>
                              <span className="font-bold text-emerald-600">−S/{(detailOrder.discountAmount!).toFixed(2)}</span>
                            </div>
                          )}
                          {(detailOrder.couponDiscount ?? 0) > 0 && (
                            <div className="flex justify-between items-center px-3 py-2 text-sm bg-emerald-50/60 dark:bg-emerald-900/10">
                              <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                                Cupón{detailOrder.appliedCouponCode ? ` ${detailOrder.appliedCouponCode}` : ""}
                              </span>
                              <span className="font-bold text-emerald-600">−S/{(detailOrder.couponDiscount!).toFixed(2)}</span>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    <div className="flex justify-between items-center px-3 py-2 bg-gray-50 dark:bg-surface font-bold text-sm">
                      <span className="text-gray-800 dark:text-foreground">Total</span>
                      <span className="text-primary">S/{detailOrder.total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                {/* Meta */}
                <div className="flex flex-wrap gap-3 items-center text-xs text-gray-400 dark:text-muted">
                  <span>ID: {detailOrder.id}</span>
                  <span>Fecha: {formatDate(detailOrder.createdAt)}</span>
                  <span className={cn("inline-flex px-2 py-0.5 rounded-full font-bold", STATUS_COLORS[detailOrder.status])}>
                    {STATUS_LABELS[detailOrder.status]}
                  </span>
                </div>
                {/* Invoice / Boleta */}
                <button
                  onClick={() => window.open(`/api/invoices/${detailOrder.id}`, "_blank", "noopener,noreferrer")}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-bold hover:bg-primary/20 transition-colors"
                >
                  <FileText className="h-4 w-4" />
                  Generar Boleta
                </button>
              </div>
          </div>
        </div>
      )}

      {/* ── Rejection Template Modal ──────────────────────────────────────── */}
      {showRejectModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowRejectModal(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 dark:border-card-border">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">Rechazar pedido</h3>
              <p className="text-xs text-gray-400 dark:text-muted mt-0.5">Selecciona un motivo o escribe uno personalizado</p>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-1 gap-1.5">
                {REJECTION_TEMPLATES.map(t => (
                  <button
                    key={t}
                    onClick={() => setRejectReason(t)}
                    className={cn(
                      "text-left px-3 py-2 rounded-lg text-sm border transition-colors",
                      rejectReason === t
                        ? "border-red-400 bg-red-50 text-red-700 font-semibold"
                        : "border-gray-200 dark:border-card-border text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <input
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="O escribe un motivo personalizado..."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-900 dark:text-foreground outline-none focus:border-red-400"
              />
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowRejectModal(null)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-card-border text-sm font-bold text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
                >
                  Cancelar
                </button>
                <button
                  onClick={executeReject}
                  disabled={!rejectReason.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  Rechazar pedido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Archive Modal (Cancelados + Entregados) ─────────────────────────── */}
      {showArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowArchive(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-card-border shrink-0">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground text-lg">Cancelados y Entregados</h3>
              <button onClick={() => setShowArchive(false)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* Filters */}
            <div className="px-5 py-3 border-b border-gray-100 dark:border-card-border shrink-0 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-muted pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar cliente o teléfono…"
                  value={archiveSearch}
                  onChange={e => setArchiveSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-card-border outline-none focus:border-primary"
                />
              </div>
              <input
                type="date"
                value={archiveDateFrom}
                onChange={e => setArchiveDateFrom(e.target.value)}
                title="Desde"
                className="text-sm rounded-lg border border-gray-200 dark:border-card-border px-3 py-2 outline-none focus:border-primary text-gray-600 dark:text-muted"
              />
              <input
                type="date"
                value={archiveDateTo}
                onChange={e => setArchiveDateTo(e.target.value)}
                title="Hasta"
                className="text-sm rounded-lg border border-gray-200 dark:border-card-border px-3 py-2 outline-none focus:border-primary text-gray-600 dark:text-muted"
              />
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              {filteredArchive.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-gray-400 dark:text-muted text-sm">No se encontraron pedidos</div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden sm:block rounded-xl border border-gray-200 dark:border-card-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-surface border-b border-gray-200 dark:border-card-border">
                        <tr>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-muted">Cliente</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-muted">Estado</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-muted">Total</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-muted">Fecha</th>
                          <th className="px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredArchive.map(o => (
                          <tr
                            key={o.id}
                            className="hover:bg-gray-50 dark:hover:bg-surface cursor-pointer"
                            onClick={() => { setDetailOrder(o); setShowArchive(false); }}
                          >
                            <td className="px-4 py-3">
                              <p className="font-semibold text-gray-900 dark:text-foreground">{o.customer.name}</p>
                              {o.customer.phone && <p className="text-xs text-gray-400 dark:text-muted font-mono">{o.customer.phone}</p>}
                            </td>
                            <td className="px-4 py-3">
                              <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold", STATUS_COLORS[o.status])}>
                                {STATUS_LABELS[o.status]}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-semibold text-primary">S/{o.total.toFixed(2)}</td>
                            <td className="px-4 py-3 text-gray-500 dark:text-muted">{formatDate(o.createdAt)}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                <a
                                  href={googleMapsUrl(o.customer.location)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors"
                                  title="Ver en Maps"
                                >
                                  <MapPin className="h-4 w-4" />
                                </a>
                                <button
                                  onClick={() => setConfirmDeleteId(o.id)}
                                  className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                                  title="Eliminar"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="sm:hidden space-y-3">
                    {filteredArchive.map(o => (
                      <div
                        key={o.id}
                        className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 shadow-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-surface transition-colors"
                        onClick={() => { setDetailOrder(o); setShowArchive(false); }}
                      >
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-gray-900 dark:text-foreground">{o.customer.name}</p>
                            {o.customer.phone && <p className="text-xs text-gray-400 dark:text-muted font-mono">{o.customer.phone}</p>}
                            <p className="text-sm text-gray-500 dark:text-muted mt-0.5 truncate">{o.customer.location}</p>
                            <p className="text-xs text-gray-400 dark:text-muted mt-0.5">{formatDate(o.createdAt)}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold", STATUS_COLORS[o.status])}>
                              {STATUS_LABELS[o.status]}
                            </span>
                            <p className="text-sm font-bold text-primary mt-1">S/{o.total.toFixed(2)}</p>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-card-border" onClick={e => e.stopPropagation()}>
                          <a
                            href={googleMapsUrl(o.customer.location)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                          >
                            <MapPin className="h-4 w-4" /> Maps
                          </a>
                          <button
                            onClick={() => setConfirmDeleteId(o.id)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" /> Eliminar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ───────────────────────────────────────── */}
      {confirmDeleteId && (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60" style={{ zIndex: 200 }} onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-foreground">¿Eliminar pedido?</h3>
                <p className="text-sm text-gray-500 dark:text-muted">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-700 dark:text-foreground bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FEATURE 2: Advanced Filters Modal ────────────────────────────────── */}
      {showAdvancedFilters && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowAdvancedFilters(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-card-border shrink-0">
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-foreground text-lg">Filtros Avanzados</h3>
                <p className="text-xs text-gray-400 dark:text-muted mt-0.5">Afina tu búsqueda de pedidos</p>
              </div>
              <button onClick={() => setShowAdvancedFilters(false)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {/* Status multi-select */}
              <div className="space-y-2">
                <p className="text-sm font-bold text-gray-700 dark:text-foreground">Estado</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(Object.keys(STATUS_LABELS) as OrderStatus[]).map(status => (
                    <label
                      key={status}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors",
                        filterStatuses.has(status)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-gray-200 dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={filterStatuses.has(status)}
                        onChange={(e) => {
                          const next = new Set(filterStatuses);
                          if (e.target.checked) next.add(status);
                          else next.delete(status);
                          setFilterStatuses(next);
                        }}
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <span className="text-sm font-semibold">{STATUS_LABELS[status]}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Payment method */}
              <div className="space-y-2">
                <p className="text-sm font-bold text-gray-700 dark:text-foreground">Método de Pago</p>
                <div className="flex gap-2">
                  {(["yape", "efectivo"] as const).map(method => (
                    <button
                      key={method}
                      onClick={() => setFilterPaymentMethod(prev => prev === method ? "" : method)}
                      className={cn(
                        "flex-1 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors",
                        filterPaymentMethod === method
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-gray-200 dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface"
                      )}
                    >
                      {method === "yape" ? "Yape" : "Efectivo"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date range */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <p className="text-sm font-bold text-gray-700 dark:text-foreground">Fecha desde</p>
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-bold text-gray-700 dark:text-foreground">Fecha hasta</p>
                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Amount range */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <p className="text-sm font-bold text-gray-700 dark:text-foreground">Monto mínimo</p>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">S/</span>
                    <input
                      type="number"
                      value={filterAmountMin}
                      onChange={(e) => setFilterAmountMin(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-bold text-gray-700 dark:text-foreground">Monto máximo</p>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">S/</span>
                    <input
                      type="number"
                      value={filterAmountMax}
                      onChange={(e) => setFilterAmountMax(e.target.value)}
                      placeholder="999.99"
                      className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Customer search */}
              <div className="space-y-2">
                <p className="text-sm font-bold text-gray-700 dark:text-foreground">Buscar Cliente</p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={filterCustomerSearch}
                    onChange={(e) => setFilterCustomerSearch(e.target.value)}
                    placeholder="Nombre o teléfono..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Checkboxes */}
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterHasDebt}
                    onChange={(e) => setFilterHasDebt(e.target.checked)}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <div>
                    <p className="text-sm font-semibold text-gray-700 dark:text-foreground">Tiene deuda pendiente</p>
                    <p className="text-xs text-gray-500 dark:text-muted">Solo pedidos con deuda sin cobrar</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterHasAdminNotes}
                    onChange={(e) => setFilterHasAdminNotes(e.target.checked)}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <div>
                    <p className="text-sm font-semibold text-gray-700 dark:text-foreground">Tiene notas internas</p>
                    <p className="text-xs text-gray-500 dark:text-muted">Solo pedidos con comentarios del equipo</p>
                  </div>
                </label>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 dark:border-card-border shrink-0 flex gap-3">
              <button
                onClick={() => {
                  clearAdvancedFilters();
                  setShowAdvancedFilters(false);
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-gray-600 dark:text-muted border border-gray-200 dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface transition-colors"
              >
                Limpiar filtros
              </button>
              <button
                onClick={() => setShowAdvancedFilters(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-colors"
              >
                Aplicar filtros
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Orders pagination */}
      {!loading && activeOrders.length > ORD_PER_PAGE && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={safeOrdPage <= 1} onClick={() => setOrdPage(p => Math.max(1, p - 1))}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-surface transition-colors">
            ← Anterior
          </button>
          <span className="text-xs text-gray-500 dark:text-muted">
            Página {safeOrdPage} de {ordTotalPages} · {activeOrders.length} pedidos
          </span>
          <button disabled={safeOrdPage >= ordTotalPages} onClick={() => setOrdPage(p => p + 1)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-surface transition-colors">
            Siguiente →
          </button>
        </div>
      )}

      {/* ── FEATURE 3: Batch Print Preview Modal ────────────────────────────── */}
      {showPrintPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowPrintPreview(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-card-border shrink-0">
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-foreground text-lg">Vista previa de impresión</h3>
                <p className="text-xs text-gray-400 dark:text-muted mt-0.5">{selectedOrderIds.size} pedido{selectedOrderIds.size > 1 ? "s" : ""} seleccionado{selectedOrderIds.size > 1 ? "s" : ""}</p>
              </div>
              <button onClick={() => setShowPrintPreview(false)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="overflow-y-auto flex-1 p-5">
              <div id="print-content" className="space-y-6">
                {orders.filter(o => selectedOrderIds.has(o.id)).map((order) => {
                  const driver = (order as DbOrder & { deliveryDriver?: string }).deliveryDriver;
                  return (
                    <div
                      key={order.id}
                      className="bg-white border-2 border-gray-300 rounded-lg p-4 print:break-after-page print:border-0 print:rounded-none"
                      style={{ pageBreakAfter: "always" }}
                    >
                      {/* Header */}
                      <div className="text-center mb-4 pb-3 border-b-2 border-dashed border-gray-300">
                        <div className="w-16 h-16 mx-auto mb-2 bg-gray-100 rounded-full flex items-center justify-center">
                          <Store className="h-8 w-8 text-primary" />
                        </div>
                        <h2 className="text-lg font-extrabold text-gray-900">Buleje</h2>
                        <p className="text-xs text-gray-500 mt-0.5">Ticket de Delivery</p>
                      </div>

                      {/* Order info */}
                      <div className="space-y-2 mb-4">
                        <div className="flex justify-between text-sm">
                          <span className="font-bold text-gray-600">Pedido #:</span>
                          <span className="font-mono font-bold">{order.id.slice(-8).toUpperCase()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="font-bold text-gray-600">Fecha:</span>
                          <span>{new Date(order.createdAt).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="font-bold text-gray-600">Estado:</span>
                          <span className="font-bold text-primary">{STATUS_LABELS[order.status]}</span>
                        </div>
                        {driver && (
                          <div className="flex justify-between text-sm">
                            <span className="font-bold text-gray-600">Delivery:</span>
                            <span className="font-bold" style={{ color: driverColor(driver) }}>{driver}</span>
                          </div>
                        )}
                      </div>

                      {/* Customer */}
                      <div className="mb-4 pb-3 border-b border-gray-200">
                        <p className="text-xs font-bold text-gray-500 uppercase mb-1">Cliente</p>
                        <p className="font-bold text-gray-900">{order.customer.name}</p>
                        {order.customer.phone && <p className="text-sm text-gray-600 font-mono">{order.customer.phone}</p>}
                        <p className="text-sm text-gray-600 mt-1">{order.customer.location}</p>
                        {order.customer.reference && <p className="text-xs text-gray-500 mt-0.5">Ref: {order.customer.reference}</p>}
                      </div>

                      {/* Items */}
                      <div className="mb-4">
                        <p className="text-xs font-bold text-gray-500 uppercase mb-2">Productos</p>
                        <div className="space-y-1">
                          {order.items.map((item, i) => (
                            <div key={i} className="flex justify-between text-sm">
                              <span className="flex-1">
                                <span className="font-bold">{item.quantity}×</span> {item.name}
                                <span className="text-gray-400 text-xs ml-1">({item.unit})</span>
                              </span>
                              <span className="font-semibold">S/{(item.price * item.quantity).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Payment */}
                      <div className="mb-4 pb-3 border-b-2 border-gray-300">
                        {order.paymentMethod && (
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-bold text-gray-600">Método de pago:</span>
                            <span className="font-bold">{order.paymentMethod === "yape" ? "Yape" : "Efectivo"}</span>
                          </div>
                        )}
                        {order.deuda && (
                          <div className="bg-red-50 border border-red-200 rounded p-2 mt-2">
                            <p className="text-xs font-bold text-red-700">⚠️ DEUDA PENDIENTE DE COBRO</p>
                          </div>
                        )}
                      </div>

                      {/* Total */}
                      <div className="bg-gray-100 rounded-lg p-3 mb-4">
                        <div className="flex justify-between items-center">
                          <span className="text-lg font-extrabold text-gray-900">TOTAL</span>
                          <span className="text-2xl font-extrabold text-primary">S/{order.total.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Notes */}
                      {order.notes && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-3">
                          <p className="text-xs font-bold text-yellow-800 mb-0.5">Notas del cliente:</p>
                          <p className="text-xs text-yellow-700">{order.notes}</p>
                        </div>
                      )}
                      {(order as DbOrder & { adminNotes?: string }).adminNotes && (
                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 mb-3">
                          <p className="text-xs font-bold text-orange-800 mb-0.5">Notas internas:</p>
                          <p className="text-xs text-orange-700 whitespace-pre-wrap">{(order as DbOrder & { adminNotes?: string }).adminNotes}</p>
                        </div>
                      )}

                      {/* Footer */}
                      <div className="text-center pt-3 border-t border-dashed border-gray-300">
                        <p className="text-xs text-gray-500">¡Gracias por tu compra!</p>
                        <p className="text-xs text-gray-400 mt-1">Productos frescos · Entrega directa</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 dark:border-card-border shrink-0 flex gap-3">
              <button
                onClick={() => setShowPrintPreview(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-gray-600 dark:text-muted border border-gray-200 dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => window.print()}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-colors"
              >
                <Printer className="h-4 w-4" />
                Imprimir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Print-only order summary ── */}
      <div className="hidden print:block print-orders-summary">
        <h1 className="text-lg font-bold mb-1">Resumen de pedidos activos</h1>
        <p className="text-xs text-gray-500 mb-4">{new Date().toLocaleString("es-PE", { timeZone: "America/Lima" })} · {activeOrders.length} pedidos · S/{total.toFixed(2)} total</p>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-900">
              <th className="text-left py-1 pr-2">ID</th>
              <th className="text-left py-1 pr-2">Cliente</th>
              <th className="text-left py-1 pr-2">Teléfono</th>
              <th className="text-left py-1 pr-2">Estado</th>
              <th className="text-left py-1 pr-2">Productos</th>
              <th className="text-right py-1">Total</th>
            </tr>
          </thead>
          <tbody>
            {activeOrders.map(o => (
              <tr key={o.id} className="border-b border-gray-300">
                <td className="py-1.5 pr-2 font-mono">{o.id.slice(-6)}</td>
                <td className="py-1.5 pr-2">{o.customer.name}</td>
                <td className="py-1.5 pr-2">{o.customer.phone || "—"}</td>
                <td className="py-1.5 pr-2">{STATUS_LABELS[o.status]}</td>
                <td className="py-1.5 pr-2">{o.items.map(i => `${i.quantity}× ${i.name}`).join(", ")}</td>
                <td className="py-1.5 text-right font-semibold">S/{o.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bulk order status bar */}
      {selectedOrderIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-primary text-white rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-3 animate-[slideUp_0.2s_ease-out]">
          <span className="text-sm font-bold">{selectedOrderIds.size} pedido{selectedOrderIds.size > 1 ? "s" : ""}</span>
          <button
            onClick={() => setShowPrintPreview(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-semibold transition-colors"
          >
            <Printer className="h-4 w-4" />
            Imprimir seleccionados
          </button>
          <select value={bulkStatusTarget} onChange={e => setBulkStatusTarget(e.target.value as OrderStatus)}
            className="rounded-lg border-0 bg-white/20 text-white text-xs font-semibold px-2 py-1.5 [&>option]:text-gray-900">
            <option value="">Cambiar estado…</option>
            {(Object.keys(STATUS_LABELS) as OrderStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <button onClick={executeBulkStatus} disabled={!bulkStatusTarget || bulkUpdating}
            className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-semibold transition-colors disabled:opacity-50">
            {bulkUpdating ? "Aplicando…" : "Aplicar"}
          </button>
          <button onClick={clearOrderSelection}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold transition-colors">
            Limpiar
          </button>
        </div>
      )}
    </div>
  );
}

// ── SettingsTab extracted to components/admin/SettingsModule.tsx ──
// ── Configuración de tab por defecto por módulo ──────────────────────────────

const NAV_MODULES = [
  {
    id: "ventas-caja",
    name: "Ventas & Caja",
    tabs: [
      { id: "dashboard", label: "Dashboard" },
      { id: "vender", label: "Vender" },
      { id: "turnos", label: "Turnos" },
      { id: "caja", label: "Caja" },
      { id: "pedidos", label: "Pedidos" },
      { id: "fiados", label: "Me deben" },
      { id: "cuadrar", label: "Cuadrar" },
    ],
  },
  {
    id: "inventario",
    name: "Inventario",
    tabs: [
      { id: "stock", label: "Existencias" },
      { id: "alertas", label: "Alertas" },
      { id: "movimientos", label: "Movimientos" },
      { id: "conteo", label: "Conteo fisico" },
      { id: "valorizado", label: "Valorizado" },
    ],
  },
  {
    id: "productos",
    name: "Productos",
    tabs: [
      { id: "dashboard", label: "Dashboard" },
      { id: "catalogo", label: "Catalogo" },
      { id: "categorias", label: "Categorias" },
      { id: "precios", label: "Precios" },
      { id: "promociones", label: "Promociones" },
    ],
  },
  {
    id: "compras",
    name: "Compras",
    tabs: [
      { id: "dashboard", label: "Dashboard" },
      { id: "sugerencias", label: "Sugerencias" },
      { id: "ordenes", label: "Ordenes" },
      { id: "proveedores", label: "Proveedores" },
      { id: "recepcion", label: "Recepcion" },
    ],
  },
  {
    id: "plata",
    name: "Mi Plata",
    tabs: [
      { id: "dashboard", label: "Dashboard" },
      { id: "pl", label: "Ingresos y egresos" },
      { id: "gastos", label: "Gastos" },
      { id: "rentabilidad", label: "Rentabilidad" },
      { id: "presupuesto", label: "Meta vs Real" },
      { id: "reportes", label: "Reportes" },
    ],
  },
  {
    id: "clientes",
    name: "CRM",
    tabs: [
      { id: "dashboard", label: "Dashboard" },
      { id: "clientes", label: "Clientes" },
      { id: "delivery", label: "Delivery" },
      { id: "fidelizacion", label: "Fidelizacion" },
      { id: "segmentos", label: "Segmentos" },
    ],
  },
];

function NavDefaultTabsConfig() {
  const [defaults, setDefaults] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem("nav-default-tabs");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [saved, setSaved] = useState(false);

  const handleChange = (moduleId: string, tabId: string) => {
    const next = { ...defaults, [moduleId]: tabId };
    setDefaults(next);
    localStorage.setItem("nav-default-tabs", JSON.stringify(next));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setDefaults({});
    localStorage.removeItem("nav-default-tabs");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-5 shadow-sm">
      <div className="space-y-1">
        {NAV_MODULES.map((mod) => (
          <div key={mod.id} className="flex items-center justify-between py-2.5 border-b border-gray-100 dark:border-white/5 last:border-b-0">
            <span className="text-sm font-medium text-gray-800 dark:text-foreground">{mod.name}</span>
            <select
              value={defaults[mod.id] ?? mod.tabs[0].id}
              onChange={(e) => handleChange(mod.id, e.target.value)}
              className="text-xs border border-gray-200 dark:border-card-border bg-white dark:bg-card rounded-lg px-2.5 py-1.5 text-gray-700 dark:text-foreground focus:ring-2 focus:ring-[#0f766e]/30 focus:border-[#0f766e] outline-none transition-all"
            >
              {mod.tabs.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-white/5">
        <button
          onClick={handleReset}
          className="text-xs text-gray-400 hover:text-red-500 transition-colors"
        >
          Restablecer todos
        </button>
        {saved && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
            <Check className="h-3 w-3" /> Guardado
          </span>
        )}
      </div>
    </div>
  );
}

function AdminPage() {
  const router = useRouter();
  const VALID_TABS: Tab[] = ["asistente-ia","ventas-caja","inventario","productos","compras","plata","clientes","config","pedidos","plan","analytics-pro","ai-command","fiados","turnos","cotizaciones","guias-remision","notas-credito","contratos","sugerencias-ia","metas-logros","marketplace","delivery-partners"];
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "asistente-ia";
    // 1. Check URL hash first (e.g. /admin#inventario)
    const hash = window.location.hash.slice(1); // remove #
    if (hash) {
      const migrated = TAB_MIGRATION[hash];
      if (migrated) return migrated;
      if (VALID_TABS.includes(hash as Tab)) return hash as Tab;
    }
    // 2. Fallback to localStorage
    try {
      const saved = localStorage.getItem("admin_active_tab");
      if (saved) {
        const migrated = TAB_MIGRATION[saved];
        if (migrated) return migrated;
        if (VALID_TABS.includes(saved as Tab)) return saved as Tab;
      }
    } catch {}
    return "asistente-ia";
  });
  const onboarding = useOnboarding();
  const [storeMode, setStoreModeState] = useState<StoreMode>("whatsapp");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null); // null = "Todas"
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [compactMode, setCompactMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("admin_compact") === "1";
  });
  const [focusMode, setFocusMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("admin_focus_mode") === "1";
  });
  const [presentationMode, setPresentationMode] = useState(false);
  const [showModuleHelp, setShowModuleHelp] = useState(false);
  const [favoriteTabs, setFavoriteTabs] = useState<Set<Tab>>(() => {
    if (typeof window === "undefined") return new Set<Tab>();
    try { const s = localStorage.getItem("admin_fav_tabs"); return s ? new Set<Tab>(JSON.parse(s)) : new Set<Tab>(); } catch { return new Set<Tab>(); }
  });
  const [recentTabs, setRecentTabs] = useState<Tab[]>(() => {
    if (typeof window === "undefined") return [];
    try { const s = localStorage.getItem("admin_recent_tabs"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [recentCollapsed, setRecentCollapsed] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmStep, setClearConfirmStep] = useState<1 | 2 | 3>(1);
  const [clearConfirmText, setClearConfirmText] = useState("");
  const [clearingData, setClearingData] = useState(false);
  const [seedingData, setSeedingData] = useState(false);
  const [clearCategories, setClearCategories] = useState<Set<string>>(() => new Set([
    "products", "customers", "orders", "sales", "suppliers", "promotions",
    "cash", "reviews", "expenses", "returns", "activity", "cms", "notifications",
  ]));
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [openAccordionCategories, setOpenAccordionCategories] = useState<Set<string>>(new Set());
  const [sidebarFlyout, setSidebarFlyout] = useState<{ categoryId: string; top: number } | null>(null);
  const flyoutTimerRef2 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hiddenTabs, setHiddenTabs] = useState<Set<Tab>>(() => {
    if (typeof window === "undefined") return new Set<Tab>();
    try { const s = localStorage.getItem("admin_hidden_tabs"); return s ? new Set<Tab>(JSON.parse(s)) : new Set<Tab>(); } catch { return new Set<Tab>(); }
  });
  const toggleHideTab = (id: Tab) => {
    setHiddenTabs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem("admin_hidden_tabs", JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };
  const [clearedDemoTabs, setClearedDemoTabs] = useState<Set<Tab>>(() => {
    if (typeof window === "undefined") return new Set<Tab>();
    try { const s = localStorage.getItem("admin_demo_cleared"); return s ? new Set<Tab>(JSON.parse(s)) : new Set<Tab>(); } catch { return new Set<Tab>(); }
  });
  const [showModuleManager, setShowModuleManager] = useState(false);
  const [showCierreDiario, setShowCierreDiario] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);

  // IDEA 7: Feria Mode — Modo especial para ferias y eventos
  const [feriaMode, setFeriaMode] = useState<{
    active: boolean;
    name: string;
    discount: number;
    startTime: number;
    salesCount: number;
    salesTotal: number;
  }>(() => {
    if (typeof window === "undefined") return { active: false, name: "", discount: 0, startTime: 0, salesCount: 0, salesTotal: 0 };
    try {
      const raw = localStorage.getItem("feria-mode");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.active) return parsed;
      }
    } catch {}
    return { active: false, name: "", discount: 0, startTime: 0, salesCount: 0, salesTotal: 0 };
  });
  const [showFeriaSetup, setShowFeriaSetup] = useState(false);
  const [feriaName, setFeriaName] = useState("");
  const [feriaDiscount, setFeriaDiscount] = useState("10");

  const toggleFeriaMode = () => {
    if (feriaMode.active) {
      // Desactivar: guardar en historial
      try {
        const history = JSON.parse(localStorage.getItem("feria-history") || "[]");
        history.unshift({
          nombre: feriaMode.name,
          fecha: new Date().toISOString(),
          ventas: feriaMode.salesTotal,
          clientes: feriaMode.salesCount,
          duracion: Math.round((Date.now() - feriaMode.startTime) / 60000),
        });
        localStorage.setItem("feria-history", JSON.stringify(history.slice(0, 10)));
      } catch {}
      const next = { active: false, name: "", discount: 0, startTime: 0, salesCount: 0, salesTotal: 0 };
      setFeriaMode(next);
      localStorage.removeItem("feria-mode");
    } else {
      setShowFeriaSetup(true);
    }
  };

  const startFeria = () => {
    const next = {
      active: true,
      name: feriaName.trim() || "Feria Especial",
      discount: Number(feriaDiscount) || 10,
      startTime: Date.now(),
      salesCount: 0,
      salesTotal: 0,
    };
    setFeriaMode(next);
    localStorage.setItem("feria-mode", JSON.stringify(next));
    setShowFeriaSetup(false);
    setFeriaName("");
    setFeriaDiscount("10");
  };

  // Changelog badge — check if user has seen the latest version
  const [changelogHasNew, setChangelogHasNew] = useState(false);
  useEffect(() => {
    try {
      const lastSeen = localStorage.getItem("changelog-last-seen");
      if (lastSeen !== "2.5") setChangelogHasNew(true);
    } catch {}
  }, []);
  const [demoClearing, setDemoClearing] = useState<Tab | null>(null);
  const dismissDemoTab = (id: Tab) => {
    setClearedDemoTabs(prev => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem("admin_demo_cleared", JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };
  const clearDemoData = async (id: Tab) => {
    const meta = DEMO_DATA_MODULES[id];
    if (!meta?.api) { dismissDemoTab(id); return; }
    setDemoClearing(id);
    try {
      const res = await fetch(meta.api, { method: "DELETE" });
      if (res.ok) dismissDemoTab(id);
    } catch { /* ignore */ }
    setDemoClearing(null);
  };
  const [userRole, setUserRole] = useState<"admin" | "cajero" | "almacenero">("admin");
  const [userName, setUserName] = useState("Admin");
  const [authReady, setAuthReady] = useState(false);
  const [savedRolePerms, setSavedRolePerms] = useState<Record<string, string[]> | null>(null);
  // Plan del tenant — loaded on mount (unused variable kept for future plan gating)
  useScrollLock(mobileNavOpen);
  const { resolved: theme, toggle: toggleTheme } = useTheme();
  const { permission, requestPermission, sendNotification, hasAsked } = useNotifications();

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.mode) setStoreModeState(d.mode);
        if (d?.rolePermissions) setSavedRolePerms(d.rolePermissions);
      })
      .catch(() => {});
    // Plan fetch removed — tenantPlan was unused
    fetch("/api/auth/me")
      .then(r => { if (!r.ok) throw new Error("unauth"); return r.json(); })
      .then(d => {
        if (d?.role) { setUserRole(d.role); setUserName(d.username ?? "admin"); }
        setAuthReady(true);
      })
      .catch(() => {
        fetch("/api/settings")
          .then(r => r.ok ? r.json() : null)
          .then(s => {
            if (s?.adminBypassLogin) {
              return fetch("/api/auth/bypass", { method: "POST" })
                .then(r => { if (!r.ok) throw new Error(); return r.json(); })
                .then(d => { setUserRole(d.role); setUserName(d.name ?? "invitado"); setAuthReady(true); });
            }
            throw new Error("no bypass");
          })
          .catch(() => { router.push("/admin/login"); });
      });
  }, [router]);

  // Webhook queue pending count for sidebar badge
  const [webhookPendingCount, setWebhookPendingCount] = useState(0);
  useEffect(() => {
    if (userRole !== "admin") return;
    const fetchCount = () =>
      fetch("/api/billing/webhook-queue")
        .then(r => r.ok ? r.json() : [])
        .then((items: { processedAt: string | null }[]) =>
          setWebhookPendingCount(items.filter(i => !i.processedAt).length)
        )
        .catch(() => {});
    fetchCount();
    const interval = setInterval(fetchCount, 60_000);
    return () => clearInterval(interval);
  }, [userRole]);

  // Keyboard shortcuts: Alt+1..9,0 for tabs, Alt+? for help
  const SHORTCUT_MAP: Record<string, Tab> = {
    "1": "asistente-ia", "2": "ventas-caja", "3": "inventario", "4": "pedidos",
    "5": "productos", "6": "compras", "7": "plata", "8": "clientes",
    "9": "config", "0": "plan",
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.altKey && SHORTCUT_MAP[e.key]) {
        e.preventDefault();
        navigateTab(SHORTCUT_MAP[e.key]);
      }
      // Ctrl+K / Cmd+K for global search
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(v => !v);
      }
      if (e.key === "?" && e.altKey) {
        e.preventDefault();
        setShowShortcuts(v => !v);
      }
      // Alt+T para toggle theme
      if (e.key === "t" && e.altKey) {
        e.preventDefault();
        toggleTheme();
      }
      // Alt+S para enfocar búsqueda (si existe en el tab actual)
      if (e.key === "s" && e.altKey) {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="text"][placeholder*="Buscar"], input[type="search"]') as HTMLInputElement;
        if (searchInput) searchInput.focus();
      }
      // Alt+N para cerrar sesión (nuevo/salir)
      if (e.key === "l" && e.altKey) {
        e.preventDefault();
        handleLogout();
      }
      // Ctrl+Shift+C para cierre del día
      if (e.ctrlKey && e.shiftKey && e.key === "C") {
        e.preventDefault();
        setShowCierreDiario(v => !v);
      }
      // Ctrl+Shift+P para modo presentación
      if (e.ctrlKey && e.shiftKey && e.key === "P") {
        e.preventDefault();
        setPresentationMode(v => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toggleTheme]);

  // ── Favorites & recent tabs ────────────────────────────────────────
  const toggleFavorite = useCallback((id: Tab) => {
    setFavoriteTabs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem("admin_fav_tabs", JSON.stringify([...next]));
      return next;
    });
  }, []);

  const navigateTab = useCallback((id: Tab) => {
    setTab(id);
    setShowModuleHelp(false);
    try { localStorage.setItem("admin_active_tab", id); } catch {}
    // Persist active tab in URL hash so reloading restores the same tab
    try { window.history.replaceState(null, "", `#${id}`); } catch {}
    setRecentTabs(prev => {
      const next = [id, ...prev.filter(t => t !== id)].slice(0, 5);
      localStorage.setItem("admin_recent_tabs", JSON.stringify(next));
      return next;
    });
  }, []);

  // ── Mejora 13: Scroll to top al cambiar módulo ──
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [tab]);

  // ── Mejora 20: Título dinámico del navegador ──
  useEffect(() => {
    const labels: Record<string, string> = {
      "ventas-caja": "POS",
      "inventario": "Inventario",
      "productos": "Productos",
      "compras": "Compras",
      "plata": "Finanzas",
      "clientes": "CRM",
      "fiados": "Fiados",
      "turnos": "Turnos",
      "recetas": "Recetas",
      "prestamos": "Préstamos",
      "pedidos": "Pedidos",
      "analytics-pro": "Analytics",
      "ai-command": "AI Center",
      "config": "Configuración",
      "asistente-ia": "Asistente IA",
      "cotizaciones": "Cotizaciones",
      "guias-remision": "Guías Remisión",
      "notas-credito": "Notas Crédito",
      "contratos": "Contratos",
      "plan": "Plan",
    };
    document.title = `${labels[tab] || "Panel"} — Buleje`;
  }, [tab]);

  // ── Mejora 16: Swipe para navegar tabs en mobile ──
  const swipeHandlers = useSwipe(
    useCallback(() => {
      // Swipe left → siguiente tab
      const allIds = TAB_CATEGORIES.flatMap(c => c.tabs);
      const idx = allIds.indexOf(tab);
      if (idx >= 0 && idx < allIds.length - 1) navigateTab(allIds[idx + 1]);
    }, [tab, navigateTab]),
    useCallback(() => {
      // Swipe right → tab anterior
      const allIds = TAB_CATEGORIES.flatMap(c => c.tabs);
      const idx = allIds.indexOf(tab);
      if (idx > 0) navigateTab(allIds[idx - 1]);
    }, [tab, navigateTab])
  );

  const toggleCompact = useCallback(() => {
    setCompactMode(prev => { const next = !prev; localStorage.setItem("admin_compact", next ? "1" : "0"); return next; });
  }, []);

  const toggleFocusMode = useCallback(() => {
    setFocusMode(prev => { const next = !prev; localStorage.setItem("admin_focus_mode", next ? "1" : "0"); return next; });
  }, []);

  // ── Auto-start onboarding tour for first-time visitors ──────────────
  useEffect(() => {
    if (onboarding.isFirstVisit && !onboarding.isTourActive) {
      // Small delay so the sidebar renders first
      const t = setTimeout(() => onboarding.startTour(), 800);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fuzzy sidebar search helper ────────────────────────────────────
  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const fuzzyMatch = useCallback((text: string, query: string) => {
    const nt = normalize(text);
    const nq = normalize(query);
    // Simple subsequence match
    let qi = 0;
    for (let i = 0; i < nt.length && qi < nq.length; i++) {
      if (nt[i] === nq[qi]) qi++;
    }
    return qi === nq.length;
  }, []);

  // Alert badges + quick stats powered by /api/admin/stats (lightweight aggregate endpoint)
  const [alerts, setAlerts] = useState<Record<string, number>>({});
  const [quickStats, setQuickStats] = useState<{ pendingOrders: number; todayRevenue: number; lowStockProducts: number; overduePayables?: number; oldPendingOrders?: number } | null>(null);
  const fetchAlerts = useCallback(() => {
    fetch("/api/admin/stats")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        const a: Record<string, number> = {};
        if (d.lowStockProducts > 0) a["inventario"] = d.lowStockProducts;
        if (d.pendingOrders > 0) a.pedidos = d.pendingOrders;
        setAlerts(a);
        setQuickStats({ pendingOrders: d.pendingOrders, todayRevenue: d.todayRevenue, lowStockProducts: d.lowStockProducts, overduePayables: d.overduePayables, oldPendingOrders: d.oldPendingOrders });
      })
      .catch(() => {});
  }, []);
  // 60s polling + immediate on mount
  useEffect(() => {
    // Delay first alert fetch to avoid competing with DashboardTab's initial load
    const t = setTimeout(fetchAlerts, 3000);
    const interval = setInterval(fetchAlerts, 60_000);
    return () => { clearTimeout(t); clearInterval(interval); };
  }, [fetchAlerts]);
  // SSE: instant update when a new order arrives — no more 60s wait
  useEffect(() => {
    if (!authReady) return;
    const es = new EventSource("/api/admin/sse");
    es.addEventListener("new_order", () => fetchAlerts());
    es.onerror = () => { /* reconnect is automatic */ };
    return () => es.close();
  }, [authReady, fetchAlerts]);

  // Push notifications for new orders
  const prevPendingOrders = useRef<number | null>(null);
  useEffect(() => {
    if (!quickStats || prevPendingOrders.current === null) {
      prevPendingOrders.current = quickStats?.pendingOrders ?? 0;
      return;
    }
    const current = quickStats.pendingOrders;
    const previous = prevPendingOrders.current;
    if (current > previous && permission === "granted") {
      const newCount = current - previous;
      sendNotification(
        `${newCount} ${newCount === 1 ? "pedido nuevo" : "pedidos nuevos"}`,
        {
          body: "Haz clic para ver los detalles en el panel de administración",
          tag: "new-orders",
          requireInteraction: false,
        }
      );
    }
    prevPendingOrders.current = current;
  }, [quickStats, permission, sendNotification]);

  // Request notification permission on first load (if not denied)
  useEffect(() => {
    if (!hasAsked && permission === "default" && authReady) {
      const timer = setTimeout(() => {
        requestPermission();
      }, 5000); // Wait 5s after load to avoid overwhelming the user
      return () => clearTimeout(timer);
    }
  }, [hasAsked, permission, authReady, requestPermission]);

  useEffect(() => {
    const root = document.querySelector('[data-admin-shell="true"]');
    if (!root) return;

    const applyMobileTableCards = () => {
      const tables = root.querySelectorAll("table");
      tables.forEach((table) => {
        const headerCells = Array.from(table.querySelectorAll("thead th"));
        const labels = headerCells.map((cell) => (cell.textContent ?? "").replace(/\s+/g, " ").trim());

        table.querySelectorAll("tbody tr").forEach((row) => {
          Array.from(row.children).forEach((cell, index) => {
            if (!(cell instanceof HTMLElement)) return;
            cell.dataset.label = labels[index] || `Campo ${index + 1}`;
          });
        });
      });
    };

    const scheduleApply = () => window.requestAnimationFrame(applyMobileTableCards);
    scheduleApply();

    const observer = new MutationObserver(scheduleApply);
    observer.observe(root, { childList: true, subtree: true });
    window.addEventListener("resize", scheduleApply);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleApply);
    };
  }, [authReady, tab]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/admin/login");
  };

  // ── 8 módulos consolidados + especiales ──────────────────────────────────────
  const ALL_TABS = [
    { id: "asistente-ia" as Tab,   label: "Asistente IA",           icon: Brain },
    { id: "ventas-caja" as Tab,    label: "Ventas & Caja",          icon: ShoppingCart },
    { id: "inventario" as Tab,     label: "Inventario",             icon: Package },
    { id: "productos" as Tab,      label: "Productos & Precios",    icon: Tag },
    { id: "compras" as Tab,        label: "Compras",                icon: Truck },
    { id: "plata" as Tab,          label: "Mi Plata",               icon: DollarSign },
    { id: "clientes" as Tab,       label: "Mis Clientes",           icon: Users },
    // — OPERACIONES —
    { id: "config" as Tab,         label: "Configuración",          icon: Settings },
    { id: "pedidos" as Tab,        label: "Pedidos",                icon: ShoppingBasket },
    // — INTELIGENCIA —
    { id: "analytics-pro" as Tab,  label: "Analytics Pro",          icon: Activity },
    { id: "ai-command" as Tab,     label: "AI Command Center",      icon: Brain },
    { id: "sugerencias-ia" as Tab, label: "Sugerencias IA",          icon: Lightbulb },
    { id: "metas-logros" as Tab,   label: "Metas y Logros",          icon: Target },
    // — FINANZAS EXTRA —
    { id: "prestamos" as Tab,      label: "Préstamos",              icon: Landmark },
    { id: "plan" as Tab,           label: "Plan & Límites",         icon: Zap },
    // — PRODUCCIÓN —
    { id: "recetas" as Tab,        label: "Recetas",                icon: FlaskConical },
    // — DOCUMENTOS COMERCIALES —
    { id: "cotizaciones" as Tab,          label: "Cotizaciones",           icon: ClipboardList },
    { id: "guias-remision" as Tab,        label: "Guías de Remisión",      icon: Truck },
    { id: "notas-credito" as Tab,         label: "Notas de Crédito",       icon: FileText },
    { id: "contratos" as Tab,             label: "Contratos",              icon: FileText },
    // — Declaración Inventario ahora está dentro de Inventario (tab "Declaración") —
    // — MARKETPLACE & DELIVERY —
    { id: "marketplace" as Tab,        label: "Marketplace",          icon: Store },
    { id: "delivery-partners" as Tab,  label: "Delivery Partners",    icon: Truck },
  ] as const;

  // All modules available — no plan gating
  const visibleCategories: TabCategory[] = TAB_CATEGORIES;

  // Role-based tab filtering — populated from lib/module-permissions.ts
  const DEFAULT_ROLE_TABS: Record<string, Tab[]> = {
    admin: ALL_TABS.map(t => t.id),
    cajero: MODULE_PERMISSIONS.cajero as Tab[],
    almacenero: MODULE_PERMISSIONS.almacenero as Tab[],
  };
  const ROLE_TABS: Record<string, Tab[]> = {
    ...DEFAULT_ROLE_TABS,
    ...(savedRolePerms ? Object.fromEntries(
      Object.entries(savedRolePerms).map(([role, tabs]) => [role, tabs as Tab[]])
    ) : {}),
    admin: ALL_TABS.map(t => t.id),
  };
  const allowedTabs = ROLE_TABS[userRole] ?? ROLE_TABS.admin;
  let filteredTabs = ALL_TABS.filter(t => allowedTabs.includes(t.id) && !hiddenTabs.has(t.id));
  
  // Category filtering — usa visibleCategories para respetar plan gating
  if (selectedCategory) {
    const categoryTabs = visibleCategories.find(c => c.id === selectedCategory)?.tabs ?? [];
    filteredTabs = filteredTabs.filter(t => categoryTabs.includes(t.id));
  }

  // Sidebar fuzzy search
  if (sidebarSearch.trim()) {
    filteredTabs = filteredTabs.filter(t => fuzzyMatch(t.label, sidebarSearch.trim()));
  }

  // Favorite & recent subsets for sidebar sections
  const favoriteTabItems = ALL_TABS.filter(t => favoriteTabs.has(t.id) && allowedTabs.includes(t.id));
  const recentTabItems = recentTabs
    .filter(id => id !== tab && !favoriteTabs.has(id) && allowedTabs.includes(id))
    .map(id => ALL_TABS.find(t => t.id === id)!)
    .filter(Boolean)
    .slice(0, 5);
  


  const currentTab = filteredTabs.find(t => t.id === tab) ?? filteredTabs[0];

  const commandItems = useMemo(() => {
    const items: Array<{ id: string; label: string; category: string; icon?: string; onSelect: () => void }> = [];

    const modules: Array<{ id: Tab; label: string; icon: string; category: string }> = [
      { id: "asistente-ia",   label: "Asistente IA",            icon: "🧠", category: "Módulo" },
      { id: "ventas-caja",    label: "Ventas & Caja (POS)",     icon: "🖥️", category: "Módulo" },
      { id: "inventario",     label: "Inventario & Almacenes",  icon: "📦", category: "Módulo" },
      { id: "productos",      label: "Productos & Precios",     icon: "🏪", category: "Módulo" },
      { id: "compras",        label: "Compras & Proveedores",   icon: "📋", category: "Módulo" },
      { id: "plata",          label: "Mi Plata (Finanzas)",     icon: "💵", category: "Módulo" },
      { id: "clientes",       label: "Mis Clientes (CRM)",      icon: "👥", category: "Módulo" },
      { id: "analytics-pro",  label: "Analytics Pro",           icon: "📊", category: "Módulo" },
      { id: "ai-command",     label: "Comandos IA",             icon: "🤖", category: "Módulo" },
      { id: "fiados",         label: "Fiados",                  icon: "💰", category: "Módulo" },
      { id: "turnos",         label: "Turnos de Caja",          icon: "⏱️", category: "Módulo" },
      { id: "recetas",        label: "Recetas & Producción",    icon: "🍳", category: "Módulo" },
      { id: "prestamos",      label: "Préstamos",               icon: "🏦", category: "Módulo" },
      { id: "pedidos",        label: "Pedidos",                 icon: "🛒", category: "Módulo" },
      { id: "cotizaciones",   label: "Cotizaciones",            icon: "📄", category: "Documento" },
      { id: "guias-remision", label: "Guías de Remisión",       icon: "🚚", category: "Documento" },
      { id: "notas-credito",  label: "Notas de Crédito",        icon: "📝", category: "Documento" },
      { id: "contratos",      label: "Contratos",               icon: "📑", category: "Documento" },
      { id: "config",         label: "Configuración",           icon: "⚙️", category: "Sistema" },
      { id: "plan",           label: "Plan & Suscripción",      icon: "⚡", category: "Sistema" },
    ];

    modules.forEach(m => {
      items.push({ ...m, onSelect: () => navigateTab(m.id) });
    });

    items.push(
      { id: "action-new-sale",     label: "Nueva venta (POS)",  icon: "➕", category: "Acción", onSelect: () => navigateTab("ventas-caja") },
      { id: "action-new-product",  label: "Nuevo producto",     icon: "➕", category: "Acción", onSelect: () => navigateTab("productos") },
      { id: "action-new-customer", label: "Nuevo cliente",      icon: "➕", category: "Acción", onSelect: () => navigateTab("clientes") },
      { id: "action-inventario",   label: "Ver stock",          icon: "🔍", category: "Acción", onSelect: () => navigateTab("inventario") },
    );

    return items;
  }, [navigateTab]);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="admin-mobile-cards min-h-screen bg-gray-50 dark:bg-background" data-admin-shell="true">
      {/* Mobile nav overlay */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 sm:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed top-0 left-0 bottom-0 w-72 z-50 bg-white dark:bg-card shadow-2xl flex flex-col transition-transform duration-300 sm:hidden",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-card-border bg-primary/5">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-primary text-white flex items-center justify-center">
              <ShoppingBasket className="h-4 w-4" />
            </div>
            <span className="font-extrabold text-gray-900 dark:text-foreground text-sm">Buleje</span>
          </div>
          <button onClick={() => setMobileNavOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
            <X className="h-5 w-5 text-gray-500 dark:text-muted" />
          </button>
        </div>
        
        {/* Category selector (mobile) */}
        <div className="relative px-3 py-3 border-b border-gray-200 dark:border-card-border">
          <button
            onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-700 dark:text-foreground bg-gray-50 dark:bg-surface hover:bg-gray-100 dark:hover:bg-accent transition-all border border-gray-200 dark:border-card-border"
          >
            <div className="flex items-center gap-2">
              {selectedCategory ? (
                <>
                  {visibleCategories.find(c => c.id === selectedCategory)?.icon && (
                    React.createElement(visibleCategories.find(c => c.id === selectedCategory)!.icon, { className: "h-4 w-4 shrink-0" })
                  )}
                  <span className="truncate">{visibleCategories.find(c => c.id === selectedCategory)?.label}</span>
                </>
              ) : (
                <>
                  <Layers className="h-4 w-4 shrink-0" />
                  <span>Todas las categorías</span>
                </>
              )}
            </div>
            <ChevronDown className={cn("h-4 w-4 transition-transform shrink-0", categoryDropdownOpen && "rotate-180")} />
          </button>
          
          {categoryDropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setCategoryDropdownOpen(false)} />
              <div className="absolute top-full left-3 right-3 mt-1 bg-white dark:bg-card shadow-xl rounded-xl border border-gray-200 dark:border-card-border z-20 max-h-80 overflow-y-auto py-2">
                <button
                  onClick={() => { setSelectedCategory(null); setCategoryDropdownOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors",
                    !selectedCategory ? "bg-primary/10 text-primary" : "text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-surface"
                  )}
                >
                  <Layers className="h-4 w-4 shrink-0" />
                  <span>Todas ({allowedTabs.length})</span>
                </button>
                <div className="h-px bg-gray-100 dark:bg-card-border my-1" />
                {visibleCategories.map(category => {
                  const count = category.tabs.filter(t => allowedTabs.includes(t)).length;
                  if (count === 0) return null;
                  const CategoryIcon = category.icon;
                  return (
                    <button
                      key={category.id}
                      onClick={() => { setSelectedCategory(category.id); setCategoryDropdownOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors",
                        selectedCategory === category.id ? "bg-primary/10 text-primary" : "text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-surface"
                      )}
                    >
                      <CategoryIcon className="h-4 w-4 shrink-0" />
                      <span className="truncate flex-1 text-left">{category.label}</span>
                      <span className="text-xs text-gray-400 dark:text-muted">({count})</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        
        <nav className="flex-1 overflow-y-auto py-3 px-3">
          {/* Sidebar search */}
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-muted" />
            <input
              type="text"
              placeholder="Filtrar módulos…"
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-gray-50 dark:bg-surface border border-gray-200 dark:border-card-border text-gray-700 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>

          {/* Favorite tabs section */}
          {!sidebarSearch && favoriteTabItems.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-muted px-4 mb-1 flex items-center gap-1"><Star className="h-3 w-3" /> Favoritos</p>
              {favoriteTabItems.map(({ id, label, icon: Icon }) => (
                <button
                  key={`fav-${id}`}
                  onClick={() => { navigateTab(id); setMobileNavOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all mb-0.5",
                    tab === id ? "bg-primary text-white shadow-sm" : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
              <div className="h-px bg-gray-100 dark:bg-card-border mx-2 my-1.5" />
            </div>
          )}

          {/* Recent tabs section */}
          {!sidebarSearch && recentTabItems.length > 0 && (
            <div className="mb-2">
              <button onClick={() => setRecentCollapsed(c => !c)} className="w-full text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-muted px-4 mb-1 flex items-center gap-1 hover:text-gray-600 dark:hover:text-foreground transition-colors">
                <Clock className="h-3 w-3" /> Recientes
                {recentCollapsed ? <ChevronDown className="h-3 w-3 ml-auto" /> : <ChevronUp className="h-3 w-3 ml-auto" />}
              </button>
              {!recentCollapsed && recentTabItems.map(({ id, label, icon: Icon }) => (
                <button
                  key={`rec-${id}`}
                  onClick={() => { navigateTab(id); setMobileNavOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all mb-0.5",
                    tab === id ? "bg-primary text-white shadow-sm" : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
              <div className="h-px bg-gray-100 dark:bg-card-border mx-2 my-1.5" />
            </div>
          )}

          {/* All tabs */}
          {filteredTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { navigateTab(id); setMobileNavOpen(false); }}
              className={cn(
                "group w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all mb-1",
                tab === id ? "bg-primary text-white shadow-sm" : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="truncate flex-1 text-left">{label}</span>
              {DEMO_DATA_MODULES[id] && !clearedDemoTabs.has(id) && (
                <span title="Contiene datos de ejemplo" className={cn("h-2 w-2 rounded-full shrink-0", tab === id ? "bg-red-300" : "bg-red-500")} />
              )}
              {alerts[id] && <span className={cn("text-xs font-bold rounded-full px-1.5 py-0.5 min-w-5 text-center", tab === id ? "bg-white/20 text-white" : "bg-red-500 text-white")}>{alerts[id]}</span>}
              <Star
                onClick={e => { e.stopPropagation(); toggleFavorite(id); }}
                className={cn(
                  "h-4 w-4 shrink-0 transition-all cursor-pointer",
                  favoriteTabs.has(id) ? "fill-amber-400 text-amber-400" : "opacity-0 group-hover:opacity-60 text-gray-400"
                )}
              />
            </button>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-gray-200 dark:border-card-border space-y-1">
          <Link href="/" className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-gray-500 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-all">
            <Store className="h-5 w-5" /> Ver tienda
          </Link>
          {userRole === "admin" && (
            <Link href="/admin/webhook-queue" className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-gray-500 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-all">
              <Activity className="h-5 w-5" /> Cola Stripe
              {webhookPendingCount > 0 && (
                <span className="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">{webhookPendingCount}</span>
              )}
            </Link>
          )}
          <button
            onClick={() => { setShowCierreDiario(true); setMobileNavOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-all"
          >
            <Power className="h-5 w-5" /> Cerrar d&iacute;a
          </button>
          {userRole === "admin" && (
            <button
              onClick={() => { setClearConfirmStep(1); setClearConfirmText(""); setShowClearConfirm(true); setMobileNavOpen(false); }}
              disabled={clearingData}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-gray-500 dark:text-muted hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-500 transition-all"
            >
              {clearingData ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
              Borrar datos
            </button>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-gray-500 dark:text-muted hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-500 transition-all"
          >
            <LogOut className="h-5 w-5" /> Cerrar sesi&oacute;n
          </button>
        </div>
      </aside>

      {/* Desktop permanent sidebar */}
      <aside className={cn(
        "hidden sm:flex fixed top-0 left-0 bottom-0 z-40 bg-white dark:bg-card border-r border-gray-200 dark:border-card-border flex-col transition-all duration-300 overflow-hidden",
        focusMode ? "w-16" : "w-64",
        presentationMode && "!hidden"
      )}>
        <div className={cn("flex items-center gap-3 py-5 border-b border-gray-200 dark:border-card-border bg-primary/5 transition-all duration-300", focusMode ? "px-3 justify-center" : "px-5")}>
          <div className="h-9 w-9 rounded-xl bg-primary text-white flex items-center justify-center shadow-sm shrink-0">
            <ShoppingBasket className="h-5 w-5" />
          </div>
          {!focusMode && (
            <>
              <div className="flex-1 min-w-0">
                <p className="font-extrabold text-gray-900 dark:text-foreground text-sm leading-tight">Buleje</p>
                <p className="text-xs text-gray-400 dark:text-muted"><span className="capitalize">{userName}</span> · <span className="uppercase text-[10px] font-bold text-primary">{userRole}</span></p>
              </div>
              <button
                onClick={() => setShowModuleManager(true)}
                title="Gestionar módulos"
                className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
              {userRole === "admin" && (
                <button
                  onClick={() => { setClearConfirmStep(1); setClearConfirmText(""); setShowClearConfirm(true); }}
                  disabled={clearingData}
                  title="Borrar todos los datos"
                  className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  {clearingData ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              )}
            </>
          )}
        </div>
        
        <nav className={cn("flex-1 overflow-y-auto py-3 transition-all duration-300", focusMode ? "px-1" : "px-3")}>
          {/* Sidebar search — hidden in focus mode */}
          {!focusMode && (
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-muted" />
              <input
                type="text"
                placeholder="Filtrar módulos…"
                value={sidebarSearch}
                onChange={e => setSidebarSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-gray-50 dark:bg-surface border border-gray-200 dark:border-card-border text-gray-700 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
          )}

          {/* Favorite tabs section — hidden in focus mode */}
          {!focusMode && !sidebarSearch && favoriteTabItems.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-muted px-4 mb-1 flex items-center gap-1"><Star className="h-3 w-3" /> Favoritos</p>
              {favoriteTabItems.map(({ id, label, icon: Icon }) => (
                <button
                  key={`fav-${id}`}
                  onClick={() => navigateTab(id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all mb-0.5",
                    tab === id ? "bg-primary text-white shadow-sm" : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
              <div className="h-px bg-gray-100 dark:bg-card-border mx-2 my-1.5" />
            </div>
          )}

          {/* Recent tabs section — hidden in focus mode */}
          {!focusMode && !sidebarSearch && recentTabItems.length > 0 && (
            <div className="mb-2">
              <button onClick={() => setRecentCollapsed(c => !c)} className="w-full text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-muted px-4 mb-1 flex items-center gap-1 hover:text-gray-600 dark:hover:text-foreground transition-colors">
                <Clock className="h-3 w-3" /> Recientes
                {recentCollapsed ? <ChevronDown className="h-3 w-3 ml-auto" /> : <ChevronUp className="h-3 w-3 ml-auto" />}
              </button>
              {!recentCollapsed && recentTabItems.map(({ id, label, icon: Icon }) => (
                <button
                  key={`rec-${id}`}
                  onClick={() => navigateTab(id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all mb-0.5",
                    tab === id ? "bg-primary text-white shadow-sm" : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
              <div className="h-px bg-gray-100 dark:bg-card-border mx-2 my-1.5" />
            </div>
          )}

          {/* Category accordion — normal mode, no search */}
          {!focusMode && !sidebarSearch && visibleCategories.map(category => {
            const catTabs = category.tabs.filter(t => allowedTabs.includes(t) && !hiddenTabs.has(t as Tab));
            if (catTabs.length === 0) return null;
            const CategoryIcon = category.icon;
            const isOpen = openAccordionCategories.has(category.id);
            return (
              <div key={category.id} className="mb-0.5">
                <button
                  onClick={() => setOpenAccordionCategories(prev =>
                    prev.has(category.id) ? new Set() : new Set([category.id])
                  )}
                  onMouseEnter={(e) => {
                    if (flyoutTimerRef2.current) clearTimeout(flyoutTimerRef2.current);
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setSidebarFlyout({ categoryId: category.id, top: rect.top });
                  }}
                  onMouseLeave={() => { flyoutTimerRef2.current = setTimeout(() => setSidebarFlyout(null), 150); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all",
                    isOpen ? "bg-primary/10 text-primary" : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
                  )}
                >
                  <CategoryIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate flex-1 text-left">{category.label}</span>
                  <span className="text-[10px] font-bold text-gray-400 dark:text-muted tabular-nums">{catTabs.length}</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200 text-gray-400", isOpen && "rotate-180")} />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="content"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="pl-3 pr-1 pt-0.5 pb-1">
                        {catTabs.map(tabId => {
                          const tabInfo = ALL_TABS.find(t => t.id === tabId);
                          if (!tabInfo) return null;
                          const TabIcon = tabInfo.icon;
                          return (
                            <button
                              key={tabId}
                              data-tour-tab={tabId}
                              onClick={() => navigateTab(tabId as Tab)}
                              className={cn(
                                "group w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all mb-0.5",
                                tab === tabId ? "bg-primary text-white shadow-sm" : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
                              )}
                            >
                              <TabIcon className="h-4 w-4 shrink-0" />
                              <span className="truncate flex-1 text-left">{tabInfo.label}</span>
                              {DEMO_DATA_MODULES[tabId as Tab] && !clearedDemoTabs.has(tabId as Tab) && (
                                <span title="Datos de ejemplo" className={cn("h-1.5 w-1.5 rounded-full shrink-0", tab === tabId ? "bg-red-300" : "bg-red-500")} />
                              )}
                              {alerts[tabId] && <span className={cn("text-xs font-bold rounded-full px-1.5 py-0.5 min-w-5 text-center", tab === tabId ? "bg-white/20 text-white" : "bg-red-500 text-white")}>{alerts[tabId]}</span>}
                              <Star
                                onClick={e => { e.stopPropagation(); toggleFavorite(tabId as Tab); }}
                                className={cn("h-3.5 w-3.5 shrink-0 transition-all cursor-pointer", favoriteTabs.has(tabId as Tab) ? "fill-amber-400 text-amber-400" : "opacity-0 group-hover:opacity-60 text-gray-400")}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
          {/* Flat list when searching */}
          {!focusMode && sidebarSearch && filteredTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              data-tour-tab={id}
              onClick={() => navigateTab(id)}
              className={cn(
                "group w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all mb-1",
                tab === id ? "bg-primary text-white shadow-sm" : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate flex-1 text-left">{label}</span>
              {DEMO_DATA_MODULES[id] && !clearedDemoTabs.has(id) && (
                <span title="Datos de ejemplo" className={cn("h-2 w-2 rounded-full shrink-0", tab === id ? "bg-red-300" : "bg-red-500")} />
              )}
              {alerts[id] && <span className={cn("text-xs font-bold rounded-full px-1.5 py-0.5 min-w-5 text-center", tab === id ? "bg-white/20 text-white" : "bg-red-500 text-white")}>{alerts[id]}</span>}
            </button>
          ))}
          {/* Icon-only in focus mode */}
          {focusMode && filteredTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              data-tour-tab={id}
              onClick={() => navigateTab(id)}
              title={label}
              className={cn(
                "w-full flex items-center justify-center rounded-xl text-sm font-semibold transition-all mb-1 px-0 py-2.5",
                tab === id ? "bg-primary text-white shadow-sm" : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
            </button>
          ))}
        </nav>
        <div className={cn("py-4 border-t border-gray-200 dark:border-card-border space-y-1 transition-all duration-300", focusMode ? "px-1" : "px-3")}>
          <Link href="/" title={focusMode ? "Ver tienda" : undefined} className={cn("flex items-center rounded-xl text-sm font-semibold text-gray-500 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-all", focusMode ? "justify-center px-0 py-2.5" : "gap-3 px-4 py-3")}>
            <Store className="h-5 w-5" /> {!focusMode && "Ver tienda"}
          </Link>
          {userRole === "admin" && (
            <Link href="/admin/webhook-queue" title={focusMode ? "Cola Stripe" : undefined} className={cn("flex items-center rounded-xl text-sm font-semibold text-gray-500 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-all", focusMode ? "justify-center px-0 py-2.5" : "gap-3 px-4 py-3")}>
              <Activity className="h-5 w-5" /> {!focusMode && "Cola Stripe"}
              {!focusMode && webhookPendingCount > 0 && (
                <span className="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">{webhookPendingCount}</span>
              )}
              {focusMode && webhookPendingCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center">{webhookPendingCount}</span>
              )}
            </Link>
          )}
          <button
            onClick={handleLogout}
            title={focusMode ? "Cerrar sesión" : undefined}
            className={cn("w-full flex items-center rounded-xl text-sm font-semibold text-gray-500 dark:text-muted hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-500 transition-all", focusMode ? "justify-center px-0 py-2.5" : "gap-3 px-4 py-3")}
          >
            <LogOut className="h-5 w-5" /> {!focusMode && "Cerrar sesión"}
          </button>
        </div>
      </aside>

      {/* Sidebar category flyout panel */}
      {!focusMode && sidebarFlyout && (() => {
        const cat = visibleCategories.find(c => c.id === sidebarFlyout.categoryId);
        if (!cat) return null;
        const catTabs = cat.tabs.filter(t => allowedTabs.includes(t));
        const FlyoutCatIcon = cat.icon;
        return (
          <motion.div
            key={sidebarFlyout.categoryId}
            initial={{ opacity: 0, x: -8, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.15 }}
            style={{ position: "fixed", top: sidebarFlyout.top, left: 264, zIndex: 50 }}
            onMouseEnter={() => { if (flyoutTimerRef2.current) clearTimeout(flyoutTimerRef2.current); }}
            onMouseLeave={() => { flyoutTimerRef2.current = setTimeout(() => setSidebarFlyout(null), 150); }}
            className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-2xl py-2 w-60 max-h-[80vh] overflow-y-auto"
          >
            <div className="flex items-center gap-2 px-3 pb-2 mb-1 border-b border-gray-100 dark:border-card-border">
              <FlyoutCatIcon className="h-4 w-4 text-primary shrink-0" />
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-muted truncate">{cat.label}</p>
              <span className="ml-auto text-[10px] font-bold text-gray-400 bg-gray-100 dark:bg-surface rounded-full px-1.5 py-0.5 shrink-0">{catTabs.length}</span>
            </div>
            {catTabs.map(tabId => {
              const tabInfo = ALL_TABS.find(t => t.id === tabId);
              if (!tabInfo) return null;
              const FlyoutTabIcon = tabInfo.icon;
              return (
                <button
                  key={tabId}
                  onClick={() => { navigateTab(tabId as Tab); setSidebarFlyout(null); }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors",
                    tab === tabId
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-surface font-medium"
                  )}
                >
                  <FlyoutTabIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate flex-1 text-left">{tabInfo.label}</span>
                  {tab === tabId && <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                </button>
              );
            })}
          </motion.div>
        );
      })()}

      {/* Content area */}
      <div className={cn("flex flex-col min-h-screen transition-[margin] duration-300", presentationMode ? "sm:ml-0" : focusMode ? "sm:ml-16" : "sm:ml-64")}>
      {/* Top bar */}
      <header className={cn("bg-white dark:bg-card border-b border-gray-200 dark:border-card-border px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 sticky top-0 z-40", presentationMode && "!hidden")}>
        <div className="flex items-center gap-3">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileNavOpen(true)}
            className="sm:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors"
            aria-label="Menú"
          >
            <Menu className="h-5 w-5 text-gray-600 dark:text-muted" />
          </button>
          <div className="h-9 w-9 rounded-xl bg-primary text-white items-center justify-center shadow-sm shrink-0 hidden sm:flex">
            <ShoppingBasket className="h-5 w-5" />
          </div>
          <div>
            {/* Mobile: show current tab name */}
            <h1 className="font-extrabold text-gray-900 dark:text-foreground text-base leading-tight sm:hidden truncate max-w-[40vw]">{currentTab.label}</h1>
            <h1 className="font-extrabold text-gray-900 dark:text-foreground text-base leading-tight hidden sm:block">Panel de administración</h1>
            <p className="text-xs text-gray-400 dark:text-muted hidden sm:block">Buleje</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Grupo 1 - Busqueda (siempre visible) */}
          <button
            onClick={() => setSearchOpen(true)}
            title="Busqueda global (Ctrl+K)"
            className="hidden sm:flex items-center gap-1.5 px-3 h-8 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent hover:text-primary transition-colors text-xs font-semibold border border-gray-200 dark:border-card-border"
          >
            <Search className="h-4 w-4" />
            <span>Buscar</span>
            <kbd className="ml-1 text-xs bg-gray-100 dark:bg-surface px-1 rounded opacity-70">Ctrl+K</kbd>
          </button>
          {/* Mobile search icon */}
          <button
            onClick={() => setSearchOpen(true)}
            title="Buscar"
            className="sm:hidden flex items-center justify-center h-8 w-8 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent hover:text-primary transition-colors"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Separador 1 */}
          <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-0.5 hidden sm:block" />

          {/* Grupo 2 - Notificaciones y Acciones (visible desde tablet) */}
          <div className="hidden sm:block">
            <NotificationBell />
          </div>
          <AlertCenter
            pendingOrders={quickStats?.pendingOrders ?? 0}
            lowStock={quickStats?.lowStockProducts ?? 0}
            todayRevenue={quickStats?.todayRevenue ?? 0}
            overduePayables={quickStats?.overduePayables ?? 0}
            oldPendingOrders={quickStats?.oldPendingOrders ?? 0}
            onNavigate={(t) => navigateTab(t as Tab)}
          />
          {/* IDEA 7: Feria Mode toggle */}
          <button
            onClick={toggleFeriaMode}
            title={feriaMode.active ? `Feria activa: ${feriaMode.name}` : "Activar Modo Feria"}
            className={cn(
              "hidden md:flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors border",
              feriaMode.active
                ? "bg-gradient-to-r from-[#f97316]/20 to-amber-100 dark:from-[#f97316]/20 dark:to-amber-900/30 text-[#f97316] border-[#f97316]/40 animate-pulse"
                : "text-gray-500 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent border-gray-200 dark:border-gray-700"
            )}
          >
            <Cake className="h-4 w-4" />
            <span>{feriaMode.active ? "Feria" : "Feria"}</span>
          </button>
          <button
            onClick={() => setShowCierreDiario(true)}
            title="Cerrar dia (Ctrl+Shift+C)"
            className="hidden md:flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors border border-amber-200 dark:border-amber-800"
          >
            <Power className="h-4 w-4" />
            <span>Cerrar dia</span>
          </button>

          {/* Separador 2 */}
          <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-0.5 hidden lg:block" />

          {/* Grupo 3 - Vista (solo desktop lg+) */}
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            className="hidden md:flex items-center justify-center h-8 w-8 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent hover:text-primary transition-colors"
          >
            <motion.div
              animate={{ rotate: theme === "dark" ? 180 : 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </motion.div>
          </button>
          <button
            onClick={toggleFocusMode}
            title={focusMode ? "Salir modo enfoque" : "Modo enfoque"}
            className="hidden lg:flex items-center justify-center h-8 w-8 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent hover:text-primary transition-colors"
          >
            {focusMode ? <Minimize2 className="h-4 w-4 text-primary" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setPresentationMode(true)}
            title="Modo presentacion (Ctrl+Shift+P)"
            className="hidden lg:flex items-center justify-center h-8 w-8 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent hover:text-primary transition-colors"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            onClick={toggleCompact}
            title={compactMode ? "Modo normal" : "Modo compacto"}
            className="hidden lg:flex items-center justify-center h-8 w-8 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent hover:text-primary transition-colors"
          >
            <SlidersHorizontal className={cn("h-4 w-4", compactMode && "text-primary")} />
          </button>
          <button
            onClick={() => setShowShortcuts(v => !v)}
            title="Atajos de teclado (Alt+?)"
            className="hidden lg:flex items-center justify-center h-8 w-8 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent hover:text-primary transition-colors text-xs font-bold"
          >
            ⌨
          </button>
          <button
            onClick={() => window.print()}
            title="Exportar a PDF"
            className="hidden lg:flex items-center justify-center h-8 w-8 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent hover:text-primary transition-colors"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={() => { setShowChangelog(true); setChangelogHasNew(false); localStorage.setItem("changelog-last-seen", "2.5"); }}
            title="Novedades del sistema"
            className="hidden lg:flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold text-gray-400 dark:text-muted hover:bg-primary/10 hover:text-primary transition-colors border border-gray-200 dark:border-card-border relative"
          >
            <Sparkles className="h-4 w-4" />
            <span>Novedades</span>
            {changelogHasNew && (
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-card" />
            )}
          </button>

          {/* Separador 3 */}
          <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-0.5 hidden lg:block" />

          {/* Grupo 4 - Links y salir */}
          <Link href="/" className="text-xs sm:text-sm font-semibold text-gray-400 dark:text-muted hover:text-primary transition-colors hidden lg:block">Ver tienda</Link>
          {userRole === "admin" && (
            <>
              <button
                onClick={() => {
                  if (seedingData) return;
                  setSeedingData(true);
                  fetch("/api/admin/seed-data", { method: "POST" })
                    .then(r => r.json())
                    .then(d => { if (d.success) window.location.reload(); else alert(d.error || "Error al generar datos"); })
                    .catch(() => alert("Error de conexion"))
                    .finally(() => setSeedingData(false));
                }}
                disabled={seedingData}
                title="Generar datos de simulacion"
                className="hidden lg:flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold text-gray-400 dark:text-muted hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:text-blue-600 transition-colors border border-gray-200 dark:border-card-border"
              >
                {seedingData ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                <span>Simulacion</span>
              </button>
              <button
                onClick={() => { setClearConfirmStep(1); setClearConfirmText(""); setShowClearConfirm(true); }}
                disabled={clearingData}
                title="Borrar todos los datos"
                className="hidden lg:flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold text-gray-400 dark:text-muted hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-500 transition-colors border border-gray-200 dark:border-card-border"
              >
                {clearingData ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                <span>Borrar datos</span>
              </button>
            </>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 dark:text-muted hover:text-red-500 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      {/* Command Palette global — Ctrl+K en todo el panel */}
      <AdminCommandPalette items={commandItems} />

      {/* Clear data confirmation modal — extracted to AdminModals */}
      <ClearDataModal
        open={showClearConfirm}
        clearConfirmStep={clearConfirmStep}
        setClearConfirmStep={setClearConfirmStep}
        clearConfirmText={clearConfirmText}
        setClearConfirmText={setClearConfirmText}
        clearCategories={clearCategories}
        setClearCategories={setClearCategories}
        clearingData={clearingData}
        setClearingData={setClearingData}
        onClose={() => setShowClearConfirm(false)}
        demoDataModuleKeys={Object.keys(DEMO_DATA_MODULES)}
      />


      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={(t) => navigateTab(t as Tab)}
      />

      {tab !== "asistente-ia" && <AIFloatingButton moduleContext={tab} />}

      {/* ── IDEA 7: Feria Mode Banner & Setup Modal ── */}
      {feriaMode.active && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-r from-[#f97316] to-amber-500 text-white px-4 py-2 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <Cake className="h-5 w-5 animate-bounce" />
            <span className="font-bold text-sm">{feriaMode.name}</span>
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{feriaMode.discount}% dcto</span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span>{feriaMode.salesCount} ventas</span>
            <span>S/{feriaMode.salesTotal.toFixed(0)}</span>
            <span>
              {(() => {
                const mins = Math.round((Date.now() - feriaMode.startTime) / 60000);
                const h = Math.floor(mins / 60);
                const m = mins % 60;
                return h > 0 ? `${h}h ${m}m` : `${m}m`;
              })()}
            </span>
            <button onClick={toggleFeriaMode} className="px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 font-bold text-xs transition-colors">
              Terminar feria
            </button>
          </div>
        </div>
      )}
      {showFeriaSetup && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowFeriaSetup(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-xl max-w-sm w-full p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Cake className="h-6 w-6 text-[#f97316]" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground">Activar Modo Feria</h3>
            </div>
            <input
              type="text"
              placeholder="Nombre del evento (ej: San Juan 2026)"
              value={feriaName}
              onChange={e => setFeriaName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316]/40"
              autoFocus
            />
            <div>
              <label className="text-xs font-bold text-gray-600 mb-1 block">Descuento global (%)</label>
              <input
                type="number"
                min="0"
                max="50"
                value={feriaDiscount}
                onChange={e => setFeriaDiscount(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316]/40"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowFeriaSetup(false)} className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-bold text-gray-600">Cancelar</button>
              <button onClick={startFeria} className="flex-1 py-2.5 rounded-xl bg-[#f97316] text-white text-sm font-bold hover:bg-[#e8934e] transition-colors">
                Iniciar Feria
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cierre Diario Modal ── */}
      <CierreDiarioModal open={showCierreDiario} onClose={() => setShowCierreDiario(false)} />

      {/* ── Changelog Modal ── */}
      <ChangelogModal open={showChangelog} onClose={() => setShowChangelog(false)} />

      {/* ── Module Manager Modal ── */}
      {showModuleManager && (
        <div className="fixed inset-0 z-100 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModuleManager(false)} />
          <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
            <div className="bg-white dark:bg-card rounded-2xl shadow-2xl border border-gray-200 dark:border-card-border w-full max-w-3xl max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 dark:border-card-border">
                <div>
                  <h2 className="font-extrabold text-gray-900 dark:text-foreground text-lg">Gestionar módulos</h2>
                  <p className="text-xs text-gray-400 dark:text-muted mt-0.5">Activa, oculta o limpia datos de ejemplo por módulo</p>
                </div>
                <button onClick={() => setShowModuleManager(false)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
              {/* Stats strip */}
              <div className="px-6 py-3 bg-gray-50 dark:bg-surface border-b border-gray-200 dark:border-card-border space-y-2.5">
                <div className="flex gap-6">
                  <div className="text-center">
                    <div className="text-xl font-extrabold text-primary">{allowedTabs.length}</div>
                    <div className="text-[10px] text-gray-400 uppercase font-semibold">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-extrabold text-emerald-600">{allowedTabs.length - hiddenTabs.size}</div>
                    <div className="text-[10px] text-gray-400 uppercase font-semibold">Visibles</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-extrabold text-gray-400">{hiddenTabs.size}</div>
                    <div className="text-[10px] text-gray-400 uppercase font-semibold">Ocultos</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-extrabold text-red-500">{Object.keys(DEMO_DATA_MODULES).filter(t => !clearedDemoTabs.has(t as Tab)).length}</div>
                    <div className="text-[10px] text-gray-400 uppercase font-semibold">Con demo</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mr-1">Prioridad:</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">● Esencial</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400">● Alta</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">● Media</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400">● Normal</span>
                </div>
              </div>
              {/* Tab list */}
              <div className="overflow-y-auto flex-1 py-2">
                {visibleCategories.map(category => {
                  const catTabs = category.tabs.filter(t => allowedTabs.includes(t));
                  if (catTabs.length === 0) return null;
                  const CatIcon = category.icon;
                  return (
                    <div key={category.id} className="mb-1">
                      <div className="flex items-center gap-2 px-6 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-muted sticky top-0 bg-white dark:bg-card z-10">
                        <CatIcon className="h-3 w-3" />
                        <span>{category.label}</span>
                      </div>
                      {catTabs.map(tabId => {
                        const tabInfo = ALL_TABS.find(t => t.id === tabId);
                        if (!tabInfo) return null;
                        const TabIcon = tabInfo.icon;
                        const isHidden = hiddenTabs.has(tabId as Tab);
                        const hasDemo = !!DEMO_DATA_MODULES[tabId as Tab] && !clearedDemoTabs.has(tabId as Tab);
                        const isClearing = demoClearing === tabId;
                        const moduleInfo = MODULE_INFO[tabId as Tab];
                        const priorityConfig = {
                          core:   { label: "Esencial",  cls: "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400",     dot: "● " },
                          high:   { label: "Alta",      cls: "bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400", dot: "● " },
                          medium: { label: "Media",     cls: "bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",  dot: "● " },
                          low:    { label: "Normal",    cls: "bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400",  dot: "● " },
                        };
                        const pCfg = moduleInfo ? priorityConfig[moduleInfo.priority] : null;
                        return (
                          <div key={tabId} className={cn("flex items-start gap-3 px-5 py-2.5 hover:bg-gray-50 dark:hover:bg-surface transition-colors", isHidden && "opacity-50")}>
                            <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0 relative mt-0.5", isHidden ? "bg-gray-100 dark:bg-surface" : "bg-primary/10")}>
                              {moduleInfo?.emoji
                                ? <span className="text-lg leading-none select-none">{moduleInfo.emoji}</span>
                                : <TabIcon className={cn("h-4 w-4", isHidden ? "text-gray-400" : "text-primary")} />
                              }
                              {hasDemo && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={cn("text-sm font-bold", isHidden ? "text-gray-400" : "text-gray-800 dark:text-foreground")}>{tabInfo.label}</span>
                                {pCfg && (
                                  <span className={cn("shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide", pCfg.cls)}>
                                    {pCfg.dot}{pCfg.label}
                                  </span>
                                )}
                                {hasDemo && (
                                  <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-950/30 px-1.5 py-0.5 rounded-full">
                                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 inline-block" />
                                    Demo
                                  </span>
                                )}
                              </div>
                              {moduleInfo?.desc && (
                                <p className="text-[11px] text-gray-500 dark:text-muted mt-0.5 leading-snug line-clamp-2">{moduleInfo.desc}</p>
                              )}
                              {moduleInfo?.tip && (
                                <p className="text-[11px] text-primary/70 dark:text-primary/60 mt-0.5 leading-snug">💡 {moduleInfo.tip}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0 pt-0.5">
                              {hasDemo && (
                                <button
                                  onClick={() => clearDemoData(tabId as Tab)}
                                  disabled={isClearing}
                                  className="text-xs font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                                >
                                  {isClearing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Eliminar datos"}
                                </button>
                              )}
                              <button
                                onClick={() => toggleHideTab(tabId as Tab)}
                                title={isHidden ? "Mostrar módulo" : "Ocultar módulo"}
                                className={cn(
                                  "h-8 w-8 rounded-lg flex items-center justify-center transition-colors",
                                  isHidden
                                    ? "bg-gray-100 dark:bg-surface text-gray-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:text-emerald-600"
                                    : "bg-primary/10 text-primary hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-500"
                                )}
                              >
                                {isHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-card-border">
                {hiddenTabs.size > 0 ? (
                  <button
                    onClick={() => { setHiddenTabs(new Set()); try { localStorage.removeItem("admin_hidden_tabs"); } catch {} }}
                    className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1.5"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Mostrar todos ({hiddenTabs.size})
                  </button>
                ) : <div />}
                <button
                  onClick={() => setShowModuleManager(false)}
                  className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  Listo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Breadcrumb — enhanced with clickable category navigation */}
      <nav aria-label="Breadcrumb" className={cn("hidden sm:flex items-center gap-1.5 px-6 py-2 text-xs text-gray-400 dark:text-muted bg-gray-50 dark:bg-surface border-b border-gray-100 dark:border-card-border", presentationMode && "!hidden")}>
        <button onClick={() => navigateTab("asistente-ia")} className="hover:text-primary transition-colors">
          Panel
        </button>
        {(() => {
          const cat = TAB_CATEGORIES.find(c => (c.tabs as readonly string[]).includes(tab));
          if (cat && tab !== "asistente-ia") return (
            <>
              <ChevronRight className="h-3 w-3" />
              <button onClick={() => setSelectedCategory(cat.id)} className="hover:text-primary transition-colors">
                {cat.label}
              </button>
            </>
          );
          return null;
        })()}
        <ChevronRight className="h-3 w-3" />
        <span className="text-gray-700 dark:text-foreground font-semibold">{currentTab.label}</span>
      </nav>

      {/* Mejora 4: Recent tabs as quick-access chips */}
      {(() => {
        const chips = recentTabs
          .filter(id => id !== tab)
          .map(id => ALL_TABS.find(t => t.id === id))
          .filter(Boolean)
          .slice(0, 4);
        if (chips.length < 2 || presentationMode) return null;
        return (
          <div className="hidden sm:flex gap-2 px-6 py-1.5 border-b border-gray-100 dark:border-gray-800 overflow-x-auto bg-gray-50/50 dark:bg-surface/50">
            <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 self-center mr-1">Recientes:</span>
            {chips.map(t => t && (
              <button
                key={t.id}
                onClick={() => navigateTab(t.id)}
                className="px-3 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-[#0f766e] hover:text-white transition-all whitespace-nowrap font-medium"
              >
                {t.label}
              </button>
            ))}
          </div>
        );
      })()}

      {/* Quick stats bars (mobile + desktop) — extracted to AdminStats */}
      {quickStats && <AdminStatsMobile quickStats={quickStats} navigateTab={navigateTab} />}
      {quickStats && <AdminStatsDesktop quickStats={quickStats} navigateTab={navigateTab} />}

      {/* Body */}
      <main
        className={cn("flex-1 mx-auto w-full pb-24 sm:pb-8", presentationMode ? "max-w-full px-4 py-4" : "max-w-7xl", compactMode && !presentationMode ? "px-2 sm:px-3 py-2 sm:py-4" : !presentationMode ? "px-3 sm:px-6 py-4 sm:py-8" : "")}
        {...swipeHandlers}
      >
        {/* Breadcrumb navigation */}
        {tab !== "asistente-ia" && (
          <nav className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-muted mb-3 overflow-x-auto" aria-label="Breadcrumb">
            <button onClick={() => navigateTab("asistente-ia")} className="hover:text-primary transition-colors shrink-0">Inicio</button>
            {(() => {
              const cat = TAB_CATEGORIES.find(c => (c.tabs as readonly string[]).includes(tab));
              if (cat) return (
                <>
                  <ChevronRight className="h-3 w-3 shrink-0" />
                  <button onClick={() => setSelectedCategory(cat.id)} className="hover:text-primary transition-colors shrink-0">{cat.label}</button>
                </>
              );
              return null;
            })()}
            <ChevronRight className="h-3 w-3 shrink-0" />
            <span className="font-semibold text-gray-700 dark:text-foreground shrink-0">{ALL_TABS.find(t => t.id === tab)?.label ?? tab}</span>
          </nav>
        )}
        {/* ── Mejora 12: Transición suave al cambiar módulo ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* ── 1. Asistente IA ── */}
            {tab === "asistente-ia" && <AsistenteIAModule />}
            {/* ── 2. Ventas & Caja ── */}
            {tab === "ventas-caja" && <POSCajaModule />}
            {/* ── 3. Inventario ── */}
            {tab === "inventario" && <InventarioAlmacenesModule />}
            {/* ── 4. Productos & Precios ── */}
            {tab === "productos" && <CatalogoTiendaModule />}
            {/* ── 5. Compras ── */}
            {tab === "compras" && <ComprasModule />}
            {/* ── 6. Mi Plata ── */}
            {tab === "plata" && <FinanzasModule />}
            {/* ── 7. Mis Clientes ── */}
            {tab === "clientes" && <CRMClientesModule />}
            {/* ── Módulos adicionales ── */}
            {tab === "fiados" && <FiadosModule />}
            {tab === "turnos" && <TurnosModule />}
            {tab === "recetas" && <RecetasModule />}
            {tab === "prestamos" && <PrestamosModule />}
            {/* ── Documentos ── */}
            {tab === "cotizaciones" && <CotizacionesModule />}
            {tab === "guias-remision" && <GuiasRemisionModule />}
            {tab === "notas-credito" && <NotasCreditoModule />}
            {tab === "contratos" && <ContratosModule />}
            {/* ── Módulos nuevos ── */}
            {tab === "auditoria" && <AuditTrailModule />}
            {tab === "devoluciones-proveedor" && <DevolucionesProveedorModule />}
            {tab === "tesoreria" && <TreasuryDashboard />}
            {tab === "promociones" && <PromocionesModule />}
            {tab === "scoring" && <ScoringCrediticioTab />}
            {/* Declaración Inventario movido dentro del módulo Inventario */}
            {/* ── 8. Configuración ── */}
            {tab === "config" && (
              <div className="space-y-8">
                <SettingsModule storeMode={storeMode} onModeChange={setStoreModeState} />
                <div className="pt-8 border-t border-gray-200 dark:border-card-border">
                  {/* Mejora 16 (R3): Sección con icono y subtítulo descriptivo */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-xl bg-cyan-50 dark:bg-cyan-900/20 flex items-center justify-center shrink-0">
                      <Users className="h-5 w-5 text-cyan-500" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-foreground">Gestión de Equipo</h3>
                      <p className="text-xs text-gray-500 dark:text-muted">Gestiona tu equipo y control de acceso por rol</p>
                    </div>
                  </div>
                  <TeamTab />
                </div>
                {/* ── Navegación por defecto ── */}
                <div className="pt-8 border-t border-gray-200 dark:border-card-border">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center shrink-0">
                      <SlidersHorizontal className="h-5 w-5 text-violet-500" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-foreground">Navegacion</h3>
                      <p className="text-xs text-gray-500 dark:text-muted">Configura que tab se abre por defecto en cada seccion</p>
                    </div>
                  </div>
                  <NavDefaultTabsConfig />
                </div>
                {/* ── Repetir tutorial ── */}
                <div className="pt-8 border-t border-gray-200 dark:border-card-border">
                  <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0">
                        <span className="text-xl">🎓</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 dark:text-foreground text-sm">Tutorial de bienvenida</p>
                        <p className="text-xs text-gray-500 dark:text-muted">Repasa cómo funciona cada sección del panel</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        onboarding.resetTour();
                        setTab("asistente-ia");
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#0f766e] hover:bg-[#0d5f58] shadow-sm transition-colors shrink-0"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Repetir tutorial de bienvenida
                    </button>
                  </div>
                </div>
              </div>
            )}
            {/* ── Especiales ── */}
            {tab === "pedidos" && <OrdersTab />}
            {tab === "plan" && <PlanTab />}
            {/* ── Módulos avanzados ── */}
            {tab === "analytics-pro" && <AnalyticsProModule />}
            {tab === "ai-command" && <AICommandModule />}
            {tab === "sugerencias-ia" && <SugerenciasIAModule />}
            {tab === "metas-logros" && <MetasLogrosModule />}
            {/* ── Marketplace & Delivery ── */}
            {tab === "marketplace" && <MarketplaceModule />}
            {tab === "delivery-partners" && <DeliveryPartnersModule />}
          </motion.div>
        </AnimatePresence>

        {/* ── Mejora 10: Botón de ayuda rápida por módulo ── */}
        {(() => {
          const AYUDA: Partial<Record<Tab, string[]>> = {
            "ventas-caja": [
              "Busca productos por nombre o escanea el código de barras",
              "Usa F1 para buscar, F2 para cobrar rápido",
              "Puedes combinar efectivo + Yape en el mismo pago",
              "Pulsa 'Historial' para ver las ventas del día",
            ],
            "inventario": [
              "El semáforo te muestra el estado del stock de cada producto",
              "Usa 'Conteo Físico' para hacer inventario guiado con escáner",
              "Exporta tu inventario para el contador con 'Descargar para mi Contador'",
            ],
            "fiados": [
              "La 'Libreta' simula tu cuaderno de fiados de papel",
              "El score de estrellas te dice qué tan puntual es el cliente",
              "Usa 'Lista de cobro' para imprimir y salir a cobrar",
            ],
            "plata": [
              "El semáforo financiero te dice si tu negocio va bien de un vistazo",
              "Usa 'Presupuesto' para controlar gastos por categoría",
              "El reporte bancario genera un PDF para pedir crédito",
            ],
            "productos": [
              "Crea categorías y organiza tu catálogo para que los clientes encuentren todo rápido",
              "Usa el historial de precios para ver cómo han cambiado los costos",
              "Los cupones y promociones se activan desde esta sección",
            ],
            "compras": [
              "Registra tus proveedores y evalúa su desempeño con el Scorecard",
              "Usa el plan de compras para saber qué necesitas pedir esta semana",
              "La recepción verifica cantidades y detecta faltantes automáticamente",
            ],
            "clientes": [
              "El CRM 360 muestra todo el historial de cada cliente en una sola vista",
              "El programa de puntos fideliza a tus mejores compradores",
              "Gestiona delivery, rutas y horarios de entrega desde aquí",
            ],
            "pedidos": [
              "Centraliza pedidos de WhatsApp, tienda online y mostrador",
              "Cambia el estado del pedido y el cliente recibe notificación automática",
              "Filtra por estado, fecha o monto para encontrar pedidos rápido",
            ],
            "config": [
              "Configura los datos de tu negocio: nombre, dirección y horarios",
              "Gestiona usuarios y permisos del equipo",
              "Personaliza la apariencia de tu tienda online",
            ],
            "asistente-ia": [
              "El asistente IA te da un resumen diario del negocio cada mañana",
              "Pregunta lo que necesites: ventas, stock, clientes, tendencias",
              "Las alertas inteligentes te avisan de oportunidades y riesgos",
            ],
            "sugerencias-ia": [
              "Revisa combos sugeridos según lo que tus clientes compran juntos",
              "Busca un cliente y ve qué productos recomendarle",
              "La IA te dice qué productos comprar para tu stock",
            ],
            "metas-logros": [
              "Configura metas diarias, semanales y mensuales",
              "Desbloquea logros vendiendo más y siendo constante",
              "Mira tu racha de días consecutivos alcanzando la meta",
            ],
          };
          const tips = AYUDA[tab];
          if (!tips) return null;
          const tabLabel = ALL_TABS.find(t => t.id === tab)?.label ?? tab;
          return (
            <>
              <button
                onClick={() => setShowModuleHelp(true)}
                className="fixed bottom-20 right-6 z-40 h-10 w-10 rounded-full bg-primary text-white shadow-lg flex items-center justify-center hover:bg-primary/90 transition-all text-lg font-bold"
                title={`Ayuda — ${tabLabel}`}
              >
                ?
              </button>
              <AnimatePresence>
                {showModuleHelp && (
                  <motion.div
                    className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowModuleHelp(false)}
                    onKeyDown={(e) => { if (e.key === "Escape") setShowModuleHelp(false); }}
                  >
                    <motion.div
                      className="bg-white dark:bg-card rounded-2xl shadow-xl max-w-md w-full p-6"
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.95, opacity: 0 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <h3 className="text-lg font-extrabold text-foreground mb-4">
                        Ayuda — {tabLabel}
                      </h3>
                      <ul className="space-y-3">
                        {tips.map((tip, i) => (
                          <li key={i} className="flex items-start gap-2.5 text-sm text-muted">
                            <span className="mt-0.5 h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                              {i + 1}
                            </span>
                            {tip}
                          </li>
                        ))}
                      </ul>
                      <button
                        onClick={() => setShowModuleHelp(false)}
                        className="mt-6 w-full py-2.5 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-colors"
                      >
                        Entendido
                      </button>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          );
        })()}
      </main>

      {/* Focus mode floating expand toggle — only on desktop */}
      {focusMode && !presentationMode && (
        <button
          onClick={toggleFocusMode}
          className="hidden sm:flex fixed bottom-6 left-4 z-50 h-10 w-10 rounded-full bg-primary text-white shadow-lg items-center justify-center hover:bg-primary/90 transition-all"
          title="Expandir sidebar"
        >
          <Maximize2 className="h-5 w-5" />
        </button>
      )}

      {/* Presentation mode — floating exit button */}
      {presentationMode && (
        <button
          onClick={() => setPresentationMode(false)}
          className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2 rounded-xl bg-black/30 backdrop-blur-md text-white/80 text-sm font-semibold hover:bg-black/50 hover:text-white transition-all shadow-lg"
          title="Salir de presentación (Ctrl+Shift+P)"
        >
          <EyeOff className="h-4 w-4" />
          Salir
        </button>
      )}

      {/* Keyboard shortcuts modal — extracted to AdminModals */}
      <ShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />

      {/* ── Mobile quick-tab bottom bar ─────────────────────────────────────── */}
      {(() => {
        const MOBILE_PRIORITY: Record<string, Tab[]> = {
          admin:      ["asistente-ia", "ventas-caja", "pedidos", "inventario"],
          cajero:     ["asistente-ia", "ventas-caja", "pedidos", "clientes"],
          almacenero: ["asistente-ia", "inventario", "compras", "plata"],
        };
        const priorityIds = MOBILE_PRIORITY[userRole] ?? MOBILE_PRIORITY.admin;
        const quickTabs = priorityIds
          .map(id => filteredTabs.find(t => t.id === id))
          .filter((t): t is NonNullable<typeof t> => t != null);
        return (
          <nav
            className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-card border-t border-gray-200 dark:border-card-border flex items-stretch"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 4px)" }}
            aria-label="Navegación rápida"
          >
            {quickTabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => navigateTab(id)}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold transition-colors relative",
                  tab === id ? "text-primary" : "text-gray-400 dark:text-muted"
                )}
                aria-current={tab === id ? "page" : undefined}
              >
                {alerts[id] ? (
                  <span className="relative inline-flex">
                    <Icon className="h-5 w-5" />
                    <span className="absolute -top-1 -right-2 min-w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-extrabold flex items-center justify-center px-0.5">{alerts[id]}</span>
                  </span>
                ) : (
                  <Icon className="h-5 w-5" />
                )}
                <span className="leading-tight truncate max-w-14">{label}</span>
                {tab === id && <span className="absolute top-0 inset-x-0 h-0.5 bg-primary" />}
              </button>
            ))}
            {(() => {
              const otherAlerts = Object.entries(alerts)
                .filter(([id]) => !priorityIds.includes(id as Tab))
                .reduce((sum, [, v]) => sum + v, 0);
              return (
                <button
                  onClick={() => setMobileNavOpen(true)}
                  className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-muted transition-colors"
                  aria-label="Más opciones"
                >
                  <span className="relative inline-flex">
                    <Menu className="h-5 w-5" />
                    {otherAlerts > 0 && (
                      <span className="absolute -top-1 -right-2 min-w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-extrabold flex items-center justify-center px-0.5">{otherAlerts}</span>
                    )}
                  </span>
                  <span className="leading-tight">Más</span>
                </button>
              );
            })()}
          </nav>
        );
      })()}
      <SSEListener />
      <MorningSummaryModal />
      <OnboardingTour
        isTourActive={onboarding.isTourActive}
        currentStep={onboarding.currentStep}
        totalSteps={onboarding.totalSteps}
        onNext={onboarding.nextStep}
        onPrev={onboarding.prevStep}
        onSkip={onboarding.skipTour}
        onComplete={onboarding.completeTour}
        onNavigateTab={navigateTab}
      />
      </div>
    </div>
  );
}

// Export as client-only (no SSR) to prevent hydration mismatches.
// Admin dashboard is auth-gated and fully dynamic — SSR provides no benefit.
const AdminPageNoSSR = dynamic(
  () => Promise.resolve({ default: AdminPage }),
  { ssr: false }
);
export default AdminPageNoSSR;
