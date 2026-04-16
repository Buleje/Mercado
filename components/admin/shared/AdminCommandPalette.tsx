"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Search, ArrowRight, Package, Users, Zap, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandItem {
  id: string;
  label: string;
  category: string; // "Módulo" | "Producto" | "Cliente" | "Acción" | "Documento" | "Sistema"
  icon?: string; // emoji
  subtitle?: string;
  onSelect: () => void;
}

interface AdminCommandPaletteProps {
  items: CommandItem[];
}

// Categorías con icono Lucide para las dinámicas
const DYN_ICONS: Record<string, React.ReactNode> = {
  Producto: <Package className="h-3 w-3" />,
  Cliente:  <Users className="h-3 w-3" />,
  Acción:   <Zap className="h-3 w-3" />,
};

const CATEGORY_ORDER = ["Acción", "Módulo", "Documento", "Sistema", "Producto", "Cliente"];

export default function AdminCommandPalette({ items }: AdminCommandPaletteProps) {
  const [open, setOpen]             = useState(false);
  const [query, setQuery]           = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [dynProducts, setDynProducts] = useState<CommandItem[]>([]);
  const [dynCustomers, setDynCustomers] = useState<CommandItem[]>([]);
  const [searching, setSearching]   = useState(false);
  const inputRef  = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Ctrl+K / Cmd+K toggle ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Auto-focus y reset ─────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setSelectedIdx(0);
      setDynProducts([]);
      setDynCustomers([]);
    }
  }, [open]);

  // ── Búsqueda dinámica con debounce 200ms ───────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setDynProducts([]);
      setDynCustomers([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const [pRes, cRes] = await Promise.allSettled([
          fetch(`/api/products?q=${encodeURIComponent(q)}&limit=5`),
          fetch(`/api/customers?search=${encodeURIComponent(q)}&limit=5`),
        ]);

        if (pRes.status === "fulfilled" && pRes.value.ok) {
          const products: Array<{ id: number; name: string; price: number; category?: string }> = await pRes.value.json();
          setDynProducts(products.map(p => ({
            id: `product-${p.id}`,
            label: p.name,
            subtitle: `S/ ${p.price.toFixed(2)}${p.category ? ` · ${p.category}` : ""}`,
            category: "Producto",
            icon: "📦",
            onSelect: () => {
              // Navega al módulo de productos — el padre maneja la lógica de tab
              window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { tab: "productos" } }));
            },
          })));
        }

        if (cRes.status === "fulfilled" && cRes.value.ok) {
          const raw = await cRes.value.json();
          // La API puede devolver array directo o { customers: [] }
          const customers: Array<{ phone?: string; name: string; location?: string }> = Array.isArray(raw) ? raw : (raw.customers ?? []);
          setDynCustomers(customers.slice(0, 5).map((c, i) => ({
            id: `customer-${c.phone ?? i}`,
            label: c.name,
            subtitle: c.phone ?? c.location ?? "",
            category: "Cliente",
            icon: "👤",
            onSelect: () => {
              window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { tab: "clientes" } }));
            },
          })));
        }
      } catch {
        // Fallo silencioso — los resultados estáticos siguen funcionando
      } finally {
        setSearching(false);
      }
    }, 200);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // ── Resultados filtrados (estáticos + dinámicos) ───────────────────────────
  const filtered = useMemo<CommandItem[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 12);
    const staticFiltered = items.filter(i =>
      i.label.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)
    );
    return [...staticFiltered, ...dynProducts, ...dynCustomers].slice(0, 20);
  }, [items, query, dynProducts, dynCustomers]);

  // ── Agrupado por categoría ─────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const item of filtered) {
      const arr = map.get(item.category) ?? [];
      arr.push(item);
      map.set(item.category, arr);
    }
    // Ordenar categorías
    return Array.from(map.entries()).sort(([a], [b]) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [filtered]);

  // ── Navegación por teclado ─────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIdx]) {
      filtered[selectedIdx].onSelect();
      setOpen(false);
    }
  }, [filtered, selectedIdx]);

  useEffect(() => { setSelectedIdx(0); }, [filtered]);

  // No trigger button — the top header search bar triggers Ctrl+K
  if (!open) return null;

  // ── Render: modal ─────────────────────────────────────────────────────────
  let globalIdx = 0;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Búsqueda global"
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden border border-gray-200 dark:border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 dark:border-gray-800">
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar módulos, productos, clientes, acciones..."
            className="flex-1 text-sm bg-transparent text-gray-900 dark:text-white placeholder:text-gray-400 outline-none"
          />
          {searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400 shrink-0" />}
          <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-[9px] font-mono text-gray-400 shrink-0">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 && !searching ? (
            <div className="text-center py-8 text-sm text-gray-400">
              <Search className="h-6 w-6 mx-auto mb-2 opacity-30" />
              <p>No se encontraron resultados</p>
              {query.length > 0 && <p className="text-xs mt-1 text-gray-400">Intenta con otro término</p>}
            </div>
          ) : (
            grouped.map(([category, categoryItems]) => (
              <div key={category}>
                <p className="px-4 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  {DYN_ICONS[category]}
                  {category}
                </p>
                {categoryItems.map(item => {
                  const idx = globalIdx++;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { item.onSelect(); setOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors",
                        idx === selectedIdx
                          ? "bg-primary/10 dark:bg-primary/20 text-primary dark:text-emerald-400"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5",
                      )}
                    >
                      {item.icon && <span className="text-base shrink-0 w-5 text-center">{item.icon}</span>}
                      <div className="flex-1 min-w-0">
                        <span className="block truncate font-medium">{item.label}</span>
                        {item.subtitle && (
                          <span className="block truncate text-xs text-gray-400 dark:text-gray-500 mt-0.5">{item.subtitle}</span>
                        )}
                      </div>
                      <ArrowRight className={cn(
                        "h-3 w-3 shrink-0 transition-opacity",
                        idx === selectedIdx ? "opacity-100" : "opacity-20"
                      )} />
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 flex items-center gap-4 text-[10px] text-gray-400">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono">↑↓</kbd>
            Navegar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono">Enter</kbd>
            Seleccionar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono">Esc</kbd>
            Cerrar
          </span>
          <span className="ml-auto flex items-center gap-1 opacity-60">
            <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono">Ctrl+K</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
