"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search, X, Package, Users, ShoppingCart, FileText,
  ShoppingBasket, Tag, AlertTriangle, TrendingUp, Loader2,
  LayoutDashboard, Monitor, Boxes, Truck, MapPin, RotateCcw,
  BarChart3, DollarSign, UserCog, MessageSquare, Bell, Shield,
  Settings, Bot, Star, Zap, Heart, ClipboardList, Target,
  BookOpen, Calculator, ArrowRight,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type ResultType =
  | "modulo"
  | "producto"
  | "cliente"
  | "pedido"
  | "accion";

interface SearchResult {
  id: string;
  type: ResultType;
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: string;
  tab?: string;
  /** Para módulos: navegar directo al tab */
  navigateTo?: string;
  /** Para acciones: callback directo */
  action?: () => void;
  /** Texto original para highlight */
  matchText?: string;
}

interface GroupedResults {
  modulos: SearchResult[];
  productos: SearchResult[];
  clientes: SearchResult[];
  pedidos: SearchResult[];
  acciones: SearchResult[];
}

// ── Índice de módulos y tabs (hardcoded) ──────────────────────────────────────

interface ModuleEntry {
  tab: string;
  label: string;
  icon: React.ElementType;
  keywords: string[];
  subtabs?: { id: string; label: string; keywords?: string[] }[];
}

