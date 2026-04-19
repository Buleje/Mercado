"use client";

import React, { useState, useEffect, useRef } from "react";
import { m, AnimatePresence } from "@/components/admin/providers";
import {
  Brain,
  ShoppingCart,
  Package,
  Tag,
  Truck,
  DollarSign,
  Settings,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Menu,
  X,
  LogOut,
  User,
  Users,
  CreditCard,
  Clock,
  FlaskConical,
  Landmark,
  FileText,
  ClipboardList,
  BarChart3,
  ArrowUpDown,
  Gauge,
  Search,
  Repeat,
  Gift,
  HeartHandshake,
  Radio,
  Store as StoreIcon,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/theme-context";
import ModuleTooltip, { useModuleTooltip } from "@/components/admin/ModuleTooltip";
import { MODULE_DESCRIPTIONS } from "@/lib/module-descriptions";
import TierSelector from "@/components/admin/TierSelector";
import { useModuleTiers } from "@/hooks/useModuleTiers";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ModuleGroup = "operaciones" | "gestion" | "finanzas" | "documentos" | "inteligencia" | "config";

const GROUP_LABELS: Record<ModuleGroup, string> = {
  operaciones: "OPERACIONES",
  gestion: "GESTION",
  finanzas: "FINANZAS",
  documentos: "DOCUMENTOS",
  inteligencia: "INTELIGENCIA",
  config: "CONFIGURACION",
};

const GROUP_ICONS: Record<ModuleGroup, LucideIcon> = {
  operaciones: ShoppingCart,
  gestion: Package,
  finanzas: DollarSign,
  documentos: FileText,
  inteligencia: Brain,
  config: Settings,
};

const GROUP_COLORS: Record<ModuleGroup, { icon: string; bg: string; border: string }> = {
  operaciones: { icon: "text-[var(--text-tertiary)]", bg: "bg-gray-100", border: "border-[var(--rule-base)]" },
  gestion:     { icon: "text-[var(--text-tertiary)]", bg: "bg-gray-100", border: "border-[var(--rule-base)]" },
  finanzas:    { icon: "text-[var(--text-tertiary)]", bg: "bg-gray-100", border: "border-[var(--rule-base)]" },
  documentos:  { icon: "text-[var(--text-tertiary)]", bg: "bg-gray-100", border: "border-[var(--rule-base)]" },
  inteligencia:{ icon: "text-[var(--text-tertiary)]", bg: "bg-gray-100", border: "border-[var(--rule-base)]" },
  config:      { icon: "text-[var(--text-tertiary)]", bg: "bg-gray-100", border: "border-[var(--rule-base)]" },
};

const GROUP_ORDER: ModuleGroup[] = ["operaciones", "gestion", "finanzas", "documentos", "inteligencia"];

export interface SidebarModule {
  id: string;
  label: string;
  icon: LucideIcon;
  tabs: Array<{ id: string; label: string }>;
  group?: ModuleGroup;
}

export interface AdminSidebarProps {
  modules?: SidebarModule[];
  activeModule: string;
  activeTab: string;
  onModuleChange: (moduleId: string) => void;
  onTabChange: (tabId: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

// ─── Modulos basicos (Plan Gratis) ────────────────────────────────────────────

export const BASIC_SIDEBAR_MODULES: SidebarModule[] = [
  {
    id: "asistente-ia",
    label: "Asistente IA",
    icon: Brain,
    group: "inteligencia",
    tabs: [
      { id: "dashboard-ia", label: "Mi negocio hoy" },
      { id: "chat-ia", label: "Chat" },
      { id: "alertas", label: "Alertas" },
    ],
  },
  // ventas-caja removido — funcionalidad cubierta por pedidos + fiados
  {
    id: "inventario",
    label: "Inventario",
    icon: Package,
    group: "gestion",
    tabs: [
      { id: "stock", label: "Mi stock" },
      { id: "kardex", label: "Kardex" },
      { id: "lotes", label: "Vencimientos" },
      { id: "mermas", label: "Pérdidas" },
      { id: "alertas-stock", label: "Alertas stock" },
      { id: "conteo", label: "Conteo físico" },
    ],
  },
  {
    id: "productos",
    label: "Productos & Precios",
    icon: Tag,
    group: "gestion",
    tabs: [
      { id: "productos", label: "Catálogo" },
      { id: "categorias", label: "Categorías" },
      { id: "promociones", label: "Ofertas" },
      { id: "cupones", label: "Cupones" },
      { id: "historial-precios", label: "Historial precios" },
    ],
  },
  {
    id: "compras",
    label: "Compras",
    icon: Truck,
    group: "gestion",
    tabs: [
      { id: "ordenes-compra", label: "Pedidos a proveedor" },
      { id: "proveedores", label: "Mis proveedores" },
      { id: "recepcion", label: "Recepción" },
      { id: "cuentas-pagar", label: "Les debo" },
    ],
  },
  {
    id: "recetas",
    label: "Recetas",
    icon: FlaskConical,
    group: "gestion",
    tabs: [
      { id: "recetas", label: "Recetas" },
    ],
  },
  {
    id: "plata",
    label: "Mi Plata",
    icon: DollarSign,
    group: "finanzas",
    tabs: [
      { id: "pl", label: "Ingresos y egresos" },
      { id: "gastos", label: "Gastos" },
      { id: "rentabilidad", label: "Ganancias por producto" },
      { id: "reportes", label: "Reportes" },
      { id: "exportar", label: "Exportar a Excel" },
    ],
  },
  {
    id: "fiados",
    label: "Fíados",
    icon: CreditCard,
    group: "finanzas",
    tabs: [
      { id: "fiados", label: "Fíados" },
    ],
  },
  {
    id: "prestamos",
    label: "Préstamos",
    icon: Landmark,
    group: "finanzas",
    tabs: [
      { id: "prestamos", label: "Préstamos" },
    ],
  },
  {
    id: "clientes",
    label: "Mis Clientes",
    icon: Users,
    group: "operaciones",
    tabs: [
      { id: "crm", label: "Mis clientes" },
      { id: "delivery", label: "Delivery" },
      { id: "resenas", label: "Opiniones" },
      { id: "fidelizacion", label: "Clientes frecuentes" },
    ],
  },
  {
    id: "turnos",
    label: "Turnos",
    icon: Clock,
    group: "operaciones",
    tabs: [
      { id: "turnos", label: "Turnos" },
    ],
  },
  // ── ENRICH-5: Marketplace/venta visible ──────────────────────────────
  // Módulos bridge desde el marketplace (Bodega al Mes, Gift Cards, Socio, Lives).
  {
    id: "subscriptions",
    label: "Bodega al Mes",
    icon: Repeat,
    group: "operaciones",
    tabs: [
      { id: "subscriptions", label: "Suscripciones" },
    ],
  },
  {
    id: "gift-cards-admin",
    label: "Gift Cards",
    icon: Gift,
    group: "operaciones",
    tabs: [
      { id: "gift-cards-admin", label: "Gift Cards" },
    ],
  },
  {
    id: "socio-members",
    label: "Socio Buleje",
    icon: HeartHandshake,
    group: "operaciones",
    tabs: [
      { id: "socio-members", label: "Miembros" },
    ],
  },
  {
    id: "lives-admin",
    label: "En Vivo",
    icon: Radio,
    group: "operaciones",
    tabs: [
      { id: "lives-admin", label: "Transmisiones" },
    ],
  },
  // ── Documentos ──
  {
    id: "cotizaciones",
    label: "Cotizaciones",
    icon: ClipboardList,
    group: "documentos",
    tabs: [
      { id: "cotizaciones", label: "Cotizaciones" },
    ],
  },
  {
    id: "guias-remision",
    label: "Guías de Remisión",
    icon: Truck,
    group: "documentos",
    tabs: [
      { id: "guias-remision", label: "Guías de Remisión" },
    ],
  },
  {
    id: "notas-credito",
    label: "Notas de Crédito",
    icon: FileText,
    group: "documentos",
    tabs: [
      { id: "notas-credito", label: "Notas de Crédito" },
    ],
  },
  {
    id: "contratos",
    label: "Contratos",
    icon: FileText,
    group: "documentos",
    tabs: [
      { id: "contratos", label: "Contratos" },
    ],
  },
  {
    id: "declaracion-inventario",
    label: "Declaración Inventario",
    icon: BarChart3,
    group: "documentos",
    tabs: [
      { id: "declaracion-inventario", label: "Declaración Inventario" },
    ],
  },
  // ── Rendimiento (técnico) ──
  {
    id: "rendimiento",
    label: "Rendimiento",
    icon: Gauge,
    group: "config",
    tabs: [
      { id: "web-vitals", label: "Velocidad Web" },
      { id: "salud", label: "Salud del Sistema" },
      { id: "navegador", label: "Mi Navegador" },
      { id: "almacenamiento", label: "Almacenamiento" },
    ],
  },
];

// ─── Modulo de configuracion (siempre al fondo) ───────────────────────────────

export const CONFIG_SIDEBAR_MODULE: SidebarModule = {
  id: "config",
  label: "Configuración",
  icon: Settings,
  tabs: [
    { id: "usuarios", label: "Usuarios & Equipo" },
    { id: "roles", label: "Permisos" },
    { id: "plan", label: "Mi plan" },
    { id: "pagina-inicio", label: "Mi página web" },
  ],
};


// ─── Sub-component: Sidebar Badge (con pulse al incrementar) ──────────────────

function SidebarBadge({ moduleId, count }: { moduleId: string; count: number }) {
  const prevCountRef = React.useRef(count);
  const [pulse, setPulse] = React.useState(false);

  React.useEffect(() => {
    if (count > prevCountRef.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 1800);
      prevCountRef.current = count;
      return () => clearTimeout(t);
    }
    prevCountRef.current = count;
  }, [count]);

  const colorClass =
    moduleId === "pedidos" ? "bg-[var(--data-error)] text-white" :
    moduleId === "inventario" ? "bg-[var(--data-warning)] text-white" :
    moduleId === "fiados" ? "bg-[var(--data-warning)] text-white" :
    moduleId === "compras" ? "bg-[var(--accent)] text-white" :
    "bg-gray-500 text-white";

  return (
    <span
      className={cn(
        "ml-1 inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full text-[length:var(--ts-2xs)] font-bold leading-none transition-transform",
        colorClass,
        pulse && "animate-sidebar-badge-pulse",
      )}
      aria-live="polite"
    >
      {count > 99 ? "99+" : count}
      <style jsx>{`
        @keyframes sidebar-badge-pulse {
          0% { transform: scale(1); }
          30% { transform: scale(1.25); }
          60% { transform: scale(0.95); }
          100% { transform: scale(1); }
        }
        .animate-sidebar-badge-pulse {
          animation: sidebar-badge-pulse 600ms ease-out 3;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-sidebar-badge-pulse { animation: none; }
        }
      `}</style>
    </span>
  );
}

// ─── Sub-component: Module Item ───────────────────────────────────────────────

interface ModuleItemProps {
  module: SidebarModule;
  isActive: boolean;
  activeTab: string;
  collapsed: boolean;
  onModuleChange: (id: string) => void;
  onTabChange: (id: string) => void;
  badgeCount?: number;
  editMode?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

function ModuleItem({
  module,
  isActive,
  activeTab,
  collapsed,
  onModuleChange,
  onTabChange,
  badgeCount,
  editMode,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: ModuleItemProps) {
  const Icon = module.icon;
  const hasMultipleTabs = module.tabs.length > 1;
  const description = MODULE_DESCRIPTIONS[module.id];
  const {
    tooltipVisible,
    anchorRect,
    onMouseEnter,
    onMouseLeave,
    setAnchorRef,
  } = useModuleTooltip({ isActive, collapsed });

  function handleClick() {
    onModuleChange(module.id);
    onTabChange(module.tabs[0].id);
  }

  return (
    <div
      className="w-full relative"
      ref={setAnchorRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <ModuleTooltip
        icon={Icon}
        label={module.label}
        description={description}
        anchorRect={anchorRect}
        visible={tooltipVisible}
      />
      {/* Module row */}
      <button
        onClick={handleClick}
        title={collapsed ? module.label : undefined}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-[var(--dur-base)] group relative",
          isActive
            ? "bg-[var(--accent)]/10 text-[var(--accent)]"
            : "text-[var(--text-secondary)] hover:bg-gray-100"
        )}
      >
        {/* Active indicator bar */}
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[var(--accent)] rounded-r-full" />
        )}

        <Icon
          className={cn(
            "shrink-0 transition-colors",
            collapsed ? "h-5 w-5" : "h-4.5 w-4.5",
            isActive
              ? "text-[var(--accent)]"
              : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"
          )}
        />

        {!collapsed && (
          <>
            <span
              className="flex-1 text-left text-sm font-medium leading-tight truncate"
              title={module.label}
            >
              {module.label}
            </span>
            {/* Mejora 19: Badge de pendientes para documentos */}
            {badgeCount != null && badgeCount > 0 && (
              <SidebarBadge moduleId={module.id} count={badgeCount} />
            )}
            {editMode && (
              <div className="flex items-center gap-0.5 ml-1 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }}
                  disabled={!canMoveUp}
                  className={cn(
                    "p-0.5 rounded transition-colors",
                    canMoveUp
                      ? "text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10"
                      : "text-[var(--text-tertiary)] cursor-not-allowed"
                  )}
                  title="Subir"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }}
                  disabled={!canMoveDown}
                  className={cn(
                    "p-0.5 rounded transition-colors",
                    canMoveDown
                      ? "text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10"
                      : "text-[var(--text-tertiary)] cursor-not-allowed"
                  )}
                  title="Bajar"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {!editMode && hasMultipleTabs && (
              <m.div
                animate={{ rotate: isActive ? 90 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
              </m.div>
            )}
          </>
        )}
      </button>

      {/* Sub-tabs (solo cuando esta expandido y modulo activo) */}
      {!collapsed && hasMultipleTabs && (
        <AnimatePresence initial={false}>
          {isActive && (
            <m.div
              key="subtabs"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="ml-6 mt-0.5 mb-1 border-l border-[var(--rule-base)] pl-3 space-y-0.5">
                {module.tabs.map((tab) => {
                  const isTabActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => onTabChange(tab.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all duration-[var(--dur-fast)]",
                        isTabActive
                          ? "bg-[var(--accent)]/10 text-[var(--accent)] font-semibold"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-gray-100"
                      )}
                    >
                      <span
                        className={cn(
                          "shrink-0 h-1.5 w-1.5 rounded-full",
                          isTabActive
                            ? "bg-[var(--accent)]"
                            : "bg-gray-300"
                        )}
                      />
                      <span className="truncate" title={tab.label}>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </m.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

// ─── FlyoutPanel (aparece al lado derecho al hacer hover en categoría) ─────────

interface FlyoutPanelProps {
  category: ModuleGroup;
  modules: SidebarModule[];
  anchorTop: number;
  sidebarWidth: number;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  activeModule: string;
  onModuleChange: (id: string) => void;
  onTabChange: (id: string) => void;
  badges: Record<string, number>;
}

function FlyoutPanel({
  category, modules, anchorTop, sidebarWidth,
  onHoverStart, onHoverEnd,
  activeModule, onModuleChange, onTabChange, badges,
}: FlyoutPanelProps) {
  const col = GROUP_COLORS[category];
  const Icon = GROUP_ICONS[category];
  // Clamp to viewport
  const maxTop = typeof window !== "undefined" ? window.innerHeight - 320 : 200;
  const top = Math.min(Math.max(8, anchorTop), maxTop);

  return (
    <m.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="fixed z-300 bg-white border border-[var(--rule-base)] rounded-xl shadow-[var(--shadow-md)] overflow-hidden"
      style={{ left: sidebarWidth + 8, top, width: 240 }}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
    >
      {/* Cabecera de categoría */}
      <div className={cn("px-3 py-2.5 flex items-center gap-2.5 border-b border-[var(--rule-soft)]", col.bg)}>
        <div className={cn("h-6 w-6 rounded-lg flex items-center justify-center", col.bg, col.border, "border")}>
          <Icon className={cn("h-3.5 w-3.5", col.icon)} />
        </div>
        <span className={cn("text-[length:var(--ts-2xs)] font-bold", col.icon)}>
          {GROUP_LABELS[category]}
        </span>
      </div>
      {/* Lista de módulos */}
      <div className="p-2 space-y-0.5 max-h-80 overflow-y-auto">
        {modules.map(mod => {
          const Ic = mod.icon;
          const isActive = mod.id === activeModule;
          const badge = badges[mod.id];
          return (
            <button
              key={mod.id}
              onClick={() => { onModuleChange(mod.id); onTabChange(mod.tabs[0].id); }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all",
                isActive
                  ? "bg-[var(--accent)]/10 text-[var(--accent)] font-semibold"
                  : "text-[var(--text-secondary)] hover:bg-gray-100"
              )}
            >
              <Ic className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left text-xs truncate">{mod.label}</span>
              {badge > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold bg-[var(--data-error)] text-white min-w-4 text-center">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
              {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" />}
            </button>
          );
        })}
      </div>
    </m.div>
  );
}

// ─── CategorySection (categoría con acordeón al hacer click) ─────────────────

interface CategorySectionProps {
  group: ModuleGroup;
  modules: SidebarModule[];
  isOpen: boolean;
  onToggle: () => void;
  onHoverStart: (top: number) => void;
  onHoverEnd: () => void;
  isCollapsed: boolean;
  isMobile: boolean;
  activeModule: string;
  activeTab: string;
  onModuleChange: (id: string) => void;
  onTabChange: (id: string) => void;
  badges: Record<string, number>;
  editMode: boolean;
  moduleIndexMap: Map<string, number>;
  totalModules: number;
  onMoveModule: (id: string, dir: "up" | "down") => void;
}

function CategorySection({
  group, modules, isOpen, onToggle, onHoverStart, onHoverEnd,
  isCollapsed, isMobile, activeModule, activeTab,
  onModuleChange, onTabChange, badges,
  editMode, moduleIndexMap, totalModules, onMoveModule,
}: CategorySectionProps) {
  // Regla: el menu de categoria NUNCA se expande verticalmente en desktop —
  // usa el FlyoutPanel lateral (position: fixed, renderizado fuera del arbol del
  // sidebar para no ser recortado por overflow). En mobile no hay hover, asi que
  // mantenemos el acordeon tradicional como fallback accesible.
  const allowAccordion = isMobile;
  const accordionOpen = allowAccordion && isOpen;
  const col = GROUP_COLORS[group];
  const Icon = GROUP_ICONS[group];
  const isAnyActive = modules.some(m => m.id === activeModule);
  const headerRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      {/* Cabecera de categoría - Clic expande, Hover flyout */}
      <div
        ref={headerRef}
        onMouseEnter={() => {
          const rect = headerRef.current?.getBoundingClientRect();
          if (rect) onHoverStart(rect.top);
        }}
        onMouseLeave={onHoverEnd}
      >
        <button
          onClick={allowAccordion ? onToggle : undefined}
          className={cn(
            "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all group",
            allowAccordion ? "cursor-pointer" : "cursor-default",
            isAnyActive
              ? "bg-[var(--accent)]/10"
              : "hover:bg-gray-50"
          )}
        >
          {/* Icono de categoría con color */}
          <div className={cn(
            "h-7 w-7 rounded-lg flex items-center justify-center shrink-0 transition-all",
            accordionOpen || isAnyActive ? cn(col.bg, "border", col.border) : "bg-gray-100"
          )}>
            <Icon className={cn(
              "h-3.5 w-3.5 transition-colors",
              accordionOpen || isAnyActive ? col.icon : "text-[var(--text-tertiary)] group-hover:" + col.icon
            )} />
          </div>

          {!isCollapsed && (
            <>
              <div className="flex-1 text-left min-w-0">
                <span className={cn(
                  "text-xs font-bold block",
                  isAnyActive
                    ? "text-[var(--accent)]"
                    : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"
                )}>
                  {GROUP_LABELS[group]}
                </span>
                <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                  {modules.length} módulo{modules.length !== 1 ? "s" : ""}
                </span>
              </div>
              {/* Chevron: rotado cuando el acordeon está abierto (solo mobile) */}
              <m.div animate={{ rotate: accordionOpen ? 90 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronRight className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-colors",
                  accordionOpen || isAnyActive ? col.icon : "text-[var(--text-tertiary)]"
                )} />
              </m.div>
            </>
          )}
        </button>
      </div>

      {/* Acordeón: solo en mobile (desktop usa flyout en hover) */}
      {!isCollapsed && allowAccordion && (
        <AnimatePresence initial={false}>
          {accordionOpen && (
            <m.div
              key={`cat-${group}`}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="ml-3.5 mt-0.5 mb-1.5 pl-3 border-l-2 space-y-0.5"
                style={{ borderColor: `color-mix(in srgb, ${group === 'operaciones' ? '#3b82f6' : group === 'gestion' ? '#f59e0b' : group === 'finanzas' ? '#10b981' : group === 'documentos' ? '#8b5cf6' : group === 'inteligencia' ? '#ec4899' : '#6b7280'} 40%, transparent)` }}>
                {modules.map((module) => {
                  const globalIdx = moduleIndexMap.get(module.id) ?? 0;
                  return (
                    <ModuleItem
                      key={module.id}
                      module={module}
                      isActive={activeModule === module.id}
                      activeTab={activeTab}
                      collapsed={false}
                      onModuleChange={onModuleChange}
                      onTabChange={onTabChange}
                      badgeCount={badges[module.id]}
                      editMode={editMode}
                      onMoveUp={() => onMoveModule(module.id, "up")}
                      onMoveDown={() => onMoveModule(module.id, "down")}
                      canMoveUp={globalIdx > 0}
                      canMoveDown={globalIdx < totalModules - 1}
                    />
                  );
                })}
              </div>
            </m.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminSidebar({
  modules,
  activeModule,
  activeTab,
  onModuleChange,
  onTabChange,
  collapsed,
  onToggleCollapse,
}: AdminSidebarProps) {
  // Si el padre pasa modulos propios, los usa; si no, usa los defaults
  const rawModules = modules ?? BASIC_SIDEBAR_MODULES;
  const { theme } = useTheme();
  const { tier, setTier, isModuleVisible, stats: tierStats, overrides, setModuleTier, resetOverrides } = useModuleTiers();
  const [mobileOpen, setMobileOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [editMode, setEditMode] = useState(false);
  const [search, setSearch] = useState("");

  // Categorías abiertas (acordeón) — SOLO MOBILE.
  // Desktop usa flyout lateral exclusivo (no expand vertical). La categoría
  // activa se resalta pero NO despliega sub-items hacia abajo.
  const [openCategories, setOpenCategories] = useState<Set<ModuleGroup>>(() => new Set());

  // Flyout lateral
  const [flyout, setFlyout] = useState<{ category: ModuleGroup; top: number } | null>(null);
  const flyoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [moduleOrder, setModuleOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return rawModules.map(m => m.id);
    try {
      const saved = localStorage.getItem("sidebar-order");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* ignore */ }
    return rawModules.map(m => m.id);
  });

  // Reorder modules by saved order, keeping any new modules at the end
  const basicModules = React.useMemo(() => {
    const moduleMap = new Map(rawModules.map(m => [m.id, m]));
    const ordered: SidebarModule[] = [];
    for (const id of moduleOrder) {
      const mod = moduleMap.get(id);
      if (mod) {
        ordered.push(mod);
        moduleMap.delete(id);
      }
    }
    // Append any modules not in the saved order
    for (const mod of moduleMap.values()) {
      ordered.push(mod);
    }
    // Filter by tier visibility
    return ordered.filter(m => isModuleVisible(m.id));
  }, [rawModules, moduleOrder, isModuleVisible]);

  const moveModule = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= basicModules.length) return;
    const newOrder = basicModules.map(m => m.id);
    [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
    setModuleOrder(newOrder);
    localStorage.setItem("sidebar-order", JSON.stringify(newOrder));
  };

  // Toggle de categoría (acordeón)
  const toggleCategory = (group: ModuleGroup) => {
    setOpenCategories(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  // Cuando el módulo activo cambia, abrir su categoría automáticamente
  useEffect(() => {
    const found = basicModules.find(m => m.id === activeModule);
    if (found?.group) {
      setOpenCategories(prev => new Set([...prev, found.group!]));
    }
  }, [activeModule, basicModules]);

  // Handlers para el flyout
  const openFlyout = (category: ModuleGroup, top: number) => {
    if (flyoutTimerRef.current) clearTimeout(flyoutTimerRef.current);
    setFlyout({ category, top });
  };
  const closeFlyoutDelayed = () => {
    flyoutTimerRef.current = setTimeout(() => setFlyout(null), 150);
  };
  const keepFlyoutOpen = () => {
    if (flyoutTimerRef.current) clearTimeout(flyoutTimerRef.current);
  };

  // Módulos agrupados por categoría
  const groupedModules = React.useMemo(() => {
    const map: Partial<Record<ModuleGroup, SidebarModule[]>> = {};
    for (const mod of basicModules) {
      if (!mod.group) continue;
      if (!map[mod.group]) map[mod.group] = [];
      map[mod.group]!.push(mod);
    }
    return map;
  }, [basicModules]);

  // Índice global de cada módulo para el reordenamiento
  const moduleIndexMap = React.useMemo(() => {
    return new Map(basicModules.map((m, i) => [m.id, i]));
  }, [basicModules]);

  // Función de moveModule que toma moduleId (nueva versión para CategorySection)
  const moveModuleById = (moduleId: string, dir: "up" | "down") => {
    const idx = moduleIndexMap.get(moduleId);
    if (idx !== undefined) moveModule(idx, dir);
  };

  // Mejora 19 + Mejora 2: Badges de pendientes para todos los modulos
  const [docBadges, setDocBadges] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    async function fetchDocBadges() {
      try {
        // Fetch doc-badges + stats in parallel for comprehensive badge data
        const [docRes, statsRes] = await Promise.all([
          fetch("/api/admin/doc-badges", { credentials: "include" }).catch(() => null),
          fetch("/api/admin/stats", { credentials: "include" }).catch(() => null),
        ]);
        if (cancelled) return;
        const badges: Record<string, number> = {};
        if (docRes?.ok) {
          const data = await docRes.json();
          Object.assign(badges, data ?? {});
        }
        if (statsRes?.ok) {
          const stats = await statsRes.json();
          if (stats?.pendingOrders > 0) badges["pedidos"] = stats.pendingOrders;
          if (stats?.lowStockProducts > 0) badges["inventario"] = stats.lowStockProducts;
          if (stats?.overduePayables > 0) badges["compras"] = stats.overduePayables;
        }
        // Fetch fiados vencidos para badge de Fiados
        try {
          const fiadosRes = await fetch("/api/fiados?status=ACTIVO", { credentials: "include" });
          if (fiadosRes?.ok) {
            const fiadosData = await fiadosRes.json();
            const arr = Array.isArray(fiadosData) ? fiadosData : [];
            const vencidos = arr.filter((f: any) => f.fechaVence && new Date(f.fechaVence) < new Date()).length;
            const activos = arr.length;
            if (vencidos > 0) badges["fiados"] = vencidos;
            else if (activos > 0) badges["fiados"] = activos;
          }
        } catch {}
        setDocBadges(badges);
      } catch { /* silent -- graceful degradation */ }
    }
    fetchDocBadges();
    const interval = setInterval(fetchDocBadges, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Filtered modules for search
  const searchResults = React.useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const results: Array<{ module: SidebarModule; matchedTabs: typeof basicModules[0]["tabs"] }> = [];
    for (const mod of basicModules) {
      if (mod.id === CONFIG_SIDEBAR_MODULE.id) continue;
      const modMatches = mod.label.toLowerCase().includes(q);
      const matchedTabs = mod.tabs.filter(t => t.label.toLowerCase().includes(q));
      if (modMatches || matchedTabs.length > 0) {
        results.push({ module: mod, matchedTabs: modMatches ? mod.tabs : matchedTabs });
      }
    }
    return results;
  }, [search, basicModules]);

  function handleTabChange(tabId: string) {
    onTabChange(tabId);
    setMobileOpen(false);
  }

  function handleModuleChange(moduleId: string) {
    onModuleChange(moduleId);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const sidebarContent = (isMobile = false) => {
    const isCollapsed = collapsed && !isMobile;
    return (
      <div
        className={cn(
          "flex flex-col h-full bg-white border-r border-[var(--rule-base)]",
          "transition-all duration-[var(--dur-base)]",
          isMobile ? "w-72" : isCollapsed ? "w-16" : "w-70"
        )}
      >
        {/* Header: toggle + logo */}
        <div
          className={cn(
            "flex items-center h-16 px-3 border-b border-[var(--rule-base)] shrink-0",
            isCollapsed ? "justify-center" : "gap-3"
          )}
        >
          <button
            onClick={isMobile ? () => setMobileOpen(false) : onToggleCollapse}
            className="p-2 rounded-lg text-[var(--text-secondary)] hover:bg-gray-100 transition-colors shrink-0"
            aria-label="Toggle sidebar"
          >
            {isMobile ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>

          {!isCollapsed && (
            <m.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-2 min-w-0"
            >
              <div className="h-7 w-7 rounded-lg bg-[var(--accent)] flex items-center justify-center shrink-0">
                <span className="text-white text-xs font-bold">B</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--text-primary)] truncate leading-tight">
                  Buleje
                </p>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate leading-tight">
                  Panel Admin
                </p>
              </div>
            </m.div>
          )}
        </div>

        {/* User info */}
        <div
          className={cn(
            "flex items-center px-3 py-3 border-b border-[var(--rule-soft)] shrink-0",
            isCollapsed ? "justify-center" : "gap-3"
          )}
        >
          <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-white" />
          </div>
          {!isCollapsed && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="min-w-0"
            >
              <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                Administrador
              </p>
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">
                Admin General
              </p>
            </m.div>
          )}
        </div>

        {/* Tier Selector */}
        {!isCollapsed ? (
          <div className="px-3 pt-2 shrink-0">
            <TierSelector
              tier={tier}
              onTierChange={setTier}
              stats={{ visible: tierStats.visible, total: tierStats.total }}
              overrides={overrides}
              onModuleTierChange={setModuleTier}
              onResetOverrides={resetOverrides}
            />
          </div>
        ) : (
          <div className="px-2 pt-2 shrink-0">
            <TierSelector tier={tier} onTierChange={setTier} collapsed overrides={overrides} onModuleTierChange={setModuleTier} onResetOverrides={resetOverrides} />
          </div>
        )}

        {/* Ordenar button */}
        {!isCollapsed && (
          <div className="px-3 pt-2 shrink-0">
            <button
              onClick={() => setEditMode(e => !e)}
              className={cn(
                "w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                editMode
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-gray-100 border border-[var(--rule-base)]"
              )}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {editMode ? "Listo" : "Ordenar"}
            </button>
          </div>
        )}

        {/* Search input */}
        {!isCollapsed && (
          <div className="px-3 pb-1 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)] pointer-events-none" />
              <input
                type="search"
                placeholder="Buscar módulo..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full h-8 pl-8 pr-8 text-xs rounded-lg border border-[var(--rule-base)] bg-gray-50 focus:outline-none focus:ring-1 focus:ring-[var(--accent)] focus:border-[var(--accent)] placeholder:text-[var(--text-tertiary)] text-[var(--text-primary)]"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Navigation con categorías */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin scrollbar-thumb-gray-200">
          {searchResults !== null ? (
            /* Resultados de búsqueda */
            <div className="space-y-0.5">
              {searchResults.length === 0 ? (
                <p className="text-xs text-[var(--text-tertiary)] text-center py-6">
                  Sin resultados para &ldquo;{search}&rdquo;
                </p>
              ) : (
                searchResults.map(({ module, matchedTabs }) => (
                  <ModuleItem
                    key={module.id}
                    module={{ ...module, tabs: matchedTabs }}
                    isActive={activeModule === module.id}
                    activeTab={activeTab}
                    collapsed={false}
                    onModuleChange={handleModuleChange}
                    onTabChange={isMobile ? handleTabChange : onTabChange}
                    badgeCount={docBadges[module.id]}
                    editMode={false}
                  />
                ))
              )}
            </div>
          ) : editMode ? (
            /* Modo edición: lista plana con botones de reordenamiento */
            <div className="space-y-0.5">
              {basicModules.map((module, idx) => (
                <ModuleItem
                  key={module.id}
                  module={module}
                  isActive={activeModule === module.id}
                  activeTab={activeTab}
                  collapsed={isCollapsed}
                  onModuleChange={handleModuleChange}
                  onTabChange={isMobile ? handleTabChange : onTabChange}
                  badgeCount={docBadges[module.id]}
                  editMode={true}
                  onMoveUp={() => moveModule(idx, "up")}
                  onMoveDown={() => moveModule(idx, "down")}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < basicModules.length - 1}
                />
              ))}
            </div>
          ) : isCollapsed ? (
            /* Modo colapsado: solo iconos de categoría con flyout en hover */
            <div className="space-y-1">
              {GROUP_ORDER.map(group => {
                const mods = groupedModules[group];
                if (!mods || mods.length === 0) return null;
                const col = GROUP_COLORS[group];
                const Icon = GROUP_ICONS[group];
                const isAnyActive = mods.some(m => m.id === activeModule);
                return (
                  <div
                    key={group}
                    className="relative"
                    onMouseEnter={() => {
                      const el = document.getElementById(`cat-icon-${group}`);
                      const rect = el?.getBoundingClientRect();
                      if (rect) openFlyout(group, rect.top);
                    }}
                    onMouseLeave={closeFlyoutDelayed}
                  >
                    <button
                      id={`cat-icon-${group}`}
                      title={GROUP_LABELS[group]}
                      className={cn(
                        "w-full flex items-center justify-center p-2 rounded-xl transition-all cursor-default",
                        isAnyActive
                          ? "bg-[var(--accent)]/10"
                          : "hover:bg-gray-100"
                      )}
                    >
                      <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center", isAnyActive ? cn(col.bg, "border", col.border) : "bg-gray-100")}>
                        <Icon className={cn("h-3.5 w-3.5", isAnyActive ? col.icon : "text-[var(--text-tertiary)]")} />
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Modo expandido: categorías con acordeón */
            <div className="space-y-1">
              {GROUP_ORDER.map(group => {
                const mods = groupedModules[group];
                if (!mods || mods.length === 0) return null;
                return (
                  <CategorySection
                    key={group}
                    group={group}
                    modules={mods}
                    isOpen={openCategories.has(group)}
                    onToggle={() => toggleCategory(group)}
                    onHoverStart={(top) => openFlyout(group, top)}
                    onHoverEnd={closeFlyoutDelayed}
                    isCollapsed={false}
                    isMobile={isMobile}
                    activeModule={activeModule}
                    activeTab={activeTab}
                    onModuleChange={handleModuleChange}
                    onTabChange={isMobile ? handleTabChange : onTabChange}
                    badges={docBadges}
                    editMode={false}
                    moduleIndexMap={moduleIndexMap}
                    totalModules={basicModules.length}
                    onMoveModule={moveModuleById}
                  />
                );
              })}
            </div>
          )}
        </nav>

        {/* Config + Logout al fondo */}
        <div className="shrink-0 border-t border-[var(--rule-base)]">
          {/* Bridge: Ver experiencia cliente (ENRICH-5) */}
          <div className="px-2 pt-2">
            <a
              href="/marketplace"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl",
                "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
                "hover:text-[var(--accent)] transition-all duration-200 group",
                isCollapsed ? "justify-center" : ""
              )}
              title={isCollapsed ? "Ver experiencia cliente" : undefined}
            >
              <StoreIcon className="h-4.5 w-4.5 shrink-0" />
              {!isCollapsed && (
                <span className="text-sm font-medium flex-1">Ver como cliente</span>
              )}
              {!isCollapsed && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />}
            </a>
          </div>

          {/* Separador config */}
          <div className="px-2 pt-2">
            <ModuleItem
              module={CONFIG_SIDEBAR_MODULE}
              isActive={activeModule === CONFIG_SIDEBAR_MODULE.id}
              activeTab={activeTab}
              collapsed={isCollapsed}
              onModuleChange={handleModuleChange}
              onTabChange={isMobile ? handleTabChange : onTabChange}
            />
          </div>

          {/* Logout */}
          <div className="px-2 pb-3 pt-1">
            <button
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl",
                "text-[var(--text-secondary)] hover:bg-[var(--data-error-50)]",
                "hover:text-[var(--data-error)] transition-all duration-[var(--dur-base)] group",
                isCollapsed ? "justify-center" : ""
              )}
              title={isCollapsed ? "Cerrar sesion" : undefined}
            >
              <LogOut className="h-4.5 w-4.5 shrink-0" />
              {!isCollapsed && (
                <span className="text-sm font-medium">Cerrar sesion</span>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <div className="hidden md:flex h-full shrink-0" data-sidebar="">
        <m.div
          animate={{ width: collapsed ? 64 : 280 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="h-full overflow-hidden"
          style={{ minWidth: collapsed ? 64 : 280 }}
        >
          {sidebarContent(false)}
        </m.div>
      </div>

      {/* ── Mobile: boton de apertura ── */}
      <button
        onClick={() => setMobileOpen(true)}
        className={cn(
          "md:hidden fixed top-4 left-4 z-40 p-2.5 rounded-xl",
          "bg-white border border-[var(--rule-base)]",
          "text-[var(--text-primary)] active:scale-95 transition-transform"
        )}
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* ── Mobile: overlay sidebar ── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <m.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
              ref={overlayRef}
            />
            <m.div
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="md:hidden fixed inset-y-0 left-0 z-50 h-full"
              data-sidebar=""
            >
              {sidebarContent(true)}
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* Flyout lateral (aparece a la derecha al hacer hover en una categoría) */}
      <AnimatePresence>
        {flyout && !mobileOpen && (
          <FlyoutPanel
            key={flyout.category}
            category={flyout.category}
            modules={groupedModules[flyout.category] ?? []}
            anchorTop={flyout.top}
            sidebarWidth={collapsed ? 64 : 280}
            onHoverStart={keepFlyoutOpen}
            onHoverEnd={closeFlyoutDelayed}
            activeModule={activeModule}
            onModuleChange={(id) => { handleModuleChange(id); setFlyout(null); }}
            onTabChange={(id) => { onTabChange(id); setFlyout(null); }}
            badges={docBadges}
          />
        )}
      </AnimatePresence>
    </>
  );
}
