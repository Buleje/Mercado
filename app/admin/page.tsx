"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { useNotifications } from "@/hooks/use-notifications";
import {
  Trash2, Pencil, Check, X, AlertTriangle,
  Users, Star, LogOut, ShoppingBasket, MessageCircle, ShoppingCart,
  Loader2, Truck, HandCoins, FileText, Settings, Menu, Store,
  MapPin, Clock, Phone, Image as ImageIcon, AlignLeft, ExternalLink, Search, User, Megaphone,
  BarChart3, Upload, ArrowUp, ArrowDown, Eye, EyeOff, Link as LinkIcon,
  Monitor, Boxes, Calculator, Lock, ChevronRight, Activity,
  RotateCcw, TrendingUp, Brain, CalendarDays, MessageSquare, FileBarChart,
  Heart, Wallet, Package, Bell, UserCog, Printer, FlaskConical,
  DollarSign, Layers, Sun, Moon, Target, Download,
  Cake, Shield, Smartphone, Copy, ChevronDown, ChevronUp,
  CheckCircle, PackageCheck, XCircle, Bike, UserCheck, SlidersHorizontal, Filter, Reply, Sparkles, Save,
  Maximize2, Zap,
} from "lucide-react";
import type { DbCustomer, DbReview, DbOrder, OrderStatus, StoreMode } from "@/lib/jsondb";
import { googleMapsUrl } from "@/lib/order-utils";
import { cn, exportToCSV } from "@/lib/utils";
import { useTheme } from "@/contexts/theme-context";
import { MODULE_PERMISSIONS } from "@/lib/module-permissions";

// Lazy-load heavy admin tabs for better initial load performance
const TabSpinner = () => (
  <div className="space-y-3 sm:space-y-4 animate-pulse">
    <div className="flex items-center gap-3">
      <div className="h-8 w-48 bg-gray-200 dark:bg-surface rounded-lg" />
      <div className="h-8 w-32 bg-gray-200 dark:bg-surface rounded-lg ml-auto" />
    </div>
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-3 sm:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="space-y-2">
            <div className="h-4 bg-gray-200 dark:bg-surface rounded w-1/3" />
            <div className="h-6 bg-gray-200 dark:bg-surface rounded w-2/3" />
          </div>
        ))}
      </div>
    </div>
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-3 sm:p-6 space-y-3">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="flex items-center gap-4">
          <div className="h-10 w-10 bg-gray-200 dark:bg-surface rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 dark:bg-surface rounded w-1/2" />
            <div className="h-3 bg-gray-200 dark:bg-surface rounded w-1/3" />
          </div>
          <div className="h-8 w-20 bg-gray-200 dark:bg-surface rounded-lg" />
        </div>
      ))}
    </div>
  </div>
);
// ── Unified Module Imports (28 consolidated modules) ──
const PanelPrincipalModule = dynamic(() => import("@/components/admin/unified/PanelPrincipalModule"), { loading: TabSpinner });
const POSCajaModule = dynamic(() => import("@/components/admin/unified/POSCajaModule"), { loading: TabSpinner });
const InventarioAlmacenesModule = dynamic(() => import("@/components/admin/unified/InventarioAlmacenesModule"), { loading: TabSpinner });
const ReposicionModule = dynamic(() => import("@/components/admin/unified/ReposicionModule"), { loading: TabSpinner });
const CatalogoTiendaModule = dynamic(() => import("@/components/admin/unified/CatalogoTiendaModule"), { loading: TabSpinner });
const PreciosPromosModule = dynamic(() => import("@/components/admin/unified/PreciosPromosModule"), { loading: TabSpinner });
const ComprasModule = dynamic(() => import("@/components/admin/unified/ComprasModule"), { loading: TabSpinner });
const ProveedoresModule = dynamic(() => import("@/components/admin/unified/ProveedoresModule"), { loading: TabSpinner });
const LogisticaModule = dynamic(() => import("@/components/admin/unified/LogisticaModule"), { loading: TabSpinner });
const DevolucionesCalidadModule = dynamic(() => import("@/components/admin/unified/DevolucionesCalidadModule"), { loading: TabSpinner });
const VentasMarketingModule = dynamic(() => import("@/components/admin/unified/VentasMarketingModule"), { loading: TabSpinner });
const CRMClientesModule = dynamic(() => import("@/components/admin/unified/CRMClientesModule"), { loading: TabSpinner });
const FidelizacionModule = dynamic(() => import("@/components/admin/unified/FidelizacionModule"), { loading: TabSpinner });
const EncuestasSoporteModule = dynamic(() => import("@/components/admin/unified/EncuestasSoporteModule"), { loading: TabSpinner });
const VisitantesTab = dynamic(() => import("@/components/admin/VisitantesTab"), { loading: TabSpinner });
const AnalyticsBIModule = dynamic(() => import("@/components/admin/unified/AnalyticsBIModule"), { loading: TabSpinner });
const ProyeccionesModule = dynamic(() => import("@/components/admin/unified/ProyeccionesModule"), { loading: TabSpinner });
const FinanzasModule = dynamic(() => import("@/components/admin/unified/FinanzasModule"), { loading: TabSpinner });
const TesoreriaModule = dynamic(() => import("@/components/admin/unified/TesoreriaModule"), { loading: TabSpinner });
const FacturacionModule = dynamic(() => import("@/components/admin/unified/FacturacionModule"), { loading: TabSpinner });
const GastosActivosModule = dynamic(() => import("@/components/admin/unified/GastosActivosModule"), { loading: TabSpinner });
const RRHHModule = dynamic(() => import("@/components/admin/unified/RRHHModule"), { loading: TabSpinner });
const ProyectosTareasModule = dynamic(() => import("@/components/admin/unified/ProyectosTareasModule"), { loading: TabSpinner });
const ComunicacionesModule = dynamic(() => import("@/components/admin/unified/ComunicacionesModule"), { loading: TabSpinner });
const AlertasAutomModule = dynamic(() => import("@/components/admin/unified/AlertasAutomModule"), { loading: TabSpinner });
const ReportesDocModule = dynamic(() => import("@/components/admin/unified/ReportesDocModule"), { loading: TabSpinner });
const AgendaUtilidadesModule = dynamic(() => import("@/components/admin/unified/AgendaUtilidadesModule"), { loading: TabSpinner });
const SeguridadModule = dynamic(() => import("@/components/admin/unified/SeguridadModule"), { loading: TabSpinner });
const SistemaModule = dynamic(() => import("@/components/admin/unified/SistemaModule"), { loading: TabSpinner });
const AgentsDashboardTab = dynamic(() => import("@/components/admin/AgentsDashboardTab"), { loading: TabSpinner });

import SSEListener from "@/components/admin/SSEListener";

const TeamTab        = dynamic(() => import("@/components/admin/TeamTab"),        { loading: TabSpinner });
const PlanTab        = dynamic(() => import("@/components/admin/PlanTab"),        { loading: TabSpinner });
const ChangelogModule = dynamic(() => import("@/components/admin/ChangelogModule"), { loading: TabSpinner });

// Utility components (not tab modules)
const GlobalSearch = dynamic(() => import("@/components/admin/GlobalSearch"), { ssr: false });
const AlertCenter = dynamic(() => import("@/components/admin/AlertCenter"), { ssr: false });
const AIAssistant = dynamic(() => import("@/components/admin/AIAssistant"), { ssr: false });
const LeafletMap = dynamic(() => import("@/components/LeafletMap"), { ssr: false });

type Tab = "panel-principal" | "pos-caja" | "inventario-almacenes" | "reposicion" | "catalogo-tienda"
  | "precios-promos" | "compras" | "proveedores" | "logistica" | "devoluciones-calidad"
  | "ventas-marketing" | "crm-clientes" | "clientes" | "fidelizacion" | "encuestas-soporte" | "resenas"
  | "analytics-bi" | "proyecciones" | "finanzas" | "tesoreria" | "facturacion" | "gastos-activos"
  | "rrhh" | "proyectos-tareas" | "comunicaciones" | "alertas-automatizacion"
  | "reportes-documentos" | "agenda-utilidades" | "seguridad" | "sistema" | "configuracion"
  | "pedidos" | "visitantes" | "plan" | "changelog" | "agentes";

// Old tab IDs → new unified IDs for localStorage migration
const TAB_MIGRATION: Record<string, Tab> = {
  dashboard: "panel-principal", "dashboard-ejecutivo": "panel-principal",
  pos: "pos-caja", caja: "pos-caja", "arqueo-caja": "pos-caja", turnos: "pos-caja",
  inventario: "inventario-almacenes", kardex: "inventario-almacenes", lotes: "inventario-almacenes", "inventario-fisico": "inventario-almacenes", mermas: "inventario-almacenes", almacenes: "inventario-almacenes", ubicaciones: "inventario-almacenes", transferencias: "inventario-almacenes",
  "auto-reorden": "inventario-almacenes", "reorden-dinamico": "inventario-almacenes", prediccion: "inventario-almacenes", reposicion: "inventario-almacenes",
  "categorias-editor": "catalogo-tienda", "combos-editor": "catalogo-tienda", combos: "catalogo-tienda", kits: "catalogo-tienda", "pagina-inicio": "catalogo-tienda",
  benchmark: "precios-promos", "historial-precios": "precios-promos", promociones: "precios-promos", cupones: "precios-promos", "ab-tests": "precios-promos",
  compras: "compras", "plan-compras": "compras", "aprobacion-compras": "compras", contratos: "compras", cotizaciones: "compras", recepcion: "compras",
  proveedores: "compras", "portal-proveedor": "compras", evaluaciones: "compras", "calidad-proveedor": "compras", "pagos-proveedor": "compras",
  entregas: "logistica", "rutas-delivery": "logistica", "delivery-horarios": "logistica", "seguimiento-envios": "logistica", "costos-envio": "logistica", flota: "logistica", "logistica-devoluciones": "logistica",
  devoluciones: "devoluciones-calidad", "devoluciones-avanzadas": "devoluciones-calidad", calidad: "devoluciones-calidad", anomalias: "devoluciones-calidad",
  marketing: "ventas-marketing", "forecast-ventas": "ventas-marketing", "metricas-conversion": "ventas-marketing", referidos: "ventas-marketing",
  crm: "crm-clientes", "cliente-360": "crm-clientes", segmentos: "crm-clientes", "segmentos-auto": "crm-clientes", clv: "crm-clientes",
  clientes: "crm-clientes", visitantes: "crm-clientes",
  fidelizacion: "fidelizacion", "programa-puntos": "fidelizacion", "wish-lists": "fidelizacion",
  nps: "encuestas-soporte", encuestas: "encuestas-soporte", soporte: "encuestas-soporte", "reseñas": "encuestas-soporte", resenas: "encuestas-soporte",
  bi: "analytics-bi", "mapa-calor": "analytics-bi", "abc-analysis": "analytics-bi", pareto: "analytics-bi", "bcg-matrix": "analytics-bi", "analisis-cesta": "analytics-bi", "kpi-personalizado": "analytics-bi",
  simulador: "proyecciones", estacionalidad: "proyecciones", "comparador-periodos": "proyecciones",
  pl: "finanzas", "balance-general": "finanzas", "flujo-caja": "finanzas", presupuestos: "finanzas", "presupuesto-real": "finanzas", "break-even": "finanzas", rentabilidad: "finanzas", margenes: "finanzas",
  tesoreria: "finanzas", "proyeccion-liquidez": "finanzas", cheques: "finanzas", conciliacion: "finanzas", "centro-cobros": "finanzas", "cuentas-cobrar": "finanzas",
  facturacion: "finanzas", "e-facturacion": "finanzas", impuestos: "finanzas", cuentas: "finanzas",
  gastos: "finanzas", "centros-costo": "finanzas", seguros: "finanzas", activos: "finanzas", "gastos-activos": "finanzas",
  rrhh: "rrhh", nomina: "rrhh", sucursales: "rrhh",
  proyectos: "proyectos-tareas", tareas: "proyectos-tareas", kanban: "proyectos-tareas", metas: "proyectos-tareas", "tablero-metas": "proyectos-tareas",
  "hub-comunicaciones": "comunicaciones", chat: "comunicaciones", "plantillas-mensaje": "comunicaciones", notificaciones: "comunicaciones",
  "alertas-automaticas": "alertas-automatizacion", recordatorios: "alertas-automatizacion", flujos: "alertas-automatizacion", "reglas-negocio": "alertas-automatizacion",
  reportes: "reportes-documentos", "reportes-auto": "reportes-documentos", "importar-exportar": "reportes-documentos", documentos: "reportes-documentos",
  calendario: "agenda-utilidades", "notas-rapidas": "agenda-utilidades", "filtros-guardados": "agenda-utilidades",
  "usuarios-admin": "seguridad", "permisos-roles": "seguridad", "logs-seguridad": "seguridad", auditoria: "seguridad", actividad: "seguridad", cumplimiento: "seguridad",
  "salud-sistema": "seguridad", "backup-restaurar": "seguridad", webhooks: "seguridad", sistema: "seguridad", configuracion: "seguridad", equipo: "seguridad",
  pedidos: "pedidos",
  changelog: "changelog",
  plan: "plan",
};

// Modules that ship with auto-seeded demo data and their API cleanup endpoint
const DEMO_DATA_MODULES: Partial<Record<Tab, { label: string; api?: string }>> = {
  "inventario-almacenes": { label: "24 productos de ejemplo cargados al inicio", api: "/api/admin/demo-products" },
};

// Rich metadata for every module: emoji, priority, description and a helpful tip
const MODULE_INFO: Partial<Record<Tab, { emoji: string; priority: "core" | "high" | "medium" | "low"; desc: string; tip: string }>> = {
  "panel-principal":        { emoji: "📊", priority: "core",   desc: "Dashboard general y ejecutivo: ventas, stock, pedidos y KPIs del día.", tip: "Empieza aquí cada mañana para tener el pulso del negocio." },
  "pos-caja":               { emoji: "🖥️", priority: "core",   desc: "Punto de venta, caja registradora, arqueo y control de turnos.",        tip: "Todo lo que necesitas para operar el mostrador en un solo lugar." },
  "inventario-almacenes":   { emoji: "📦", priority: "core",   desc: "Stock, Kardex, lotes, mermas, almacenes, ubicaciones y transferencias.", tip: "Control completo del inventario desde una sola vista con sub-tabs." },
  "pedidos":                { emoji: "🛒", priority: "core",   desc: "Gestiona pedidos recibidos, su estado, asignación y entrega.",           tip: "Centraliza pedidos de WhatsApp, tienda online y mostrador." },
  "clientes":               { emoji: "👥", priority: "core",   desc: "Base de datos de clientes con historial de compras y contacto.",         tip: "Conoce a tus mejores clientes y personaliza atención." },
  "configuracion":          { emoji: "⚙️", priority: "core",   desc: "Ajustes generales: nombre, logo, métodos de pago y zona de entrega.",   tip: "Configura esto primero para que todo funcione correctamente." },
  "reposicion":             { emoji: "🔄", priority: "high",   desc: "Auto-reorden, reorden dinámico y predicción de demanda con IA.",         tip: "Evita quiebres de stock con reposición inteligente." },
  "catalogo-tienda":        { emoji: "🏪", priority: "high",   desc: "Categorías, combos, kits, bundles y editor de página de inicio.",        tip: "Gestiona todo tu catálogo y la experiencia de la tienda." },
  "precios-promos":         { emoji: "💰", priority: "high",   desc: "Benchmark, historial de precios, promociones, cupones y A/B tests.",     tip: "Optimiza precios y campañas con datos y experimentación." },
  "compras":                { emoji: "📋", priority: "high",   desc: "Órdenes de compra, planificación, aprobaciones, RFQ y recepción.",       tip: "Flujo completo de compras desde la cotización hasta la recepción." },
  "proveedores":            { emoji: "🚚", priority: "high",   desc: "Directorio, portal, evaluaciones, calidad y pagos a proveedores.",       tip: "Gestiona toda la relación con proveedores en un módulo." },
  "logistica":              { emoji: "🗺️", priority: "high",   desc: "Calendario, rutas, horarios, tracking, costos de envío y flota.",        tip: "Controla toda la operación de entregas y logística." },
  "devoluciones-calidad":   { emoji: "↩️", priority: "high",   desc: "Devoluciones básicas y avanzadas, control de calidad y anomalías.",      tip: "Gestiona calidad y devoluciones con flujos estandarizados." },
  "ventas-marketing":       { emoji: "📣", priority: "high",   desc: "Marketing automation, forecast de ventas, métricas y referidos.",         tip: "Impulsa ventas con automatización y proyecciones inteligentes." },
  "crm-clientes":           { emoji: "🤝", priority: "high",   desc: "CRM, vista 360°, segmentación manual y automática, CLV.",                tip: "Conoce al detalle cada cliente y segmenta para mejores campañas." },
  "fidelizacion":           { emoji: "❤️", priority: "medium", desc: "Programa de fidelización, puntos canjeables y wish lists.",              tip: "Aumenta retención premiando la lealtad del cliente." },
  "encuestas-soporte":      { emoji: "🎫", priority: "medium", desc: "NPS, encuestas de satisfacción y sistema de tickets de soporte.",        tip: "Mide satisfacción y resuelve problemas de forma organizada." },
  "analytics-bi":           { emoji: "🧠", priority: "high",   desc: "BI, mapa de calor, ABC, Pareto, BCG, análisis de cesta y KPIs.",        tip: "Inteligencia de negocio completa para decisiones basadas en datos." },
  "proyecciones":           { emoji: "🎛️", priority: "medium", desc: "Simulador de escenarios, estacionalidad y comparador de períodos.",     tip: "Proyecta resultados y compara rendimiento entre períodos." },
  "finanzas":               { emoji: "💵", priority: "high",   desc: "P&G, balance, flujo de caja, presupuestos, rentabilidad y márgenes.",    tip: "Visión financiera completa del negocio en un solo módulo." },
  "tesoreria":              { emoji: "🏦", priority: "high",   desc: "Tesorería, liquidez, cheques, conciliación, cobros y cuentas x cobrar.", tip: "Control total del efectivo y las cuentas por cobrar." },
  "facturacion":            { emoji: "🧾", priority: "high",   desc: "Facturación, factura electrónica, impuestos y cuentas por pagar.",       tip: "Todo lo tributario y de facturación centralizado." },
  "gastos-activos":         { emoji: "💸", priority: "medium", desc: "Gastos operativos, centros de costo, seguros y activos fijos.",          tip: "Controla egresos y patrimonio del negocio." },
  "rrhh":                   { emoji: "👨‍💼", priority: "medium", desc: "Recursos humanos, nómina y gestión multi-sucursal.",                     tip: "Gestiona personal y sucursales desde un módulo unificado." },
  "proyectos-tareas":       { emoji: "🎯", priority: "medium", desc: "Proyectos, tareas, Kanban, metas y tablero de seguimiento.",             tip: "Organiza el trabajo del equipo con visibilidad completa." },
  "comunicaciones":         { emoji: "📬", priority: "medium", desc: "Hub de comunicaciones, chat interno, plantillas y notificaciones.",      tip: "Todos los canales de comunicación en un solo lugar." },
  "alertas-automatizacion": { emoji: "⚡", priority: "medium", desc: "Alertas automáticas, recordatorios, flujos de trabajo y reglas.",        tip: "Automatiza procesos repetitivos y nunca olvides una tarea." },
  "reportes-documentos":    { emoji: "📈", priority: "high",   desc: "Reportes manuales y automáticos, importar/exportar y documentos.",       tip: "Genera y distribuye reportes con facilidad." },
  "agenda-utilidades":      { emoji: "📅", priority: "low",    desc: "Calendario compartido, notas rápidas y filtros guardados.",              tip: "Herramientas de productividad diaria para el equipo." },
  "seguridad":              { emoji: "🔐", priority: "high",   desc: "Usuarios, roles, logs de seguridad, auditoría y cumplimiento.",          tip: "Protege el acceso y audita todas las acciones del sistema." },
  "sistema":                { emoji: "💚", priority: "high",   desc: "Salud del sistema, backups y webhooks para integraciones.",              tip: "Monitorea y mantén la estabilidad de la plataforma." },
  "agentes":                { emoji: "🤖", priority: "high",   desc: "Orquestador multiagente, tareas automáticas, monitoreo y ejecución.",   tip: "Controla y monitorea todos los agentes del sistema desde un solo panel." },
  "resenas":                { emoji: "⭐", priority: "medium", desc: "Gestiona opiniones de clientes sobre productos y servicio.",             tip: "Responde reseñas y usa las positivas para generar confianza." },
  "visitantes":             { emoji: "👋", priority: "medium", desc: "Registro de visitantes nuevos: nombre y dispositivo preferido.",          tip: "Conoce desde dónde te visitan por primera vez." },
  "changelog":              { emoji: "⚗️", priority: "low",    desc: "Historial de versiones, releases y cambios del proyecto.",              tip: "Consulta qué hay de nuevo en cada versión del proyecto." },
};

type TabCategory = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tabs: Tab[];  
};