const MODULE_INDEX: ModuleEntry[] = [
  {
    tab: "panel-principal",
    label: "Panel Principal",
    icon: LayoutDashboard,
    keywords: ["panel", "dashboard", "inicio", "principal", "ejecutivo", "resumen", "kpi", "métricas", "agentes", "changelog"],
    subtabs: [
      { id: "panel-principal", label: "Panel principal", keywords: ["dashboard", "inicio", "ventas"] },
      { id: "panel-principal", label: "Ejecutivo", keywords: ["ejecutivo", "gerencia", "resumen"] },
      { id: "panel-principal", label: "Agentes IA", keywords: ["agentes", "ia", "inteligencia"] },
      { id: "panel-principal", label: "Changelog", keywords: ["changelog", "versiones", "cambios"] },
    ],
  },
  {
    tab: "pos-caja",
    label: "POS & Caja",
    icon: Monitor,
    keywords: ["pos", "caja", "punto de venta", "venta", "turno", "arqueo", "registradora", "cobro"],
    subtabs: [
      { id: "pos-caja", label: "Caja", keywords: ["pos", "venta", "cobrar"] },
      { id: "pos-caja", label: "Caja registradora", keywords: ["caja", "registradora"] },
      { id: "pos-caja", label: "Turnos", keywords: ["turno", "apertura", "cierre"] },
      { id: "pos-caja", label: "Arqueo de caja", keywords: ["arqueo", "conteo", "efectivo"] },
    ],
  },
  {
    tab: "inventario-almacenes",
    label: "Inventario & Almacenes",
    icon: Boxes,
    keywords: ["inventario", "stock", "almacén", "almacenes", "kardex", "lotes", "mermas", "ubicaciones", "transferencias", "reorden", "predicción"],
    subtabs: [
      { id: "inventario-almacenes", label: "Mi stock", keywords: ["stock", "existencias"] },
      { id: "inventario-almacenes", label: "Kardex", keywords: ["kardex", "movimientos"] },
      { id: "inventario-almacenes", label: "Vencimientos", keywords: ["lotes", "batch", "vencimiento", "fefo"] },
      { id: "inventario-almacenes", label: "Perdidas", keywords: ["mermas", "pérdidas", "desperdicios"] },
      { id: "inventario-almacenes", label: "Almacenes", keywords: ["almacenes", "bodega"] },
      { id: "inventario-almacenes", label: "Ubicaciones", keywords: ["ubicaciones", "pasillo", "estante"] },
      { id: "inventario-almacenes", label: "Transferencias", keywords: ["transferencias", "traslado"] },
      { id: "inventario-almacenes", label: "Reorden", keywords: ["reorden", "reposición", "mínimo"] },
      { id: "inventario-almacenes", label: "Prediccion IA", keywords: ["predicción", "demanda", "forecast"] },
      { id: "inventario-almacenes", label: "Conteo fisico", keywords: ["conteo", "físico", "inventario físico"] },
    ],
  },
  {
    tab: "reposicion",
    label: "Reposición Inteligente",
    icon: RotateCcw,
    keywords: ["reposición", "reorden", "auto-reorden", "reabastecimiento"],
  },
  {
    tab: "pedidos",
    label: "Pedidos",
    icon: ShoppingCart,
    keywords: ["pedidos", "órdenes", "orders", "entrega", "delivery", "pendiente", "confirmado"],
  },
  {
    tab: "catalogo-tienda",
    label: "Catálogo & Tienda",
    icon: BookOpen,
    keywords: ["catálogo", "tienda", "categorías", "combos", "kits", "bundles", "página inicio"],
    subtabs: [
      { id: "catalogo-tienda", label: "Categorías", keywords: ["categorías", "clasificación"] },
      { id: "catalogo-tienda", label: "Combos & Kits", keywords: ["combos", "kits", "bundles", "paquetes"] },
      { id: "catalogo-tienda", label: "Página de Inicio", keywords: ["página inicio", "home", "banner"] },
    ],
  },
  {
    tab: "precios-promos",
    label: "Precios & Promociones",
    icon: Tag,
    keywords: ["precios", "promociones", "cupones", "descuentos", "benchmark", "ab test", "historial precios"],
    subtabs: [
      { id: "precios-promos", label: "Benchmark", keywords: ["benchmark", "competencia"] },
      { id: "precios-promos", label: "Historial de Precios", keywords: ["historial", "precio"] },
      { id: "precios-promos", label: "Promociones", keywords: ["promociones", "ofertas"] },
      { id: "precios-promos", label: "Cupones", keywords: ["cupones", "descuentos", "código"] },
      { id: "precios-promos", label: "A/B Tests", keywords: ["ab test", "experimento"] },
    ],
  },
  {
    tab: "compras",
    label: "Compras",
    icon: ShoppingBasket,
    keywords: ["compras", "órdenes de compra", "cotizaciones", "rfq", "recepción", "aprobación"],
    subtabs: [
      { id: "compras", label: "Plan de compras", keywords: ["plan compras"] },
      { id: "compras", label: "Cotizaciones", keywords: ["cotizaciones", "rfq"] },
      { id: "compras", label: "Aprobacion", keywords: ["aprobación", "aprobar"] },
      { id: "compras", label: "Recepci\u00f3n", keywords: ["recepción", "recibir"] },
    ],
  },
  {
    tab: "compras",
    label: "Mis proveedores",
    icon: Truck,
    keywords: ["proveedores", "proveedor", "portal proveedor", "evaluación", "calidad proveedor", "pagos proveedor"],
  },
  {
    tab: "logística",
    label: "Logística",
    icon: MapPin,
    keywords: ["logística", "delivery", "entregas", "rutas", "flota", "envíos", "tracking", "costos envío"],
    subtabs: [
      { id: "logística", label: "Calendario de entregas", keywords: ["calendario", "entregas"] },
      { id: "logística", label: "Rutas de delivery", keywords: ["rutas", "delivery"] },
      { id: "logística", label: "Seguimiento de envios", keywords: ["seguimiento", "tracking"] },
      { id: "logística", label: "Flota", keywords: ["flota", "vehículos", "moto"] },
    ],
  },
  {
    tab: "devoluciones-calidad",
    label: "Devoluciones & Calidad",
    icon: RotateCcw,
    keywords: ["devoluciones", "calidad", "anomalías", "retorno", "reclamo"],
  },
  {
    tab: "ventas-marketing",
    label: "Ventas & Marketing",
    icon: TrendingUp,
    keywords: ["ventas", "marketing", "forecast", "campañas", "referidos", "conversión"],
  },
  {
    tab: "crm-clientes",
    label: "Mis clientes",
    icon: Users,
    keywords: ["crm", "clientes", "segmentos", "clv", "cliente 360", "segmentación"],
    subtabs: [
      { id: "crm-clientes", label: "Mis clientes", keywords: ["crm", "clientes"] },
      { id: "crm-clientes", label: "Vista 360°", keywords: ["cliente 360", "360"] },
      { id: "crm-clientes", label: "Segmentos", keywords: ["segmentos", "grupos"] },
    ],
  },
  {
    tab: "fidelizacion",
    label: "Clientes frecuentes",
    icon: Heart,
    keywords: ["fidelización", "puntos", "loyalty", "wish list", "recompensas", "frecuentes"],
  },
  {
    tab: "encuestas-soporte",
    label: "Opiniones & Soporte",
    icon: Star,
    keywords: ["encuestas", "soporte", "nps", "tickets", "satisfacción", "reseñas", "opiniones"],
  },
  {
    tab: "analytics-bi",
    label: "Reportes avanzados",
    icon: BarChart3,
    keywords: ["analytics", "bi", "análisis", "mapa calor", "abc", "pareto", "bcg", "kpi", "cesta", "reportes"],
  },
  {
    tab: "proyecciones",
    label: "Proyecciones",
    icon: TrendingUp,
    keywords: ["proyecciones", "simulador", "estacionalidad", "períodos", "escenarios"],
  },
  {
    tab: "finanzas",
    label: "Finanzas",
    icon: DollarSign,
    keywords: ["finanzas", "p&g", "balance", "flujo caja", "presupuestos", "rentabilidad", "márgenes", "plata que entra", "ganancias"],
  },
  {
    tab: "finanzas",
    label: "Tesoreria",
    icon: Calculator,
    keywords: ["tesorería", "liquidez", "cheques", "conciliación", "cuentas cobrar", "me deben"],
  },
  {
    tab: "finanzas",
    label: "Facturacion",
    icon: FileText,
    keywords: ["facturación", "e-factura", "impuestos", "cuentas pagar", "les debo"],
  },
  {
    tab: "finanzas",
    label: "Gastos y activos",
    icon: DollarSign,
    keywords: ["gastos", "centros costo", "activos fijos", "seguros", "egresos"],
  },
  {
    tab: "rrhh",
    label: "Mi equipo",
    icon: UserCog,
    keywords: ["rrhh", "recursos humanos", "nómina", "sucursales", "personal", "empleados", "equipo"],
  },
  {
    tab: "proyectos-tareas",
    label: "Proyectos & Tareas",
    icon: Target,
    keywords: ["proyectos", "tareas", "kanban", "metas", "tablero"],
  },
  {
    tab: "comunicaciones",
    label: "Comunicaciones",
    icon: MessageSquare,
    keywords: ["comunicaciones", "chat", "plantillas", "notificaciones", "hub"],
  },
  {
    tab: "alertas-automatizacion",
    label: "Alertas y automatizacion",
    icon: Bell,
    keywords: ["alertas", "automatización", "recordatorios", "flujos", "reglas negocio"],
  },
  {
    tab: "reportes-documentos",
    label: "Reportes y documentos",
    icon: FileText,
    keywords: ["reportes", "documentos", "exportar", "importar", "informe"],
  },
  {
    tab: "agenda-utilidades",
    label: "Agenda y utilidades",
    icon: ClipboardList,
    keywords: ["agenda", "calendario", "notas", "filtros guardados"],
  },
  {
    tab: "seguridad",
    label: "Seguridad y auditoria",
    icon: Shield,
    keywords: ["seguridad", "usuarios", "roles", "permisos", "auditoría", "logs", "cumplimiento"],
  },
  {
    tab: "sistema",
    label: "Ajustes del sistema",
    icon: Settings,
    keywords: ["sistema", "backups", "webhooks", "salud sistema", "restaurar", "ajustes", "configuracion"],
  },
  {
    tab: "agentes",
    label: "Agentes IA",
    icon: Bot,
    keywords: ["agentes", "ia", "inteligencia artificial", "automatización ia", "orquestador"],
  },
];

