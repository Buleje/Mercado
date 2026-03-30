"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/theme-context";
import ModuleTooltip, { useModuleTooltip } from "@/components/admin/ModuleTooltip";
import { MODULE_DESCRIPTIONS } from "@/lib/module-descriptions";

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
  operaciones: { icon: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-200 dark:border-blue-800/40" },
  gestion:     { icon: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-200 dark:border-amber-800/40" },
  finanzas:    { icon: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-800/40" },
  documentos:  { icon: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-900/20", border: "border-purple-200 dark:border-purple-800/40" },
  inteligencia:{ icon: "text-pink-500", bg: "bg-pink-50 dark:bg-pink-900/20", border: "border-pink-200 dark:border-pink-800/40" },
  config:      { icon: "text-gray-500", bg: "bg-gray-100 dark:bg-gray-800/50", border: "border-gray-200 dark:border-gray-700/50" },
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
  {
    id: "ventas-caja",
    label: "Ventas & Caja",
    icon: ShoppingCart,
    group: "operaciones",
    tabs: [
      { id: "pos", label: "Punto de venta" },
      { id: "caja-registradora", label: "Caja" },
      { id: "arqueo", label: "Arqueo de caja" },
      { id: "pedidos", label: "Pedidos" },
      { id: "cuentas-cobrar", label: "Me deben (fiao)" },
    ],
  },
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
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative",
          isActive
            ? "bg-[#0f766e]/10 dark:bg-[#0f766e]/20 text-[#0f766e] dark:text-emerald-400"
            : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5"
        )}
      >
        {/* Active indicator bar */}
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#0f766e] rounded-r-full" />
        )}

        <Icon
          className={cn(
            "shrink-0 transition-colors",
            collapsed ? "h-5 w-5" : "h-[18px] w-[18px]",
            isActive
              ? "text-[#0f766e] dark:text-emerald-400"
              : "text-gray-500 dark:text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300"
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
              <span className={cn(
                "ml-1 inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full text-[10px] font-bold leading-none",
                module.id === "pedidos" ? "bg-red-500 text-white" :
                module.id === "inventario" ? "bg-amber-500 text-white" :
                module.id === "fiados" ? "bg-orange-500 text-white" :
                module.id === "compras" ? "bg-blue-500 text-white" :
                "bg-gray-500 text-white"
              )}>
                {badgeCount > 99 ? "99+" : badgeCount}
              </span>
            )}
            {editMode && (
              <div className="flex items-center gap-0.5 ml-1 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }}
                  disabled={!canMoveUp}
                  className={cn(
                    "p-0.5 rounded transition-colors",
                    canMoveUp
                      ? "text-gray-500 hover:text-[#0f766e] hover:bg-[#0f766e]/10"
                      : "text-gray-300 dark:text-gray-600 cursor-not-allowed"
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
                      ? "text-gray-500 hover:text-[#0f766e] hover:bg-[#0f766e]/10"
                      : "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                  )}
                  title="Bajar"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {!editMode && hasMultipleTabs && (
              <motion.div
                animate={{ rotate: isActive ? 90 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              </motion.div>
            )}
          </>
        )}
      </button>

      {/* Sub-tabs (solo cuando esta expandido y modulo activo) */}
      {!collapsed && hasMultipleTabs && (
        <AnimatePresence initial={false}>
          {isActive && (
            <motion.div
              key="subtabs"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="ml-6 mt-0.5 mb-1 border-l border-gray-200 dark:border-white/10 pl-3 space-y-0.5">
                {module.tabs.map((tab) => {
                  const isTabActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => onTabChange(tab.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all duration-150",
                        isTabActive
                          ? "bg-[#0f766e]/10 dark:bg-[#0f766e]/20 text-[#0f766e] dark:text-emerald-400 font-semibold"
                          : "text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5"
                      )}
                    >
                      <span
                        className={cn(
                          "shrink-0 h-1.5 w-1.5 rounded-full",
                          isTabActive
                            ? "bg-[#0f766e] dark:bg-emerald-400"
                            : "bg-gray-300 dark:bg-gray-600"
                        )}
                      />
                      <span className="truncate" title={tab.label}>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
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
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.16 }}
      className="fixed z-[300] bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl overflow-hidden"
      style={{ left: sidebarWidth + 8, top, width: 240 }}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
    >
      {/* Cabecera de categoría */}
      <div className={cn("px-3 py-2.5 flex items-center gap-2.5 border-b border-gray-100 dark:border-white/5", col.bg)}>
        <div className={cn("h-6 w-6 rounded-lg flex items-center justify-center", col.bg, col.border, "border")}>
          <Icon className={cn("h-3.5 w-3.5", col.icon)} />
        </div>
        <span className={cn("text-[10px] font-bold uppercase tracking-widest", col.icon)}>
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
                  ? "bg-[#0f766e]/10 dark:bg-[#0f766e]/20 text-[#0f766e] dark:text-emerald-400 font-semibold"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5"
              )}
            >
              <Ic className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left text-xs truncate">{mod.label}</span>
              {badge > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-500 text-white min-w-4 text-center">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
              {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#0f766e] dark:bg-emerald-400 shrink-0" />}
            </button>
          );
        })}
      </div>
    </motion.div>
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
  isCollapsed, activeModule, activeTab,
  onModuleChange, onTabChange, badges,
  editMode, moduleIndexMap, totalModules, onMoveModule,
}: CategorySectionProps) {
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
          onClick={onToggle}
          className={cn(
            "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all group",
            isAnyActive
              ? "bg-[#0f766e]/10 dark:bg-[#0f766e]/20"
              : "hover:bg-gray-50 dark:hover:bg-white/5"
          )}
        >
          {/* Icono de categoría con color */}
          <div className={cn(
            "h-7 w-7 rounded-lg flex items-center justify-center shrink-0 transition-all",
            isOpen || isAnyActive ? cn(col.bg, "border", col.border) : "bg-gray-100 dark:bg-white/5"
          )}>
            <Icon className={cn(
              "h-3.5 w-3.5 transition-colors",
              isOpen || isAnyActive ? col.icon : "text-gray-400 dark:text-gray-500 group-hover:" + col.icon
            )} />
          </div>

          {!isCollapsed && (
            <>
              <div className="flex-1 text-left min-w-0">
                <span className={cn(
                  "text-xs font-bold uppercase tracking-wide block",
                  isAnyActive
                    ? "text-[#0f766e] dark:text-emerald-400"
                    : "text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300"
                )}>
                  {GROUP_LABELS[group]}
                </span>
                <span className="text-[9px] text-gray-400 dark:text-gray-500">
                  {modules.length} módulo{modules.length !== 1 ? "s" : ""}
                </span>
              </div>
              {/* Chevron rotado cuando está abierto */}
              <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronRight className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-colors",
                  isOpen || isAnyActive ? col.icon : "text-gray-300 dark:text-gray-600"
                )} />
              </motion.div>
            </>
          )}
        </button>
      </div>

      {/* Acordeón: módulos se despliegan hacia abajo al hacer clic */}
      {!isCollapsed && (
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
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
            </motion.div>
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [editMode, setEditMode] = useState(false);

  // Categorías abiertas (acordeón)
  const [openCategories, setOpenCategories] = useState<Set<ModuleGroup>>(() => {
    // Abrir la categoría que contiene el módulo activo al iniciar
    const found = BASIC_SIDEBAR_MODULES.find(m => m.id === activeModule);
    return new Set(found?.group ? [found.group] : ["operaciones"]);
  });

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
    return ordered;
  }, [rawModules, moduleOrder]);

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
          "flex flex-col h-full bg-white dark:bg-card border-r border-gray-200 dark:border-card-border",
          "transition-all duration-300",
          isMobile ? "w-72" : isCollapsed ? "w-16" : "w-[280px]"
        )}
      >
        {/* Header: toggle + logo */}
        <div
          className={cn(
            "flex items-center h-16 px-3 border-b border-gray-200 dark:border-card-border shrink-0",
            isCollapsed ? "justify-center" : "gap-3"
          )}
        >
          <button
            onClick={isMobile ? () => setMobileOpen(false) : onToggleCollapse}
            className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors shrink-0"
            aria-label="Toggle sidebar"
          >
            {isMobile ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>

          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-2 min-w-0"
            >
              <div className="h-7 w-7 rounded-lg bg-[#0f766e] flex items-center justify-center shrink-0">
                <span className="text-white text-xs font-bold">B</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 dark:text-white truncate leading-tight">
                  Buleje
                </p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate leading-tight">
                  Panel Admin
                </p>
              </div>
            </motion.div>
          )}
        </div>

        {/* User info */}
        <div
          className={cn(
            "flex items-center px-3 py-3 border-b border-gray-100 dark:border-white/5 shrink-0",
            isCollapsed ? "justify-center" : "gap-3"
          )}
        >
          <div className="h-8 w-8 rounded-full bg-[#f97316] flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-white" />
          </div>
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="min-w-0"
            >
              <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                Administrador
              </p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                Admin General
              </p>
            </motion.div>
          )}
        </div>

        {/* Ordenar button */}
        {!isCollapsed && (
          <div className="px-3 pt-2 shrink-0">
            <button
              onClick={() => setEditMode(e => !e)}
              className={cn(
                "w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                editMode
                  ? "bg-[#0f766e] text-white"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 border border-gray-200 dark:border-card-border"
              )}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {editMode ? "Listo" : "Ordenar"}
            </button>
          </div>
        )}

        {/* Navigation con categorías */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-white/10">
          {editMode ? (
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
                      onClick={() => toggleCategory(group)}
                      title={GROUP_LABELS[group]}
                      className={cn(
                        "w-full flex items-center justify-center p-2 rounded-xl transition-all",
                        isAnyActive
                          ? "bg-[#0f766e]/10 dark:bg-[#0f766e]/20"
                          : "hover:bg-gray-100 dark:hover:bg-white/5"
                      )}
                    >
                      <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center", isAnyActive ? cn(col.bg, "border", col.border) : "bg-gray-100 dark:bg-white/5")}>
                        <Icon className={cn("h-3.5 w-3.5", isAnyActive ? col.icon : "text-gray-400")} />
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
        <div className="shrink-0 border-t border-gray-200 dark:border-card-border">
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
                "text-gray-500 dark:text-gray-500 hover:bg-red-50 dark:hover:bg-red-900/10",
                "hover:text-red-600 dark:hover:text-red-400 transition-all duration-200 group",
                isCollapsed ? "justify-center" : ""
              )}
              title={isCollapsed ? "Cerrar sesion" : undefined}
            >
              <LogOut className="h-[18px] w-[18px] shrink-0" />
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
      <div className="hidden md:flex h-full shrink-0">
        <motion.div
          animate={{ width: collapsed ? 64 : 280 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="h-full overflow-hidden"
          style={{ minWidth: collapsed ? 64 : 280 }}
        >
          {sidebarContent(false)}
        </motion.div>
      </div>

      {/* ── Mobile: boton de apertura ── */}
      <button
        onClick={() => setMobileOpen(true)}
        className={cn(
          "md:hidden fixed top-4 left-4 z-40 p-2.5 rounded-xl",
          "bg-white dark:bg-card shadow-lg border border-gray-200 dark:border-card-border",
          "text-gray-700 dark:text-gray-300 active:scale-95 transition-transform"
        )}
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* ── Mobile: overlay sidebar ── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
              ref={overlayRef}
            />
            <motion.div
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="md:hidden fixed inset-y-0 left-0 z-50 h-full shadow-2xl"
            >
              {sidebarContent(true)}
            </motion.div>
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
