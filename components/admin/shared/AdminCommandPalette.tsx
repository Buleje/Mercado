"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Search, ArrowRight, Command } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandItem {
  id: string;
  label: string;
  category: string; // "Módulo" | "Producto" | "Cliente" | "Acción"
  icon?: string; // emoji
  onSelect: () => void;
}

interface AdminCommandPaletteProps {
  items: CommandItem[];
}

export default function AdminCommandPalette({ items }: AdminCommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl+K / Cmd+K to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Auto-focus input when open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setSelectedIdx(0);
    }
  }, [open]);

  // Filtered results
  const filtered = useMemo(() => {
    if (!query.trim()) return items.slice(0, 12);
    const q = query.toLowerCase();
    return items.filter(i =>
      i.label.toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q)
    ).slice(0, 12);
  }, [items, query]);

  // Keyboard navigation
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

  // Reset selection when results change
  useEffect(() => { setSelectedIdx(0); }, [filtered]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl text-xs text-gray-500 dark:text-gray-400 transition-colors"
        aria-label="Búsqueda global (Ctrl+K)"
      >
        <Search className="h-3 w-3" />
        <span>Buscar...</span>
        <kbd className="ml-2 px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-[9px] font-mono">
          Ctrl+K
        </kbd>
      </button>
    );
  }

  // Group by category
  const grouped = filtered.reduce<Record<string, CommandItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  let globalIdx = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm"
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
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
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
          <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-[9px] font-mono text-gray-400">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">
              No se encontraron resultados
            </div>
          ) : (
            Object.entries(grouped).map(([category, categoryItems]) => (
              <div key={category}>
                <p className="px-4 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
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
                          ? "bg-[#0f766e]/10 text-[#0f766e] dark:text-emerald-400"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5",
                      )}
                    >
                      {item.icon && <span className="text-base shrink-0">{item.icon}</span>}
                      <span className="flex-1 truncate">{item.label}</span>
                      <ArrowRight className="h-3 w-3 opacity-30 shrink-0" />
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-4 text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono">↑↓</kbd> Navegar</span>
          <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono">Enter</kbd> Seleccionar</span>
          <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono">Esc</kbd> Cerrar</span>
        </div>
      </div>
    </div>
  );
}
