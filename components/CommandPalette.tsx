"use client";

import { useState, useEffect, useCallback, useMemo, type KeyboardEvent } from "react";
import { Search, ArrowRight, Clock, X, Command } from "lucide-react";
import { useRouter } from "next/navigation";

type SearchableItem = {
  id: string;
  type: "tab" | "product" | "order" | "customer" | "action";
  title: string;
  subtitle?: string;
  href?: string;
  action?: () => void;
  icon?: React.ReactNode;
  category: string;
};

const STORE_ITEMS: SearchableItem[] = [
  { id: "s-inicio", type: "action", title: "Inicio", category: "Tienda", href: "/" },
  { id: "s-buscar", type: "action", title: "Buscar productos", category: "Tienda", href: "/buscar" },
  { id: "s-tienda", type: "action", title: "Catálogo completo", category: "Tienda", href: "/tienda" },
  { id: "s-pedidos", type: "action", title: "Mis pedidos", category: "Mi cuenta", href: "/mis-pedidos" },
  { id: "s-cuenta", type: "action", title: "Mi cuenta", category: "Mi cuenta", href: "/cuenta" },
  { id: "s-cat-frutas", type: "action", title: "Frutas y Verduras 🥬", category: "Categorías", href: "/tienda/categoria/frutas-verduras" },
  { id: "s-cat-abarrotes", type: "action", title: "Abarrotes 🏪", category: "Categorías", href: "/tienda/categoria/abarrotes" },
  { id: "s-cat-carnes", type: "action", title: "Carnes 🥩", category: "Categorías", href: "/tienda/categoria/carnes" },
  { id: "s-cat-lacteos", type: "action", title: "Lácteos 🧀", category: "Categorías", href: "/tienda/categoria/lacteos" },
  { id: "s-cat-bebidas", type: "action", title: "Bebidas 🥤", category: "Categorías", href: "/tienda/categoria/bebidas" },
  { id: "s-cat-limpieza", type: "action", title: "Limpieza 🧹", category: "Categorías", href: "/tienda/categoria/limpieza" },
];

const ADMIN_TABS: SearchableItem[] = [
  { id: "dashboard", type: "tab", title: "Dashboard", category: "Navegación", href: "/admin?tab=dashboard" },
  { id: "pos", type: "tab", title: "Punto de Venta", category: "Navegación", href: "/admin?tab=pos" },
  { id: "inventario", type: "tab", title: "Inventario", category: "Navegación", href: "/admin?tab=inventario" },
  { id: "pedidos", type: "tab", title: "Pedidos", category: "Navegación", href: "/admin?tab=pedidos" },
  { id: "clientes", type: "tab", title: "Clientes", category: "Navegación", href: "/admin?tab=clientes" },
  { id: "proveedores", type: "tab", title: "Proveedores", category: "Navegación", href: "/admin?tab=proveedores" },
  { id: "compras", type: "tab", title: "Compras", category: "Navegación", href: "/admin?tab=compras" },
  { id: "caja", type: "tab", title: "Caja", category: "Navegación", href: "/admin?tab=caja" },
  { id: "reportes", type: "tab", title: "Reportes", category: "Navegación", href: "/admin?tab=reportes" },
  { id: "configuracion", type: "tab", title: "Configuración", category: "Navegación", href: "/admin?tab=configuracion" },
];

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
    const stored = localStorage.getItem("bsm-recent-searches");
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
    localStorage.setItem("bsm-recent-searches", JSON.stringify(updated));
  }, [recentSearches]);

  const allItems = useMemo<SearchableItem[]>(() => {
    return [...STORE_ITEMS, ...ADMIN_TABS];
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return allItems.slice(0, 10);
    const q = query.toLowerCase();
    return allItems
      .filter((item) => 
        item.title.toLowerCase().includes(q) || 
        item.subtitle?.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [query, allItems]);

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
      setSelected((s) => (s + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => (s - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter" && filtered[selected]) {
      e.preventDefault();
      handleSelect(filtered[selected]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[20vh] bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl mx-4 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar tabs, productos, pedidos o acciones..."
            className="flex-1 bg-transparent text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none text-sm"
            autoFocus
          />
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto">
          {!query && recentSearches.length > 0 && (
            <div className="p-2">
              <p className="text-xs text-gray-500 px-3 py-2 flex items-center gap-2">
                <Clock className="w-3 h-3" />
                Búsquedas recientes
              </p>
              {recentSearches.map((search, i) => (
                <button
                  key={i}
                  onClick={() => setQuery(search)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition"
                >
                  {search}
                </button>
              ))}
            </div>
          )}

          {filtered.length === 0 && query && (
            <div className="p-8 text-center text-gray-500">
              <p className="text-sm">No se encontraron resultados</p>
              <p className="text-xs mt-1">Intenta con otro término de búsqueda</p>
            </div>
          )}

          {filtered.map((item, i) => (
            <button
              key={item.id}
              onClick={() => handleSelect(item)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 transition ${
                i === selected
                  ? "bg-blue-50 dark:bg-blue-900/20"
                  : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
              }`}
            >
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {item.title}
                </p>
                {item.subtitle && (
                  <p className="text-xs text-gray-500 mt-0.5">{item.subtitle}</p>
                )}
              </div>
              <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                {item.category}
              </span>
              <ArrowRight className="w-4 h-4 text-gray-400" />
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600">↑↓</kbd>
              Navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600">↵</kbd>
              Seleccionar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600">Esc</kbd>
              Cerrar
            </span>
          </div>
          <span className="flex items-center gap-1">
            <Command className="w-3 h-3" />
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600">K</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
