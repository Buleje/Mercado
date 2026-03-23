"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Tag,
  Truck,
  DollarSign,
  Store,
  Settings,
  ChevronRight,
  Menu,
  X,
  LogOut,
  User,
  Lock,
  BarChart3,
  Calculator,
  MapPin,
  Users,
  Megaphone,
  UserCog,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/theme-context";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SidebarModule {
  id: string;
  label: string;
  icon: LucideIcon;
  tabs: Array<{ id: string; label: string }>;
  isPro?: boolean;
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
    id: "inicio",
    label: "Inicio",
    icon: LayoutDashboard,
    tabs: [
      { id: "dashboard", label: "Panel principal" },
      { id: "configuracion", label: "Ajustes" },
    ],
  },
  {
    id: "ventas-caja",
    label: "Ventas & Caja",
    icon: ShoppingCart,
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
    tabs: [
      { id: "stock", label: "Mi stock" },
      { id: "lotes", label: "Vencimientos" },
      { id: "mermas", label: "Perdidas" },
      { id: "alertas-stock", label: "Alertas" },
    ],
  },
  {
    id: "productos",
    label: "Productos",
    icon: Tag,
    tabs: [
      { id: "productos", label: "Catalogo" },
      { id: "categorias", label: "Categorias" },
      { id: "promociones", label: "Ofertas" },
      { id: "cupones", label: "Cupones" },
    ],
  },
  {
    id: "compras",
    label: "Compras",
    icon: Truck,
    tabs: [
      { id: "ordenes-compra", label: "Pedidos a proveedor" },
      { id: "proveedores", label: "Mis proveedores" },
      { id: "recepcion", label: "Recepcion" },
      { id: "cuentas-pagar", label: "Les debo" },
    ],
  },
  {
    id: "plata",
    label: "Mi Plata",
    icon: DollarSign,
    tabs: [
      { id: "flujo-caja", label: "Plata que entra y sale" },
      { id: "gastos", label: "Gastos" },
      { id: "margenes", label: "Ganancias por producto" },
      { id: "reportes", label: "Reportes" },
      { id: "exportar", label: "Exportar a Excel" },
    ],
  },
  {
    id: "mi-tienda",
    label: "Mi Tienda",
    icon: Store,
    tabs: [
      { id: "delivery", label: "Delivery" },
      { id: "clientes", label: "Mis clientes" },
      { id: "resenas", label: "Opiniones" },
      { id: "fidelizacion", label: "Clientes frecuentes" },
      { id: "horarios", label: "Horarios" },
      { id: "pagina-inicio", label: "Mi pagina web" },
    ],
  },
];

// ─── Modulo de configuracion (siempre al fondo) ───────────────────────────────

export const CONFIG_SIDEBAR_MODULE: SidebarModule = {
  id: "config",
  label: "Configuracion",
  icon: Settings,
  tabs: [
    { id: "usuarios", label: "Usuarios" },
    { id: "roles", label: "Permisos" },
    { id: "equipo", label: "Mi equipo" },
    { id: "plan", label: "Mi plan" },
  ],
};

// ─── Modulos PRO (con candado visual) ─────────────────────────────────────────

export const PRO_SIDEBAR_MODULES: SidebarModule[] = [
  {
    id: "analytics",
    label: "Reportes avanzados",
    icon: BarChart3,
    tabs: [
      { id: "analytics-bi", label: "Business Intelligence" },
      { id: "proyecciones", label: "Proyecciones" },
    ],
    isPro: true,
  },
  {
    id: "finanzas-pro",
    label: "Contabilidad",
    icon: Calculator,
    tabs: [
      { id: "balance", label: "Balance" },
      { id: "facturacion", label: "Facturacion" },
    ],
    isPro: true,
  },
  {
    id: "logistica-pro",
    label: "Logistica",
    icon: MapPin,
    tabs: [
      { id: "rutas", label: "Rutas de reparto" },
      { id: "devoluciones", label: "Devoluciones" },
    ],
    isPro: true,
  },
  {
    id: "crm-pro",
    label: "CRM Clientes",
    icon: Users,
    tabs: [
      { id: "crm", label: "Vista 360" },
      { id: "encuestas", label: "Encuestas" },
    ],
    isPro: true,
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: Megaphone,
    tabs: [{ id: "campanas", label: "Campanas" }],
    isPro: true,
  },
  {
    id: "rrhh",
    label: "Personal",
    icon: UserCog,
    tabs: [{ id: "empleados", label: "Mis empleados" }],
    isPro: true,
  },
  {
    id: "automatizacion",
    label: "Automatizacion",
    icon: Zap,
    tabs: [{ id: "flujos", label: "Flujos automaticos" }],
    isPro: true,
  },
];

// ─── Sub-component: Pro Tooltip ───────────────────────────────────────────────

function ProTooltip({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -6 }}
          transition={{ duration: 0.15 }}
          className={cn(
            "absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50",
            "bg-gray-900 dark:bg-gray-800 text-white text-xs font-medium",
            "px-2.5 py-1.5 rounded-lg shadow-xl whitespace-nowrap pointer-events-none"
          )}
        >
          Disponible en Plan Pro
          {/* Arrow */}
          <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900 dark:border-r-gray-800" />
        </motion.div>
      )}
    </AnimatePresence>
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
}

