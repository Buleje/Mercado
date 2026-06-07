'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { m as motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, X, Check, HelpCircle, AlertTriangle, FileText, Loader2 } from "@buleje/design-system/icons";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { cn } from "@/lib/utils";

type MatchedProduct = {
  id: number;
  name: string;
  price: number;
  image: string;
  unit: string;
  category: string;
  stock?: number;
};

type ParsedLine = {
  raw: string;
  quantity: number;
  unit: string;
  searchTerm: string;
};

type LineResult = {
  parsed: ParsedLine;
  status: "found" | "multiple" | "not_found" | "searching";
  matches: MatchedProduct[];
  selected?: MatchedProduct;
};

const LINE_REGEX = /^(\d+\.?\d*)?\s*(kg|litro|litros|l|unid|unidades|pack|bolsa|botella|lata|sobre|atado)?\s*(.+)$/i;

function parseLine(line: string): ParsedLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const match = trimmed.match(LINE_REGEX);
  if (!match) return { raw: trimmed, quantity: 1, unit: "", searchTerm: trimmed };
  return {
    raw: trimmed,
    quantity: match[1] ? parseFloat(match[1]) : 1,
    unit: match[2] || "",
    searchTerm: (match[3] || "").trim(),
  };
}

export default function MarketListMode({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<LineResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheRef = useRef<Map<string, MatchedProduct[]>>(new Map());
  const { addItem } = useCart();
  const { showToast } = useToast();

  const searchProduct = useCallback(async (term: string): Promise<MatchedProduct[]> => {
    const key = term.toLowerCase();
    if (cacheRef.current.has(key)) return cacheRef.current.get(key)!;
    try {
      const res = await fetch(`/api/products?search=${encodeURIComponent(term)}&limit=5`);
      if (!res.ok) return [];
      const data = await res.json();
      const products: MatchedProduct[] = (Array.isArray(data) ? data : data.products || []).slice(0, 5).map((p: Record<string, unknown>) => ({
        id: p.id as number,
        name: p.name as string,
        price: p.price as number,
        image: (p.image as string) || "",
        unit: (p.unit as string) || "unidad",
        category: (p.category as string) || "",
        stock: p.stock as number | undefined,
      }));
      cacheRef.current.set(key, products);
      return products;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const lines = text.split("\n").filter(l => l.trim());
      const parsed = lines.map(parseLine).filter((p): p is ParsedLine => p !== null);

      // Show searching state
      setResults(parsed.map(p => ({ parsed: p, status: "searching" as const, matches: [] })));
      setIsSearching(true);

      const newResults: LineResult[] = [];
      for (const p of parsed) {
        const matches = await searchProduct(p.searchTerm);
        if (matches.length === 0) {
          newResults.push({ parsed: p, status: "not_found", matches: [] });
        } else if (matches.length === 1) {
          newResults.push({ parsed: p, status: "found", matches, selected: matches[0] });
        } else {
          // Check for exact-ish match
          const exact = matches.find(m => m.name.toLowerCase().includes(p.searchTerm.toLowerCase()));
          if (exact) {
            newResults.push({ parsed: p, status: "found", matches, selected: exact });
          } else {
            newResults.push({ parsed: p, status: "multiple", matches });
          }
        }
      }

      setResults(newResults);
      setIsSearching(false);
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [text, searchProduct]);

  const selectProduct = (lineIdx: number, product: MatchedProduct) => {
    setResults(prev => prev.map((r, i) =>
      i === lineIdx ? { ...r, status: "found" as const, selected: product } : r
    ));
  };

  const foundItems = useMemo(() =>
    results.filter(r => r.status === "found" && r.selected),
    [results]
  );

  const totalPrice = useMemo(() =>
    foundItems.reduce((sum, r) => sum + (r.selected!.price * r.parsed.quantity), 0),
    [foundItems]
  );

  const handleAddAll = () => {
    let added = 0;
    for (const r of foundItems) {
      if (r.selected) {
        for (let i = 0; i < Math.ceil(r.parsed.quantity); i++) {
          addItem({
            id: r.selected.id,
            name: r.selected.name,
            price: r.selected.price,
            image: r.selected.image,
            unit: r.selected.unit,
            category: r.selected.category,
          });
        }
        added++;
      }
    }
    showToast(`${added} productos agregados al carrito`, "");
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="bg-[var(--surface-raised)] rounded-2xl shadow-[var(--shadow-xl)] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--rule-base)]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-[var(--accent)]" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-[var(--text-primary)]">Lista de mercado</h2>
              <p className="text-xs text-[var(--text-tertiary)]">Escribe tu lista como si fuera un mensaje</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Textarea */}
          <div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={"2 kg arroz\n1 leche gloria\naceite 1 litro\n3 tomates\nfideos\njugo de naranja"}
              className="w-full h-40 p-4 rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-base)] text-[var(--text-primary)] placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 transition-all"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1.5">Escribe un producto por linea. Puedes poner cantidad y unidad.</p>
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-[var(--text-secondary)] flex items-center gap-2">
                Resultados
                {isSearching && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />}
              </h3>
              <AnimatePresence>
                {results.map((r, idx) => (
                  <motion.div
                    key={`${r.parsed.raw}-${idx}`}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={cn(
                      "p-3 rounded-xl border transition-all",
                      r.status === "found" && "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/20",
                      r.status === "multiple" && "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/20",
                      r.status === "not_found" && "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/20",
                      r.status === "searching" && "border-[var(--rule-base)] bg-[var(--surface-sunken)] animate-pulse",
                    )}
                  >
                    {r.status === "searching" ? (
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Buscando &quot;{r.parsed.searchTerm}&quot;...
                      </div>
                    ) : r.status === "found" && r.selected ? (
                      <div className="flex items-center gap-3">
                        <Check className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                            {r.selected.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {r.parsed.quantity > 1 ? `${r.parsed.quantity} x ` : ""}S/ {Number(r.selected.price).toFixed(2)}
                            {r.parsed.quantity > 1 && ` = S/ ${(r.selected.price * r.parsed.quantity).toFixed(2)}`}
                          </p>
                        </div>
                      </div>
                    ) : r.status === "multiple" ? (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <HelpCircle className="h-4 w-4 text-[var(--data-warning-600)] dark:text-amber-400 flex-shrink-0" />
                          <p className="text-sm text-[var(--data-warning-700)] dark:text-amber-300">
                            &quot;{r.parsed.searchTerm}&quot; — {r.matches.length} opciones:
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 ml-6">
                          {r.matches.slice(0, 4).map(m => (
                            <button
                              key={m.id}
                              onClick={() => selectProduct(idx, m)}
                              className="px-3 py-1.5 rounded-lg bg-[var(--surface-raised)] border border-amber-300 dark:border-[var(--data-warning-700)] text-xs font-medium text-[var(--text-secondary)] hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                            >
                              {m.name} · S/{Number(m.price).toFixed(2)}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-[var(--data-error-500)] flex-shrink-0" />
                        <p className="text-sm text-[var(--data-error-600)] dark:text-red-400">
                          &quot;{r.parsed.searchTerm}&quot; — No encontrado
                        </p>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Footer */}
        {foundItems.length > 0 && (
          <div className="border-t border-[var(--rule-base)] p-5">
            <button
              onClick={handleAddAll}
              className="w-full py-4 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white font-bold text-base flex items-center justify-center gap-2 transition-all shadow-xl active:scale-[0.98]"
            >
              <ShoppingCart className="h-5 w-5" />
              Agregar {foundItems.length} producto{foundItems.length !== 1 ? "s" : ""} al carrito · S/ {totalPrice.toFixed(2)}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
