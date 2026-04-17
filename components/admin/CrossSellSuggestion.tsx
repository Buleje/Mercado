"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ShoppingBasket, X, Plus, TrendingUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CurrentItem {
  productId: number;
  name: string;
}

interface SuggestedProduct {
  id: number;
  name: string;
  price: number;
  unit?: string;
  reason?: string; // e.g. "también lleva con Arroz"
}

interface CrossSellSuggestionProps {
  currentItems: CurrentItem[];
  onAddProduct: (product: SuggestedProduct) => void;
  className?: string;
}

// ── Local heuristics (fallback when no API) ───────────────────────────────────

const PAIRINGS: Record<string, string[]> = {
  arroz: ["aceite", "sal", "frejoles", "azucar"],
  aceite: ["arroz", "sal", "vinagre"],
  leche: ["azucar", "café", "avena"],
  pan: ["mantequilla", "mermelada", "leche"],
  pollo: ["arroz", "aceite", "sal", "limon"],
  carne: ["sal", "aceite", "papa"],
  papa: ["aceite", "sal", "cebolla"],
  azucar: ["leche", "café", "harina"],
  fideos: ["aceite", "sal", "tomate"],
  café: ["azucar", "leche"],
};

function getLocalSuggestions(items: CurrentItem[]): string[] {
  const names = items.map((i) => i.name.toLowerCase());
  const suggestions = new Set<string>();
  for (const name of names) {
    for (const [key, pairs] of Object.entries(PAIRINGS)) {
      if (name.includes(key)) {
        pairs.forEach((p) => {
          if (!names.some((n) => n.includes(p))) suggestions.add(p);
        });
      }
    }
  }
  return Array.from(suggestions).slice(0, 3);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CrossSellSuggestion({ currentItems, onAddProduct, className }: CrossSellSuggestionProps) {
  const [suggestions, setSuggestions] = useState<SuggestedProduct[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const prevIdsRef = useRef<string>("");
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback(async (items: CurrentItem[]) => {
    if (items.length === 0) {
      setSuggestions([]);
      setVisible(false);
      return;
    }

    setLoading(true);
    try {
      const ids = items.map((i) => i.productId).join(",");
      const res = await fetch(`/api/products/co-purchased?ids=${ids}`);
      if (res.ok) {
        const data = await res.json();
        const fetched: SuggestedProduct[] = Array.isArray(data) ? data : (data.suggestions ?? []);
        if (fetched.length > 0) {
          setSuggestions(fetched.slice(0, 3));
          setVisible(true);
          setLoading(false);
          return;
        }
      }
    } catch {
      // fall through to local heuristics
    }

    // Local fallback
    const localNames = getLocalSuggestions(items);
    if (localNames.length === 0) {
      setSuggestions([]);
      setVisible(false);
      setLoading(false);
      return;
    }

    try {
      const results = await Promise.all(
        localNames.map(async (name) => {
          const res = await fetch(`/api/products?search=${encodeURIComponent(name)}&limit=1`);
          if (!res.ok) return null;
          const data = await res.json();
          const list: SuggestedProduct[] = Array.isArray(data) ? data : (data.data ?? data.products ?? []);
          if (!list[0]) return null;
          const triggerItem = items.find((i) => {
            for (const [key, pairs] of Object.entries(PAIRINGS)) {
              if (i.name.toLowerCase().includes(key) && pairs.includes(name)) return true;
            }
            return false;
          });
          const suggestion: SuggestedProduct = { ...list[0], reason: triggerItem ? `con ${triggerItem.name}` : undefined };
          return suggestion;
        })
      );
      const valid = (results.filter((r) => r !== null) as SuggestedProduct[]).slice(0, 3);
      setSuggestions(valid);
      setVisible(valid.length > 0);
    } catch {
      setSuggestions([]);
      setVisible(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ids = currentItems.map((i) => i.productId).sort().join(",");
    if (ids === prevIdsRef.current) return;
    prevIdsRef.current = ids;
    setDismissed(new Set());
    fetchSuggestions(currentItems);
  }, [currentItems, fetchSuggestions]);

  const handleAdd = (product: SuggestedProduct) => {
    onAddProduct(product);
    setDismissed((prev) => new Set(prev).add(product.id));
  };

  const handleDismiss = (id: number) => {
    setDismissed((prev) => new Set(prev).add(id));
  };

  const visibleSuggestions = suggestions.filter((s) => !dismissed.has(s.id));

  // Auto-hide when all dismissed
  useEffect(() => {
    if (suggestions.length > 0 && visibleSuggestions.length === 0) {
      setVisible(false);
    }
  }, [suggestions, visibleSuggestions]);

  if (!visible || currentItems.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "overflow-hidden transition-all duration-[var(--dur-base)]",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
        className
      )}
      style={{
        animation: visible ? "slideUpFade 0.3s ease-out forwards" : undefined,
      }}
    >
      <style>{`
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="rounded-xl border border-secondary/40 bg-secondary/5 dark:bg-secondary/10 p-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2.5">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-secondary" />
            <span className="text-xs font-semibold text-gray-700 dark:text-foreground">
              Clientes que compran esto tambien llevan:
            </span>
          </div>
          {loading && <Loader2 className="h-3 w-3 animate-spin text-gray-400 ml-auto" />}
        </div>

        {/* Suggestions */}
        <div className="space-y-2">
          {loading && visibleSuggestions.length === 0 ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
            </div>
          ) : (
            visibleSuggestions.map((product) => (
              <div
                key={product.id}
                className="flex items-center gap-2 bg-white dark:bg-card rounded-xl px-3 py-2 border border-[var(--rule-soft)] dark:border-card-border "
              >
                <ShoppingBasket className="h-4 w-4 text-secondary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-foreground truncate">{product.name}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-primary font-semibold">
                      S/ {product.price?.toFixed(2) ?? "—"}
                    </span>
                    {product.reason && (
                      <span className="text-xs text-gray-400 dark:text-muted truncate">{product.reason}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleAdd(product)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <Plus className="h-3 w-3" />
                    Agregar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDismiss(product.id)}
                    className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors focus:outline-none"
                    aria-label="Ignorar sugerencia"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
