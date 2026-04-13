"use client";

import { useState, useEffect, useCallback, useMemo, type KeyboardEvent } from "react";
import { Search, ArrowRight, Clock, X, Command, Settings, Package, Users, Zap, DollarSign, Receipt, ShoppingCart, BarChart2, Inbox, Star, FlaskConical, TrendingUp, RefreshCw, Tag, FileText, UserPlus, LogIn, AlertTriangle, LayoutDashboard, Truck } from "lucide-react";
import { useRouter } from "next/navigation";

// ── Tipos admin quick-actions ────────────────────────────────────────────────
export type AdminRole = "admin" | "cajero" | "almacenero" | "vendedor" | "superadmin";
export type AdminQuickAction = {
  id: string;
  label: string;
  subtitle?: string;
  icon: React.ReactNode;
  href?: string;
  action?: () => void;
  roles: AdminRole[];
};

type SearchableItem = {
  id: string;
  type: "tab" | "product" | "customer" | "action";
  title: string;
  subtitle?: string;
  href?: string;
  action?: () => void;
  icon?: React.ReactNode;
  category: string;
};

const CATEGORY_CONFIG: Record<string, { icon: React.ReactNode; label: string; priority: number }> = {
  "Acciones": { icon: <Zap className="w-3.5 h-3.5" />, label: "Acciones", priority: 0 },
  "Navegación": { icon: <Settings className="w-3.5 h-3.5" />, label: "Modulos", priority: 1 },
  "Tienda": { icon: <Package className="w-3.5 h-3.5" />, label: "Tienda", priority: 2 },
  "Mi cuenta": { icon: <Users className="w-3.5 h-3.5" />, label: "Mi cuenta", priority: 3 },
  "Categorías": { icon: <Package className="w-3.5 h-3.5" />, label: "Categorías", priority: 4 },
  "Productos": { icon: <Package className="w-3.5 h-3.5" />, label: "Productos", priority: 5 },
  "Clientes": { icon: <Users className="w-3.5 h-3.5" />, label: "Clientes", priority: 6 },
};

const STORE_ITEMS: SearchableItem[] = [
  { id: "s-inicio", type: "action", title: "Inicio", category: "Tienda", href: "/" },
  { id: "s-buscar", type: "action", title: "Buscar productos", category: "Tienda", href: "/buscar" },
  { id: "s-tienda", type: "action", title: "Catálogo completo", category: "Tienda", href: "/tienda" },
  { id: "s-pedidos", type: "action", title: "Mis pedidos", category: "Mi cuenta", href: "/mis-pedidos" },
  { id: "s-cuenta", type: "action", title: "Mi cuenta", category: "Mi cuenta", href: "/cuenta" },
  { id: "s-cat-frutas", type: "action", title: "Frutas y Verduras", category: "Categorías", href: "/tienda/categoria/frutas-verduras" },
  { id: "s-cat-abarrotes", type: "action", title: "Abarrotes", category: "Categorías", href: "/tienda/categoria/abarrotes" },
  { id: "s-cat-carnes", type: "action", title: "Carnes", category: "Categorías", href: "/tienda/categoria/carnes" },
  { id: "s-cat-lacteos", type: "action", title: "Lácteos", category: "Categorías", href: "/tienda/categoria/lacteos" },
  { id: "s-cat-bebidas", type: "action", title: "Bebidas", category: "Categorías", href: "/tienda/categoria/bebidas" },
  { id: "s-cat-limpieza", type: "action", title: "Limpieza", category: "Categorías", href: "/tienda/categoria/limpieza" },
];

const ADMIN_TABS: SearchableItem[] = [
  { id: "dashboard", type: "tab", title: "Dashboard / Asistente IA", category: "Navegación", href: "/admin?tab=asistente-ia" },
  { id: "pos", type: "tab", title: "Pedidos", category: "Navegación", href: "/admin?tab=pedidos" },
  { id: "inventario", type: "tab", title: "Inventario", category: "Navegación", href: "/admin?tab=inventario" },
  { id: "pedidos", type: "tab", title: "Pedidos", category: "Navegación", href: "/admin?tab=pedidos" },
  { id: "clientes", type: "tab", title: "Clientes / CRM", category: "Navegación", href: "/admin?tab=clientes" },
  { id: "productos", type: "tab", title: "Productos & Precios", category: "Navegación", href: "/admin?tab=productos" },
  { id: "compras", type: "tab", title: "Compras", category: "Navegación", href: "/admin?tab=compras" },
  { id: "plata", type: "tab", title: "Mi Plata (Finanzas)", category: "Navegación", href: "/admin?tab=plata" },
  { id: "configuracion", type: "tab", title: "Configuración", category: "Navegación", href: "/admin?tab=config" },
  { id: "fiados", type: "tab", title: "Fiados", category: "Navegación", href: "/admin?tab=fiados" },
  { id: "turnos", type: "tab", title: "Turnos", category: "Navegación", href: "/admin?tab=turnos" },
];