// ── Acciones rápidas ──────────────────────────────────────────────────────────

interface QuickAction {
  id: string;
  label: string;
  icon: React.ElementType;
  navigateTo: string;
  keywords: string[];
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: "nuevo-producto",  label: "Nuevo producto",    icon: Package,      navigateTo: "inventario-almacenes", keywords: ["nuevo producto", "agregar producto", "crear producto"] },
  { id: "nueva-orden",     label: "Nueva orden",       icon: ShoppingCart, navigateTo: "pos-caja",             keywords: ["nueva orden", "nueva venta", "crear pedido", "nuevo pedido"] },
  { id: "cerrar-caja",     label: "Cerrar caja",       icon: Monitor,      navigateTo: "pos-caja",             keywords: ["cerrar caja", "arqueo", "cierre turno"] },
  { id: "hacer-backup",    label: "Hacer backup",      icon: Shield,       navigateTo: "sistema",              keywords: ["backup", "respaldo", "copia seguridad"] },
  { id: "nueva-compra",    label: "Nueva orden compra", icon: ShoppingBasket, navigateTo: "compras",           keywords: ["nueva compra", "orden compra"] },
  { id: "registrar-merma", label: "Registrar merma",   icon: Zap,          navigateTo: "inventario-almacenes", keywords: ["merma", "pérdida", "registro merma"] },
  { id: "nuevo-cliente",   label: "Nuevo cliente",     icon: Users,        navigateTo: "crm-clientes",         keywords: ["nuevo cliente", "agregar cliente", "crear cliente"] },
  { id: "nuevo-cupon",     label: "Nuevo cupón",       icon: Tag,          navigateTo: "precios-promos",       keywords: ["nuevo cupón", "crear cupón", "descuento"] },
];