const TAB_CATEGORIES: TabCategory[] = [
  {
    id: "operaciones",
    label: "Operaciones & POS",
    icon: Monitor,
    tabs: ["panel-principal", "pos-caja", "inventario-almacenes", "pedidos"]
  },
  {
    id: "producto",
    label: "Producto & Precios",
    icon: Package,
    tabs: ["catalogo-tienda", "precios-promos"]
  },
  {
    id: "compras-proveedores",
    label: "Compras & Proveedores",
    icon: Truck,
    tabs: ["compras"]
  },
  {
    id: "logistica-calidad",
    label: "Logística & Calidad",
    icon: MapPin,
    tabs: ["logistica", "devoluciones-calidad"]
  },
  {
    id: "clientes-marketing",
    label: "Clientes & Marketing",
    icon: Users,
    tabs: ["crm-clientes", "ventas-marketing", "fidelizacion", "encuestas-soporte"]
  },
  {
    id: "analytics",
    label: "Inteligencia & Analytics",
    icon: Brain,
    tabs: ["analytics-bi", "proyecciones"]
  },
  {
    id: "finanzas",
    label: "Finanzas",
    icon: DollarSign,
    tabs: ["finanzas"]
  },
  {
    id: "organizacion",
    label: "Organización",
    icon: Target,
    tabs: ["rrhh", "proyectos-tareas", "comunicaciones", "alertas-automatizacion"]
  },
  {
    id: "admin-sistema",
    label: "Administración & Sistema",
    icon: Settings,
    tabs: ["reportes-documentos", "agenda-utilidades", "seguridad", "plan", "changelog", "agentes"]
  },
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

// ── Data helpers ──────────────────────────────────────────────────────────────

/**
 * Fetches all orders from the API using cursor-based pagination.
 * Replaces the old ?limit=1000 calls — each round-trip is bounded at 200 rows,
 * all filtering is pushed to Postgres, and we stop as soon as the last page.
 */
async function fetchAllOrders(): Promise<DbOrder[]> {
  const all: DbOrder[] = [];
  let cursor: string | undefined;
  while (true) {
    const url = cursor
      ? `/api/orders?limit=200&cursor=${encodeURIComponent(cursor)}`
      : "/api/orders?limit=200";
    const res = await fetch(url);
    if (!res.ok) throw new Error("Error al cargar pedidos");
    const batch = (await res.json()) as DbOrder[];
    all.push(...batch);
    const next = res.headers.get("X-Next-Cursor") ?? "";
    if (!next) break;
    cursor = next;
  }
  return all;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function Stars({ rating }: { rating: number }) {
  return (
    <span>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rating ? "text-amber-400" : "text-gray-200"}>★</span>
      ))}
    </span>
  );
}

