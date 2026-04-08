import type { OrderStatus, StoreMode } from "@/lib/jsondb";
import type React from "react";
import {
  Users, ShoppingBasket, ShoppingCart,
  Truck, FileText, Settings, Store,
  Clock, Activity,
  Brain,
  Package, FlaskConical,
  DollarSign, Tag,
  Shield, CreditCard, Landmark,
  ClipboardList, RotateCcw,
  Palette,
} from "lucide-react";

// ── 8 consolidated modules + specials + extras ──
export type Tab =
  | "asistente-ia"
  | "ventas-caja"
  | "inventario"
  | "productos"
  | "compras"
  | "plata"
  | "clientes"
  | "config"
  | "pedidos"
  | "plan"
  | "analytics-pro"
  | "ai-command"
  | "fiados"
  | "turnos"
  | "recetas"
  | "prestamos"
  | "cotizaciones"
  | "guias-remision"
  | "notas-credito"
  | "contratos"
  | "auditoria"
  | "devoluciones-proveedor"
  | "tesoreria"
  | "promociones"
  | "scoring"
  | "sugerencias-ia"
  | "metas-logros"
  | "marketplace"
  | "delivery-partners"
  | "delivery-live"
  | "store-customizer"
  | "mi-perfil"
  | "rendimiento"
  | "colas";

export type TabCategory = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tabs: Tab[];
};

// Old tab IDs → consolidated module IDs for localStorage migration
export const TAB_MIGRATION: Record<string, Tab> = {
  // → Asistente IA (absorbe dashboard, agentes, changelog)
  dashboard: "asistente-ia", "dashboard-ejecutivo": "asistente-ia", "panel-principal": "asistente-ia",
  agentes: "asistente-ia", changelog: "asistente-ia",
  // ��� Ventas & Caja
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
  logistica: "clientes",
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
  "tablero-metas": "config", "proyectos-tareas": "config",
  "alertas-automatizacion": "config", "alertas-automaticas": "config",
  recordatorios: "config", flujos: "config", "reglas-negocio": "config",
  "agenda-utilidades": "config", calendario: "config",
  "notas-rapidas": "config", "filtros-guardados": "config",
  "pagina-inicio": "config",
  // Especiales
  pedidos: "pedidos",
  plan: "plan",
  // Módulos nuevos
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
  // Rendimiento técnico
  rendimiento: "rendimiento",
  "web-vitals": "rendimiento",
  "salud-sistema-tech": "rendimiento",
  // Módulos adicionales
  fiados: "fiados",
  turnos: "turnos",
  recetas: "recetas",
  prestamos: "prestamos",
};

// Modules that ship with auto-seeded demo data and their API cleanup endpoint
export const DEMO_DATA_MODULES: Partial<Record<Tab, { label: string; api?: string }>> = {
  "inventario": { label: "24 productos de ejemplo cargados al inicio", api: "/api/admin/demo-products" },
};

// Rich metadata for every module: emoji, priority, description and a helpful tip
export const MODULE_INFO: Partial<Record<Tab, { emoji: string; priority: "core" | "high" | "medium" | "low"; desc: string; tip: string }>> = {
  "asistente-ia":  { emoji: "\u{1F9E0}", priority: "core",   desc: "Dashboard IA, chat con asistente y centro de alertas del negocio.",     tip: "Empieza aqu\u00ED cada ma\u00F1ana para tener el pulso del negocio." },
  "ventas-caja":   { emoji: "\u{1F5A5}\uFE0F", priority: "core",   desc: "Punto de venta, caja registradora, arqueo, pedidos y cuentas por cobrar.", tip: "Todo lo que necesitas para operar el mostrador en un solo lugar." },
  "inventario":    { emoji: "\u{1F4E6}", priority: "core",   desc: "Stock, Kardex, vencimientos, mermas y alertas de inventario.",           tip: "Control completo del inventario desde una sola vista." },
  "productos":     { emoji: "\u{1F3EA}", priority: "high",   desc: "Cat\u00E1logo, categor\u00EDas, ofertas, cupones e historial de precios.",         tip: "Gestiona tu cat\u00E1logo y optimiza precios." },
  "compras":       { emoji: "\u{1F4CB}", priority: "high",   desc: "Pedidos a proveedor, directorio de proveedores y recepci\u00F3n.",            tip: "Flujo completo de compras desde la cotizaci\u00F3n hasta la recepci\u00F3n." },
  "plata":         { emoji: "\u{1F4B5}", priority: "high",   desc: "Ingresos, egresos, gastos, ganancias, reportes y exportaci\u00F3n.",          tip: "Visi\u00F3n financiera completa del negocio en un solo m\u00F3dulo." },
  "clientes":      { emoji: "\u{1F465}", priority: "high",   desc: "CRM, delivery, opiniones y programa de fidelizaci\u00F3n.",                   tip: "Conoce a tus clientes y personaliza la atenci\u00F3n." },
  "config":        { emoji: "\u2699\uFE0F", priority: "core",   desc: "Usuarios, permisos, plan y configuraci\u00F3n de la p\u00E1gina web.",             tip: "Configura esto primero para que todo funcione correctamente." },
  "pedidos":       { emoji: "\u{1F6D2}", priority: "core",   desc: "Gestiona pedidos recibidos, su estado, asignaci\u00F3n y entrega.",           tip: "Centraliza pedidos de WhatsApp, tienda online y mostrador." },
  "plan":          { emoji: "\u26A1", priority: "medium", desc: "Tu plan actual, l\u00EDmites y opciones de mejora.",                          tip: "Revisa tu plan para aprovechar al m\u00E1ximo la plataforma." },
  "fiados":        { emoji: "\u{1F4B0}", priority: "high",   desc: "Control de cr\u00E9ditos informales: registro, pagos y saldos pendientes.",  tip: "Lleva la cuenta de lo que te deben tus clientes de confianza." },
  "turnos":        { emoji: "\u23F1\uFE0F", priority: "high",   desc: "Apertura y cierre de turnos con conteo de efectivo.",                   tip: "Control de caja por turno para saber exactamente cu\u00E1nto entr\u00F3." },
  "recetas":       { emoji: "\u{1F373}", priority: "medium", desc: "Recetas de producci\u00F3n con ingredientes y control de lotes.",            tip: "Calcula costos de producci\u00F3n y descuenta stock autom\u00E1ticamente." },
  "prestamos":     { emoji: "\u{1F3E6}", priority: "medium", desc: "Pr\u00E9stamos a clientes con cuotas, inter\u00E9s y tabla de amortizaci\u00F3n.",     tip: "Gestiona pr\u00E9stamos con calculadora integrada y seguimiento de pagos." },
};

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export const STATUS_COLORS: Record<OrderStatus, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  confirmado: "bg-blue-100 text-blue-700",
  en_camino: "bg-purple-100 text-purple-700",
  entregado: "bg-emerald-100 text-emerald-700",
  cancelado: "bg-red-100 text-red-500",
};