// ── Highlight de texto coincidente ───────────────────────────────────────────

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <span>{text}</span>;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return (
    <span>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/40 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

// ── Skeleton de carga ─────────────────────────────────────────────────────────

function ResultSkeleton() {
  return (
    <div className="px-4 py-3 space-y-3 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--rule-soft)] dark:bg-surface shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 bg-[var(--rule-soft)] dark:bg-surface rounded w-2/3" />
            <div className="h-3 bg-[var(--rule-soft)] dark:bg-surface rounded w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Búsqueda local en módulos ─────────────────────────────────────────────────

function searchModules(q: string): SearchResult[] {
  const results: SearchResult[] = [];
  const lower = q.toLowerCase();

  for (const mod of MODULE_INDEX) {
    const labelMatch = mod.label.toLowerCase().includes(lower);
    const kwMatch = mod.keywords.some(k => k.includes(lower));

    if (labelMatch || kwMatch) {
      results.push({
        id: `modulo-${mod.tab}-${mod.label}`,
        type: "modulo",
        title: mod.label,
        subtitle: "Módulo",
        navigateTo: mod.tab,
        tab: mod.tab,
      });
    }

    // Buscar en subtabs
    if (mod.subtabs) {
      for (const sub of mod.subtabs) {
        const subMatch =
          sub.label.toLowerCase().includes(lower) ||
          (sub.keywords ?? []).some(k => k.includes(lower));
        if (subMatch && !labelMatch) {
          results.push({
            id: `subtab-${mod.tab}-${sub.label}`,
            type: "modulo",
            title: sub.label,
            subtitle: `Tab en ${mod.label}`,
            navigateTo: sub.id,
            tab: sub.id,
          });
        }
      }
    }
  }

  return results.slice(0, 5);
}

function searchActions(q: string, onNavigate: (tab: string) => void, onClose: () => void): SearchResult[] {
  const lower = q.toLowerCase();
  return QUICK_ACTIONS
    .filter(a =>
      a.label.toLowerCase().includes(lower) ||
      a.keywords.some(k => k.includes(lower))
    )
    .slice(0, 5)
    .map(a => ({
      id: `accion-${a.id}`,
      type: "accion" as ResultType,
      title: a.label,
      subtitle: "Acción rápida",
      navigateTo: a.navigateTo,
      tab: a.navigateTo,
      action: () => { onNavigate(a.navigateTo); onClose(); },
    }));
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  onOpen?: () => void;
  onNavigate: (tab: string) => void;
}

// ── Metadatos de grupos ───────────────────────────────────────────────────────

const GROUP_META: Record<keyof GroupedResults, { label: string; icon: React.ElementType; color: string }> = {
  modulos:   { label: "Módulos",         icon: LayoutDashboard, color: "text-primary" },
  productos: { label: "Productos",       icon: Package,         color: "text-[var(--data-success-500)]" },
  clientes:  { label: "Clientes",        icon: Users,           color: "text-[var(--text-secondary)]" },
  pedidos:   { label: "Pedidos",         icon: ShoppingCart,    color: "text-[var(--data-warning-500)]" },
  acciones:  { label: "Acciones rápidas",icon: Zap,             color: "text-[var(--data-success-500)]" },
};

const GROUP_ORDER: (keyof GroupedResults)[] = ["modulos", "productos", "clientes", "pedidos", "acciones"];

// ── Acceso rápido (estado vacío) ──────────────────────────────────────────────

const QUICK_ACCESS = [
  { label: "Nuevo pedido",    tab: "pedidos",              icon: ShoppingCart,   color: "text-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20" },
  { label: "Mi stock",        tab: "inventario-almacenes", icon: Boxes,          color: "text-[var(--data-success-500)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  { label: "Mis clientes",    tab: "crm-clientes",         icon: Users,          color: "text-[var(--text-secondary)] bg-[var(--surface-sunken)]" },
  { label: "Caja",            tab: "pos-caja",             icon: Monitor,        color: "text-[var(--data-success-500)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  { label: "Reportes",        tab: "reportes-documentos",  icon: FileText,       color: "text-[var(--text-secondary)] bg-[var(--surface-alt)] dark:bg-surface" },
  { label: "Promociones",     tab: "precios-promos",       icon: TrendingUp,     color: "text-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20" },
];

// ── Componente principal ──────────────────────────────────────────────────────

export default function GlobalSearch({ open, onClose, onOpen, onNavigate }: Props) {
  const [query, setQuery]       = useState("");
  const [grouped, setGrouped]   = useState<GroupedResults>({ modulos: [], productos: [], clientes: [], pedidos: [], acciones: [] });
  const [loading, setLoading]   = useState(false);
  const [selected, setSelected] = useState(0);

  const inputRef    = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Atajo global Ctrl+K / Cmd+K
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        if (open) {
          onClose();
        } else {
          onOpen?.();
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, [open, onClose, onOpen]);

  // Focus al abrir
  useEffect(() => {
    if (open) {
      setQuery("");
      setGrouped({ modulos: [], productos: [], clientes: [], pedidos: [], acciones: [] });
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Búsqueda combinada
  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setGrouped({ modulos: [], productos: [], clientes: [], pedidos: [], acciones: [] });
      return;
    }

    setLoading(true);

    // Búsquedas locales (síncronas) — módulos y acciones
    const modulos  = searchModules(q);
    const acciones = searchActions(q, onNavigate, onClose);

    // Búsquedas remotas en paralelo
    const [apiRes] = await Promise.allSettled([
      fetch(`/api/search?q=${encodeURIComponent(q.trim())}`).then(r => r.ok ? r.json() : { results: [] }),
    ]);

    const apiResults: SearchResult[] = apiRes.status === "fulfilled"
      ? (apiRes.value?.results ?? [])
      : [];

    const productos: SearchResult[] = apiResults
      .filter((r: SearchResult) => r.type === "producto")
      .slice(0, 5);
    const clientes: SearchResult[] = apiResults
      .filter((r: SearchResult) => r.type === "cliente")
      .slice(0, 5);
    const pedidos: SearchResult[] = apiResults
      .filter((r: SearchResult) => r.type === "pedido")
      .slice(0, 5);

    setGrouped({ modulos, productos, clientes, pedidos, acciones });
    setLoading(false);
  }, [onNavigate, onClose]);

  // Debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  // Lista plana para navegación por teclado
  const flatResults = GROUP_ORDER.flatMap(g => grouped[g]);
  const totalResults = flatResults.length;

  // Navegación por teclado
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, totalResults - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
      if (e.key === "Enter" && flatResults[selected]) {
        const r = flatResults[selected];
        if (r.action) { r.action(); }
        else if (r.navigateTo) { onNavigate(r.navigateTo); onClose(); }
      }
      if (e.key === "Escape") { onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, flatResults, selected, totalResults]);

  const handleSelect = (r: SearchResult) => {
    if (r.action) { r.action(); }
    else if (r.navigateTo) { onNavigate(r.navigateTo); onClose(); }
  };

  if (!open) return null;

  const hasResults = totalResults > 0;
  const isSearching = query.trim().length >= 2;

  // Índice global para resaltar selección por teclado
  let globalIdx = 0;

  return (
    <>
      {/* Backdrop transparente — captura click-fuera sin oscurecer la página */}
      <div
        className="fixed inset-0 z-[9998]"
        onClick={onClose}
        aria-hidden
      />
      {/* Popover anclado al search button del topbar (top-14 ~ debajo del header h-14).
          Mismo ancho max-w-xl + posicionado a la izquierda con margen para alinear
          con el botón del header. En mobile ocupa todo el ancho. */}
      <div
        className="fixed top-14 left-2 sm:left-12 lg:left-[calc(var(--admin-sidebar-w,260px)+1rem)] right-2 sm:right-auto z-[9999] sm:w-[calc(100vw-3rem)] sm:max-w-xl"
      >
        <div
          className="bg-white dark:bg-card rounded-2xl overflow-hidden border border-[var(--rule-base)] dark:border-card-border shadow-[var(--shadow-xl)]"
          onClick={e => e.stopPropagation()}
        >
        {/* ── Input de búsqueda — más prominente, h-14, con eyebrow ── */}
        <div className="px-5 pt-4 pb-2 border-b border-[var(--rule-soft)] dark:border-card-border">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
            Buscar en todo el panel
          </p>
          <div className="flex items-center gap-3">
            {loading
              ? <Loader2 className="h-5 w-5 text-primary shrink-0 animate-spin" />
              : <Search className="h-5 w-5 text-[var(--text-tertiary)] dark:text-muted shrink-0" strokeWidth={2} />
            }
            <input
              ref={inputRef}
              type="text"
              placeholder="Módulos, productos, clientes, pedidos, acciones…"
              value={query}
              onChange={e => { setQuery(e.target.value); setSelected(0); }}
              className="flex-1 bg-transparent text-base font-semibold text-[var(--text-primary)] dark:text-foreground placeholder:text-[var(--text-tertiary)] dark:placeholder:text-muted placeholder:font-normal outline-none"
            />
            <div className="flex items-center gap-2 shrink-0">
              {query && (
                <button
                  onClick={() => { setQuery(""); setSelected(0); }}
                  className="p-1 rounded-full hover:bg-[var(--surface-sunken)] dark:hover:bg-surface transition-colors"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="h-4 w-4 text-[var(--text-tertiary)]" />
                </button>
              )}
              <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md text-[length:var(--ts-2xs)] font-bold font-mono text-[var(--text-tertiary)] bg-[var(--surface-sunken)] dark:bg-surface border border-[var(--rule-base)] dark:border-card-border">
                Esc
              </kbd>
            </div>
          </div>
        </div>

        {/* ── Resultados ── */}
        {isSearching && (
          <div className="max-h-[60vh] overflow-y-auto">
            {loading && <ResultSkeleton />}

            {!loading && !hasResults && (
              <div className="flex items-center gap-3 px-4 py-8 text-[var(--text-tertiary)] dark:text-muted text-sm justify-center">
                <AlertTriangle className="h-5 w-5" />
                Sin resultados para &ldquo;{query}&rdquo;
              </div>
            )}

            {!loading && hasResults && GROUP_ORDER.map(groupKey => {
              const items = grouped[groupKey];
              if (items.length === 0) return null;
              const meta = GROUP_META[groupKey];
              const GroupIcon = meta.icon;

              return (
                <div key={groupKey}>
                  {/* Cabecera de grupo — eyebrow uppercase + counter */}
                  <div className="flex items-center justify-between gap-2 px-5 py-2 bg-[var(--surface-sunken)] dark:bg-surface border-b border-[var(--rule-soft)] dark:border-card-border sticky top-0 z-10">
                    <div className="flex items-center gap-2">
                      <GroupIcon className={cn("h-3.5 w-3.5", meta.color)} strokeWidth={2.25} />
                      <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)] dark:text-muted">
                        {meta.label}
                      </span>
                    </div>
                    <span className="text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-tertiary)]">
                      {items.length}
                    </span>
                  </div>

                  {items.map(r => {
                    const itemIdx = globalIdx++;
                    const isSelected = itemIdx === selected;
                    const Icon = (() => {
                      if (groupKey === "modulos") {
                        const mod = MODULE_INDEX.find(m => m.tab === r.navigateTo || m.tab === r.tab);
                        return mod?.icon ?? LayoutDashboard;
                      }
                      if (groupKey === "productos") return Package;
                      if (groupKey === "clientes")  return Users;
                      if (groupKey === "pedidos")   return ShoppingCart;
                      const action = QUICK_ACTIONS.find(a => `accion-${a.id}` === r.id);
                      return action?.icon ?? Zap;
                    })();

                    return (
                      <button
                        key={r.id}
                        onClick={() => handleSelect(r)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-gray-50 dark:border-card-border last:border-0",
                          isSelected
                            ? "bg-primary/5 dark:bg-primary/10"
                            : "hover:bg-[var(--surface-alt)] dark:hover:bg-surface"
                        )}
                      >
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-[var(--surface-sunken)] dark:bg-surface",
                          meta.color
                        )}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-foreground truncate">
                            <HighlightText text={r.title} query={query} />
                          </p>
                          <p className="text-xs text-[var(--text-tertiary)] dark:text-muted truncate">{r.subtitle}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {r.badge && (
                            <span
                              className="px-2 py-0.5 rounded-full text-xs font-bold text-white"
                              style={{ background: r.badgeColor ?? "#6b7280" }}
                            >
                              {r.badge}
                            </span>
                          )}
                          {isSelected && (
                            <ArrowRight className="h-3.5 w-3.5 text-primary" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Acceso rápido (estado vacío) ── */}
        {!isSearching && (
          <div className="px-5 py-4">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] dark:text-muted mb-3">
              Acceso rápido
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {QUICK_ACCESS.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.tab}
                    onClick={() => { onNavigate(item.tab); onClose(); }}
                    className="flex items-center gap-3 p-3 rounded-xl border border-[var(--rule-base)] dark:border-card-border hover:border-primary/40 hover:bg-[var(--surface-sunken)] dark:hover:bg-surface transition-colors text-left"
                  >
                    <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", item.color)}>
                      <Icon className="h-4 w-4" strokeWidth={2} />
                    </div>
                    <span className="text-sm font-semibold text-[var(--text-primary)] dark:text-foreground leading-tight">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Footer — atajos de teclado discretos ── */}
        <div className="px-5 py-2.5 bg-[var(--surface-sunken)] dark:bg-surface border-t border-[var(--rule-soft)] dark:border-card-border flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)] dark:text-muted">
            <span className="flex items-center gap-1.5">
              <kbd className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border px-1.5 rounded font-mono font-semibold">↑↓</kbd>
              navegar
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border px-1.5 rounded font-mono font-semibold">↵</kbd>
              abrir
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border px-1.5 rounded font-mono font-semibold">Esc</kbd>
              cerrar
            </span>
          </div>
          <span className="hidden sm:flex items-center gap-1 text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)] dark:text-muted">
            <kbd className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border px-1.5 rounded font-mono font-semibold">⌘K</kbd>
            <span>abrir/cerrar</span>
          </span>
        </div>
        </div>
      </div>
    </>
  );
}