// ── Admin Quick Actions (12) — filtrables por rol ────────────────────────────
export const ADMIN_QUICK_ACTIONS: AdminQuickAction[] = [
  { id: "a-crear-producto",  label: "Crear producto",       subtitle: "Agregar nuevo producto al inventario",      icon: <Package    className="w-4 h-4 text-blue-500"    />, href: "/admin?tab=productos&new=1",                 roles: ["admin", "almacenero"] },
  { id: "a-nueva-venta",     label: "Nueva venta",          subtitle: "Registrar un pedido nuevo",                  icon: <Zap        className="w-4 h-4 text-emerald-500" />, href: "/admin?tab=pedidos",                         roles: ["admin", "cajero"] },
  { id: "a-registrar-gasto", label: "Registrar gasto",      subtitle: "Ir a Mi Plata para registrar un gasto",    icon: <DollarSign className="w-4 h-4 text-red-500"     />, href: "/admin?tab=plata",                           roles: ["admin"] },
  { id: "a-cobrar-fiado",    label: "Cobrar fiado",         subtitle: "Gestionar cuentas por cobrar",              icon: <Receipt    className="w-4 h-4 text-amber-500"   />, href: "/admin?tab=fiados",                          roles: ["admin", "cajero"] },
  { id: "a-crear-oc",        label: "Crear OC",             subtitle: "Nueva orden de compra a proveedor",        icon: <ShoppingCart className="w-4 h-4 text-violet-500" />, href: "/admin?tab=compras",                        roles: ["admin", "almacenero"] },
  { id: "a-abrir-turno",     label: "Abrir turno",          subtitle: "Iniciar turno de caja",                    icon: <Clock      className="w-4 h-4 text-cyan-500"     />, href: "/admin?tab=turnos",                          roles: ["admin", "cajero"] },
  { id: "a-ver-reportes",    label: "Ver reportes",         subtitle: "Reportes financieros y analíticas",        icon: <BarChart2  className="w-4 h-4 text-indigo-500"   />, href: "/admin?tab=plata",                           roles: ["admin"] },
  { id: "a-cerrar-dia",      label: "Cerrar día",           subtitle: "Cierre diario de caja",                    icon: <Settings   className="w-4 h-4 text-gray-500"     />, href: "/admin?tab=turnos",                          roles: ["admin", "cajero"] },
  { id: "a-pedidos-hoy",     label: "Ver pedidos hoy",      subtitle: "Pedidos recibidos en el día",              icon: <ShoppingBasketIcon className="w-4 h-4 text-orange-500" />, href: "/admin?tab=pedidos&filter=today",      roles: ["admin", "cajero", "almacenero"] },
  { id: "a-nuevo-cliente",   label: "Nuevo cliente",        subtitle: "Registrar un nuevo cliente en el CRM",     icon: <UserPlus   className="w-4 h-4 text-blue-500"     />, href: "/admin?tab=clientes&new=1",                  roles: ["admin", "cajero"] },
  { id: "a-soporte",         label: "Reportar bug / soporte", subtitle: "Ir a la bandeja de soporte unificada",  icon: <Inbox      className="w-4 h-4 text-pink-500"      />, href: "/admin?tab=support-inbox",                  roles: ["admin"] },
  { id: "a-prediccion",      label: "Predicción de demanda", subtitle: "Ver forecasting de stock",               icon: <TrendingUp className="w-4 h-4 text-green-500"    />, href: "/admin?tab=forecasting",                     roles: ["admin", "almacenero"] },
];

// Convertir a SearchableItem para el motor de búsqueda existente
const QUICK_ACTIONS: SearchableItem[] = ADMIN_QUICK_ACTIONS.map((a) => ({
  id: a.id,
  type: "action" as const,
  title: a.label,
  subtitle: a.subtitle,
  category: "Acciones",
  href: a.href,
  action: a.action,
  icon: a.icon,
}));

// Alias para evitar conflicto de nombre con lucide-react
function ShoppingBasketIcon({ className }: { className?: string }) {
  return <ShoppingCart className={className} />;
}