// ── 7 basic modules + extras ──
const BASIC_MODULES: TabCategory[] = [
  {
    id: "asistente-ia",
    label: "IA & Anal\u00EDtica",
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
    label: "F\u00EDados",
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
    label: "Pr\u00E9stamos",
    icon: Landmark,
    tabs: ["prestamos"],
  },
  {
    id: "auditoria",
    label: "Auditor\u00EDa",
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
    label: "Tesorer\u00EDa",
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
    label: "Scoring Cr\u00E9dito",
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

// Mi Tienda module (visual customization)
const TIENDA_MODULE: TabCategory = {
  id: "mi-tienda",
  label: "Mi Tienda",
  icon: Palette,
  tabs: ["store-customizer"],
};

// Config module (always visible)
export const CONFIG_MODULE: TabCategory = {
  id: "config",
  label: "Configuraci\u00F3n",
  icon: Settings,
  tabs: ["config", "plan"],
};

// TAB_CATEGORIES: all modules (Config and Plan accessible from user dropdown)
export const TAB_CATEGORIES: TabCategory[] = [
  ...BASIC_MODULES,
  TIENDA_MODULE,
];

export const VALID_TABS: Tab[] = [
  "asistente-ia","ventas-caja","inventario","productos","compras","plata","clientes","config","pedidos","plan","analytics-pro","ai-command","fiados","turnos","cotizaciones","guias-remision","notas-credito","contratos","sugerencias-ia","metas-logros","marketplace","delivery-partners","delivery-live","store-customizer","colas",
];

// Nav module defaults configuration
export const NAV_MODULES = [
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

// Keyboard shortcut mapping for Alt+number keys
export const SHORTCUT_MAP: Record<string, Tab> = {
  "1": "asistente-ia", "2": "ventas-caja", "3": "inventario", "4": "pedidos",
  "5": "productos", "6": "compras", "7": "plata", "8": "clientes",
  "9": "config", "0": "plan",
};

// Dynamic browser title labels
export const TAB_TITLE_LABELS: Record<string, string> = {
  "ventas-caja": "POS",
  "inventario": "Inventario",
  "productos": "Productos",
  "compras": "Compras",
  "plata": "Finanzas",
  "clientes": "CRM",
  "fiados": "Fiados",
  "turnos": "Turnos",
  "recetas": "Recetas",
  "prestamos": "Pr\u00E9stamos",
  "pedidos": "Pedidos",
  "analytics-pro": "Analytics",
  "config": "Configuraci\u00F3n",
  "asistente-ia": "Asistente IA",
  "cotizaciones": "Cotizaciones",
  "guias-remision": "Gu\u00EDas Remisi\u00F3n",
  "notas-credito": "Notas Cr\u00E9dito",
  "contratos": "Contratos",
  "plan": "Plan",
};

// Default sidebar shortcuts
export const DEFAULT_SHORTCUTS: Array<{ id: string; label: string }> = [
  { id: "asistente-ia", label: "Dashboard" },
  { id: "inventario", label: "Stock" },
  { id: "pedidos", label: "Pedidos" },
  { id: "ventas-caja", label: "Caja POS" },
];

// Mobile bottom bar tab priorities per role
export const MOBILE_PRIORITY: Record<string, Tab[]> = {
  admin:      ["asistente-ia", "ventas-caja", "pedidos", "inventario"],
  cajero:     ["asistente-ia", "ventas-caja", "pedidos", "clientes"],
  almacenero: ["asistente-ia", "inventario", "compras", "plata"],
};
