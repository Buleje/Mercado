import type { OrderStatus } from "@/lib/jsondb";
import type React from "react";
import {
  Users, ShoppingCart,
  Truck, FileText, Settings, Store,
  Clock,
  Brain,
  Package, FlaskConical,
  DollarSign, Tag,
  Shield, CreditCard, Landmark, RotateCcw,
  Palette } from "@buleje/design-system/icons";

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
  | "marketplace-chat"
  | "store-customizer"
  | "mi-perfil"
  | "rendimiento"
  | "colas"
  | "pagina-inicio"
  | "documentos";

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
  // Ventas & Caja — `ventas-caja` es el ID ACTUAL del POS (no migrar).
  pos: "ventas-caja", caja: "ventas-caja", "pos-caja": "ventas-caja", "arqueo-caja": "ventas-caja",
  "ventas-marketing": "analytics-pro", marketing: "analytics-pro", "forecast-ventas": "analytics-pro",
  "metricas-conversion": "analytics-pro", referidos: "analytics-pro",
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
  reportes: "plata", "reportes-auto": "plata", "importar-exportar": "plata",
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
  "pagina-inicio": "pagina-inicio",
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

// Rich metadata for every module: priority, description and a helpful tip
export const MODULE_INFO: Partial<Record<Tab, { priority: "core" | "high" | "medium" | "low"; desc: string; tip: string }>> = {
  "asistente-ia":  { priority: "core",   desc: "Dashboard IA, chat con asistente y centro de alertas del negocio.",     tip: "Empieza acá cada mañana para tener el pulso del negocio." },
  "inventario":    { priority: "core",   desc: "Stock, Kardex, vencimientos, mermas y alertas de inventario.",           tip: "Control completo del inventario desde una sola vista." },
  "productos":     { priority: "high",   desc: "Catálogo, categorías, ofertas, cupones e historial de precios.",         tip: "Gestioná tu catálogo y optimizá precios." },
  "compras":       { priority: "high",   desc: "Pedidos a proveedor, directorio de proveedores y recepción.",            tip: "Flujo completo de compras desde la cotización hasta la recepción." },
  "plata":         { priority: "high",   desc: "Ingresos, egresos, gastos, ganancias, reportes y exportación.",          tip: "Visión financiera completa del negocio en un solo módulo." },
  "clientes":      { priority: "high",   desc: "CRM, delivery, opiniones y programa de fidelización.",                   tip: "Conoce a tus clientes y personalizá la atención." },
  "config":        { priority: "core",   desc: "Usuarios, permisos, plan y configuración de la página web.",             tip: "Configurá esto primero para que todo funcione correctamente." },
  "pedidos":       { priority: "core",   desc: "Gestiona pedidos recibidos, su estado, asignación y entrega.",           tip: "Centralizá pedidos de WhatsApp, tienda online y mostrador." },
  "plan":          { priority: "medium", desc: "Tu plan actual, límites y opciones de mejora.",                          tip: "Revisa tu plan para aprovechar al máximo la plataforma." },
  "fiados":        { priority: "high",   desc: "Control de créditos informales: registro, pagos y saldos pendientes.",  tip: "Lleva la cuenta de lo que te deben tus clientes de confianza." },
  "turnos":        { priority: "high",   desc: "Apertura y cierre de turnos con conteo de efectivo.",                   tip: "Control de caja por turno para saber exactamente cuánto entró." },
  "recetas":       { priority: "medium", desc: "Recetas de producción con ingredientes y control de lotes.",            tip: "Calculá costos de producción y descontá stock automáticamente." },
  "prestamos":     { priority: "medium", desc: "Préstamos a clientes con cuotas, interés y tabla de amortización.",     tip: "Gestioná préstamos con calculadora integrada y seguimiento de pagos." },
};

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  preparando: "Preparando",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export const STATUS_COLORS: Record<OrderStatus, string> = {
  pendiente: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]",
  confirmado: "bg-primary/10 text-[var(--data-success-500)]",
  preparando: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]",
  en_camino: "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
  entregado: "bg-primary/10 text-[var(--data-success-500)]",
  cancelado: "bg-[var(--data-error-100)] text-[var(--data-error-500)]",
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
    id: "pedidos-ops",
    label: "Pedidos",
    icon: ShoppingCart,
    tabs: ["pedidos"],
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
  "asistente-ia","inventario","productos","compras","plata","clientes","config","pedidos","plan","analytics-pro","ai-command","fiados","turnos","cotizaciones","guias-remision","notas-credito","contratos","sugerencias-ia","metas-logros","marketplace","delivery-partners","delivery-live","marketplace-chat","store-customizer","colas",
];

// Nav module defaults configuration
export const NAV_MODULES = [
  // ventas-caja module removido
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
  "1": "asistente-ia", "2": "pedidos", "3": "inventario", "4": "productos",
  "5": "productos", "6": "compras", "7": "plata", "8": "clientes",
  "9": "config", "0": "plan",
};

// Dynamic browser title labels
export const TAB_TITLE_LABELS: Record<string, string> = {
  // ventas-caja title removido
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
  { id: "fiados", label: "Fiados" },
];

// Mobile bottom bar tab priorities per role
export const MOBILE_PRIORITY: Record<string, Tab[]> = {
  admin:      ["asistente-ia", "pedidos", "inventario", "productos"],
  cajero:     ["asistente-ia", "pedidos", "clientes", "inventario"],
  almacenero: ["asistente-ia", "inventario", "compras", "plata"],
};
