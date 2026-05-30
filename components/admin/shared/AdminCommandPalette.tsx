"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Search, ArrowRight, Package, Users, Zap, Loader2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { ComponentType } from "react";

// Historial de búsqueda eliminado (Brandon 2026-05-29): el palette solo busca
// los módulos actuales del negocio + productos/clientes, sin recientes.

interface CommandItem {
  id: string;
  label: string;
  category: string;
  icon?: string;
  iconComponent?: ComponentType<{ className?: string }>;
  iconColor?: string;
  subtitle?: string;
  shortcut?: string;
  onSelect: () => void;
}

interface AdminCommandPaletteProps {
  items: CommandItem[];
}

// Lucide icons for dynamic categories (Producto / Cliente / Accion)
const DYN_ICONS: Record<string, React.ReactNode> = {
  Producto: <Package className="h-3 w-3" />,
  Cliente:  <Users className="h-3 w-3" />,
  Accion:   <Zap className="h-3 w-3" />,
};

const CATEGORY_ORDER = ["Accion", "Negocio", "Inventario", "Dinero", "Documento", "Sistema", "Producto", "Cliente"];

export default function AdminCommandPalette({ items }: AdminCommandPaletteProps) {
  const [open, setOpen]             = useState(false);
  const [query, setQuery]           = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [dynProducts, setDynProducts] = useState<CommandItem[]>([]);
  const [dynCustomers, setDynCustomers] = useState<CommandItem[]>([]);
  const [searching, setSearching]   = useState(false);
  const inputRef  = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

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

  // ── Busqueda dinamica con debounce 200ms ───────────────────────────────────
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
            subtitle: `S/ ${Number(p.price).toFixed(2)}${p.category ? ` · ${p.category}` : ""}`,
            category: "Producto",
            iconComponent: Package,
            onSelect: () => {
              window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { tab: "productos" } }));
            },
          })));
        }

        if (cRes.status === "fulfilled" && cRes.value.ok) {
          const raw = await cRes.value.json();
          const customers: Array<{ phone?: string; name: string; location?: string }> = Array.isArray(raw) ? raw : (raw.customers ?? []);
          setDynCustomers(customers.slice(0, 5).map((c, i) => ({
            id: `customer-${c.phone ?? i}`,
            label: c.name,
            subtitle: c.phone ?? c.location ?? "",
            category: "Cliente",
            iconComponent: Users,
            onSelect: () => {
              window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { tab: "clientes" } }));
            },
          })));
        }
      } catch {
        // Fallo silencioso — los resultados estaticos siguen funcionando
      } finally {
        setSearching(false);
      }
    }, 200);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // ── Resultados filtrados (estaticos + dinamicos) ───────────────────────────
  // Sin historial: query vacía muestra los módulos actuales; con query, match.
  const filtered = useMemo<CommandItem[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return items.slice(0, 16);
    }
    const staticFiltered = items.filter(i =>
      i.label.toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q) ||
      (i.subtitle && i.subtitle.toLowerCase().includes(q))
    );
    return [...staticFiltered, ...dynProducts, ...dynCustomers].slice(0, 20);
  }, [items, query, dynProducts, dynCustomers]);

  // ── Agrupado por categoria ─────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const item of filtered) {
      const arr = map.get(item.category) ?? [];
      arr.push(item);
      map.set(item.category, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [filtered]);

  // ── Navegacion por teclado ─────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIdx]) {
      const item = filtered[selectedIdx];
      item.onSelect();
      setOpen(false);
    }
  }, [filtered, selectedIdx]);

  useEffect(() => { setSelectedIdx(0); }, [filtered]);

  // Auto-scroll selected into view cuando navegas con flechas
  useEffect(() => {
    if (!resultsRef.current) return;
    const el = resultsRef.current.querySelector<HTMLElement>(`[data-cmdk-idx="${selectedIdx}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIdx]);

  if (!open) return null;

  // ── Render: modal ─────────────────────────────────────────────────────────
  let globalIdx = 0;

  return (
    <div
      className="modal-backdrop flex items-start justify-center pt-[15vh] " style={{ zIndex: 9999 }}
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Busqueda global"
    >
      <div
        className="bg-[var(--surface-raised)] rounded-xl w-full max-w-lg mx-4 overflow-hidden border border-[var(--rule-base)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--rule-base)]">
          <Search className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar modulos, productos, clientes, acciones..."
            className="flex-1 text-sm bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
          />
          {searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text-tertiary)] shrink-0" />}
          <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-[length:var(--ts-2xs)] font-mono text-[var(--text-tertiary)] shrink-0">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={resultsRef} className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 && !searching ? (
            <div className="text-center py-8 text-sm text-[var(--text-tertiary)]">
              <Search className="h-6 w-6 mx-auto mb-2 opacity-30" />
              <p>No se encontraron resultados</p>
              {query.length > 0 && <p className="text-xs mt-1 text-[var(--text-tertiary)]">Intenta con otro termino</p>}
            </div>
          ) : (
            grouped.map(([category, categoryItems]) => (
              <div key={category}>
                {/* Category separator */}
                <div className="flex items-center gap-2 px-4 pt-3 pb-1.5">
                  <span className="h-px flex-1 bg-[var(--surface-sunken)]" />
                  <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] flex items-center gap-1.5">
                    {DYN_ICONS[category]}
                    {category}
                  </span>
                  <span className="h-px flex-1 bg-[var(--surface-sunken)]" />
                </div>
                {categoryItems.map(item => {
                  const idx = globalIdx++;
                  const IconComp = item.iconComponent;
                  return (
                    <button
                      key={item.id}
                      data-cmdk-idx={idx}
                      onClick={() => { item.onSelect(); setOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors",
                        idx === selectedIdx
                          ? "bg-[var(--surface-sunken)] dark:bg-white/10"
                          : "text-[var(--text-secondary)] hover:bg-[var(--surface-alt)] dark:hover:bg-white/5",
                      )}
                    >
                      {/* Icon: Lucide component with tinted bg, or emoji fallback */}
                      {IconComp ? (
                        <span className="shrink-0 w-8 h-8 rounded-lg bg-[var(--surface-sunken)] flex items-center justify-center">
                          <IconComp className={cn("h-4 w-4", item.iconColor ?? "text-[var(--text-secondary)]")} />
                        </span>
                      ) : item.icon ? (
                        <span className="shrink-0 w-8 h-8 rounded-lg bg-[var(--surface-sunken)] flex items-center justify-center text-base">
                          {item.icon}
                        </span>
                      ) : (
                        <span className="shrink-0 w-8 h-8 rounded-lg bg-[var(--surface-sunken)] flex items-center justify-center">
                          <Zap className="h-4 w-4 text-[var(--text-tertiary)]" />
                        </span>
                      )}

                      {/* Label + description */}
                      <div className="flex-1 min-w-0">
                        <span className={cn(
                          "block truncate font-medium",
                          idx === selectedIdx ? "text-[var(--text-primary)]" : "",
                        )}>
                          {item.label}
                        </span>
                        {item.subtitle && (
                          <span className="block truncate text-xs text-[var(--text-tertiary)] mt-0.5">
                            {item.subtitle}
                          </span>
                        )}
                      </div>

                      {/* Shortcut badge */}
                      {item.shortcut && (
                        <kbd className="shrink-0 px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-[length:var(--ts-2xs)] font-mono text-[var(--text-tertiary)]">
                          {item.shortcut}
                        </kbd>
                      )}

                      <ArrowRight className={cn(
                        "h-3 w-3 shrink-0 transition-opacity",
                        idx === selectedIdx ? "opacity-100" : "opacity-0"
                      )} />
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-[var(--rule-base)] flex items-center gap-4 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded bg-[var(--surface-sunken)] font-mono">&#8593;&#8595;</kbd>
            Navegar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded bg-[var(--surface-sunken)] font-mono">Enter</kbd>
            Seleccionar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded bg-[var(--surface-sunken)] font-mono">Esc</kbd>
            Cerrar
          </span>
          <span className="ml-auto flex items-center gap-1 opacity-60">
            <kbd className="px-1 py-0.5 rounded bg-[var(--surface-sunken)] font-mono">Ctrl+K</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
