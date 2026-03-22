"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Package, Users, ShoppingCart, FileText, ShoppingBasket, Tag, AlertTriangle, TrendingUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type SearchResult = {
  id: string;
  type: "producto" | "cliente" | "pedido" | "proveedor" | "cupon" | "promocion";
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: string;
  tab: string;
};

const TYPE_META: Record<SearchResult["type"], { icon: React.ElementType; color: string; label: string }> = {
  producto:   { icon: Package,       color: "text-blue-500",   label: "Producto"   },
  cliente:    { icon: Users,         color: "text-violet-500", label: "Cliente"    },
  pedido:     { icon: ShoppingCart,  color: "text-amber-500",  label: "Pedido"     },
  proveedor:  { icon: ShoppingBasket,color: "text-emerald-500",label: "Proveedor"  },
  cupon:      { icon: Tag,           color: "text-pink-500",   label: "Cupón"      },
  promocion:  { icon: TrendingUp,    color: "text-orange-500", label: "Promoción"  },
};

interface Props {
  open: boolean;
  onClose: () => void;
  onNavigate: (tab: string) => void;
}

export default function GlobalSearch({ open, onClose, onNavigate }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results ?? []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
      if (e.key === "Enter" && results[selected]) { handleSelect(results[selected]); }
      if (e.key === "Escape") { onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, results, selected]);

  const handleSelect = (result: SearchResult) => {
    onNavigate(result.tab);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden border border-gray-200 dark:border-card-border"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex flex-wrap items-center gap-3 px-2 sm:px-4 py-2 sm:py-3.5 border-b border-gray-100 dark:border-card-border">
          {loading
            ? <Loader2 className="h-5 w-5 text-gray-400 shrink-0 animate-spin" />
            : <Search className="h-5 w-5 text-gray-400 dark:text-muted shrink-0" />
          }
          <input
            ref={inputRef}
            type="text"
            placeholder="Buscar productos, clientes, pedidos…"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0); }}
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-surface transition-colors">
              <X className="h-4 w-4 text-gray-400" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono text-gray-400 bg-gray-100 dark:bg-surface border border-gray-200 dark:border-card-border">
            Esc
          </kbd>
        </div>

        {/* Results */}
        {query.trim().length >= 2 && (
          <div className="max-h-96 overflow-y-auto">
            {results.length === 0 && !loading && (
              <div className="flex flex-wrap items-center gap-3 px-4 py-8 text-gray-400 dark:text-muted text-sm justify-center">
                <AlertTriangle className="h-5 w-5" />
                Sin resultados para &ldquo;{query}&rdquo;
              </div>
            )}
            {results.map((r, i) => {
              const meta = TYPE_META[r.type];
              const Icon = meta.icon;
              return (
                <button
                  key={r.id}
                  onClick={() => handleSelect(r)}
                  className={cn(
                    "w-full flex items-center gap-3 px-2 sm:px-4 py-2 sm:py-3 text-left hover:bg-gray-50 dark:hover:bg-surface transition-colors border-b border-gray-50 dark:border-card-border last:border-0",
                    i === selected && "bg-primary/5 dark:bg-primary/10"
                  )}
                >
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-gray-100 dark:bg-surface", meta.color)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-foreground truncate">{r.title}</p>
                    <p className="text-xs text-gray-400 dark:text-muted truncate">{r.subtitle}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {r.badge && (
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                        style={{ background: r.badgeColor ?? "#6b7280" }}
                      >
                        {r.badge}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-300 dark:text-muted font-medium uppercase tracking-wide">
                      {meta.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Quick actions when empty */}
        {query.trim().length < 2 && (
          <div className="px-2 sm:px-4 py-2 sm:py-3">
            <p className="text-[10px] font-bold text-gray-400 dark:text-muted uppercase tracking-wide mb-2">Acceso rápido</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {[
                { label: "Nuevo Pedido",    tab: "pedidos",    icon: ShoppingCart,  color: "text-amber-500 bg-amber-50" },
                { label: "Inventario",      tab: "inventario", icon: Package,       color: "text-blue-500 bg-blue-50" },
                { label: "Clientes",        tab: "clientes",   icon: Users,         color: "text-violet-500 bg-violet-50" },
                { label: "Punto de Venta",  tab: "pos",        icon: ShoppingBasket,color: "text-emerald-500 bg-emerald-50" },
                { label: "Reportes",        tab: "reportes",   icon: FileText,      color: "text-gray-500 bg-gray-50" },
                { label: "Promociones",     tab: "promociones",icon: TrendingUp,    color: "text-orange-500 bg-orange-50" },
              ].map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.tab}
                    onClick={() => { onNavigate(item.tab); onClose(); }}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-gray-100 dark:border-card-border hover:border-gray-200 dark:hover:border-card-border/80 transition-colors"
                  >
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", item.color)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-[10px] font-semibold text-gray-600 dark:text-muted text-center leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="px-2 sm:px-4 py-1.5 sm:py-2 bg-gray-50 dark:bg-surface border-t border-gray-100 dark:border-card-border flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-3 text-[10px] text-gray-400 dark:text-muted">
            <span className="flex items-center gap-1"><kbd className="bg-white dark:bg-card border border-gray-200 dark:border-card-border px-1 rounded font-mono">↑↓</kbd> navegar</span>
            <span className="flex items-center gap-1"><kbd className="bg-white dark:bg-card border border-gray-200 dark:border-card-border px-1 rounded font-mono">Enter</kbd> ir</span>
          </div>
          <span className="text-[10px] text-gray-300 dark:text-muted">Ctrl + K para abrir</span>
        </div>
      </div>
    </div>
  );
}