function ModuleItem({
  module,
  isActive,
  activeTab,
  collapsed,
  onModuleChange,
  onTabChange,
}: ModuleItemProps) {
  const Icon = module.icon;
  const hasMultipleTabs = module.tabs.length > 1;
  const isPro = module.isPro === true;
  const [showProTooltip, setShowProTooltip] = useState(false);

  function handleClick() {
    if (isPro) {
      // No navega — solo muestra tooltip si esta colapsado
      return;
    }
    onModuleChange(module.id);
    onTabChange(module.tabs[0].id);
  }

  return (
    <div className="w-full relative">
      {/* Module row */}
      <button
        onClick={handleClick}
        onMouseEnter={() => isPro && setShowProTooltip(true)}
        onMouseLeave={() => setShowProTooltip(false)}
        title={collapsed && !isPro ? module.label : undefined}
        aria-disabled={isPro}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative",
          isPro
            ? "opacity-50 cursor-default text-gray-500 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5"
            : isActive
            ? "bg-[#2d6a4f]/10 dark:bg-[#2d6a4f]/20 text-[#2d6a4f] dark:text-emerald-400"
            : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5"
        )}
      >
        {/* Active indicator bar */}
        {isActive && !isPro && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#2d6a4f] rounded-r-full" />
        )}

        <Icon
          className={cn(
            "shrink-0 transition-colors",
            collapsed ? "h-5 w-5" : "h-[18px] w-[18px]",
            isPro
              ? "text-gray-400 dark:text-gray-600"
              : isActive
              ? "text-[#2d6a4f] dark:text-emerald-400"
              : "text-gray-500 dark:text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300"
          )}
        />

        {!collapsed && (
          <>
            <span className="flex-1 text-left text-sm font-medium leading-tight truncate">
              {module.label}
            </span>
            {isPro ? (
              <Lock className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-600" />
            ) : (
              hasMultipleTabs && (
                <motion.div
                  animate={{ rotate: isActive ? 90 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                </motion.div>
              )
            )}
          </>
        )}

        {/* Tooltip para modulos pro cuando esta colapsado */}
        {collapsed && <ProTooltip visible={showProTooltip} />}
      </button>

      {/* Tooltip cuando NO esta colapsado */}
      {!collapsed && (
        <AnimatePresence>
          {showProTooltip && isPro && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className={cn(
                "absolute left-3 -top-8 z-50",
                "bg-gray-900 dark:bg-gray-800 text-white text-xs font-medium",
                "px-2.5 py-1.5 rounded-lg shadow-xl whitespace-nowrap pointer-events-none"
              )}
            >
              Disponible en Plan Pro
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Sub-tabs (solo cuando esta expandido, modulo activo, y no es Pro) */}
      {!collapsed && hasMultipleTabs && !isPro && (
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
                          ? "bg-[#2d6a4f]/10 dark:bg-[#2d6a4f]/20 text-[#2d6a4f] dark:text-emerald-400 font-semibold"
                          : "text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5"
                      )}
                    >
                      <span
                        className={cn(
                          "shrink-0 h-1.5 w-1.5 rounded-full",
                          isTabActive
                            ? "bg-[#2d6a4f] dark:bg-emerald-400"
                            : "bg-gray-300 dark:bg-gray-600"
                        )}
                      />
                      <span className="truncate">{tab.label}</span>
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

// ─── Sub-component: Pro Section Divider ──────────────────────────────────────

function ProSectionDivider({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return (
      <div className="my-2 mx-2 border-t border-dashed border-gray-200 dark:border-white/10" />
    );
  }
  return (
    <div className="my-2 mx-2 flex items-center gap-2">
      <div className="flex-1 border-t border-dashed border-gray-200 dark:border-white/10" />
      <span className="flex items-center gap-1 text-[10px] font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-wider whitespace-nowrap">
        <Lock className="h-2.5 w-2.5" />
        Plan Pro
      </span>
      <div className="flex-1 border-t border-dashed border-gray-200 dark:border-white/10" />
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
  const basicModules = modules ?? BASIC_SIDEBAR_MODULES;
  const { theme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

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
              <div className="h-7 w-7 rounded-lg bg-[#2d6a4f] flex items-center justify-center shrink-0">
                <span className="text-white text-xs font-bold">B</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 dark:text-white truncate leading-tight">
                  Bodega San Martin
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
          <div className="h-8 w-8 rounded-full bg-[#f4a261] flex items-center justify-center shrink-0">
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

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-white/10">
          {/* Modulos basicos */}
          {basicModules.map((module) => (
            <ModuleItem
              key={module.id}
              module={module}
              isActive={activeModule === module.id}
              activeTab={activeTab}
              collapsed={isCollapsed}
              onModuleChange={handleModuleChange}
              onTabChange={isMobile ? handleTabChange : onTabChange}
            />
          ))}

          {/* Separador + modulos Pro */}
          <ProSectionDivider collapsed={isCollapsed} />

          {PRO_SIDEBAR_MODULES.map((module) => (
            <ModuleItem
              key={module.id}
              module={module}
              isActive={false}
              activeTab=""
              collapsed={isCollapsed}
              onModuleChange={() => {}}
              onTabChange={() => {}}
            />
          ))}
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
    </>
  );
}