function parseGps(loc: string): { lat: number; lon: number } | null {
  const m = loc.match(/GPS:\s*([\d.-]+),\s*([\d.-]+)/);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function avatarColor(name: string): string {
  const colors = ["#ef4444","#f97316","#f59e0b","#65a30d","#16a34a","#14b8a6","#0891b2","#0ea5e9","#3b82f6","#2d6a4f","#8b5cf6","#a855f7","#ec4899","#f43f5e"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

type TimelineStep = {
  status: OrderStatus;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  completed: boolean;
  current: boolean;
  timestamp?: string;
};

function getOrderTimeline(order: DbOrder): TimelineStep[] {
  const statusFlow: OrderStatus[] = ["pendiente", "confirmado", "en_camino", "entregado"];
  const isCanceled = order.status === "cancelado";
  
  // Find current status index
  const currentIndex = statusFlow.indexOf(order.status);
  
  // Build timeline for normal flow
  const timeline: TimelineStep[] = statusFlow.map((status, idx) => {
    const isCompleted = isCanceled ? false : idx < currentIndex;
    const isCurrent = !isCanceled && idx === currentIndex;
    
    // Estimate timestamps
    let timestamp: string | undefined;
    if (idx === 0) {
      // First status uses createdAt
      timestamp = formatDate(order.createdAt);
    } else if (isCurrent && idx === currentIndex) {
      // Current status uses updatedAt
      timestamp = order.updatedAt ? formatDate(order.updatedAt) : undefined;
    }
    
    return {
      status,
      label: STATUS_LABELS[status],
      icon: status === "pendiente" ? Clock : status === "confirmado" ? CheckCircle : status === "en_camino" ? Truck : PackageCheck,
      completed: isCompleted,
      current: isCurrent,
      timestamp,
    };
  });
  
  // If canceled, add canceled step as alternate path
  if (isCanceled) {
    timeline.push({
      status: "cancelado",
      label: STATUS_LABELS.cancelado,
      icon: XCircle,
      completed: false,
      current: true,
      timestamp: order.updatedAt ? formatDate(order.updatedAt) : undefined,
    });
  }
  
  return timeline;
}

function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    const safe = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rich = safe
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-gray-900 dark:text-foreground">$1</strong>')
      .replace(/\*(.+?)\*/g, '<em class="italic text-gray-600 dark:text-muted">$1</em>');
    const isList = /^[-*] /.test(line) || /^\d+\. /.test(line);
    if (!isList && inList) { out.push("</ul>"); inList = false; }
    if (line.startsWith("#### ")) {
      out.push(`<div class="mt-4 mb-1.5 flex items-center gap-2"><span class="w-1 h-4 rounded-full bg-violet-400 shrink-0 inline-block"></span><h4 class="text-xs font-bold text-violet-700 uppercase tracking-wider">${rich.slice(5)}</h4></div>`);
    } else if (line.startsWith("### ")) {
      out.push(`<div class="mt-3 mb-1 flex items-center gap-2"><span class="w-1 h-4 rounded-full bg-indigo-400 shrink-0 inline-block"></span><h3 class="text-xs font-bold text-indigo-700 uppercase tracking-wider">${rich.slice(4)}</h3></div>`);
    } else if (line.startsWith("## ")) {
      out.push(`<h2 class="text-sm font-bold text-gray-900 dark:text-foreground mt-5 mb-2 pb-1 border-b-2 border-violet-200">${rich.slice(3)}</h2>`);
    } else if (line.startsWith("# ")) {
      out.push(`<h1 class="text-base font-extrabold text-gray-900 dark:text-foreground mt-4 mb-2">${rich.slice(2)}</h1>`);
    } else if (/^[-*] /.test(line)) {
      if (!inList) { out.push(`<ul class="space-y-1 my-1.5">`); inList = true; }
      out.push(`<li class="flex items-start gap-2 text-sm text-gray-700 dark:text-foreground leading-relaxed"><span class="text-violet-400 shrink-0 mt-0.5">▸</span><span>${rich.slice(2)}</span></li>`);
    } else if (/^\d+\. /.test(line)) {
      if (!inList) { out.push(`<ul class="space-y-1 my-1.5">`); inList = true; }
      const num = line.match(/^(\d+)\./)?.[1] ?? "•";
      out.push(`<li class="flex items-start gap-2 text-sm text-gray-700 dark:text-foreground leading-relaxed"><span class="text-violet-500 font-bold shrink-0 text-xs mt-0.5">${num}.</span><span>${rich.replace(/^\d+\.\s/, "")}</span></li>`);
    } else if (line === "") {
      out.push('<div class="h-1.5"></div>');
    } else {
      out.push(`<p class="text-sm text-gray-700 dark:text-foreground leading-relaxed">${rich}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

// Stable timestamp for churn/frequency calculations (refreshes on page load)
const _NOW_MS = Date.now();

// ── Customers Tab ─────────────────────────────────────────────────────────────

type CustomerStats = { phone: string; name: string; orderCount: number; totalSpent: number; stars: number };

function computeStars(totalSpent: number): number {
  if (totalSpent >= 500) return 5;
  if (totalSpent >= 300) return 4;
  if (totalSpent >= 150) return 3;
  if (totalSpent >= 50) return 2;
  if (totalSpent > 0) return 1;
  return 0;
}

function CustomersTab() {
  const [customers, setCustomers] = useState<DbCustomer[]>([]);
  const [orders, setOrders] = useState<DbOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState<"stars" | "orders" | "spent" | "name">("stars");
  const [custPage, setCustPage] = useState(1);
  const CUST_PER_PAGE = 25;

  // Customer detail side-panel
  const [selectedCustomer, setSelectedCustomer] = useState<DbCustomer | null>(null);
  const [customerOrders, setCustomerOrders] = useState<DbOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Order detail modal
  const [detailOrder, setDetailOrder] = useState<DbOrder | null>(null);

  // AI analysis
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const [aiAnalysisSaved, setAiAnalysisSaved] = useState(false);

  // Customer timeline
  type TimelineEvent = { id: string; type: string; icon: string; title: string; detail: string; date: string };
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);

  // RFM segmentation
  type RFMEntry = { phone: string; segment: string; segmentColor: string; rScore: number; fScore: number; mScore: number; recencyDays: number; frequency: number; monetary: number };
  const [rfmMap, setRfmMap] = useState<Map<string, RFMEntry>>(new Map());
  const [segmentFilter, setSegmentFilter] = useState<string>("all");

  // Delete confirm
  const [confirmDeletePhone, setConfirmDeletePhone] = useState<string | null>(null);

  // Birthday calendar
  const [birthdayCollapsed, setBirthdayCollapsed] = useState(false);

  // WhatsApp export modal
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [copiedPhones, setCopiedPhones] = useState(false);

  // Quick notes
  const [quickNotes, setQuickNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Custom segments
  type CustomSegment = {
    id: string;
    name: string;
    color: string;
    filters: {
      totalSpentMin?: number;
      totalSpentMax?: number;
      orderCountMin?: number;
      orderCountMax?: number;
      lastPurchaseDaysMin?: number;
      lastPurchaseDaysMax?: number;
      loyaltyTiers?: string[];
      hasBirthdayThisMonth?: boolean;
      locations?: string[];
      hasDebt?: boolean;
      churnRisk?: ("alto" | "medio")[];
    };
    logic: "AND" | "OR";
  };
  const [customSegments, setCustomSegments] = useState<CustomSegment[]>(() => {
    try {
      if (typeof window === "undefined") return [];
      const stored = localStorage.getItem("customSegments");
      return stored ? (JSON.parse(stored) as CustomSegment[]) : [];
    } catch {
      return [];
    }
  });
  const [showSegmentBuilder, setShowSegmentBuilder] = useState(false);
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [segmentName, setSegmentName] = useState("");
  const [segmentColor, setSegmentColor] = useState("#8b5cf6");
  const [segmentLogic, setSegmentLogic] = useState<"AND" | "OR">("AND");
  const [filterTotalSpentMin, setFilterTotalSpentMin] = useState("");
  const [filterTotalSpentMax, setFilterTotalSpentMax] = useState("");
  const [filterOrderCountMin, setFilterOrderCountMin] = useState("");
  const [filterOrderCountMax, setFilterOrderCountMax] = useState("");
  const [filterLastPurchaseDaysMin, setFilterLastPurchaseDaysMin] = useState("");
  const [filterLastPurchaseDaysMax, setFilterLastPurchaseDaysMax] = useState("");
  const [filterLoyaltyTiers, setFilterLoyaltyTiers] = useState<Set<string>>(new Set());
  const [filterBirthdayThisMonth, setFilterBirthdayThisMonth] = useState(false);
  const [filterLocations, setFilterLocations] = useState("");
  const [filterHasDebtCustom, setFilterHasDebtCustom] = useState(false);
  const [filterChurnRisk, setFilterChurnRisk] = useState<Set<"alto" | "medio">>(new Set());

  useScrollLock(!!selectedCustomer || !!detailOrder || showAiModal || !!confirmDeletePhone || showWhatsAppModal || showSegmentBuilder);


  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [cRes, rfmRes, ordersResult] = await Promise.all([
        fetch("/api/customers?limit=500"),
        fetch("/api/customers/rfm"),
        fetchAllOrders().catch(() => null),
      ]);
      if (!cRes.ok || !ordersResult) {
        setLoadError("Error al cargar datos. Verifica tu conexión e intenta de nuevo.");
      }
      if (cRes.ok) setCustomers(await cRes.json());
      if (ordersResult) setOrders(ordersResult);
      if (rfmRes.ok) {
        const rfmData: RFMEntry[] = await rfmRes.json();
        const m = new Map<string, RFMEntry>();
        for (const r of rfmData) m.set(r.phone, r);
        setRfmMap(m);
      }
    } catch {
      setLoadError("Error de conexión al cargar clientes. Intenta de nuevo.");
    }
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  // Save custom segment
  const saveCustomSegment = () => {
    if (!segmentName.trim()) return;
    const segment: CustomSegment = {
      id: editingSegmentId || `seg-${crypto.randomUUID()}`,
      name: segmentName.trim(),
      color: segmentColor,
      logic: segmentLogic,
      filters: {
        ...(filterTotalSpentMin && { totalSpentMin: parseFloat(filterTotalSpentMin) }),
        ...(filterTotalSpentMax && { totalSpentMax: parseFloat(filterTotalSpentMax) }),
        ...(filterOrderCountMin && { orderCountMin: parseInt(filterOrderCountMin) }),
        ...(filterOrderCountMax && { orderCountMax: parseInt(filterOrderCountMax) }),
        ...(filterLastPurchaseDaysMin && { lastPurchaseDaysMin: parseInt(filterLastPurchaseDaysMin) }),
        ...(filterLastPurchaseDaysMax && { lastPurchaseDaysMax: parseInt(filterLastPurchaseDaysMax) }),
        ...(filterLoyaltyTiers.size > 0 && { loyaltyTiers: Array.from(filterLoyaltyTiers) }),
        ...(filterBirthdayThisMonth && { hasBirthdayThisMonth: true }),
        ...(filterLocations.trim() && { locations: filterLocations.split(",").map(l => l.trim()).filter(Boolean) }),
        ...(filterHasDebtCustom && { hasDebt: true }),
        ...(filterChurnRisk.size > 0 && { churnRisk: Array.from(filterChurnRisk) }),
      },
    };
    const updated = editingSegmentId
      ? customSegments.map(s => s.id === editingSegmentId ? segment : s)
      : [...customSegments, segment];
    setCustomSegments(updated);
    localStorage.setItem("customSegments", JSON.stringify(updated));
    closeSegmentBuilder();
  };

  const deleteCustomSegment = (id: string) => {
    if (!confirm("¿Eliminar este segmento personalizado?")) return;
    const updated = customSegments.filter(s => s.id !== id);
    setCustomSegments(updated);
    localStorage.setItem("customSegments", JSON.stringify(updated));
    if (segmentFilter === id) setSegmentFilter("all");
  };

  const openSegmentBuilder = (segment?: CustomSegment) => {
    if (segment) {
      setEditingSegmentId(segment.id);
      setSegmentName(segment.name);
      setSegmentColor(segment.color);
      setSegmentLogic(segment.logic);
      setFilterTotalSpentMin(segment.filters.totalSpentMin?.toString() ?? "");
      setFilterTotalSpentMax(segment.filters.totalSpentMax?.toString() ?? "");
      setFilterOrderCountMin(segment.filters.orderCountMin?.toString() ?? "");
      setFilterOrderCountMax(segment.filters.orderCountMax?.toString() ?? "");
      setFilterLastPurchaseDaysMin(segment.filters.lastPurchaseDaysMin?.toString() ?? "");
      setFilterLastPurchaseDaysMax(segment.filters.lastPurchaseDaysMax?.toString() ?? "");
      setFilterLoyaltyTiers(new Set(segment.filters.loyaltyTiers ?? []));
      setFilterBirthdayThisMonth(segment.filters.hasBirthdayThisMonth ?? false);
      setFilterLocations(segment.filters.locations?.join(", ") ?? "");
      setFilterHasDebtCustom(segment.filters.hasDebt ?? false);
      setFilterChurnRisk(new Set(segment.filters.churnRisk ?? []));
    } else {
      setEditingSegmentId(null);
      setSegmentName("");
      setSegmentColor("#8b5cf6");
      setSegmentLogic("AND");
      setFilterTotalSpentMin("");
      setFilterTotalSpentMax("");
      setFilterOrderCountMin("");
      setFilterOrderCountMax("");
      setFilterLastPurchaseDaysMin("");
      setFilterLastPurchaseDaysMax("");
      setFilterLoyaltyTiers(new Set());
      setFilterBirthdayThisMonth(false);
      setFilterLocations("");
      setFilterHasDebtCustom(false);
      setFilterChurnRisk(new Set());
    }
    setShowSegmentBuilder(true);
  };

  const closeSegmentBuilder = () => {
    setShowSegmentBuilder(false);
    setEditingSegmentId(null);
  };

  // Check if customer matches custom segment
  const matchesCustomSegment = (c: DbCustomer, segment: CustomSegment): boolean => {
    const stat = statsMap.get(c.phone);
    if (!stat) return false;
    const rfm = rfmMap.get(c.phone);
    const churnRisk = calculateChurnRisk(c, rfm);
    
    const checks: boolean[] = [];
    const f = segment.filters;
    
    if (f.totalSpentMin !== undefined) checks.push(stat.totalSpent >= f.totalSpentMin);
    if (f.totalSpentMax !== undefined) checks.push(stat.totalSpent <= f.totalSpentMax);
    if (f.orderCountMin !== undefined) checks.push(stat.orderCount >= f.orderCountMin);
    if (f.orderCountMax !== undefined) checks.push(stat.orderCount <= f.orderCountMax);
    if (f.lastPurchaseDaysMin !== undefined && rfm) checks.push(rfm.recencyDays >= f.lastPurchaseDaysMin);
    if (f.lastPurchaseDaysMax !== undefined && rfm) checks.push(rfm.recencyDays <= f.lastPurchaseDaysMax);
    if (f.loyaltyTiers && f.loyaltyTiers.length > 0) checks.push(f.loyaltyTiers.includes(c.loyaltyTier ?? ""));
    if (f.hasBirthdayThisMonth) {
      const now = new Date();
      const hasBday = c.birthday && new Date(c.birthday).getMonth() === now.getMonth();
      checks.push(!!hasBday);
    }
    if (f.locations && f.locations.length > 0) {
      const hasLocation = f.locations.some(loc => c.location?.toLowerCase().includes(loc.toLowerCase()));
      checks.push(hasLocation);
    }
    if (f.hasDebt) checks.push((c.creditBalance ?? 0) < 0);
    if (f.churnRisk && f.churnRisk.length > 0) checks.push(f.churnRisk.includes(churnRisk.risk as "alto" | "medio"));
    
    if (checks.length === 0) return true;
    return segment.logic === "AND" ? checks.every(Boolean) : checks.some(Boolean);
  };

  // Export segment to CSV or WhatsApp
  const exportSegment = (segmentId: string, format: "csv" | "whatsapp") => {
    const segment = customSegments.find(s => s.id === segmentId);
    if (!segment) return;
    const matches = customers.filter(c => matchesCustomSegment(c, segment));
    if (format === "csv") {
      exportToCSV(matches.map(c => ({
        nombre: c.name,
        telefono: c.phone,
        ubicacion: c.location ?? "",
        gasto_total: statsMap.get(c.phone)?.totalSpent ?? 0,
        pedidos: statsMap.get(c.phone)?.orderCount ?? 0,
      })), `segmento-${segment.name.toLowerCase().replace(/\s+/g, "-")}`);
    } else {
      const phones = matches.map(c => c.phone).join("\n");
      navigator.clipboard.writeText(phones);
      alert(`${matches.length} teléfonos copiados al portapapeles`);
    }
  };

  // Compute stats for each customer
  const statsMap = new Map<string, CustomerStats>();
  for (const c of customers) {
    statsMap.set(c.phone, { phone: c.phone, name: c.name, orderCount: 0, totalSpent: 0, stars: 0 });
  }
  for (const o of orders) {
    const ph = o.customer.phone;
    if (!ph) continue;
    const stat = statsMap.get(ph);
    if (stat) {
      stat.orderCount += 1;
      stat.totalSpent += o.total;
    }
  }
  for (const s of statsMap.values()) {
    s.stars = computeStars(s.totalSpent);
  }

  // Unique segments for filter
  const uniqueSegments = Array.from(new Set(Array.from(rfmMap.values()).map(r => r.segment)));

  const q = searchText.toLowerCase();
  const filtered = customers
    .filter(c => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q))
    .filter(c => {
      if (segmentFilter === "all") return true;
      // Check if it's an RFM segment
      if (rfmMap.get(c.phone)?.segment === segmentFilter) return true;
      // Check if it's a custom segment
      const customSeg = customSegments.find(s => s.id === segmentFilter);
      if (customSeg) return matchesCustomSegment(c, customSeg);
      return false;
    })
    .sort((a, b) => {
      const sa = statsMap.get(a.phone)!;
      const sb = statsMap.get(b.phone)!;
      if (sortBy === "stars") return sb.stars - sa.stars || sb.totalSpent - sa.totalSpent;
      if (sortBy === "spent") return sb.totalSpent - sa.totalSpent;
      if (sortBy === "orders") return sb.orderCount - sa.orderCount;
      return a.name.localeCompare(b.name);
    });

  const custTotalPages = Math.max(1, Math.ceil(filtered.length / CUST_PER_PAGE));
  const safeCustPage = Math.min(custPage, custTotalPages);
  const paginatedCustomers = filtered.slice((safeCustPage - 1) * CUST_PER_PAGE, safeCustPage * CUST_PER_PAGE);

  const openCustomerDetail = async (c: DbCustomer) => {
    setSelectedCustomer(c);
    setAiAnalysis(c.aiNotes ?? null);
    setAiAnalysisSaved(!!c.aiNotes);
    setQuickNotes(c.privateNotes ?? "");
    setLoadingOrders(true);
    setShowTimeline(false);
    setTimeline([]);
    try {
      const r = await fetch(`/api/customers/${encodeURIComponent(c.phone)}/orders`);
      if (r.ok) setCustomerOrders(await r.json());
      else setCustomerOrders([]);
    } catch { setCustomerOrders([]); }
    setLoadingOrders(false);
  };

  const loadTimeline = async (phone: string) => {
    setLoadingTimeline(true);
    setShowTimeline(true);
    try {
      const r = await fetch(`/api/customers/${encodeURIComponent(phone)}/timeline`);
      if (r.ok) setTimeline(await r.json());
      else setTimeline([]);
    } catch { setTimeline([]); }
    setLoadingTimeline(false);
  };

  const requestAiAnalysis = async (phone: string) => {
    setLoadingAi(true);
    setAiAnalysis(null);
    setAiAnalysisSaved(false);
    setShowAiModal(true);
    try {
      const r = await fetch(`/api/customers/${encodeURIComponent(phone)}/ai-analysis`, { method: "POST" });
      const data = await r.json();
      if (data.error) setAiAnalysis(`⚠️ ${data.error}`);
      else setAiAnalysis(data.analysis);
    } catch { setAiAnalysis("Error al conectar con el servicio de IA."); }
    setLoadingAi(false);
  };

  const saveAiAnalysis = async () => {
    if (!selectedCustomer || !aiAnalysis || savingAi) return;
    setSavingAi(true);
    try {
      const r = await fetch(`/api/customers/${encodeURIComponent(selectedCustomer.phone)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiNotes: aiAnalysis }),
      });
      if (r.ok) {
        const now = new Date().toISOString();
        setSelectedCustomer(prev => prev ? { ...prev, aiNotes: aiAnalysis, aiNotesDate: now } : prev);
        setCustomers(prev => prev.map(c => c.phone === selectedCustomer.phone ? { ...c, aiNotes: aiAnalysis, aiNotesDate: now } : c));
        setAiAnalysisSaved(true);
      }
    } catch {}
    setSavingAi(false);
  };

  const confirmDelete = async () => {
    if (!confirmDeletePhone) return;
    await fetch(`/api/customers/${encodeURIComponent(confirmDeletePhone)}`, { method: "DELETE" });
    setConfirmDeletePhone(null);
    if (selectedCustomer?.phone === confirmDeletePhone) setSelectedCustomer(null);
    load();
  };

  const saveQuickNotes = async () => {
    if (!selectedCustomer || savingNotes) return;
    setSavingNotes(true);
    try {
      const r = await fetch(`/api/customers/${encodeURIComponent(selectedCustomer.phone)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privateNotes: quickNotes }),
      });
      if (r.ok) {
        const updatedCustomer = { ...selectedCustomer, privateNotes: quickNotes };
        setSelectedCustomer(updatedCustomer);
        setCustomers(prev => prev.map(c => c.phone === selectedCustomer.phone ? updatedCustomer : c));
      }
    } catch {}
    setSavingNotes(false);
  };

  // Helper: Calculate churn risk
  const calculateChurnRisk = (c: DbCustomer, rfm?: RFMEntry): { risk: "alto" | "medio" | "activo"; daysInactive: number; color: string } => {
    let daysInactive = 0;
    if (rfm) {
      daysInactive = rfm.recencyDays;
    } else {
      // Fallback: check last order date from orders array
      const customerOrdersList = orders.filter(o => o.customer.phone === c.phone);
      if (customerOrdersList.length > 0) {
        const lastOrder = customerOrdersList.reduce((latest, o) => new Date(o.createdAt) > new Date(latest.createdAt) ? o : latest);
        daysInactive = Math.floor((_NOW_MS - new Date(lastOrder.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      }
    }
    if (daysInactive > 60) return { risk: "alto", daysInactive, color: "#ef4444" };
    if (daysInactive > 30) return { risk: "medio", daysInactive, color: "#f59e0b" };
    return { risk: "activo", daysInactive, color: "#10b981" };
  };

  // Helper: Get customers with birthdays this month
  const getBirthdayCustomers = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    return customers.filter(c => {
      if (!c.birthday) return false;
      const bday = new Date(c.birthday);
      return bday.getMonth() === currentMonth;
    }).map(c => {
      const bday = new Date(c.birthday!);
      const thisYearBday = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());
      const daysUntil = Math.ceil((thisYearBday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const isToday = daysUntil === 0;
      const isSoon = daysUntil >= 0 && daysUntil <= 3;
      return { customer: c, date: bday, daysUntil, isToday, isSoon };
    }).sort((a, b) => a.daysUntil - b.daysUntil);
  };

  const birthdayCustomers = getBirthdayCustomers();

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1.5">
          <div className="h-7 w-28 bg-gray-200 dark:bg-surface rounded-lg" />
          <div className="h-4 w-40 bg-gray-200 dark:bg-surface rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-48 bg-gray-200 dark:bg-surface rounded-xl" />
          <div className="h-9 w-28 bg-gray-200 dark:bg-surface rounded-xl" />
        </div>
      </div>
      {/* Stats row skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-card rounded-2xl p-4 space-y-2 border border-gray-100 dark:border-card-border">
            <div className="h-3 w-20 bg-gray-200 dark:bg-surface rounded" />
            <div className="h-7 w-12 bg-gray-200 dark:bg-surface rounded" />
          </div>
        ))}
      </div>
      {/* Customer row skeletons */}
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4 bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border">
          <div className="h-10 w-10 bg-gray-200 dark:bg-surface rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 dark:bg-surface rounded w-1/4" />
            <div className="h-3 bg-gray-200 dark:bg-surface rounded w-1/3" />
          </div>
          <div className="h-5 w-16 bg-gray-200 dark:bg-surface rounded-full" />
          <div className="h-5 w-14 bg-gray-200 dark:bg-surface rounded" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-foreground">Clientes</h2>
          <p className="text-sm text-gray-500 dark:text-muted">{customers.length} registrados</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex items-center">
            <div className="absolute left-0 top-0 bottom-0 flex items-center justify-center w-10 pointer-events-none">
              <Search className="h-4 w-4 text-violet-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar cliente…"
              value={searchText}
              onChange={e => { setSearchText(e.target.value); setCustPage(1); }}
              className="pl-10 pr-8 py-2.5 text-sm rounded-2xl border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface outline-none focus:bg-white dark:focus:bg-card focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all w-56 placeholder:text-gray-400 dark:placeholder:text-muted font-medium text-gray-700 dark:text-foreground"
            />
            {searchText && (
              <button onClick={() => setSearchText("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-300 hover:bg-gray-400 flex items-center justify-center transition-colors">
                <X className="h-3 w-3 text-white" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-accent rounded-xl p-1">
            {(["stars","spent","orders","name"] as const).map(v => {
              const labels: Record<string, string> = { stars: "â­ Estrellas", spent: "💰 Gasto", orders: "📦 Pedidos", name: "🗤 Nombre" };
              return (
                <button key={v} onClick={() => setSortBy(v)}
                  className={cn("px-3 py-1 rounded-lg text-xs font-semibold transition-all",
                    sortBy === v ? "bg-white dark:bg-card text-gray-900 dark:text-foreground shadow-sm" : "text-gray-500 dark:text-muted hover:text-gray-700 dark:hover:text-foreground"
                  )}>{labels[v]}</button>
              );
            })}
          </div>
          <button
            onClick={() => exportToCSV(customers.map(c => ({ nombre: c.name, telefono: c.phone, ubicacion: c.location ?? "", puntos: c.loyaltyPoints, nivel: c.loyaltyTier, gasto_total: c.totalSpent, credito: c.creditBalance, registrado: c.createdAt.slice(0, 10) })), "clientes-bodega")}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-muted border border-gray-200 dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent px-3 py-1.5 rounded-lg transition-colors"
            title="Exportar clientes a CSV"
          >
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>
      </div>

      {/* Segment filter pills */}
      {(uniqueSegments.length > 0 || customSegments.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => { setSegmentFilter("all"); setCustPage(1); }}
            className={cn("px-3 py-1 rounded-full text-xs font-semibold border transition-all",
              segmentFilter === "all" ? "bg-gray-900 dark:bg-foreground text-white dark:text-surface border-transparent" : "bg-white dark:bg-card text-gray-500 dark:text-muted border-gray-200 dark:border-card-border hover:border-gray-300"
            )}
          >
            Todos ({customers.length})
          </button>
          {/* RFM Segments */}
          {uniqueSegments.map(seg => {
            const count = customers.filter(c => rfmMap.get(c.phone)?.segment === seg).length;
            const color = rfmMap.values().next().value ? Array.from(rfmMap.values()).find(r => r.segment === seg)?.segmentColor ?? "#6b7280" : "#6b7280";
            return (
              <button
                key={seg}
                onClick={() => { setSegmentFilter(segmentFilter === seg ? "all" : seg); setCustPage(1); }}
                className={cn("px-3 py-1 rounded-full text-xs font-semibold border transition-all",
                  segmentFilter === seg ? "text-white border-transparent" : "bg-white dark:bg-card border-gray-200 dark:border-card-border hover:border-gray-300"
                )}
                style={segmentFilter === seg ? { background: color } : { color }}
              >
                {seg} ({count})
              </button>
            );
          })}
          {/* Custom Segments */}
          {customSegments.map(seg => {
            const count = customers.filter(c => matchesCustomSegment(c, seg)).length;
            return (
              <div key={seg.id} className="flex items-center gap-0.5">
                <button
                  onClick={() => { setSegmentFilter(segmentFilter === seg.id ? "all" : seg.id); setCustPage(1); }}
                  className={cn("px-3 py-1 rounded-l-full text-xs font-semibold border border-r-0 transition-all",
                    segmentFilter === seg.id ? "text-white border-transparent" : "bg-white dark:bg-card border-gray-200 dark:border-card-border hover:border-gray-300"
                  )}
                  style={segmentFilter === seg.id ? { background: seg.color } : { color: seg.color }}
                >
                  <UserCog className="h-3 w-3 inline mr-1" />
                  {seg.name} ({count})
                </button>
                <div className={cn("flex items-center border rounded-r-full overflow-hidden",
                  segmentFilter === seg.id ? "border-transparent" : "border-gray-200 dark:border-card-border"
                )}
                  style={segmentFilter === seg.id ? { background: seg.color } : {}}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); openSegmentBuilder(seg); }}
                    className={cn("px-1.5 py-1 hover:brightness-90 transition-all",
                      segmentFilter === seg.id ? "text-white" : "text-gray-400 hover:text-gray-600"
                    )}
                    title="Editar"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); exportSegment(seg.id, "csv"); }}
                    className={cn("px-1.5 py-1 hover:brightness-90 transition-all",
                      segmentFilter === seg.id ? "text-white" : "text-gray-400 hover:text-gray-600"
                    )}
                    title="Exportar CSV"
                  >
                    <Download className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); exportSegment(seg.id, "whatsapp"); }}
                    className={cn("px-1.5 py-1 hover:brightness-90 transition-all",
                      segmentFilter === seg.id ? "text-white" : "text-gray-400 hover:text-gray-600"
                    )}
                    title="Copiar teléfonos"
                  >
                    <Smartphone className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteCustomSegment(seg.id); }}
                    className={cn("px-1.5 py-1 hover:brightness-90 transition-all",
                      segmentFilter === seg.id ? "text-white" : "text-gray-400 hover:text-red-500"
                    )}
                    title="Eliminar"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
          <button
            onClick={() => openSegmentBuilder()}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-violet-500 text-white hover:bg-violet-600 transition-colors"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Crear segmento
          </button>
          <button
            onClick={() => setShowWhatsAppModal(true)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-500 text-white hover:bg-green-600 transition-colors"
          >
            <Smartphone className="h-4 w-4" />
            WhatsApp Masivo
          </button>
        </div>
      )}

      {/* Birthday Calendar Section */}
      {birthdayCustomers.length > 0 && (
        <div className="bg-linear-to-r from-pink-50 to-purple-50 dark:from-pink-900/10 dark:to-purple-900/10 border border-pink-200 dark:border-pink-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between cursor-pointer" onClick={() => setBirthdayCollapsed(!birthdayCollapsed)}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-linear-to-br from-pink-400 to-purple-500 flex items-center justify-center">
                <Cake className="h-4 w-4 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-foreground">Cumpleaños del mes</h3>
                <p className="text-xs text-gray-500 dark:text-muted">{birthdayCustomers.length} cumpleaños este mes</p>
              </div>
            </div>
            {birthdayCollapsed ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronUp className="h-4 w-4 text-gray-400" />}
          </div>
          {!birthdayCollapsed && (
            <div className="px-4 pb-4">
              <div className="flex gap-3 overflow-x-auto pb-2">
                {birthdayCustomers.map((bday) => (
                  <div
                    key={bday.customer.phone}
                    className={cn("shrink-0 w-48 rounded-xl p-3 cursor-pointer transition-all hover:scale-105",
                      bday.isToday ? "bg-linear-to-br from-yellow-100 to-yellow-200 dark:from-yellow-900/30 dark:to-yellow-800/30 border-2 border-yellow-400" :
                      bday.isSoon ? "bg-linear-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-300" :
                      "bg-white dark:bg-card border border-gray-200 dark:border-card-border"
                    )}
                    onClick={() => openCustomerDetail(bday.customer)}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{background: avatarColor(bday.customer.name)}}>
                        {bday.customer.name.charAt(0).toUpperCase()}
                      </div>
                      {bday.isToday && <span className="text-lg">🎂</span>}
                    </div>
                    <p className="font-bold text-sm text-gray-900 dark:text-foreground truncate">{bday.customer.name}</p>
                    <p className="text-xs text-gray-500 dark:text-muted mt-1">
                      {bday.date.toLocaleDateString("es-PE", { day: "numeric", month: "long" })}
                    </p>
                    <p className="text-xs font-semibold mt-1" style={{ color: bday.isToday ? "#ea580c" : bday.isSoon ? "#f59e0b" : "#6b7280" }}>
                      {bday.isToday ? "¡Hoy es su cumpleaños!" : bday.daysUntil === 1 ? "Mañana" : bday.daysUntil > 0 ? `En ${bday.daysUntil} días` : `Hace ${Math.abs(bday.daysUntil)} días`}
                    </p>
                    {bday.customer.phone && (
                      <a
                        href={`https://wa.me/51${bday.customer.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`🎂 ¡Feliz cumpleaños ${bday.customer.name}! De parte de Bodega San Martín te deseamos un excelente día. 🎉`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="mt-2 flex items-center justify-center gap-1.5 w-full px-2 py-1.5 text-[11px] font-bold rounded-lg bg-green-500 hover:bg-green-600 text-white transition-colors"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.75.75 0 00.917.918l4.458-1.495A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.94 9.94 0 01-5.332-1.543.75.75 0 00-.653-.088l-2.845.954.954-2.845a.75.75 0 00-.088-.653A9.94 9.94 0 012.493 12.5C2.493 7.253 6.753 2.993 12 2.993c5.247 0 9.507 4.26 9.507 9.507S17.247 22 12 22z"/></svg>
                        Felicitar
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
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
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4 flex items-center gap-4">
              <div className="h-10 w-10 bg-gray-200 dark:bg-surface rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-surface rounded w-1/3" />
                <div className="h-3 bg-gray-200 dark:bg-surface rounded w-1/2" />
              </div>
              <div className="h-6 w-16 bg-gray-200 dark:bg-surface rounded-lg" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl">
          {searchText ? "Sin resultados" : "No hay clientes registrados"}
        </div>
      ) : (
        <div className="space-y-1.5">
          {paginatedCustomers.map((c) => {
            const stat = statsMap.get(c.phone)!;
            const rfm = rfmMap.get(c.phone);
            const churnRisk = calculateChurnRisk(c, rfm);
            return (
              <div
                key={c.phone}
                className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-sm overflow-hidden cursor-pointer hover:shadow-md hover:border-gray-300 transition-all"
                onClick={() => openCustomerDetail(c)}
              >
                <div className="flex items-center gap-2.5 px-3 py-2">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{background: avatarColor(c.name)}}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm text-gray-900 dark:text-foreground">{c.name}</p>
                      {stat.stars > 0 && (
                        <span className="text-xs font-bold tracking-wider">
                          <span className="text-amber-400">{"★".repeat(stat.stars)}</span><span className="text-gray-200">{"★".repeat(5 - stat.stars)}</span>
                        </span>
                      )}
                      {rfm && (
                        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold text-white leading-none" style={{ background: rfm.segmentColor }}>
                          {rfm.segment}
                        </span>
                      )}
                      {churnRisk.risk !== "activo" && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold text-white leading-none" style={{ background: churnRisk.color }}>
                          <Shield className="h-2.5 w-2.5" />
                          {churnRisk.risk === "alto" ? "Alto riesgo" : "Riesgo"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-gray-400 dark:text-muted font-mono">{c.phone}</span>
                      {stat.orderCount > 0 && (
                        <>
                          <span className="text-gray-300 dark:text-muted text-xs">•</span>
                          <span className="text-xs text-gray-500 dark:text-muted">{stat.orderCount} pedido{stat.orderCount !== 1 ? "s" : ""}</span>
                          <span className="text-gray-300 dark:text-muted text-xs">•</span>
                          <span className="text-xs font-bold text-emerald-600">S/{stat.totalSpent.toFixed(2)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => { openCustomerDetail(c); setTimeout(() => { requestAiAnalysis(c.phone); }, 50); }}
                      className={cn("flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-colors",
                        c.aiNotes ? "text-violet-600 hover:bg-violet-100" : "text-gray-400 dark:text-muted hover:text-violet-600 hover:bg-violet-50"
                      )}
                      title={c.aiNotes ? "Ver análisis guardado" : "Generar análisis IA"}
                    >
                      <MessageCircle className="h-4 w-4" />
                      <span>Análisis IA</span>
                      {c.aiNotes && <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />}
                    </button>
                    <a
                      href={`https://wa.me/51${c.phone.replace(/\D/g, "")}`}
                      target="_blank" rel="noopener noreferrer"
                      className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-green-500 hover:bg-green-50 transition-colors"
                      title="WhatsApp"
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                    {c.location && (
                      <a
                        href={googleMapsUrl(c.location)}
                        target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors"
                        title="Ver en Maps"
                      >
                        <MapPin className="h-4 w-4" />
                      </a>
                    )}
                    <button
                      onClick={() => setConfirmDeletePhone(c.phone)}
                      className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
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

      {/* Customer pagination */}
      {!loading && filtered.length > CUST_PER_PAGE && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button disabled={safeCustPage <= 1} onClick={() => setCustPage(p => Math.max(1, p - 1))}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-surface transition-colors">
            ← Anterior
          </button>
          <span className="text-xs text-gray-500 dark:text-muted">
            Página {safeCustPage} de {custTotalPages} · {filtered.length} clientes
          </span>
          <button disabled={safeCustPage >= custTotalPages} onClick={() => setCustPage(p => p + 1)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-surface transition-colors">
            Siguiente →
          </button>
        </div>
      )}

      {/* ── Customer Detail Modal ─────────────────────────────────────────── */}
      {selectedCustomer && (
        <div className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/50" style={{ zIndex: 100 }} onClick={() => setSelectedCustomer(null)}>
          <div className="bg-white dark:bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Colored header */}
            <div className="rounded-t-2xl sm:rounded-t-2xl px-5 py-4 shrink-0" style={{ background: 'linear-gradient(to right, #2d6a4f, #7c3aed)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0" style={{background: avatarColor(selectedCustomer.name), boxShadow:'0 0 0 2px rgba(255,255,255,0.35)'}}>
                    {selectedCustomer.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-white text-base leading-tight">{selectedCustomer.name}</h3>
                    <p className="text-xs font-mono" style={{color:'rgba(199,210,254,0.9)'}}>{selectedCustomer.phone}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedCustomer(null)} className="p-1.5 rounded-lg transition-colors" style={{color:'rgba(255,255,255,0.65)'}}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              {/* Stats inline */}
              {(() => {
                const stat = statsMap.get(selectedCustomer.phone)!;
                return (
                  <div className="flex items-center gap-2 mt-3">
                    <div className="flex-1 rounded-xl px-3 py-2 text-center" style={{background:'rgba(255,255,255,0.15)'}}>
                      <div className="flex justify-center">
                        {[1,2,3,4,5].map(n => (
                          <span key={n} className="text-xs" style={{color: n <= stat.stars ? '#fcd34d' : 'rgba(255,255,255,0.2)'}}>★</span>
                        ))}
                      </div>
                      <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.7)'}}>Rating</p>
                    </div>
                    <div className="flex-1 rounded-xl px-3 py-2 text-center" style={{background:'rgba(255,255,255,0.15)'}}>
                      <p className="text-white font-extrabold text-base leading-none">{stat.orderCount}</p>
                      <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.7)'}}>Pedidos</p>
                    </div>
                    <div className="flex-1 rounded-xl px-3 py-2 text-center" style={{background:'rgba(255,255,255,0.15)'}}>
                      <p className="text-white font-extrabold text-sm leading-none">S/{stat.totalSpent.toFixed(2)}</p>
                      <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.7)'}}>Gastado</p>
                    </div>
                  </div>
                );
              })()}
              {/* RFM Segment */}
              {(() => {
                const rfm = rfmMap.get(selectedCustomer.phone);
                if (!rfm) return null;
                return (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="px-2 py-1 rounded-lg text-xs font-bold text-white" style={{ background: rfm.segmentColor }}>
                      {rfm.segment}
                    </span>
                    <span className="text-[11px] font-mono" style={{ color: 'rgba(199,210,254,0.8)' }}>
                      R{rfm.rScore} · F{rfm.fScore} · M{rfm.mScore}
                    </span>
                    <span className="text-[11px]" style={{ color: 'rgba(199,210,254,0.6)' }}>
                      (último pedido: {rfm.recencyDays === 0 ? "hoy" : `hace ${rfm.recencyDays}d`})
                    </span>
                  </div>
                );
              })()}
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

              {/* 360° Overview */}
              {(() => {
                const stat = statsMap.get(selectedCustomer.phone)!;
                const churnRisk = calculateChurnRisk(selectedCustomer, rfmMap.get(selectedCustomer.phone));
                const avgOrderValue = stat.orderCount > 0 ? stat.totalSpent / stat.orderCount : 0;
                
                // Calculate favorite products
                const productCounts = new Map<string, { name: string; count: number; total: number }>();
                for (const o of customerOrders) {
                  for (const item of o.items) {
                    const existing = productCounts.get(item.name);
                    if (existing) {
                      existing.count += item.quantity;
                      existing.total += item.price * item.quantity;
                    } else {
                      productCounts.set(item.name, { name: item.name, count: item.quantity, total: item.price * item.quantity });
                    }
                  }
                }
                const topProducts = Array.from(productCounts.values()).sort((a, b) => b.count - a.count).slice(0, 3);
                
                // Calculate buying frequency (orders per month)
                const firstOrderDate = customerOrders.length > 0 ? new Date(customerOrders[customerOrders.length - 1].createdAt) : new Date();
                const monthsSinceFirst = Math.max(1, (_NOW_MS - firstOrderDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
                const ordersPerMonth = stat.orderCount / monthsSinceFirst;

                return (
                  <div className="bg-linear-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/10 dark:to-purple-900/10 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4">
                    <h4 className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide mb-3 flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Resumen 360°
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="bg-white dark:bg-card rounded-lg p-2.5 border border-indigo-100 dark:border-indigo-800">
                        <p className="text-xs text-gray-500 dark:text-muted">Total gastado</p>
                        <p className="text-base font-bold text-gray-900 dark:text-foreground">S/{stat.totalSpent.toFixed(2)}</p>
                      </div>
                      <div className="bg-white dark:bg-card rounded-lg p-2.5 border border-indigo-100 dark:border-indigo-800">
                        <p className="text-xs text-gray-500 dark:text-muted">Puntos fidelidad</p>
                        <p className="text-base font-bold text-gray-900 dark:text-foreground">{selectedCustomer.loyaltyPoints}</p>
                      </div>
                      <div className="bg-white dark:bg-card rounded-lg p-2.5 border border-indigo-100 dark:border-indigo-800">
                        <p className="text-xs text-gray-500 dark:text-muted">Nivel</p>
                        <p className="text-sm font-bold text-amber-600">{selectedCustomer.loyaltyTier}</p>
                      </div>
                      <div className="bg-white dark:bg-card rounded-lg p-2.5 border border-indigo-100 dark:border-indigo-800">
                        <p className="text-xs text-gray-500 dark:text-muted">Crédito a favor</p>
                        <p className="text-base font-bold text-emerald-600">S/{selectedCustomer.creditBalance.toFixed(2)}</p>
                      </div>
                      <div className="bg-white dark:bg-card rounded-lg p-2.5 border border-indigo-100 dark:border-indigo-800">
                        <p className="text-xs text-gray-500 dark:text-muted">Churn risk</p>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: churnRisk.color }} />
                          <p className="text-sm font-bold" style={{ color: churnRisk.color }}>{churnRisk.risk === "alto" ? "Alto" : churnRisk.risk === "medio" ? "Medio" : "Activo"}</p>
                        </div>
                      </div>
                      <div className="bg-white dark:bg-card rounded-lg p-2.5 border border-indigo-100 dark:border-indigo-800">
                        <p className="text-xs text-gray-500 dark:text-muted">Último pedido</p>
                        <p className="text-sm font-bold text-gray-900 dark:text-foreground">{churnRisk.daysInactive === 0 ? "Hoy" : `${churnRisk.daysInactive}d`}</p>
                      </div>
                    </div>
                    
                    {/* Additional metrics */}
                    <div className="mt-3 pt-3 border-t border-indigo-200 dark:border-indigo-800 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-gray-500 dark:text-muted">Ticket promedio</p>
                        <p className="text-sm font-bold text-gray-900 dark:text-foreground">S/{avgOrderValue.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-muted">Frecuencia de compra</p>
                        <p className="text-sm font-bold text-gray-900 dark:text-foreground">{ordersPerMonth.toFixed(1)} pedidos/mes</p>
                      </div>
                    </div>
                    
                    {/* Favorite products */}
                    {topProducts.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-indigo-200 dark:border-indigo-800">
                        <p className="text-xs text-gray-500 dark:text-muted mb-2">Productos favoritos</p>
                        <div className="space-y-1">
                          {topProducts.map((p, i) => (
                            <div key={p.name} className="flex items-center gap-2">
                              <span className="text-xs font-bold text-violet-500 shrink-0">{i + 1}.</span>
                              <span className="text-xs text-gray-700 dark:text-foreground flex-1 truncate">{p.name}</span>
                              <span className="text-xs text-gray-500 dark:text-muted shrink-0">×{p.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Location */}
              {selectedCustomer.location && (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Dirección</p>
                  <div className="flex items-start gap-2">
                    <p className="text-sm text-gray-700 dark:text-foreground">{selectedCustomer.location}</p>
                    <a
                      href={googleMapsUrl(selectedCustomer.location)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 p-1 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                  {selectedCustomer.reference && (
                    <p className="text-xs text-gray-500 dark:text-muted">Ref: {selectedCustomer.reference}</p>
                  )}
                </div>
              )}

              {/* AI Analysis CTA */}
              <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(to bottom right, #8b5cf6, #9333ea)' }}>
                    <MessageCircle className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-violet-800">Análisis IA</p>
                    {selectedCustomer.aiNotesDate ? (
                      <p className="text-xs text-violet-500">Guardado el {formatDate(selectedCustomer.aiNotesDate)}</p>
                    ) : (
                      <p className="text-xs text-violet-400">Sin análisis guardado</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {selectedCustomer.aiNotes && (
                    <button
                      onClick={() => { setAiAnalysis(selectedCustomer.aiNotes!); setAiAnalysisSaved(true); setShowAiModal(true); }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-card border border-violet-200 text-violet-700 hover:bg-violet-50 transition-colors"
                    >
                      <FileText className="h-4 w-4" />
                      Ver guardado
                    </button>
                  )}
                  <button
                    onClick={() => requestAiAnalysis(selectedCustomer.phone)}
                    disabled={loadingAi}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold text-white hover:brightness-110 transition-all disabled:opacity-60"
                    style={{ background: 'linear-gradient(to right, #8b5cf6, #9333ea)' }}
                  >
                    {loadingAi ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                    {selectedCustomer.aiNotes ? "Generar nuevo" : "Generar análisis"}
                  </button>
                </div>
              </div>

              {/* Quick Notes */}
              <div className="rounded-xl border border-gray-200 dark:border-card-border bg-gray-50/50 dark:bg-surface/50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gray-200 dark:bg-accent flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-gray-600 dark:text-muted" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 dark:text-foreground">Notas rápidas</p>
                      {selectedCustomer.privateNotes && (
                        <p className="text-xs text-gray-500 dark:text-muted">Última actualización: {formatDate(selectedCustomer.updatedAt)}</p>
                      )}
                    </div>
                  </div>
                </div>
                <textarea
                  value={quickNotes}
                  onChange={(e) => setQuickNotes(e.target.value)}
                  placeholder="Agrega notas privadas sobre este cliente..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm text-gray-700 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all resize-none"
                  rows={3}
                />
                <button
                  onClick={saveQuickNotes}
                  disabled={savingNotes || quickNotes === selectedCustomer.privateNotes}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-gray-900 dark:bg-foreground text-white dark:text-surface hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingNotes ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {savingNotes ? "Guardando..." : "Guardar notas"}
                </button>
              </div>

              {/* Purchase history */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Historial de compras</p>
                {loadingOrders ? (
                  <div className="h-20 flex items-center justify-center text-gray-400 dark:text-muted text-sm"><Loader2 className="h-4 w-4 animate-spin mr-2" />Cargando…</div>
                ) : customerOrders.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-muted py-4 text-center">Sin compras registradas</p>
                ) : (
                  <div className="space-y-2">
                    {customerOrders.map(o => (
                      <div
                        key={o.id}
                        className="bg-gray-50 dark:bg-surface rounded-xl p-3 border border-gray-100 dark:border-card-border cursor-pointer hover:bg-gray-100 dark:hover:bg-accent transition-colors"
                        onClick={() => setDetailOrder(o)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-gray-900 dark:text-foreground">{formatDate(o.createdAt)}</span>
                              <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold", STATUS_COLORS[o.status])}>
                                {STATUS_LABELS[o.status]}
                              </span>
                              {o.paymentMethod && (
                                <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold",
                                  o.paymentMethod === "yape" ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700"
                                )}>
                                  {o.paymentMethod === "yape" ? "Yape" : "Efectivo"}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-muted mt-1 truncate">
                              {o.items.map(i => `${i.quantity}Ã— ${i.name}`).join(", ")}
                            </p>
                          </div>
                          <span className="text-sm font-bold text-primary shrink-0">S/{o.total.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Saved locations */}
              {selectedCustomer.locations && selectedCustomer.locations.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Direcciones guardadas</p>
                  {selectedCustomer.locations.map(loc => (
                    <div key={loc.id} className="flex items-start gap-2 bg-gray-50 dark:bg-surface rounded-xl px-3 py-2 border border-gray-100 dark:border-card-border">
                      <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 dark:text-foreground">{loc.location}</p>
                        {loc.reference && <p className="text-xs text-gray-400 dark:text-muted mt-0.5">{loc.reference}</p>}
                      </div>
                      <a href={googleMapsUrl(loc.location)} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline shrink-0 flex items-center gap-1">
                        <ExternalLink className="h-4 w-4" /> Maps
                      </a>
                    </div>
                  ))}
                </div>
              )}

              {/* Interaction Timeline */}
              <div className="space-y-2">
                {!showTimeline ? (
                  <button
                    onClick={() => loadTimeline(selectedCustomer.phone)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold bg-gray-50 dark:bg-surface border border-gray-200 dark:border-card-border text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-colors"
                  >
                    <Activity className="h-4 w-4" /> Ver timeline de interacciones
                  </button>
                ) : (
                  <>
                    <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Timeline de interacciones</p>
                    {loadingTimeline ? (
                      <div className="h-20 flex items-center justify-center text-gray-400 dark:text-muted text-sm"><Loader2 className="h-4 w-4 animate-spin mr-2" />Cargando…</div>
                    ) : timeline.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-muted py-4 text-center">Sin interacciones registradas</p>
                    ) : (
                      <div className="relative pl-5 space-y-3">
                        <div className="absolute left-1.75 top-1 bottom-1 w-0.5 bg-gray-200 dark:bg-card-border" />
                        {timeline.slice(0, 20).map(ev => {
                          const IconComp = ev.icon === "star" ? Star
                            : ev.icon === "message-circle" ? MessageCircle
                            : ev.icon === "bell" ? Bell
                            : ev.icon === "check" ? Check
                            : ev.icon === "x" ? X
                            : ShoppingBasket;
                          const colors = ev.type === "order" ? "bg-primary/10 text-primary"
                            : ev.type === "sale" ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                            : ev.type === "review" ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400"
                            : ev.type === "in-app" ? "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                            : "bg-blue-50 dark:bg-blue-900/20 text-blue-500";
                          return (
                            <div key={ev.id} className="relative flex gap-3">
                              <div className={cn("absolute -left-5 w-4 h-4 rounded-full flex items-center justify-center shrink-0", colors)}>
                                <IconComp className="h-2.5 w-2.5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800 dark:text-foreground leading-tight">{ev.title}</p>
                                <p className="text-xs text-gray-500 dark:text-muted">{ev.detail}</p>
                                <p className="text-xs text-gray-400 dark:text-muted mt-0.5">{formatDate(ev.date)}</p>
                              </div>
                            </div>
                          );
                        })}
                        {timeline.length > 20 && (
                          <p className="text-xs text-gray-400 dark:text-muted text-center">+ {timeline.length - 20} más</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              <p className="text-xs text-gray-400 dark:text-muted">Registrado: {formatDate(selectedCustomer.createdAt)}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Order Detail Modal (from customer history) ────────────────────── */}
      {detailOrder && (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60" style={{ zIndex: 200 }} onClick={() => setDetailOrder(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-card-border shrink-0">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground text-lg">Detalle del pedido</h3>
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
              {/* Timeline */}
              <div className="bg-linear-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-xl p-4 border border-blue-100 dark:border-blue-900/30">
                <p className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wide mb-3">Estado del Pedido</p>
                <div className="flex items-start justify-between gap-1 relative">
                  <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200 dark:bg-gray-700" style={{ zIndex: 0 }} />
                  {getOrderTimeline(detailOrder).map((step) => {
                    const Icon = step.icon;
                    const isCanceled = step.status === "cancelado";
                    return (
                      <div key={step.status} className="flex flex-col items-center gap-1 relative" style={{ flex: isCanceled ? 0.7 : 1, zIndex: 1 }}>
                        <div className={cn(
                          "w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all",
                          step.completed ? "bg-emerald-500 border-emerald-500 text-white"
                          : step.current && !isCanceled ? "bg-blue-500 border-blue-500 text-white"
                          : step.current && isCanceled ? "bg-red-500 border-red-500 text-white"
                          : "bg-white dark:bg-card border-gray-300 dark:border-gray-600 text-gray-400"
                        )}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <p className={cn("text-[10px] font-bold text-center leading-tight",
                          step.completed ? "text-emerald-700 dark:text-emerald-400"
                          : step.current && !isCanceled ? "text-blue-700 dark:text-blue-400"
                          : step.current && isCanceled ? "text-red-700 dark:text-red-400"
                          : "text-gray-400"
                        )}>{step.label}</p>
                        {step.timestamp && <p className="text-[9px] text-gray-400 text-center">{step.timestamp}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Cliente</p>
                <p className="font-bold text-gray-900 dark:text-foreground">{detailOrder.customer.name}</p>
                {detailOrder.customer.phone && (
                  <p className="text-sm text-gray-500 dark:text-muted flex items-center gap-1.5">
                    <Phone className="h-4 w-4 shrink-0" /> {detailOrder.customer.phone}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Dirección</p>
                <div className="flex items-start gap-2">
                  <p className="text-sm text-gray-700 dark:text-foreground flex-1">{detailOrder.customer.location}</p>
                  <a href={googleMapsUrl(detailOrder.customer.location)} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 p-1 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
                {detailOrder.customer.reference && (
                  <p className="text-xs text-gray-500 dark:text-muted">Ref: {detailOrder.customer.reference}</p>
                )}
              </div>
              {detailOrder.paymentMethod && (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Pago</p>
                  <p className="text-sm text-gray-700 dark:text-foreground font-semibold">
                    {detailOrder.paymentMethod === "yape" ? "Yape" : "Efectivo"}
                    {detailOrder.yapeOperationNumber && (
                      <span className="text-gray-400 dark:text-muted font-mono ml-2">Nº Op. {detailOrder.yapeOperationNumber}</span>
                    )}
                  </p>
                </div>
              )}
              {detailOrder.notes && (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Notas</p>
                  <p className="text-sm text-gray-600 dark:text-muted italic">{detailOrder.notes}</p>
                </div>
              )}
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Productos</p>
                <div className="rounded-xl border border-gray-100 dark:border-card-border divide-y divide-gray-100 overflow-hidden">
                  {detailOrder.items.map((item, i) => (
                    <div key={i} className="flex justify-between items-center px-3 py-2 text-sm">
                      <span className="text-gray-700 dark:text-foreground">{item.quantity}× {item.name} <span className="text-gray-400 dark:text-muted">({item.unit})</span></span>
                      <span className="font-semibold text-gray-900 dark:text-foreground">S/{(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                  {/* Discount breakdown — only shown when a discount was actually applied */}
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
              <div className="flex flex-wrap gap-3 items-center text-xs text-gray-400 dark:text-muted">
                <span>ID: {detailOrder.id}</span>
                <span>Fecha: {formatDate(detailOrder.createdAt)}</span>
                <span className={cn("inline-flex px-2 py-0.5 rounded-full font-bold", STATUS_COLORS[detailOrder.status])}>
                  {STATUS_LABELS[detailOrder.status]}
                </span>
              </div>
              <button
                onClick={() => window.open(`/api/invoices/${detailOrder.id}`, "_blank", "noopener,noreferrer")}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-bold hover:bg-primary/20 transition-colors"
              >
                <Printer className="h-4 w-4" />
                Imprimir Ticket / Boleta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Analysis Modal ─────────────────────────────────────────────── */}
      {showAiModal && (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60" style={{ zIndex: 300 }} onClick={() => setShowAiModal(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="rounded-t-2xl px-5 py-4 shrink-0" style={{ background: 'linear-gradient(to right, #8b5cf6, #9333ea)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white dark:bg-card/20 flex items-center justify-center">
                    <MessageCircle className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-white text-base">Análisis IA</h3>
                    {selectedCustomer && (
                      <p className="text-violet-200 text-xs">{selectedCustomer.name}</p>
                    )}
                  </div>
                </div>
                <button onClick={() => setShowAiModal(false)} className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white dark:bg-card/10 transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
              {/* Status bar */}
              {!loadingAi && aiAnalysis && (
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-violet-200">
                    {aiAnalysisSaved ? `✓ Guardado el ${selectedCustomer?.aiNotesDate ? formatDate(selectedCustomer.aiNotesDate) : "hoy"}` : "âš¡ Análisis recién generado"}
                  </span>
                  {!aiAnalysisSaved && (
                    <button
                      onClick={saveAiAnalysis}
                      disabled={savingAi}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white dark:bg-card text-violet-700 text-xs font-bold hover:bg-violet-50 transition-colors disabled:opacity-60"
                    >
                      {savingAi ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      {savingAi ? "Guardando…" : "Guardar análisis"}
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {loadingAi ? (
                <div className="h-40 flex flex-col items-center justify-center text-gray-400 dark:text-muted">
                  <Loader2 className="h-6 w-6 animate-spin mb-3" />
                  <p className="text-sm font-semibold">Analizando historial de compras…</p>
                  <p className="text-xs mt-1 text-gray-300 dark:text-muted">Esto puede tomar unos segundos</p>
                </div>
              ) : aiAnalysis ? (
                <div className="space-y-0.5" dangerouslySetInnerHTML={{ __html: mdToHtml(aiAnalysis) }} />
              ) : (
                <p className="text-sm text-gray-400 dark:text-muted text-center py-10">No hay análisis disponible.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ─────────────────────────────────────── */}
      {confirmDeletePhone && (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60" style={{ zIndex: 300 }} onClick={() => setConfirmDeletePhone(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-foreground">¿Eliminar cliente?</h3>
                <p className="text-sm text-gray-500 dark:text-muted">Se eliminará el cliente y sus datos.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeletePhone(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-700 dark:text-foreground bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors">Cancelar</button>
              <button onClick={confirmDelete} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors">Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── WhatsApp Export Modal ─────────────────────────────────────────── */}
      {showWhatsAppModal && (() => {
        const filteredForExport = customers.filter(c => segmentFilter === "all" || rfmMap.get(c.phone)?.segment === segmentFilter);
        const phoneList = filteredForExport.map(c => `51${c.phone.replace(/\D/g, "")}`).join("\n");
        
        return (
          <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60" style={{ zIndex: 300 }} onClick={() => setShowWhatsAppModal(false)}>
            <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-gray-100 dark:border-card-border shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                      <Smartphone className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-gray-900 dark:text-foreground text-lg">WhatsApp Masivo</h3>
                      <p className="text-sm text-gray-500 dark:text-muted">
                        {filteredForExport.length} cliente{filteredForExport.length !== 1 ? "s" : ""} seleccionado{filteredForExport.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setShowWhatsAppModal(false)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              
              <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
                {/* Segment info */}
                <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
                  <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                    Filtro actual: <span className="font-bold">{segmentFilter === "all" ? "Todos los clientes" : `Segmento ${segmentFilter}`}</span>
                  </p>
                </div>

                {/* Phone numbers list */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Lista de teléfonos</p>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(phoneList);
                        setCopiedPhones(true);
                        setTimeout(() => setCopiedPhones(false), 2000);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-gray-900 dark:bg-foreground text-white dark:text-surface hover:bg-gray-800 transition-colors"
                    >
                      {copiedPhones ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copiedPhones ? "¡Copiado!" : "Copiar lista"}
                    </button>
                  </div>
                  <div className="bg-gray-50 dark:bg-surface rounded-xl p-3 border border-gray-200 dark:border-card-border max-h-48 overflow-y-auto">
                    <pre className="text-xs text-gray-700 dark:text-foreground font-mono whitespace-pre-wrap">{phoneList}</pre>
                  </div>
                </div>

                {/* Customer cards with WhatsApp links */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Abrir WhatsApp individual</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {filteredForExport.slice(0, 50).map(c => (
                      <div key={c.phone} className="flex items-center justify-between bg-gray-50 dark:bg-surface rounded-lg px-3 py-2 border border-gray-200 dark:border-card-border">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0" style={{background: avatarColor(c.name)}}>
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-foreground truncate">{c.name}</p>
                            <p className="text-xs text-gray-500 dark:text-muted font-mono">{c.phone}</p>
                          </div>
                        </div>
                        <a
                          href={`https://wa.me/51${c.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola ${c.name}, tenemos ofertas especiales para ti en Bodega San Martín!`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500 text-white hover:bg-green-600 transition-colors shrink-0"
                        >
                          <Phone className="h-3 w-3" />
                          Abrir
                        </a>
                      </div>
                    ))}
                    {filteredForExport.length > 50 && (
                      <p className="text-xs text-gray-400 dark:text-muted text-center py-2">
                        Mostrando los primeros 50 de {filteredForExport.length} clientes
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Segment Builder Modal ────────────────────────────────────────── */}
      {showSegmentBuilder && (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60" style={{ zIndex: 300 }} onClick={closeSegmentBuilder}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 dark:border-card-border shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
                    <SlidersHorizontal className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-gray-900 dark:text-foreground text-lg">
                      {editingSegmentId ? "Editar segmento" : "Crear segmento personalizado"}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-muted">Define criterios de filtrado avanzados</p>
                  </div>
                </div>
                <button onClick={closeSegmentBuilder} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {/* Segment name and color */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 dark:text-muted uppercase tracking-wide">Nombre del segmento</label>
                  <input
                    type="text"
                    value={segmentName}
                    onChange={e => setSegmentName(e.target.value)}
                    placeholder="ej. Clientes VIP"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm text-gray-900 dark:text-foreground outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 dark:text-muted uppercase tracking-wide">Color</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={segmentColor}
                      onChange={e => setSegmentColor(e.target.value)}
                      className="h-10 w-16 rounded-lg border border-gray-200 dark:border-card-border cursor-pointer"
                    />
                    <div className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border flex items-center gap-2" style={{ background: segmentColor, color: "#fff" }}>
                      <div className="w-4 h-4 rounded-full bg-white/30" />
                      <span className="text-sm font-semibold">{segmentName || "Vista previa"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Logic selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600 dark:text-muted uppercase tracking-wide">Lógica de combinación</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSegmentLogic("AND")}
                    className={cn("flex-1 py-2 rounded-lg text-sm font-semibold transition-all",
                      segmentLogic === "AND" ? "bg-violet-500 text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted hover:bg-gray-200"
                    )}
                  >
                    AND (cumple todos)
                  </button>
                  <button
                    onClick={() => setSegmentLogic("OR")}
                    className={cn("flex-1 py-2 rounded-lg text-sm font-semibold transition-all",
                      segmentLogic === "OR" ? "bg-violet-500 text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted hover:bg-gray-200"
                    )}
                  >
                    OR (cumple alguno)
                  </button>
                </div>
              </div>

              {/* Filters grid */}
              <div className="border-t border-gray-200 dark:border-card-border pt-3 space-y-3">
                <p className="text-xs font-bold text-gray-600 dark:text-muted uppercase tracking-wide flex items-center gap-2">
                  <Filter className="h-4 w-4" /> Criterios de filtrado
                </p>

                {/* Total spent range */}
                <div className="bg-gray-50 dark:bg-surface rounded-xl p-3 space-y-2">
                  <p className="text-sm font-semibold text-gray-700 dark:text-foreground">Gasto total (S/)</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={filterTotalSpentMin}
                      onChange={e => setFilterTotalSpentMin(e.target.value)}
                      placeholder="Mínimo"
                      className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-violet-400"
                    />
                    <input
                      type="number"
                      value={filterTotalSpentMax}
                      onChange={e => setFilterTotalSpentMax(e.target.value)}
                      placeholder="Máximo"
                      className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-violet-400"
                    />
                  </div>
                </div>

                {/* Order count range */}
                <div className="bg-gray-50 dark:bg-surface rounded-xl p-3 space-y-2">
                  <p className="text-sm font-semibold text-gray-700 dark:text-foreground">Número de pedidos</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={filterOrderCountMin}
                      onChange={e => setFilterOrderCountMin(e.target.value)}
                      placeholder="Mínimo"
                      className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-violet-400"
                    />
                    <input
                      type="number"
                      value={filterOrderCountMax}
                      onChange={e => setFilterOrderCountMax(e.target.value)}
                      placeholder="Máximo"
                      className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-violet-400"
                    />
                  </div>
                </div>

                {/* Last purchase days range */}
                <div className="bg-gray-50 dark:bg-surface rounded-xl p-3 space-y-2">
                  <p className="text-sm font-semibold text-gray-700 dark:text-foreground">Días desde última compra</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={filterLastPurchaseDaysMin}
                      onChange={e => setFilterLastPurchaseDaysMin(e.target.value)}
                      placeholder="Mínimo"
                      className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-violet-400"
                    />
                    <input
                      type="number"
                      value={filterLastPurchaseDaysMax}
                      onChange={e => setFilterLastPurchaseDaysMax(e.target.value)}
                      placeholder="Máximo"
                      className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-violet-400"
                    />
                  </div>
                </div>

                {/* Loyalty tiers */}
                <div className="bg-gray-50 dark:bg-surface rounded-xl p-3 space-y-2">
                  <p className="text-sm font-semibold text-gray-700 dark:text-foreground">Nivel de lealtad</p>
                  <div className="flex flex-wrap gap-2">
                    {["Bronce", "Plata", "Oro", "Platino"].map(tier => (
                      <button
                        key={tier}
                        onClick={() => {
                          const newSet = new Set(filterLoyaltyTiers);
                          if (newSet.has(tier)) newSet.delete(tier);
                          else newSet.add(tier);
                          setFilterLoyaltyTiers(newSet);
                        }}
                        className={cn("px-3 py-1 rounded-full text-xs font-semibold transition-all",
                          filterLoyaltyTiers.has(tier) ? "bg-violet-500 text-white" : "bg-gray-200 dark:bg-card text-gray-600 dark:text-muted hover:bg-gray-300"
                        )}
                      >
                        {tier}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Boolean filters */}
                <div className="bg-gray-50 dark:bg-surface rounded-xl p-3 space-y-2">
                  <p className="text-sm font-semibold text-gray-700 dark:text-foreground">Otros criterios</p>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filterBirthdayThisMonth}
                        onChange={e => setFilterBirthdayThisMonth(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-violet-500 focus:ring-violet-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-foreground">Cumpleaños este mes 🎂</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filterHasDebtCustom}
                        onChange={e => setFilterHasDebtCustom(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-violet-500 focus:ring-violet-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-foreground">Tiene deuda pendiente</span>
                    </label>
                  </div>
                </div>

                {/* Churn risk */}
                <div className="bg-gray-50 dark:bg-surface rounded-xl p-3 space-y-2">
                  <p className="text-sm font-semibold text-gray-700 dark:text-foreground">Riesgo de abandono</p>
                  <div className="flex flex-wrap gap-2">
                    {(["alto", "medio"] as const).map(risk => (
                      <button
                        key={risk}
                        onClick={() => {
                          const newSet = new Set(filterChurnRisk);
                          if (newSet.has(risk)) newSet.delete(risk);
                          else newSet.add(risk);
                          setFilterChurnRisk(newSet);
                        }}
                        className={cn("px-3 py-1 rounded-full text-xs font-semibold transition-all",
                          filterChurnRisk.has(risk) ? "bg-violet-500 text-white" : "bg-gray-200 dark:bg-card text-gray-600 dark:text-muted hover:bg-gray-300"
                        )}
                      >
                        {risk.charAt(0).toUpperCase() + risk.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Locations */}
                <div className="bg-gray-50 dark:bg-surface rounded-xl p-3 space-y-2">
                  <p className="text-sm font-semibold text-gray-700 dark:text-foreground">Ubicaciones (separadas por coma)</p>
                  <input
                    type="text"
                    value={filterLocations}
                    onChange={e => setFilterLocations(e.target.value)}
                    placeholder="ej. Centro, San Juan, Miraflores"
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-violet-400"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-gray-100 dark:border-card-border shrink-0 flex gap-2">
              <button
                onClick={closeSegmentBuilder}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-700 dark:text-foreground bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={saveCustomSegment}
                disabled={!segmentName.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-violet-500 hover:bg-violet-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Save className="h-4 w-4" />
                {editingSegmentId ? "Actualizar" : "Crear"} segmento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reviews Tab ───────────────────────────────────────────────────────────────
function ReviewsTab() {
  const [reviews, setReviews] = useState<DbReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  // Admin replies
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [replyingToReview, setReplyingToReview] = useState<DbReview | null>(null);
  const [replyText, setReplyText] = useState("");
  const [savingReply, setSavingReply] = useState(false);

  const REPLY_TEMPLATES = [
    "¡Muchas gracias por tu comentario! Nos alegra servirte 😊",
    "Lamentamos tu experiencia. Por favor contáctanos para resolverlo.",
    "¡Gracias por tu preferencia! Te esperamos pronto 🛒",
    "Agradecemos tus palabras. Seguiremos mejorando para ti.",
    "Estamos aquí para ayudarte. Contáctanos si necesitas algo más.",
  ];

  useScrollLock(showReplyModal);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/reviews?all=1");
      if (r.ok) setReviews(await r.json());
    } catch {}
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const deleteReview = async (id: string) => {
    if (!confirm("¿Eliminar esta reseña?")) return;
    await fetch(`/api/reviews/${id}`, { method: "DELETE" });
    load();
  };

  const setStatus = async (id: string, status: "approved" | "rejected") => {
    await fetch(`/api/reviews/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    setReviews(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  };

  const generateAiSynthesis = async () => {
    setLoadingAi(true);
    const approved = reviews.filter(r => r.status === "approved");
    if (approved.length === 0) { setAiSummary("No hay reseñas aprobadas para analizar."); setLoadingAi(false); return; }
    const totalRating = approved.reduce((s, r) => s + r.rating, 0);
    const avgRating = (totalRating / approved.length).toFixed(1);
    const dist = [5, 4, 3, 2, 1].map(n => ({ stars: n, count: approved.filter(r => r.rating === n).length }));
    const topPositive = approved.filter(r => r.rating >= 4).slice(0, 5).map(r => r.text);
    const issues = approved.filter(r => r.rating <= 3).slice(0, 5).map(r => r.text);

    const summary = [
      `## Síntesis de Reseñas`,
      `**${approved.length}** reseñas aprobadas · Promedio: **${avgRating}★**\n`,
      `### Distribución`,
      ...dist.map(d => `- ${"★".repeat(d.stars)}${"☆".repeat(5 - d.stars)}: ${d.count} reseña${d.count !== 1 ? "s" : ""} (${(d.count / approved.length * 100).toFixed(0)}%)`),
      ``,
      topPositive.length > 0 ? `### Lo que más destacan los clientes` : "",
      ...topPositive.map(t => `- "${t.slice(0, 100)}${t.length > 100 ? "..." : ""}"`),
      ``,
      issues.length > 0 ? `### Áreas de mejora mencionadas` : "",
      ...issues.map(t => `- "${t.slice(0, 100)}${t.length > 100 ? "..." : ""}"`),
    ].filter(Boolean).join("\n");

    setAiSummary(summary);
    setLoadingAi(false);
  };

  const openReplyModal = (review: DbReview) => {
    setReplyingToReview(review);
    setReplyText(review.adminReply ?? "");
    setShowReplyModal(true);
  };

  const closeReplyModal = () => {
    setShowReplyModal(false);
    setReplyingToReview(null);
    setReplyText("");
  };

  const saveReply = async () => {
    if (!replyingToReview || !replyText.trim() || savingReply) return;
    setSavingReply(true);
    try {
      await fetch(`/api/reviews/${replyingToReview.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminReply: replyText.trim(),
          adminReplyDate: new Date().toISOString(),
        }),
      });
      setReviews(prev => prev.map(r => r.id === replyingToReview.id
        ? { ...r, adminReply: replyText.trim(), adminReplyDate: new Date().toISOString() }
        : r
      ));
      closeReplyModal();
    } catch {}
    setSavingReply(false);
  };

  const deleteReply = async (reviewId: string) => {
    if (!confirm("¿Eliminar esta respuesta?")) return;
    try {
      await fetch(`/api/reviews/${reviewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminReply: null,
          adminReplyDate: null,
        }),
      });
      setReviews(prev => prev.map(r => r.id === reviewId
        ? { ...r, adminReply: undefined, adminReplyDate: undefined }
        : r
      ));
    } catch {}
  };

  const filtered = filter === "all" ? reviews : reviews.filter(r => r.status === filter);
  const pendingCount = reviews.filter(r => r.status === "pending").length;
  const approvedReviews = reviews.filter(r => r.status === "approved");
  const avg = approvedReviews.length > 0
    ? (approvedReviews.reduce((s, r) => s + r.rating, 0) / approvedReviews.length).toFixed(1)
    : "—";

  const STATUS_BADGE: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  const STATUS_LABEL: Record<string, string> = { pending: "Pendiente", approved: "Aprobada", rejected: "Rechazada" };

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-foreground">Reseñas</h2>
          <p className="text-sm text-gray-500 dark:text-muted">
            {reviews.length} total · {approvedReviews.length} aprobadas · promedio {avg} ★
            {pendingCount > 0 && <span className="ml-2 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-xs font-bold">{pendingCount} pendientes</span>}
          </p>
        </div>
        <button
          onClick={generateAiSynthesis}
          disabled={loadingAi}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white hover:brightness-110 transition-all shadow-sm disabled:opacity-60"
          style={{ background: 'linear-gradient(to right, #8b5cf6, #9333ea)' }}
        >
          {loadingAi ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
          Síntesis IA
        </button>
      </div>

      {/* AI Summary */}
      {aiSummary && (
        <div className="bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-violet-800 dark:text-violet-300">Síntesis automática</p>
            <button onClick={() => setAiSummary(null)} className="p-1 rounded text-violet-400 hover:text-violet-600"><X className="h-4 w-4" /></button>
          </div>
          <div className="text-sm text-violet-700 dark:text-violet-300 whitespace-pre-line">{aiSummary}</div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["all", "pending", "approved", "rejected"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
            filter === f ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted hover:bg-gray-200 dark:hover:bg-accent"
          )}>
            {f === "all" ? "Todas" : STATUS_LABEL[f]}
            {f === "pending" && pendingCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-yellow-400 text-yellow-900 text-[10px]">{pendingCount}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted">Cargando…</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const hasReply = !!r.adminReply;
            return (
              <div key={r.id} className={cn("bg-white dark:bg-card border rounded-2xl shadow-sm overflow-hidden",
                r.status === "rejected" ? "border-red-200 dark:border-red-900/30 opacity-60" : "border-gray-200 dark:border-card-border"
              )}>
                {/* Review content */}
                <div className="p-4 flex gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-gray-900 dark:text-foreground text-sm">{r.name}</p>
                          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold", STATUS_BADGE[r.status] ?? STATUS_BADGE.pending)}>
                            {STATUS_LABEL[r.status] ?? "Pendiente"}
                          </span>
                          {hasReply && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 flex items-center gap-1">
                              <Reply className="h-2.5 w-2.5" /> Respondida
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 dark:text-muted">{r.location} · {formatDate(r.date)}</p>
                      </div>
                      <Stars rating={r.rating} />
                    </div>
                    <p className="text-sm text-gray-600 dark:text-muted mt-1.5">{r.text}</p>
                    {r.phone && <p className="text-xs text-gray-400 dark:text-muted mt-1 font-mono">{r.phone}</p>}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {r.status !== "approved" && (
                      <button onClick={() => setStatus(r.id, "approved")} className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors" title="Aprobar">
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                    {r.status !== "rejected" && (
                      <button onClick={() => setStatus(r.id, "rejected")} className="p-1.5 rounded-lg text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors" title="Rechazar">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    {r.status === "approved" && (
                      <button onClick={() => openReplyModal(r)} className="p-1.5 rounded-lg text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors" title="Responder">
                        <Reply className="h-4 w-4" />
                      </button>
                    )}
                    <button onClick={() => deleteReview(r.id)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Eliminar">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Admin reply */}
                {hasReply && (
                  <div className="bg-linear-to-r from-violet-50 to-purple-50 dark:from-violet-900/10 dark:to-purple-900/10 border-t border-violet-200 dark:border-violet-800 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-linear-to-br from-violet-400 to-purple-500 flex items-center justify-center shrink-0">
                        <Sparkles className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wide mb-1">Respuesta de Bodega San Martín</p>
                        <p className="text-sm text-violet-900 dark:text-violet-200">{r.adminReply}</p>
                        {r.adminReplyDate && (
                          <p className="text-xs text-violet-400 dark:text-violet-500 mt-1">{formatDate(r.adminReplyDate)}</p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => openReplyModal(r)}
                          className="p-1 rounded text-violet-400 hover:text-violet-600 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
                          title="Editar respuesta"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteReply(r.id)}
                          className="p-1 rounded text-violet-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                          title="Eliminar respuesta"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl">No hay reseñas{filter !== "all" ? ` ${STATUS_LABEL[filter]?.toLowerCase() ?? ""}s` : ""}</div>
          )}
        </div>
      )}

      {/* ── Reply Modal ──────────────────────────────────────────────────── */}
      {showReplyModal && replyingToReview && (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60" style={{ zIndex: 300 }} onClick={closeReplyModal}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 dark:border-card-border shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
                    <Reply className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-gray-900 dark:text-foreground text-lg">Responder reseña</h3>
                    <p className="text-sm text-gray-500 dark:text-muted">Mensaje para el cliente</p>
                  </div>
                </div>
                <button onClick={closeReplyModal} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {/* Original review (read-only) */}
              <div className="bg-gray-50 dark:bg-surface rounded-xl p-4 border border-gray-200 dark:border-card-border">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-bold text-gray-900 dark:text-foreground text-sm">{replyingToReview.name}</p>
                    <p className="text-xs text-gray-400 dark:text-muted">{replyingToReview.location} · {formatDate(replyingToReview.date)}</p>
                  </div>
                  <Stars rating={replyingToReview.rating} />
                </div>
                <p className="text-sm text-gray-700 dark:text-foreground">{replyingToReview.text}</p>
              </div>

              {/* Reply templates */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-600 dark:text-muted uppercase tracking-wide">Plantillas rápidas</p>
                <div className="flex flex-wrap gap-2">
                  {REPLY_TEMPLATES.map((template, i) => (
                    <button
                      key={i}
                      onClick={() => setReplyText(template)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors border border-violet-200 dark:border-violet-800"
                    >
                      {template.slice(0, 40)}{template.length > 40 ? "..." : ""}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reply textarea */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-600 dark:text-muted uppercase tracking-wide">Tu respuesta</label>
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Escribe tu respuesta..."
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm text-gray-900 dark:text-foreground outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all resize-none"
                />
                <p className="text-xs text-gray-400 dark:text-muted">{replyText.length} caracteres</p>
              </div>

              {/* Preview */}
              {replyText.trim() && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-600 dark:text-muted uppercase tracking-wide">Vista previa</p>
                  <div className="bg-linear-to-r from-violet-50 to-purple-50 dark:from-violet-900/10 dark:to-purple-900/10 rounded-xl p-4 border border-violet-200 dark:border-violet-800">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-linear-to-br from-violet-400 to-purple-500 flex items-center justify-center shrink-0">
                        <Sparkles className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wide mb-1">Respuesta de Bodega San Martín</p>
                        <p className="text-sm text-violet-900 dark:text-violet-200">{replyText}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-gray-100 dark:border-card-border shrink-0 flex gap-2">
              <button
                onClick={closeReplyModal}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-700 dark:text-foreground bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={saveReply}
                disabled={!replyText.trim() || savingReply}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-violet-500 hover:bg-violet-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {savingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Publicar respuesta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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

  // eslint-disable-next-line react-hooks/set-state-in-effect
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
          {paginatedOrders.map((o) => (
            <div key={o.id} className={cn("bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-sm overflow-hidden", selectedOrderIds.has(o.id) && "ring-2 ring-primary")}>
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
          ))}
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
                        <h2 className="text-lg font-extrabold text-gray-900">Bodega San Martín</h2>
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

function SettingsSaveBtn({ section, data, extra, saving, savedSection, onSave }: {
  section: string;
  data: Record<string, unknown>;
  extra?: () => void;
  saving: boolean;
  savedSection: string | null;
  onSave: (section: string, data: Record<string, unknown>, extra?: () => void) => void;
}) {
  return (
    <button
      type="button"
      disabled={saving}
      onClick={() => onSave(section, data, extra)}
      className={cn(
        "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all",
        savedSection === section ? "bg-emerald-500 text-white" : "bg-gray-900 text-white hover:bg-gray-800"
      )}
    >
      {saving && savedSection !== section ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</> :
       savedSection === section ? <><Check className="h-4 w-4" /> ¡Guardado!</> :
       "Guardar"}
    </button>
  );
}

type NavLinkItem = { id: string; visible: boolean };
const NAV_LABEL: Record<string, string> = {
  inicio: "Inicio",
  productos: "Productos",
  beneficios: "Beneficios",
  contacto: "Contacto",
};
const DEFAULT_NAV_LINKS: NavLinkItem[] = [
  { id: "inicio", visible: true },
  { id: "productos", visible: true },
  { id: "beneficios", visible: true },
  { id: "contacto", visible: true },
];

function SettingsTab({ storeMode, onModeChange }: { storeMode: StoreMode; onModeChange: (m: StoreMode) => void }) {
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState<"mode" | "business" | "payment" | "nav" | "password" | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedSection, setSavedSection] = useState<string | null>(null);
  
  // Backup/restore state
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePreview, setRestorePreview] = useState<{ date: string; size: string; products: number; orders: number; customers: number; sales: number; suppliers: number } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [backupSchedule, setBackupSchedule] = useState<"none" | "daily" | "weekly">(() => {
    if (typeof window === "undefined") return "none";
    return (localStorage.getItem("bsm-backup-schedule") as "none" | "daily" | "weekly") || "none";
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mode
  const [mode, setMode] = useState<StoreMode>(storeMode);
  // Business
  const [businessName, setBusinessName] = useState("Bodega San Martín");
  const [businessPhone, setBusinessPhone] = useState("51916409675");
  const [businessAddress, setBusinessAddress] = useState("Pucallpa, Ucayali");
  const [logoUrl, setLogoUrl] = useState("");
  const [description, setDescription] = useState("Productos frescos, precios justos y entrega directa a tu puerta.");
  const [hours, setHours] = useState("Lun - Sáb: 7am - 9pm");
  const [deliveryZone, setDeliveryZone] = useState("Pucallpa");
  const [businessLat, setBusinessLat] = useState<number | null>(null);
  const [businessLon, setBusinessLon] = useState<number | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [pickerLat, setPickerLat] = useState(-8.38001);
  const [pickerLon, setPickerLon] = useState(-74.53551);
  // Payment
  const [yapeEnabled, setYapeEnabled] = useState(true);
  const [yapeImage, setYapeImage] = useState("");
  const [yapeName, setYapeName] = useState("");
  const [yapePhone, setYapePhone] = useState("");
  const [cashEnabled, setCashEnabled] = useState(true);
  // Nav
  const [navLinks, setNavLinks] = useState<NavLinkItem[]>(DEFAULT_NAV_LINKS);
  // Password
  const [currentPwInput, setCurrentPwInput] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwChangeError, setPwChangeError] = useState("");
  const [storedAdminPw, setStoredAdminPw] = useState("admin2024");
  // Maintenance
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState("");
  // Bypass login
  const [bypassLogin, setBypassLogin] = useState(false);

  const yapeImgRef = useRef<HTMLInputElement>(null);
  const logoImgRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.ok ? r.json() : null)
      .then((d) => {
        if (d) {
          if (d.mode) setMode(d.mode);
          if (d.businessName) setBusinessName(d.businessName);
          if (d.businessPhone) setBusinessPhone(d.businessPhone);
          if (d.businessAddress) setBusinessAddress(d.businessAddress);
          if (d.logoUrl) setLogoUrl(d.logoUrl);
          if (d.description) setDescription(d.description);
          if (d.hours) setHours(d.hours);
          if (d.deliveryZone) setDeliveryZone(d.deliveryZone);
          if (d.businessLat) { setBusinessLat(d.businessLat); setPickerLat(d.businessLat); }
          if (d.businessLon) { setBusinessLon(d.businessLon); setPickerLon(d.businessLon); }
          if (d.yapeEnabled !== undefined) setYapeEnabled(d.yapeEnabled);
          if (d.yapeImage) setYapeImage(d.yapeImage);
          if (d.yapeName) setYapeName(d.yapeName);
          if (d.yapePhone) setYapePhone(d.yapePhone);
          if (d.cashEnabled !== undefined) setCashEnabled(d.cashEnabled);
          if (Array.isArray(d.navLinks) && d.navLinks.length > 0) setNavLinks(d.navLinks);
          if (d.adminPassword) setStoredAdminPw(d.adminPassword);
          if (d.maintenanceMode !== undefined) setMaintenanceMode(d.maintenanceMode);
          if (d.maintenanceMessage) setMaintenanceMsg(d.maintenanceMessage);
          if (d.adminBypassLogin !== undefined) setBypassLogin(d.adminBypassLogin);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const patch = async (data: Record<string, unknown>) => {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  };

  const saveSection = async (section: string, data: Record<string, unknown>, extraAction?: () => void) => {
    setSaving(true);
    try {
      await patch(data);
      if (extraAction) extraAction();
      setSavedSection(section);
      setTimeout(() => { setSavedSection(null); setOpenModal(null); }, 1300);
    } catch {}
    setSaving(false);
  };

  const handleFileUpload = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setter(reader.result as string);
    reader.readAsDataURL(file);
  };

  const moveNavLink = (idx: number, dir: -1 | 1) => {
    const next = [...navLinks];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setNavLinks(next);
  };

  const toggleNavVis = (idx: number) =>
    setNavLinks(prev => prev.map((l, i) => i === idx ? { ...l, visible: !l.visible } : l));

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-3 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-gray-200 dark:bg-surface rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-5 bg-gray-200 dark:bg-surface rounded w-1/3" />
              <div className="h-3 bg-gray-200 dark:bg-surface rounded w-2/3" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const sections = [
    {
      id: "mode" as const,
      icon: <ShoppingCart className="h-6 w-6 text-blue-500" />,
      bg: "bg-blue-50",
      title: "Modo de tienda",
      desc: "Cómo reciben pedidos tus clientes",
      badge: mode === "whatsapp" ? "WhatsApp" : "Checkout",
      badgeColor: mode === "whatsapp" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700",
    },
    {
      id: "business" as const,
      icon: <Store className="h-6 w-6 text-orange-500" />,
      bg: "bg-orange-50",
      title: "Información del negocio",
      desc: "Nombre, teléfono, horario y logo",
      badge: businessName,
      badgeColor: "bg-orange-100 text-orange-700",
    },
    {
      id: "payment" as const,
      icon: <HandCoins className="h-6 w-6 text-purple-500" />,
      bg: "bg-purple-50",
      title: "Métodos de pago",
      desc: "Efectivo y Yape",
      badge: [cashEnabled && "Efectivo", yapeEnabled && "Yape"].filter(Boolean).join(" · ") || "Ninguno",
      badgeColor: "bg-purple-100 text-purple-700",
    },
    {
      id: "nav" as const,
      icon: <LinkIcon className="h-6 w-6 text-indigo-500" />,
      bg: "bg-indigo-50",
      title: "Navegación del sitio",
      desc: "Orden y visibilidad de los enlaces",
      badge: `${navLinks.filter(l => l.visible).length} de ${navLinks.length} visibles`,
      badgeColor: "bg-indigo-100 text-indigo-700",
    },
    {
      id: "password" as const,
      icon: <Lock className="h-6 w-6 text-red-500" />,
      bg: "bg-red-50",
      title: "Contraseña de admin",
      desc: "Cambia la contraseña de acceso al panel",
      badge: "••••••",
      badgeColor: "bg-red-100 text-red-700",
    },
  ];

  return (
    <div className="space-y-3 sm:space-y-6">
      <div>
        <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-foreground">Configuración</h2>
        <p className="text-sm text-gray-500 dark:text-muted">Personaliza tu tienda, pagos y navegación</p>
      </div>

      {/* Section cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sections.map(s => (
          <div key={s.id} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-5 shadow-sm flex flex-col gap-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", s.bg)}>
                {s.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 dark:text-foreground text-sm">{s.title}</p>
                <p className="text-xs text-gray-500 dark:text-muted">{s.desc}</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-semibold truncate max-w-[58%]", s.badgeColor)}>
                {s.badge}
              </span>
              <button
                onClick={() => setOpenModal(s.id)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-gray-700 dark:text-foreground bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors shrink-0"
              >
                <Pencil className="h-4 w-4" /> Editar
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Maintenance mode toggle */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-gray-900 dark:text-foreground text-sm">Modo mantenimiento</p>
            <p className="text-xs text-gray-500 dark:text-muted">Bloquea la tienda para los clientes</p>
          </div>
          <button
            onClick={async () => {
              const next = !maintenanceMode;
              setMaintenanceMode(next);
              await patch({ maintenanceMode: next, maintenanceMessage: maintenanceMsg || undefined });
            }}
            className={cn(
              "relative w-12 h-6 rounded-full transition-colors",
              maintenanceMode ? "bg-amber-500" : "bg-gray-200 dark:bg-surface"
            )}
          >
            <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform", maintenanceMode && "translate-x-6")} />
          </button>
        </div>
        {maintenanceMode && (
          <div className="mt-3">
            <input
              type="text"
              value={maintenanceMsg}
              onChange={e => setMaintenanceMsg(e.target.value)}
              onBlur={() => patch({ maintenanceMessage: maintenanceMsg || undefined })}
              placeholder="Mensaje personalizado (opcional)"
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-surface border border-gray-200 dark:border-card-border rounded-xl outline-none focus:ring-2 focus:ring-amber-200"
            />
          </div>
        )}
      </div>

      {/* Bypass login toggle */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-cyan-50 flex items-center justify-center shrink-0">
            <UserCog className="h-6 w-6 text-cyan-500" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-gray-900 dark:text-foreground text-sm">Acceso sin login</p>
            <p className="text-xs text-gray-500 dark:text-muted">Permite entrar al panel sin credenciales</p>
          </div>
          <button
            onClick={async () => {
              const next = !bypassLogin;
              setBypassLogin(next);
              await patch({ adminBypassLogin: next });
            }}
            className={cn(
              "relative w-12 h-6 rounded-full transition-colors",
              bypassLogin ? "bg-cyan-500" : "bg-gray-200 dark:bg-surface"
            )}
          >
            <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform", bypassLogin && "translate-x-6")} />
          </button>
        </div>
        {bypassLogin && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 font-medium">⚠️ Cualquier persona podrá acceder al panel de administración</p>
        )}
      </div>

      {/* Enhanced Backup & Restore Section */}
      <div className="bg-linear-to-br from-teal-50 to-cyan-50 dark:from-teal-950/30 dark:to-cyan-950/30 border border-teal-100 dark:border-teal-900/30 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-linear-to-br from-teal-500 to-cyan-500 flex items-center justify-center shrink-0">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 dark:text-foreground text-base">Respaldo de Datos</h3>
            <p className="text-xs text-gray-500 dark:text-muted">Protege tu información con backups regulares</p>
          </div>
        </div>
        
        {/* Last backup reminder */}
        {(() => {
          const lastBackup = localStorage.getItem("bsm-last-backup");
          const lastBackupDate = lastBackup ? new Date(lastBackup) : null;
          const daysSince = lastBackupDate ? Math.floor((Date.now() - lastBackupDate.getTime()) / 86400000) : null;
          const needsBackup = !lastBackupDate || daysSince! > 7;
          
          if (needsBackup) {
            return (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mb-4">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                      {lastBackupDate ? `Último respaldo hace ${daysSince} días` : "No hay respaldos recientes"}
                    </p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                      Se recomienda hacer respaldos semanales para proteger tus datos.
                    </p>
                  </div>
                </div>
              </div>
            );
          }
          
          return (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 mb-4">
              <div className="flex items-center gap-2.5">
                <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <p className="text-xs text-emerald-800 dark:text-emerald-300">
                  <strong>Último respaldo:</strong> {lastBackupDate.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}
                  {daysSince === 0 ? " (hoy)" : ` (hace ${daysSince} día${(daysSince ?? 0) > 1 ? "s" : ""})`}
                </p>
              </div>
            </div>
          );
        })()}
        
        <div className="grid sm:grid-cols-2 gap-3">
          {/* Generate Backup */}
          <button
            onClick={async () => {
              try {
                const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
                const link = document.createElement("a");
                link.href = "/api/backup";
                link.download = `bodega-backup-${timestamp}.json`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                localStorage.setItem("bsm-last-backup", new Date().toISOString());
                // Show success briefly
                setTimeout(() => window.location.reload(), 1500);
              } catch (err) {
                console.error("Backup error:", err);
              }
            }}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-teal-200 dark:border-teal-800 bg-white dark:bg-card hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors text-sm font-semibold text-teal-700 dark:text-teal-400 group"
          >
            <Download className="h-4 w-4 group-hover:animate-bounce" />
            Generar respaldo
          </button>
          
          {/* Restore from Backup */}
          <button
            onClick={() => setShowRestoreModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-cyan-200 dark:border-cyan-800 bg-white dark:bg-card hover:bg-cyan-50 dark:hover:bg-cyan-900/20 transition-colors text-sm font-semibold text-cyan-700 dark:text-cyan-400 group"
          >
            <Upload className="h-4 w-4 group-hover:-translate-y-0.5 transition-transform" />
            Restaurar desde respaldo
          </button>
        </div>
        
        {/* Backup Schedule */}
        <div className="mt-4 pt-4 border-t border-teal-100 dark:border-teal-900/30">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-gray-700 dark:text-foreground">Programación automática</p>
              <p className="text-[11px] text-gray-500 dark:text-muted">Recibe recordatorios periódicos</p>
            </div>
            <select
              value={backupSchedule}
              onChange={e => {
                const val = e.target.value as typeof backupSchedule;
                setBackupSchedule(val);
                localStorage.setItem("bsm-backup-schedule", val);
              }}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-700 dark:text-foreground bg-white dark:bg-card outline-none focus:border-teal-500 cursor-pointer"
            >
              <option value="none">Ninguno</option>
              <option value="daily">Diario</option>
              <option value="weekly">Semanal</option>
            </select>
          </div>
        </div>
      </div>
      
      {/* Restore Modal */}
      {showRestoreModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => !restoring && setShowRestoreModal(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-card-border">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-linear-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                  <Upload className="h-4 w-4 text-white" />
                </div>
                <h3 className="font-extrabold text-gray-900 dark:text-foreground">Restaurar Base de Datos</h3>
              </div>
              {!restoring && (
                <button onClick={() => setShowRestoreModal(false)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent">
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
            
            <div className="px-6 py-5 space-y-4">
              {!restoreSuccess && !restoreFile && (
                <>
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-red-800 dark:text-red-300">ADVERTENCIA</p>
                        <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                          Esta acción <strong>sobrescribirá todos los datos actuales</strong> (productos, pedidos, clientes, etc.) con los del archivo de respaldo.
                          Asegúrate de tener un backup reciente antes de proceder.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-foreground mb-2">Seleccionar archivo de respaldo</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setRestoreError(null);
                        try {
                          const text = await file.text();
                          const data = JSON.parse(text);
                          // Validate structure
                          if (!data.products || !data.orders) {
                            setRestoreError("Archivo inválido: formato incorrecto");
                            return;
                          }
                          setRestoreFile(file);
                          setRestorePreview({
                            date: data.exportDate || "Desconocida",
                            products: data.products?.length || 0,
                            orders: data.orders?.length || 0,
                            customers: data.customers?.length || 0,
                            sales: data.sales?.length || 0,
                            suppliers: data.suppliers?.length || 0,
                            size: (file.size / 1024).toFixed(2) + " KB",
                          });
                        } catch {
                          setRestoreError("Error al leer el archivo: formato JSON inválido");
                        }
                      }}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-8 rounded-xl border-2 border-dashed border-cyan-300 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400 hover:border-cyan-500 dark:hover:border-cyan-500 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 transition-colors group"
                    >
                      <Upload className="h-8 w-8 mx-auto mb-2 group-hover:-translate-y-1 transition-transform" />
                      <p className="text-sm font-semibold">Haz clic para seleccionar archivo</p>
                      <p className="text-xs text-gray-500 dark:text-muted mt-1">Solo archivos .json</p>
                    </button>
                  </div>
                  
                  {restoreError && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
                      <p className="text-xs font-semibold text-red-700 dark:text-red-400">{restoreError}</p>
                    </div>
                  )}
                </>
              )}
              
              {restoreFile && !restoreSuccess && restorePreview && (
                <>
                  <div className="bg-gray-50 dark:bg-surface rounded-xl p-4 border border-gray-200 dark:border-card-border">
                    <p className="text-xs font-bold text-gray-700 dark:text-foreground mb-3">Vista previa del respaldo</p>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-gray-500 dark:text-muted block">Fecha export:</span>
                        <span className="font-semibold text-gray-900 dark:text-foreground">{restorePreview.date}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-muted block">Tamaño:</span>
                        <span className="font-semibold text-gray-900 dark:text-foreground">{restorePreview.size}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-muted block">Productos:</span>
                        <span className="font-semibold text-gray-900 dark:text-foreground">{restorePreview.products}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-muted block">Pedidos:</span>
                        <span className="font-semibold text-gray-900 dark:text-foreground">{restorePreview.orders}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-muted block">Clientes:</span>
                        <span className="font-semibold text-gray-900 dark:text-foreground">{restorePreview.customers}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-muted block">Ventas POS:</span>
                        <span className="font-semibold text-gray-900 dark:text-foreground">{restorePreview.sales}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
                    <div className="flex items-start gap-2.5">
                      <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800 dark:text-amber-300">
                        <strong>Importante:</strong> Se recomienda descargar un respaldo de los datos actuales antes de restaurar.
                      </p>
                    </div>
                  </div>
                  
                  {restoreError && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
                      <p className="text-xs font-semibold text-red-700 dark:text-red-400">{restoreError}</p>
                    </div>
                  )}
                </>
              )}
              
              {restoreSuccess && (
                <div className="text-center py-6">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-lg font-bold text-gray-900 dark:text-foreground">¡Restauración exitosa!</p>
                  <p className="text-sm text-gray-500 dark:text-muted mt-1">Los datos han sido restaurados correctamente.</p>
                  <p className="text-xs text-gray-400 dark:text-muted mt-2">Recargando página...</p>
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-card-border">
              {!restoreSuccess && (
                <>
                  <button
                    onClick={() => {
                      setShowRestoreModal(false);
                      setRestoreFile(null);
                      setRestorePreview(null);
                      setRestoreError(null);
                    }}
                    disabled={restoring}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  
                  {restoreFile && (
                    <button
                      onClick={async () => {
                        if (!restoreFile) return;
                        setRestoring(true);
                        setRestoreError(null);
                        try {
                          const text = await restoreFile.text();
                          const res = await fetch("/api/restore", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: text,
                          });
                          if (!res.ok) {
                            const err = await res.text();
                            throw new Error(err || "Error al restaurar");
                          }
                          setRestoreSuccess(true);
                          setTimeout(() => {
                            window.location.reload();
                          }, 2000);
                        } catch (err: unknown) {
                          setRestoreError(err instanceof Error ? err.message : "Error al restaurar los datos");
                          setRestoring(false);
                        }
                      }}
                      disabled={restoring}
                      className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-linear-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                    >
                      {restoring ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Restaurando...
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-4 w-4" />
                          Confirmar restauración
                        </>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Modo de tienda ───────────────────────────────────────────── */}
      {openModal === "mode" && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOpenModal(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-card-border">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">Modo de tienda</h3>
              <button onClick={() => setOpenModal(null)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-gray-500 dark:text-muted">Elige cómo tus clientes realizan pedidos</p>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setMode("whatsapp")}
                  className={cn("flex flex-col items-center gap-2 py-5 px-3 rounded-xl border-2 transition-all",
                    mode === "whatsapp" ? "border-emerald-400 bg-emerald-50" : "border-gray-200 dark:border-card-border hover:border-gray-300")}>
                  <MessageCircle className={cn("h-8 w-8", mode === "whatsapp" ? "text-emerald-600" : "text-gray-300 dark:text-muted")} />
                  <span className={cn("font-bold text-sm", mode === "whatsapp" ? "text-emerald-700" : "text-gray-400 dark:text-muted")}>WhatsApp</span>
                  <span className="text-xs text-gray-400 dark:text-muted text-center leading-tight">Pedidos via mensaje</span>
                </button>
                <button type="button" onClick={() => setMode("checkout")}
                  className={cn("flex flex-col items-center gap-2 py-5 px-3 rounded-xl border-2 transition-all",
                    mode === "checkout" ? "border-primary bg-primary/5" : "border-gray-200 dark:border-card-border hover:border-gray-300")}>
                  <ShoppingCart className={cn("h-8 w-8", mode === "checkout" ? "text-primary" : "text-gray-300 dark:text-muted")} />
                  <span className={cn("font-bold text-sm", mode === "checkout" ? "text-primary" : "text-gray-400 dark:text-muted")}>Checkout</span>
                  <span className="text-xs text-gray-400 dark:text-muted text-center leading-tight">Formulario integrado</span>
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-card-border">
              <button onClick={() => setOpenModal(null)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-colors">Cancelar</button>
              <SettingsSaveBtn section="mode" data={{ mode }} extra={() => onModeChange(mode)} saving={saving} savedSection={savedSection} onSave={saveSection} />
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Información del negocio ─────────────────────────────────── */}
      {openModal === "business" && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOpenModal(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-card-border shrink-0">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">Información del negocio</h3>
              <button onClick={() => setOpenModal(null)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"><X className="h-5 w-5" /></button>
            </div>
            <div className="overflow-y-auto px-6 py-5 flex-1 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-muted mb-1.5"><Store className="h-4 w-4" /> Nombre del negocio</label>
                  <input value={businessName} onChange={e => setBusinessName(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-muted mb-1.5"><Phone className="h-4 w-4" /> WhatsApp (con código país)</label>
                  <input value={businessPhone} onChange={e => setBusinessPhone(e.target.value)} placeholder="51916409675" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm font-mono" />
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-muted mb-1.5">
                    <MapPin className="h-4 w-4" /> Dirección / Ciudad
                    <button type="button" onClick={() => setShowMapPicker(true)} className="ml-auto inline-flex items-center gap-1 text-xs text-blue-600 font-semibold hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-lg transition-colors" title="Seleccionar en mapa">
                      <MapPin className="h-3 w-3" /> Abrir mapa
                    </button>
                  </label>
                  <input value={businessAddress} onChange={e => setBusinessAddress(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                  <button type="button"
                    onClick={() => {
                      if (!navigator.geolocation) return;
                      navigator.geolocation.getCurrentPosition(pos => {
                        const lat = pos.coords.latitude;
                        const lon = pos.coords.longitude;
                        setBusinessLat(lat);
                        setBusinessLon(lon);
                        setPickerLat(lat);
                        setPickerLon(lon);
                        setBusinessAddress(`GPS: ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
                      });
                    }}
                    className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors py-1"
                  >
                    <MapPin className="h-3 w-3" /> Usar ubicación actual
                  </button>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-muted mb-1.5"><Truck className="h-4 w-4" /> Zona de delivery</label>
                  <input value={deliveryZone} onChange={e => setDeliveryZone(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-muted mb-1.5"><Clock className="h-4 w-4" /> Horario de atención</label>
                  <input value={hours} onChange={e => setHours(e.target.value)} placeholder="Lun - Sáb: 7am - 9pm" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-muted mb-1.5"><AlignLeft className="h-4 w-4" /> Descripción del negocio</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm resize-none" />
              </div>
              {/* Logo */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-muted mb-2"><ImageIcon className="h-4 w-4" /> Logo del negocio</label>
                <div className="flex flex-col gap-2">
                  <button type="button" onClick={() => logoImgRef.current?.click()}
                    className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-dashed border-gray-300 hover:border-primary text-sm font-semibold text-gray-500 dark:text-muted hover:text-primary bg-gray-50 dark:bg-surface hover:bg-primary/5 transition-colors">
                    <Upload className="h-4 w-4" /> Subir imagen desde dispositivo
                  </button>
                  <input ref={logoImgRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload(setLogoUrl)} />
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-400 dark:text-muted">o URL</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                  <input value={logoUrl.startsWith("data:") ? "" : logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://… o /logo.png" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                {logoUrl && (
                  <div className="flex items-center gap-3 mt-3 p-3 bg-gray-50 dark:bg-surface rounded-xl border border-gray-100 dark:border-card-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoUrl} alt="Logo preview" className="h-14 w-14 object-contain rounded-xl bg-white dark:bg-card border border-gray-100 dark:border-card-border" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    <span className="text-xs text-gray-500 dark:text-muted flex-1">Vista previa del logo</span>
                    <button type="button" onClick={() => setLogoUrl("")} className="text-xs text-red-400 hover:text-red-600 transition-colors">Quitar</button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-card-border shrink-0">
              <button onClick={() => setOpenModal(null)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-colors">Cancelar</button>
              <SettingsSaveBtn section="business" data={{ businessName, businessPhone, businessAddress, businessLat, businessLon, logoUrl, description, hours, deliveryZone }} saving={saving} savedSection={savedSection} onSave={saveSection} />
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Métodos de pago ──────────────────────────────────────────── */}
      {openModal === "payment" && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOpenModal(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-card-border shrink-0">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">Métodos de pago</h3>
              <button onClick={() => setOpenModal(null)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"><X className="h-5 w-5" /></button>
            </div>
            <div className="overflow-y-auto px-6 py-5 flex-1 space-y-4">
              {/* Cash */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-surface rounded-xl border border-gray-100 dark:border-card-border">
                <div className="flex items-center gap-3">
                  <HandCoins className="h-6 w-6 text-emerald-600" />
                  <div>
                    <p className="font-bold text-sm text-gray-900 dark:text-foreground">Efectivo</p>
                    <p className="text-xs text-gray-500 dark:text-muted">Pago contra entrega</p>
                  </div>
                </div>
                <button type="button" onClick={() => setCashEnabled(!cashEnabled)}
                  className={cn("relative w-11 h-6 rounded-full transition-colors", cashEnabled ? "bg-primary" : "bg-gray-300")}>
                  <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white dark:bg-card shadow transition-transform", cashEnabled && "translate-x-5")} />
                </button>
              </div>
              {/* Yape */}
              <div className="p-4 bg-purple-50 rounded-xl border border-purple-100 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-purple-600 flex items-center justify-center text-white font-bold text-sm">Y</div>
                    <div>
                      <p className="font-bold text-sm text-gray-900 dark:text-foreground">Yape</p>
                      <p className="text-xs text-gray-500 dark:text-muted">QR de cobro antes de entrega</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setYapeEnabled(!yapeEnabled)}
                    className={cn("relative w-11 h-6 rounded-full transition-colors", yapeEnabled ? "bg-purple-600" : "bg-gray-300")}>
                    <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white dark:bg-card shadow transition-transform", yapeEnabled && "translate-x-5")} />
                  </button>
                </div>
                {yapeEnabled && (
                  <div className="space-y-3">
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-muted mb-1.5"><User className="h-4 w-4" /> Nombre del titular</label>
                      <input value={yapeName} onChange={e => setYapeName(e.target.value)} placeholder="Juan Pérez" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card text-gray-900 dark:text-foreground focus:border-purple-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-muted mb-1.5"><Phone className="h-4 w-4" /> Número de Yape</label>
                      <input value={yapePhone} onChange={e => setYapePhone(e.target.value)} placeholder="987654321" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card text-gray-900 dark:text-foreground focus:border-purple-500 outline-none text-sm font-mono" />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-muted mb-2"><ImageIcon className="h-4 w-4" /> Imagen / QR de Yape</label>
                      <div className="flex flex-col gap-2">
                        <button type="button" onClick={() => yapeImgRef.current?.click()}
                          className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-dashed border-purple-300 hover:border-purple-500 text-sm font-semibold text-purple-600 hover:text-purple-700 bg-white dark:bg-card hover:bg-purple-50 transition-colors">
                          <Upload className="h-4 w-4" /> Subir desde dispositivo o celular
                        </button>
                        <input ref={yapeImgRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload(setYapeImage)} />
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-px bg-gray-200" />
                          <span className="text-xs text-gray-400 dark:text-muted">o URL</span>
                          <div className="flex-1 h-px bg-gray-200" />
                        </div>
                        <input value={yapeImage.startsWith("data:") ? "" : yapeImage} onChange={e => setYapeImage(e.target.value)} placeholder="https://…" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card text-gray-900 dark:text-foreground focus:border-purple-500 outline-none text-sm" />
                      </div>
                      {yapeImage && (
                        <div className="flex items-center gap-3 mt-3 p-3 bg-white dark:bg-card rounded-xl border border-purple-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={yapeImage} alt="Yape QR" className="h-24 w-24 object-contain rounded-xl border border-gray-100 dark:border-card-border" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                          <div className="text-xs text-gray-500 dark:text-muted">
                            <p className="font-semibold text-gray-700 dark:text-foreground">{yapeName || "Titular"}</p>
                            <p className="font-mono mt-0.5">{yapePhone || "Número"}</p>
                            <button type="button" onClick={() => setYapeImage("")} className="mt-2 text-red-400 hover:text-red-600 transition-colors">Quitar imagen</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-card-border shrink-0">
              <button onClick={() => setOpenModal(null)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-colors">Cancelar</button>
              <SettingsSaveBtn section="payment" data={{ yapeEnabled, yapeImage, yapeName, yapePhone, cashEnabled }} saving={saving} savedSection={savedSection} onSave={saveSection} />
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Navegación del sitio ────────────────────────────────────── */}
      {openModal === "nav" && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOpenModal(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-card-border">
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-foreground">Navegación del sitio</h3>
                <p className="text-xs text-gray-500 dark:text-muted mt-0.5">Reordena y oculta los enlaces del menú</p>
              </div>
              <button onClick={() => setOpenModal(null)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-6 py-4 space-y-2">
              {navLinks.map((link, idx) => (
                <div key={link.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-surface rounded-xl border border-gray-100 dark:border-card-border">
                  <div className="flex flex-col gap-0.5">
                    <button type="button" disabled={idx === 0} onClick={() => moveNavLink(idx, -1)}
                      className="p-0.5 rounded text-gray-400 dark:text-muted hover:text-gray-800 dark:hover:text-foreground disabled:opacity-25 transition-colors">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button type="button" disabled={idx === navLinks.length - 1} onClick={() => moveNavLink(idx, 1)}
                      className="p-0.5 rounded text-gray-400 dark:text-muted hover:text-gray-800 dark:hover:text-foreground disabled:opacity-25 transition-colors">
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </div>
                  <span className="flex-1 font-semibold text-sm text-gray-800 dark:text-foreground">{NAV_LABEL[link.id] || link.id}</span>
                  <span className="text-xs text-gray-400 dark:text-muted font-mono">#{idx + 1}</span>
                  <button type="button" onClick={() => toggleNavVis(idx)}
                    className={cn("p-1.5 rounded-lg transition-colors", link.visible ? "text-primary bg-primary/10 hover:bg-primary/20" : "text-gray-300 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent")}>
                    {link.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>
              ))}
              <p className="text-xs text-gray-400 dark:text-muted pt-1">ðŸ’¡ Los cambios se reflejarán en el menú de clientes al guardar.</p>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-card-border">
              <button onClick={() => setOpenModal(null)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-colors">Cancelar</button>
              <SettingsSaveBtn section="nav" data={{ navLinks }} saving={saving} savedSection={savedSection} onSave={saveSection} />
            </div>
          </div>
        </div>
      )}

      {/* ── Password change modal ─────────────────────────────── */}
      {openModal === "password" && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOpenModal(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-card-border">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">Cambiar contraseña</h3>
              <button onClick={() => setOpenModal(null)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"><X className="h-5 w-5" /></button>
            </div>
            <form className="px-6 py-5 space-y-4" onSubmit={async (e) => {
              e.preventDefault();
              setPwChangeError("");
              if (currentPwInput !== storedAdminPw) { setPwChangeError("La contraseña actual es incorrecta"); return; }
              if (newPw.length < 4) { setPwChangeError("La nueva contraseña debe tener al menos 4 caracteres"); return; }
              if (newPw !== confirmPw) { setPwChangeError("Las contraseñas no coinciden"); return; }
              await saveSection("password", { adminPassword: newPw });
              setStoredAdminPw(newPw);
              setCurrentPwInput(""); setNewPw(""); setConfirmPw(""); setPwChangeError("");
              // Re-issue cookie session with new password so the user stays logged in
              await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: newPw }) });
            }}>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-foreground mb-1">Contraseña actual</label>
                <input type="password" value={currentPwInput} onChange={e => setCurrentPwInput(e.target.value)} required autoFocus
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted outline-none focus:border-primary transition-colors" placeholder="••••••" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-foreground mb-1">Nueva contraseña</label>
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted outline-none focus:border-primary transition-colors" placeholder="Mínimo 4 caracteres" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-foreground mb-1">Confirmar nueva contraseña</label>
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted outline-none focus:border-primary transition-colors" placeholder="Repite la contraseña" />
              </div>
              {pwChangeError && <p className="text-sm text-red-500 font-semibold">{pwChangeError}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setOpenModal(null)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-colors">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors shadow-md shadow-primary/20 disabled:opacity-50 flex items-center gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                  {savedSection === "password" ? "¡Guardado!" : "Cambiar contraseña"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Mapa picker: ubicación del negocio ─────────────────────────────── */}
      {showMapPicker && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowMapPicker(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-card-border shrink-0">
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-foreground">Ubicación del negocio</h3>
                <p className="text-xs text-gray-500 dark:text-muted mt-0.5">Haz clic en el mapa o arrastra el marcador para seleccionar la ubicación exacta</p>
              </div>
              <button onClick={() => setShowMapPicker(false)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <button type="button"
                onClick={() => {
                  if (!navigator.geolocation) return;
                  navigator.geolocation.getCurrentPosition(pos => {
                    setPickerLat(pos.coords.latitude);
                    setPickerLon(pos.coords.longitude);
                    setBusinessLat(pos.coords.latitude);
                    setBusinessLon(pos.coords.longitude);
                    setBusinessAddress(`GPS: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
                  });
                }}
                className="self-start inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors"
              >
                <MapPin className="h-4 w-4" /> Usar ubicación actual
              </button>
              <LeafletMap
                lat={pickerLat}
                lon={pickerLon}
                zoom={15}
                height={340}
                onPick={(lat, lon, address) => {
                  setPickerLat(lat);
                  setPickerLon(lon);
                  setBusinessLat(lat);
                  setBusinessLon(lon);
                  setBusinessAddress(address);
                }}
              />
              {businessLat !== null && businessLon !== null && (
                <p className="text-xs text-gray-500 dark:text-muted font-mono">GPS: {businessLat.toFixed(5)}, {businessLon.toFixed(5)}</p>
              )}
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-100 dark:border-card-border shrink-0">
              <button onClick={() => setShowMapPicker(false)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-colors">Cancelar</button>
              <button onClick={() => setShowMapPicker(false)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-colors">Confirmar ubicación</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "panel-principal";
    try {
      const saved = localStorage.getItem("admin_active_tab");
      if (saved) {
        // Migrate old tab IDs to new unified IDs
        const migrated = TAB_MIGRATION[saved];
        if (migrated) return migrated;
        // Check if already a valid new tab
        const VALID_TABS: Tab[] = ["panel-principal","pos-caja","inventario-almacenes","reposicion","catalogo-tienda","precios-promos","compras","proveedores","logistica","devoluciones-calidad","ventas-marketing","crm-clientes","fidelizacion","encuestas-soporte","analytics-bi","proyecciones","finanzas","tesoreria","facturacion","gastos-activos","rrhh","proyectos-tareas","comunicaciones","alertas-automatizacion","reportes-documentos","agenda-utilidades","seguridad","sistema","clientes","resenas","pedidos","configuracion","agentes"];
        if (VALID_TABS.includes(saved as Tab)) return saved as Tab;
      }
    } catch {}
    return "panel-principal";
  });
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
  const [focusMode, setFocusMode] = useState(false);
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
  const [clearingData, setClearingData] = useState(false);
  const [seedingData, setSeedingData] = useState(false);
  const [clearCategories, setClearCategories] = useState<Set<string>>(() => new Set([
    "products", "customers", "orders", "sales", "suppliers", "promotions",
    "cash", "reviews", "expenses", "returns", "activity", "cms", "notifications",
  ]));
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
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
    "1": "panel-principal", "2": "pos-caja", "3": "inventario-almacenes", "4": "pedidos",
    "5": "proveedores", "6": "compras", "7": "finanzas", "8": "clientes",
    "9": "crm-clientes", "0": "configuracion",
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
    try { localStorage.setItem("admin_active_tab", id); } catch {}
    setRecentTabs(prev => {
      const next = [id, ...prev.filter(t => t !== id)].slice(0, 5);
      localStorage.setItem("admin_recent_tabs", JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleCompact = useCallback(() => {
    setCompactMode(prev => { const next = !prev; localStorage.setItem("admin_compact", next ? "1" : "0"); return next; });
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
        if (d.lowStockProducts > 0) a["inventario-almacenes"] = d.lowStockProducts;
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

  const ALL_TABS = [
    // — Operaciones & POS —
    { id: "panel-principal" as Tab,         label: "Panel Principal",            icon: BarChart3 },
    { id: "pos-caja" as Tab,               label: "POS & Caja",                icon: Monitor },
    { id: "inventario-almacenes" as Tab,   label: "Inventario & Reposición",    icon: Boxes },
    { id: "pedidos" as Tab,                label: "Pedidos",                   icon: ShoppingCart },
    // — Producto & Precios —
    { id: "catalogo-tienda" as Tab,        label: "Catálogo & Tienda",         icon: Store },
    { id: "precios-promos" as Tab,         label: "Precios & Promos",          icon: DollarSign },
    // — Compras & Proveedores —
    { id: "compras" as Tab,                label: "Compras & Proveedores",     icon: Truck },
    // — Logística & Calidad —
    { id: "logistica" as Tab,              label: "Logística",                 icon: MapPin },
    { id: "devoluciones-calidad" as Tab,   label: "Devoluciones & Calidad",    icon: RotateCcw },
    // — Clientes & Marketing —
    { id: "crm-clientes" as Tab,           label: "Clientes & Leads",          icon: Users },
    { id: "ventas-marketing" as Tab,       label: "Ventas & Marketing",        icon: Megaphone },
    { id: "fidelizacion" as Tab,           label: "Fidelización",              icon: Heart },
    { id: "encuestas-soporte" as Tab,      label: "Customer Success (CX)",     icon: MessageSquare },
    // — Inteligencia & Analytics —
    { id: "analytics-bi" as Tab,           label: "Analytics & BI",            icon: Brain },
    { id: "proyecciones" as Tab,           label: "Proyecciones",              icon: SlidersHorizontal },
    // — Finanzas —
    { id: "finanzas" as Tab,               label: "Finanzas & Contabilidad",   icon: Wallet },
    // — Organización —
    { id: "rrhh" as Tab,                   label: "Recursos Humanos",          icon: Users },
    { id: "proyectos-tareas" as Tab,       label: "Proyectos & Tareas",        icon: Target },
    { id: "comunicaciones" as Tab,         label: "Comunicaciones",            icon: MessageSquare },
    { id: "alertas-automatizacion" as Tab, label: "Alertas & Automatización",  icon: Bell },
    // — Administración & Sistema —
    { id: "reportes-documentos" as Tab,    label: "Reportes & Documentos",     icon: FileBarChart },
    { id: "agenda-utilidades" as Tab,      label: "Agenda & Utilidades",       icon: CalendarDays },
    { id: "seguridad" as Tab,              label: "Sistema & Accesos",         icon: Settings },
    { id: "plan" as Tab,                    label: "Plan & Límites",            icon: Zap },
    { id: "changelog" as Tab,               label: "Changelog",                 icon: Target },
  ] as const;

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
  
  // Category filtering
  if (selectedCategory) {
    const categoryTabs = TAB_CATEGORIES.find(c => c.id === selectedCategory)?.tabs ?? [];
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
            <span className="font-extrabold text-gray-900 dark:text-foreground text-sm">Bodega San Martín</span>
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
                  {TAB_CATEGORIES.find(c => c.id === selectedCategory)?.icon && (
                    React.createElement(TAB_CATEGORIES.find(c => c.id === selectedCategory)!.icon, { className: "h-4 w-4 shrink-0" })
                  )}
                  <span className="truncate">{TAB_CATEGORIES.find(c => c.id === selectedCategory)?.label}</span>
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
                {TAB_CATEGORIES.map(category => {
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
          {userRole === "admin" && (
            <button
              onClick={() => { setShowClearConfirm(true); setMobileNavOpen(false); }}
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
            <LogOut className="h-5 w-5" /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Desktop permanent sidebar */}
      <aside className={cn(
        "hidden sm:flex fixed top-0 left-0 bottom-0 w-64 z-40 bg-white dark:bg-card border-r border-gray-200 dark:border-card-border flex-col transition-transform duration-300",
        focusMode && "-translate-x-full"
      )}>
        <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-200 dark:border-card-border bg-primary/5">
          <div className="h-9 w-9 rounded-xl bg-primary text-white flex items-center justify-center shadow-sm shrink-0">
            <ShoppingBasket className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-extrabold text-gray-900 dark:text-foreground text-sm leading-tight">Bodega San Martín</p>
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
              onClick={() => setShowClearConfirm(true)}
              disabled={clearingData}
              title="Borrar todos los datos"
              className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              {clearingData ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          )}
        </div>
        
        {/* Category selector */}
        <div className="relative px-3 py-3 border-b border-gray-200 dark:border-card-border">
          <button
            onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-700 dark:text-foreground bg-gray-50 dark:bg-surface hover:bg-gray-100 dark:hover:bg-accent transition-all border border-gray-200 dark:border-card-border"
          >
            <div className="flex items-center gap-2">
              {selectedCategory ? (
                <>
                  {TAB_CATEGORIES.find(c => c.id === selectedCategory)?.icon && (
                    React.createElement(TAB_CATEGORIES.find(c => c.id === selectedCategory)!.icon, { className: "h-4 w-4 shrink-0" })
                  )}
                  <span className="truncate">{TAB_CATEGORIES.find(c => c.id === selectedCategory)?.label}</span>
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
              <div className="fixed inset-0 z-10" onClick={() => { setCategoryDropdownOpen(false); setHoveredCategory(null); }} />
              <div className="absolute top-full left-3 mt-1 bg-white dark:bg-card shadow-xl rounded-xl border border-gray-200 dark:border-card-border z-20 py-2 w-60"
                onMouseLeave={() => setHoveredCategory(null)}>
                <button
                  onClick={() => { setSelectedCategory(null); setCategoryDropdownOpen(false); setHoveredCategory(null); }}
                  onMouseEnter={() => setHoveredCategory(null)}
                  className={cn(
                    "w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors",
                    !selectedCategory ? "bg-primary/10 text-primary" : "text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-surface"
                  )}
                >
                  <Layers className="h-4 w-4 shrink-0" />
                  <span>Todas ({allowedTabs.length - hiddenTabs.size})</span>
                </button>
                {hiddenTabs.size > 0 && (
                  <button
                    onClick={() => { setHiddenTabs(new Set()); try { localStorage.removeItem("admin_hidden_tabs"); } catch {} setCategoryDropdownOpen(false); }}
                    onMouseEnter={() => setHoveredCategory(null)}
                    className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                  >
                    <CheckCircle className="h-4 w-4 shrink-0" />
                    <span>Restablecer {hiddenTabs.size} oculto{hiddenTabs.size !== 1 ? "s" : ""}</span>
                  </button>
                )}
                <div className="h-px bg-gray-100 dark:bg-card-border my-1" />
                {TAB_CATEGORIES.map(category => {
                  const catTabs = category.tabs.filter(t => allowedTabs.includes(t));
                  if (catTabs.length === 0) return null;
                  const CategoryIcon = category.icon;
                  const isHovered = hoveredCategory === category.id;
                  return (
                    <div key={category.id} className="relative"
                      onMouseEnter={() => setHoveredCategory(category.id)}>
                      <button
                        onClick={() => { setSelectedCategory(category.id); setCategoryDropdownOpen(false); setHoveredCategory(null); }}
                        className={cn(
                          "w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors",
                          isHovered ? "bg-primary/5 dark:bg-primary/10" : "",
                          selectedCategory === category.id ? "bg-primary/10 text-primary" : "text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-surface"
                        )}
                      >
                        <CategoryIcon className="h-4 w-4 shrink-0" />
                        <span className="truncate flex-1 text-left">{category.label}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                      </button>
                      {/* Flyout sub-menu */}
                      {isHovered && (
                        <div className="absolute left-full top-0 ml-1 w-56 bg-white dark:bg-card shadow-xl rounded-xl border border-gray-200 dark:border-card-border py-2 z-30">
                          <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-muted">{category.label}</p>
                          {catTabs.map(tabId => {
                            const tabInfo = ALL_TABS.find(t => t.id === tabId);
                            if (!tabInfo) return null;
                            const TabIcon = tabInfo.icon;
                            const isHidden = hiddenTabs.has(tabId as Tab);
                            return (
                              <div
                                key={tabId}
                                className={cn(
                                  "group flex items-center gap-2 px-3 py-2 text-sm transition-colors",
                                  tab === tabId ? "bg-primary/10 text-primary font-semibold" : "text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface font-medium",
                                  isHidden && "opacity-40"
                                )}
                              >
                                <button
                                  onClick={() => { if (!isHidden) { navigateTab(tabId as Tab); setCategoryDropdownOpen(false); setHoveredCategory(null); } }}
                                  className="flex items-center gap-2 flex-1 min-w-0"
                                >
                                  <TabIcon className="h-4 w-4 shrink-0" />
                                  <span className="truncate">{tabInfo.label}</span>
                                  {DEMO_DATA_MODULES[tabId as Tab] && !clearedDemoTabs.has(tabId as Tab) && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" title="Datos de ejemplo" />
                                  )}
                                </button>
                                <button
                                  onClick={e => { e.stopPropagation(); toggleHideTab(tabId as Tab); }}
                                  title={isHidden ? "Mostrar módulo" : "Ocultar módulo"}
                                  className={cn(
                                    "shrink-0 opacity-0 group-hover:opacity-100 transition-opacity rounded p-0.5",
                                    isHidden ? "text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 opacity-100" : "text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                                  )}
                                >
                                  {isHidden ? <CheckCircle className="h-4 w-4" /> : <X className="h-4 w-4" />}
                                </button>
                              </div>
                            );
                          })}
                          <div className="h-px bg-gray-100 dark:bg-card-border mx-2 my-1.5" />
                          <button
                            onClick={() => { setSelectedCategory(category.id); setCategoryDropdownOpen(false); setHoveredCategory(null); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/5 transition-colors"
                          >
                            <Layers className="h-4 w-4 shrink-0" />
                            <span>Ver toda la categoría</span>
                          </button>
                        </div>
                      )}
                    </div>
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

          {/* All tabs */}
          {filteredTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => navigateTab(id)}
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
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-gray-500 dark:text-muted hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-500 transition-all"
          >
            <LogOut className="h-5 w-5" /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Content area */}
      <div className={cn("flex flex-col min-h-screen transition-[margin] duration-300", focusMode ? "sm:ml-0" : "sm:ml-64")}>
      {/* Top bar */}
      <header className="bg-white dark:bg-card border-b border-gray-200 dark:border-card-border px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 sticky top-0 z-40">
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
            <p className="text-xs text-gray-400 dark:text-muted hidden sm:block">Bodega San Martín</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSearchOpen(true)}
            title="Búsqueda global (Ctrl+K)"
            className="hidden sm:flex items-center gap-1.5 px-3 h-8 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent hover:text-primary transition-colors text-xs font-semibold border border-gray-200 dark:border-card-border"
          >
            <Search className="h-4 w-4" />
            <span>Buscar</span>
            <kbd className="ml-1 text-xs bg-gray-100 dark:bg-surface px-1 rounded opacity-70">Ctrl+K</kbd>
          </button>
          <button
            onClick={() => setShowShortcuts(v => !v)}
            title="Atajos de teclado (Alt+?)"
            className="hidden sm:flex items-center justify-center h-8 w-8 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent hover:text-primary transition-colors text-xs font-bold"
          >
            ⌨
          </button>
          <button
            onClick={() => permission !== "granted" && requestPermission()}
            title={permission === "granted" ? "Notificaciones activadas" : permission === "denied" ? "Notificaciones bloqueadas" : "Activar notificaciones"}
            className={cn(
              "hidden sm:flex items-center justify-center h-8 w-8 rounded-lg transition-colors",
              permission === "granted" 
                ? "text-green-500 hover:bg-green-50 dark:hover:bg-green-950/30" 
                : permission === "denied" 
                ? "text-gray-300 dark:text-muted cursor-not-allowed" 
                : "text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent hover:text-primary"
            )}
            disabled={permission === "denied"}
          >
            <Bell className={cn("h-4 w-4", permission === "granted" && "animate-pulse")} />
          </button>
          {/* Mobile search icon – only visible on small screens */}
          <button
            onClick={() => setSearchOpen(true)}
            title="Buscar"
            className="sm:hidden flex items-center justify-center h-8 w-8 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent hover:text-primary transition-colors"
          >
            <Search className="h-4 w-4" />
          </button>
          <AlertCenter
            pendingOrders={quickStats?.pendingOrders ?? 0}
            lowStock={quickStats?.lowStockProducts ?? 0}
            todayRevenue={quickStats?.todayRevenue ?? 0}
            overduePayables={quickStats?.overduePayables ?? 0}
            oldPendingOrders={quickStats?.oldPendingOrders ?? 0}
            onNavigate={(t) => navigateTab(t as Tab)}
          />
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            className="hidden sm:flex items-center justify-center h-8 w-8 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent hover:text-primary transition-colors"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            onClick={toggleCompact}
            title={compactMode ? "Modo normal" : "Modo compacto"}
            className="hidden sm:flex items-center justify-center h-8 w-8 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent hover:text-primary transition-colors"
          >
            <SlidersHorizontal className={cn("h-4 w-4", compactMode && "text-primary")} />
          </button>
          <button
            onClick={() => setFocusMode(f => !f)}
            title={focusMode ? "Salir modo enfoque" : "Modo enfoque"}
            className="hidden sm:flex items-center justify-center h-8 w-8 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent hover:text-primary transition-colors"
          >
            <Maximize2 className={cn("h-4 w-4", focusMode && "text-primary")} />
          </button>
          <Link href="/" className="text-xs sm:text-sm font-semibold text-gray-400 dark:text-muted hover:text-primary transition-colors hidden sm:block">Ver tienda</Link>
          {userRole === "admin" && (
            <>
              <button
                onClick={() => {
                  if (seedingData) return;
                  setSeedingData(true);
                  fetch("/api/admin/seed-data", { method: "POST" })
                    .then(r => r.json())
                    .then(d => { if (d.success) window.location.reload(); else alert(d.error || "Error al generar datos"); })
                    .catch(() => alert("Error de conexión"))
                    .finally(() => setSeedingData(false));
                }}
                disabled={seedingData}
                title="Generar datos de simulación"
                className="hidden sm:flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold text-gray-400 dark:text-muted hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:text-blue-600 transition-colors border border-gray-200 dark:border-card-border"
              >
                {seedingData ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                <span>Simulación</span>
              </button>
              <button
                onClick={() => setShowClearConfirm(true)}
                disabled={clearingData}
                title="Borrar todos los datos"
                className="hidden sm:flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold text-gray-400 dark:text-muted hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-500 transition-colors border border-gray-200 dark:border-card-border"
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

      {/* Clear data confirmation modal */}
      {showClearConfirm && (() => {
        const ALL_CLEAR_CATS = [
          { key: "products", label: "Productos", icon: Package, desc: "Productos, combos, historial precios, inventario" },
          { key: "customers", label: "Clientes", icon: Users, desc: "Clientes, ubicaciones, carritos, listas de compra" },
          { key: "orders", label: "Pedidos", icon: ShoppingCart, desc: "Pedidos online y slots de entrega" },
          { key: "sales", label: "Ventas POS", icon: Monitor, desc: "Ventas del punto de venta" },
          { key: "suppliers", label: "Proveedores", icon: Truck, desc: "Proveedores, compras, cuentas por pagar" },
          { key: "promotions", label: "Promociones & Cupones", icon: Megaphone, desc: "Promociones y cupones de descuento" },
          { key: "cash", label: "Caja", icon: Calculator, desc: "Registros de caja y movimientos" },
          { key: "reviews", label: "Reseñas", icon: Star, desc: "Opiniones de clientes" },
          { key: "expenses", label: "Gastos", icon: Wallet, desc: "Gastos operativos" },
          { key: "returns", label: "Devoluciones", icon: RotateCcw, desc: "Devoluciones y reembolsos" },
          { key: "activity", label: "Actividad & Chat", icon: Activity, desc: "Logs, mensajes internos, chat" },
          { key: "cms", label: "CMS & Tests", icon: FileBarChart, desc: "Páginas, A/B tests, encuestas, media" },
          { key: "notifications", label: "Notificaciones", icon: Bell, desc: "Suscripciones push, notificaciones" },
        ];
        const allSelected = clearCategories.size === ALL_CLEAR_CATS.length;
        const toggleCat = (key: string) => {
          setClearCategories(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
          });
        };
        const toggleAll = () => {
          if (allSelected) setClearCategories(new Set());
          else setClearCategories(new Set(ALL_CLEAR_CATS.map(c => c.key)));
        };
        return (
          <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowClearConfirm(false)}>
            <div className="bg-white dark:bg-card rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6 space-y-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-foreground">Borrar datos</h3>
                  <p className="text-sm text-gray-500 dark:text-muted">Selecciona qué datos eliminar</p>
                </div>
              </div>

              <div className="flex items-center justify-between px-1">
                <button onClick={toggleAll} className="text-xs font-semibold text-primary hover:underline">
                  {allSelected ? "Deseleccionar todo" : "Seleccionar todo"}
                </button>
                <span className="text-xs text-gray-400 dark:text-muted">{clearCategories.size} de {ALL_CLEAR_CATS.length} seleccionados</span>
              </div>

              <div className="overflow-y-auto flex-1 space-y-1 -mx-1 px-1">
                {ALL_CLEAR_CATS.map(cat => {
                  const CatIcon = cat.icon;
                  const checked = clearCategories.has(cat.key);
                  return (
                    <label key={cat.key} className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all border",
                      checked ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40" : "bg-gray-50 dark:bg-surface border-transparent hover:bg-gray-100 dark:hover:bg-accent"
                    )}>
                      <input type="checkbox" checked={checked} onChange={() => toggleCat(cat.key)}
                        className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 accent-red-600 shrink-0" />
                      <CatIcon className={cn("h-4 w-4 shrink-0", checked ? "text-red-500" : "text-gray-400 dark:text-muted")} />
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-semibold", checked ? "text-red-700 dark:text-red-400" : "text-gray-700 dark:text-foreground")}>{cat.label}</p>
                        <p className="text-[11px] text-gray-400 dark:text-muted truncate">{cat.desc}</p>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="border-t border-gray-200 dark:border-card-border pt-4 space-y-3">
                <p className="text-sm font-semibold text-gray-700 dark:text-foreground">Escribe <code className="bg-red-50 dark:bg-red-950/30 text-red-600 px-1.5 py-0.5 rounded text-xs font-bold">BORRAR</code> para confirmar:</p>
                <input
                  id="clear-confirm-input"
                  type="text"
                  autoComplete="off"
                  className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-card-border rounded-xl text-sm font-mono focus:border-red-400 focus:outline-none dark:bg-surface dark:text-foreground"
                  placeholder="Escribe BORRAR aquí..."
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted bg-gray-100 dark:bg-surface hover:bg-gray-200 dark:hover:bg-accent transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    disabled={clearCategories.size === 0}
                    onClick={() => {
                      const input = document.getElementById("clear-confirm-input") as HTMLInputElement;
                      if (input?.value !== "BORRAR") { input?.focus(); return; }
                      setClearingData(true);
                      setShowClearConfirm(false);

                      // Nuclear localStorage clear: wipe everything EXCEPT UI preferences
                      const KEEP_KEYS = new Set([
                        "admin_compact", "admin_fav_tabs", "admin_hidden_tabs",
                        "admin_recent_tabs", "bsm-admin-theme-set", "theme",
                      ]);
                      try {
                        const allKeys: string[] = [];
                        for (let i = 0; i < localStorage.length; i++) {
                          const k = localStorage.key(i);
                          if (k && !KEEP_KEYS.has(k)) allKeys.push(k);
                        }
                        allKeys.forEach(k => { try { localStorage.removeItem(k); } catch {} });
                      } catch { /* ignore */ }

                      const cats = [...clearCategories];
                      fetch("/api/admin/clear-data", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ confirm: "BORRAR_TODO", categories: allSelected ? undefined : cats }),
                      })
                        .then(r => r.json())
                        .then(d => {
                          if (d.success) {
                            try { localStorage.setItem("admin_demo_cleared", JSON.stringify(Object.keys(DEMO_DATA_MODULES))); } catch {}
                            window.location.reload();
                          } else {
                            alert(d.error || "Error al borrar datos");
                          }
                        })
                        .catch((err) => alert(`Error de conexión: ${err?.message ?? "verifica tu red"}`))
                        .finally(() => setClearingData(false));
                    }}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-colors",
                      clearCategories.size > 0 ? "bg-red-600 hover:bg-red-700" : "bg-gray-300 cursor-not-allowed"
                    )}
                  >
                    {clearingData
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Eliminando todo…</>
                      : allSelected ? "🗑️ Borrar TODO" : `🗑️ Borrar ${clearCategories.size} categoría${clearCategories.size !== 1 ? "s" : ""}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={(t) => navigateTab(t as Tab)}
      />

      <AIAssistant onNavigate={(t) => navigateTab(t as Tab)} />

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
                {TAB_CATEGORIES.map(category => {
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

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1.5 px-6 py-2 text-xs text-gray-400 dark:text-muted bg-gray-50 dark:bg-surface border-b border-gray-100 dark:border-card-border">
        <span>Panel</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-gray-700 dark:text-foreground font-semibold">{currentTab.label}</span>
      </nav>

      {/* Quick stats – mobile strip (scroll horizontal) */}
      {quickStats && (
        <div className="sm:hidden flex items-center gap-1 px-2.5 py-1.5 bg-white dark:bg-card border-b border-gray-100 dark:border-card-border overflow-x-auto scrollbar-none text-[11px]">
          <button
            onClick={() => navigateTab("pedidos")}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full font-semibold shrink-0 transition-colors",
              quickStats.pendingOrders > 0 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"
            )}
          >
            <ShoppingCart className="h-3 w-3" />
            {quickStats.pendingOrders} pend.
          </button>
          <span className="text-gray-300 dark:text-card-border shrink-0">|</span>
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold shrink-0">
            <TrendingUp className="h-3 w-3" />
            S/{quickStats.todayRevenue.toFixed(2)}
          </span>
          {quickStats.lowStockProducts > 0 && (
            <>
              <span className="text-gray-300 dark:text-card-border shrink-0">|</span>
              <button
                onClick={() => navigateTab("inventario-almacenes")}
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-600 font-semibold shrink-0 transition-colors"
              >
                <AlertTriangle className="h-3 w-3" />
                {quickStats.lowStockProducts} bajo
              </button>
            </>
          )}
          {(quickStats.overduePayables ?? 0) > 0 && (
            <>
              <span className="text-gray-300 dark:text-card-border shrink-0">|</span>
              <button
                onClick={() => navigateTab("facturacion")}
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-semibold shrink-0 transition-colors"
              >
                <HandCoins className="h-3 w-3" />
                {quickStats.overduePayables} venc.
              </button>
            </>
          )}
        </div>
      )}

      {/* Quick stats bar — updates every 60 s via /api/admin/stats */}
      {quickStats && (
        <div className="hidden sm:flex items-center gap-1 px-6 py-1.5 bg-white dark:bg-card border-b border-gray-100 dark:border-card-border text-xs">
          <button
            onClick={() => navigateTab("pedidos")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold transition-colors",
              quickStats.pendingOrders > 0
                ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            )}
          >
            <ShoppingCart className="h-4 w-4" />
            {quickStats.pendingOrders} pendiente{quickStats.pendingOrders !== 1 ? "s" : ""}
          </button>
          <span className="text-gray-200 dark:text-card-border">|</span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold">
            <TrendingUp className="h-4 w-4" />
            S/{quickStats.todayRevenue.toFixed(2)} hoy
          </span>
          {quickStats.lowStockProducts > 0 && (
            <>
              <span className="text-gray-200 dark:text-card-border">|</span>
              <button
                onClick={() => navigateTab("inventario-almacenes")}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 text-red-600 font-semibold hover:bg-red-200 transition-colors"
              >
                <AlertTriangle className="h-4 w-4" />
                {quickStats.lowStockProducts} stock bajo
              </button>
            </>
          )}
          {(quickStats.overduePayables ?? 0) > 0 && (
            <>
              <span className="text-gray-200 dark:text-card-border">|</span>
              <button
                onClick={() => navigateTab("facturacion")}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 font-semibold hover:bg-amber-200 transition-colors"
              >
                <HandCoins className="h-4 w-4" />
                {quickStats.overduePayables} cuentas vencidas
              </button>
            </>
          )}
          <span className="ml-auto text-gray-300 text-[10px]">Actualizado hace &lt;1 min</span>
        </div>
      )}

      {/* Body */}
      <main className={cn("flex-1 mx-auto max-w-7xl w-full pb-24 sm:pb-8", compactMode ? "px-2 sm:px-3 py-2 sm:py-4" : "px-3 sm:px-6 py-4 sm:py-8")}>
        {/* Breadcrumb navigation */}
        {tab !== "panel-principal" && (
          <nav className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-muted mb-3 overflow-x-auto" aria-label="Breadcrumb">
            <button onClick={() => navigateTab("panel-principal")} className="hover:text-primary transition-colors shrink-0">Panel Principal</button>
            {(() => {
              const cat = TAB_CATEGORIES.find(c => c.tabs.includes(tab));
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
        {tab === "panel-principal" && <PanelPrincipalModule />}
        {tab === "pos-caja" && <POSCajaModule />}
        {tab === "inventario-almacenes" && (
          <div className="space-y-8">
            <InventarioAlmacenesModule />
            <div className="pt-8 border-t border-gray-200 dark:border-card-border">
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-4">Reposición Inteligente</h3>
              <ReposicionModule />
            </div>
          </div>
        )}
        {tab === "catalogo-tienda" && <CatalogoTiendaModule />}
        {tab === "precios-promos" && <PreciosPromosModule />}
        {tab === "compras" && (
          <div className="space-y-8">
            <ComprasModule />
            <div className="pt-8 border-t border-gray-200 dark:border-card-border">
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-4">Directorio de Proveedores</h3>
              <ProveedoresModule />
            </div>
          </div>
        )}
        {tab === "logistica" && <LogisticaModule />}
        {tab === "devoluciones-calidad" && <DevolucionesCalidadModule />}
        {tab === "ventas-marketing" && <VentasMarketingModule />}
        {tab === "crm-clientes" && (
          <div className="space-y-8">
            <CRMClientesModule />
            <div className="pt-8 border-t border-gray-200 dark:border-card-border">
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-4">Base de Datos: Clientes</h3>
              <CustomersTab />
            </div>
            <div className="pt-8 border-t border-gray-200 dark:border-card-border">
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-4">Registro de Visitantes (Leads)</h3>
              <VisitantesTab />
            </div>
          </div>
        )}
        {tab === "fidelizacion" && <FidelizacionModule />}
        {tab === "encuestas-soporte" && (
          <div className="space-y-8">
            <EncuestasSoporteModule />
            <div className="pt-8 border-t border-gray-200 dark:border-card-border">
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-4">Reseñas y Feedback Externo</h3>
              <ReviewsTab />
            </div>
          </div>
        )}
        {tab === "analytics-bi" && <AnalyticsBIModule />}
        {tab === "proyecciones" && <ProyeccionesModule />}
        {tab === "finanzas" && (
          <div className="space-y-8">
            <FinanzasModule />
            <div className="pt-8 border-t border-gray-200 dark:border-card-border">
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-4">Tesorería y Liquidez</h3>
              <TesoreriaModule />
            </div>
            <div className="pt-8 border-t border-gray-200 dark:border-card-border">
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-4">Módulo de Facturación</h3>
              <FacturacionModule />
            </div>
            <div className="pt-8 border-t border-gray-200 dark:border-card-border">
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-4">Gastos y Activos Fijos</h3>
              <GastosActivosModule />
            </div>
          </div>
        )}
        {tab === "rrhh" && <RRHHModule />}
        {tab === "proyectos-tareas" && <ProyectosTareasModule />}
        {tab === "comunicaciones" && <ComunicacionesModule />}
        {tab === "alertas-automatizacion" && <AlertasAutomModule />}
        {tab === "reportes-documentos" && <ReportesDocModule />}
        {tab === "agenda-utilidades" && <AgendaUtilidadesModule />}
        {tab === "seguridad" && (
          <div className="space-y-8">
            <SeguridadModule />
            <div className="pt-8 border-t border-gray-200 dark:border-card-border">
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-4">Salud del Sistema y Webhooks</h3>
              <SistemaModule />
            </div>
            <div className="pt-8 border-t border-gray-200 dark:border-card-border">
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-4">Configuración General</h3>
              <SettingsTab storeMode={storeMode} onModeChange={setStoreModeState} />
            </div>
            <div className="pt-8 border-t border-gray-200 dark:border-card-border">
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-4">Gestión de Equipo</h3>
              <TeamTab />
            </div>
          </div>
        )}
        {tab === "pedidos" && <OrdersTab />}
        {tab === "plan" && <PlanTab />}
        {tab === "changelog" && <ChangelogModule />}
        {tab === "agentes" && <AgentsDashboardTab />}
      </main>

      {/* Focus mode floating sidebar toggle */}
      {focusMode && (
        <button
          onClick={() => setFocusMode(false)}
          className="fixed bottom-20 sm:bottom-6 left-4 z-50 h-10 w-10 rounded-full bg-primary text-white shadow-lg flex items-center justify-center hover:bg-primary/90 transition-all"
          title="Mostrar sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40" onClick={() => setShowShortcuts(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-gray-200 dark:border-card-border" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-extrabold text-foreground mb-4">⌨ Atajos de teclado</h3>
            <div className="space-y-2 text-sm">
              {[
                ["Alt + 1", "Panel Principal"],
                ["Alt + 2", "POS & Caja"],
                ["Alt + 3", "Inventario"],
                ["Alt + 4", "Pedidos"],
                ["Alt + 5", "Proveedores"],
                ["Alt + 6", "Compras"],
                ["Alt + 7", "Finanzas"],
                ["Alt + 8", "Clientes"],
                ["Alt + 9", "CRM"],
                ["Alt + 0", "Configuración"],
                ["Alt + ?", "Mostrar atajos"],
                ["Alt + T", "Cambiar tema"],
                ["Alt + S", "Buscar"],
                ["Alt + L", "Cerrar sesión"],
                ["Cmd/Ctrl + K", "Comando rápido"],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-muted">{label}</span>
                  <kbd className="bg-gray-100 dark:bg-surface text-foreground px-2 py-0.5 rounded text-xs font-mono">{key}</kbd>
                </div>
              ))}
            </div>
            <button onClick={() => setShowShortcuts(false)} className="mt-5 w-full py-2.5 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-colors">Cerrar</button>
          </div>
        </div>
      )}

      {/* ── Mobile quick-tab bottom bar ─────────────────────────────────────── */}
      {(() => {
        const MOBILE_PRIORITY: Record<string, Tab[]> = {
          admin:      ["panel-principal", "pos-caja", "pedidos", "inventario-almacenes"],
          cajero:     ["panel-principal", "pos-caja", "pedidos", "clientes"],
          almacenero: ["panel-principal", "inventario-almacenes", "proveedores", "compras"],
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
