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
  Menu,
  X,
  LogOut,
  User,
  Users,
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
      { id: "kardex", label: "Kardex" },
      { id: "lotes", label: "Vencimientos" },
      { id: "mermas", label: "Pérdidas" },
      { id: "alertas-stock", label: "Alertas stock" },
    ],
  },
  {
    id: "productos",
    label: "Productos & Precios",
    icon: Tag,
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
    tabs: [
      { id: "ordenes-compra", label: "Pedidos a proveedor" },
      { id: "proveedores", label: "Mis proveedores" },
      { id: "recepcion", label: "Recepción" },
      { id: "cuentas-pagar", label: "Les debo" },
    ],
  },
  {
    id: "plata",
    label: "Mi Plata",
    icon: DollarSign,
    tabs: [
      { id: "pl", label: "Ingresos y egresos" },
      { id: "gastos", label: "Gastos" },
      { id: "rentabilidad", label: "Ganancias por producto" },
      { id: "reportes", label: "Reportes" },
      { id: "exportar", label: "Exportar a Excel" },
    ],
  },
  {
    id: "clientes",
    label: "Mis Clientes",
    icon: Users,
    tabs: [
      { id: "crm", label: "Mis clientes" },
      { id: "delivery", label: "Delivery" },
      { id: "resenas", label: "Opiniones" },
      { id: "fidelizacion", label: "Clientes frecuentes" },
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

  function handleClick() {
    onModuleChange(module.id);
    onTabChange(module.tabs[0].id);
  }

  return (
    <div className="w-full relative">
      {/* Module row */}
      <button
        onClick={handleClick}
        title={collapsed ? module.label : undefined}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative",
          isActive
            ? "bg-[#2d6a4f]/10 dark:bg-[#2d6a4f]/20 text-[#2d6a4f] dark:text-emerald-400"
            : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5"
        )}
      >
        {/* Active indicator bar */}
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#2d6a4f] rounded-r-full" />
        )}

        <Icon
          className={cn(
            "shrink-0 transition-colors",
            collapsed ? "h-5 w-5" : "h-[18px] w-[18px]",
            isActive
              ? "text-[#2d6a4f] dark:text-emerald-400"
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
            {hasMultipleTabs && (
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