const MAX_PER_CATEGORY = 3;

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const router = useRouter();

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const down = (e: globalThis.KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen((open) => !open);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Load recent searches
  useEffect(() => {
    const stored = localStorage.getItem("buleje-recent-searches");
    if (stored) {
      try {
        setRecentSearches(JSON.parse(stored));
      } catch {}
    }
  }, []);

  const saveSearch = useCallback((q: string) => {
    if (!q.trim()) return;
    const updated = [q, ...recentSearches.filter((s) => s !== q)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem("buleje-recent-searches", JSON.stringify(updated));
  }, [recentSearches]);

  const allItems = useMemo<SearchableItem[]>(() => {
    return [...QUICK_ACTIONS, ...ADMIN_TABS, ...STORE_ITEMS];
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = q
      ? allItems.filter((item) =>
          item.title.toLowerCase().includes(q) ||
          item.subtitle?.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
        )
      : allItems;

    // Group by category and limit per category
    const grouped = new Map<string, SearchableItem[]>();
    for (const item of items) {
      const group = grouped.get(item.category) ?? [];
      if (group.length < MAX_PER_CATEGORY) {
        group.push(item);
      }
      grouped.set(item.category, group);
    }

    // Sort categories by priority
    const sortedCategories = Array.from(grouped.entries()).sort(([a], [b]) => {
      const pa = CATEGORY_CONFIG[a]?.priority ?? 99;
      const pb = CATEGORY_CONFIG[b]?.priority ?? 99;
      return pa - pb;
    });

    return sortedCategories;
  }, [query, allItems]);

  // Flatten for keyboard navigation
  const flatItems = useMemo(() => filtered.flatMap(([, items]) => items), [filtered]);

  const handleSelect = useCallback((item: SearchableItem) => {
    if (item.action) {
      item.action();
    } else if (item.href) {
      router.push(item.href);
    }
    saveSearch(item.title);
    setIsOpen(false);
    setQuery("");
    setSelected(0);
  }, [router, saveSearch]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => (s + 1) % Math.max(1, flatItems.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => (s - 1 + flatItems.length) % Math.max(1, flatItems.length));
    } else if (e.key === "Enter" && flatItems[selected]) {
      e.preventDefault();
      handleSelect(flatItems[selected]);
    }
  };

  if (!isOpen) return null;

  let flatIdx = 0;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
      onClick={() => setIsOpen(false)}
      aria-hidden="true"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
        className="w-full max-w-2xl mx-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        aria-hidden="false"
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <Search className="w-5 h-5 text-gray-400 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar módulos, productos, acciones..."
            className="flex-1 bg-transparent text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none text-base"
            autoFocus
            aria-label="Buscar en la paleta de comandos"
            aria-autocomplete="list"
            aria-controls="command-palette-results"
            role="combobox"
            aria-expanded={flatItems.length > 0}
          />
          <div className="flex items-center gap-1.5 shrink-0">
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 text-[10px] font-mono text-gray-500">Ctrl+K</kbd>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
            aria-label="Cerrar paleta de comandos"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Results */}
        <div id="command-palette-results" className="max-h-[400px] overflow-y-auto" role="listbox" aria-label="Resultados de búsqueda">
          {!query && recentSearches.length > 0 && (
            <div className="p-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 px-3 py-2 flex items-center gap-2">
                <Clock className="w-3 h-3" />
                Búsquedas recientes
              </p>
              {recentSearches.map((search, i) => (
                <button
                  key={i}
                  onClick={() => setQuery(search)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
                >
                  {search}
                </button>
              ))}
            </div>
          )}

          {flatItems.length === 0 && query && (
            <div className="p-8 text-center text-gray-500">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">No se encontraron resultados</p>
              <p className="text-xs mt-1 text-gray-400">Intenta con otro término de búsqueda</p>
            </div>
          )}

          {filtered.map(([category, items]) => {
            const config = CATEGORY_CONFIG[category];
            return (
              <div key={category} className="py-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-5 py-2 flex items-center gap-2">
                  {config?.icon}
                  {config?.label ?? category}
                </p>
                {items.map((item) => {
                  const currentFlatIdx = flatIdx++;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelect(item)}
                      className={`w-full text-left px-5 py-2.5 flex items-center gap-3 transition ${
                        currentFlatIdx === selected
                          ? "bg-primary/10 dark:bg-primary/15"
                          : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      }`}
                    >
                      {item.icon && (
                        <span className="shrink-0">{item.icon}</span>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${
                          currentFlatIdx === selected
                            ? "text-primary"
                            : "text-gray-900 dark:text-white"
                        }`}>
                          {item.title}
                        </p>
                        {item.subtitle && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{item.subtitle}</p>
                        )}
                      </div>
                      <ArrowRight className={`w-3.5 h-3.5 shrink-0 ${
                        currentFlatIdx === selected ? "text-primary" : "text-gray-300"
                      }`} />
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-2.5 flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 text-[10px]">&#8593;&#8595;</kbd>
              Navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 text-[10px]">&#9166;</kbd>
              Seleccionar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 text-[10px]">Esc</kbd>
              Cerrar
            </span>
          </div>
          <span className="flex items-center gap-1">
            <Command className="w-3 h-3" />
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 text-[10px]">K</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
